import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";

// --- Types ---

interface StartCommand {
  type: "start";
  prompt: string;
  cwd: string;
  sessionId?: string;
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
}

interface PermissionResponseCommand {
  type: "permission_response";
  id: string;
  behavior: "allow" | "deny";
  updatedInput?: Record<string, unknown>;
  message?: string;
}

interface AskUserResponseCommand {
  type: "ask_user_response";
  id: string;
  answers: Record<string, string>;
  questions: Array<Record<string, unknown>>;
}

interface AbortCommand {
  type: "abort";
}

type IncomingCommand =
  | StartCommand
  | PermissionResponseCommand
  | AskUserResponseCommand
  | AbortCommand;

// --- State ---

const pendingRequests = new Map<
  string,
  { resolve: (result: unknown) => void }
>();
let requestCounter = 0;
let currentAbortController: AbortController | null = null;

// --- I/O ---

function emit(event: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line: string) => {
  try {
    const cmd = JSON.parse(line) as IncomingCommand;
    switch (cmd.type) {
      case "start":
        handleStart(cmd);
        break;
      case "permission_response":
        resolvePending(cmd.id, {
          behavior: cmd.behavior,
          updatedInput: cmd.updatedInput ?? {},
          ...(cmd.behavior === "deny" ? { message: cmd.message ?? "User denied" } : {}),
        });
        break;
      case "ask_user_response":
        resolvePending(cmd.id, {
          behavior: "allow",
          updatedInput: {
            questions: cmd.questions,
            answers: cmd.answers,
          },
        });
        break;
      case "abort":
        currentAbortController?.abort();
        break;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    emit({ type: "error", message: `Parse error: ${msg}` });
  }
});

rl.on("close", () => {
  process.exit(0);
});

// --- Permission handling ---

function nextId(): string {
  return `req-${++requestCounter}`;
}

function resolvePending(id: string, result: unknown): void {
  const p = pendingRequests.get(id);
  if (!p) return;
  pendingRequests.delete(id);
  p.resolve(result);
}

async function requestPermission(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<unknown> {
  const id = nextId();
  emit({ type: "permission_request", id, toolName, toolInput });
  return new Promise((resolve) => {
    pendingRequests.set(id, { resolve });
  });
}

async function requestAskUser(
  questions: unknown[],
): Promise<unknown> {
  const id = nextId();
  emit({ type: "ask_user", id, questions });
  return new Promise((resolve) => {
    pendingRequests.set(id, { resolve });
  });
}

// --- Main agent loop ---

async function handleStart(cmd: StartCommand): Promise<void> {
  const abortController = new AbortController();
  currentAbortController = abortController;

  try {
    const q = query({
      prompt: cmd.prompt,
      options: {
        cwd: cmd.cwd,
        resume: cmd.sessionId || undefined,
        permissionMode: cmd.permissionMode ?? "default",
        abortController,
        maxTurns: 50,
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project"],
        canUseTool: async (
          toolName: string,
          input: Record<string, unknown>,
        ) => {
          if (toolName === "AskUserQuestion") {
            return requestAskUser(
              (input as { questions?: unknown[] }).questions ?? [],
            ) as Promise<{ behavior: "allow"; updatedInput: Record<string, unknown> }>;
          }
          return requestPermission(toolName, input) as Promise<{
            behavior: "allow";
            updatedInput: Record<string, unknown>;
          }>;
        },
      },
    });

    for await (const message of q) {
      switch (message.type) {
        case "system": {
          if (message.subtype === "init") {
            emit({
              type: "session_init",
              sessionId: message.session_id,
              model: (message as Record<string, unknown>).model,
            });
          }
          break;
        }

        case "assistant": {
          const content = (message.message as { content?: unknown[] })?.content;
          if (!content) break;

          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") {
              emit({ type: "message", content: b.text });
            } else if (b.type === "tool_use") {
              emit({
                type: "tool_use",
                toolName: b.name as string,
                toolInput: b.input as Record<string, unknown>,
              });
            }
          }

          if (message.parent_tool_use_id) {
            emit({
              type: "subagent_start",
              subagentId: message.parent_tool_use_id,
            });
          }
          break;
        }

        case "user": {
          const content = (message.message as { content?: unknown[] })?.content;
          if (!content) break;

          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type === "tool_result") {
              const raw = b.content;
              const text =
                typeof raw === "string"
                  ? raw
                  : Array.isArray(raw)
                    ? raw
                        .filter(
                          (c: unknown) =>
                            (c as Record<string, unknown>).type === "text",
                        )
                        .map(
                          (c: unknown) =>
                            (c as Record<string, string>).text,
                        )
                        .join("\n")
                    : "";
              const summary = summarize(text);
              emit({
                type: "tool_result",
                content: summary,
                isError: b.is_error ?? false,
              });
            }
          }
          break;
        }

        case "result": {
          const r = message as unknown as Record<string, unknown>;
          emit({
            type: "done",
            result: r.result ?? "",
            sessionId: r.session_id,
            numTurns: r.num_turns,
            durationMs: r.duration_ms,
            costUsd: r.total_cost_usd,
            isError: r.is_error ?? false,
          });
          break;
        }
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      emit({ type: "done", result: "Aborted", isError: false });
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      emit({ type: "error", message: msg });
    }
  }

  currentAbortController = null;
}

function summarize(text: string): string {
  if (!text) return "ok";
  const lines = text.split("\n");
  if (lines.length <= 3) return text.slice(0, 200);
  return `${lines.length} lines`;
}
