import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AgentProvider, AgentEvent } from "./provider";
import { useStore } from "../store";

/**
 * Sidecar-based Claude provider.
 * Spawns the Agent SDK sidecar via Rust, communicates via JSON lines.
 * Supports interactive tool approval and ask_user flows.
 */
export function createClaudeProvider(): AgentProvider {
  return {
    async *send(prompt: string, cwd: string): AsyncGenerator<AgentEvent> {
      const events: AgentEvent[] = [];
      let resolveNext: (() => void) | null = null;
      let done = false;

      // Listen for JSON line events from the sidecar (relayed by Rust)
      const unlistenEvent = await listen<string>("agent-event", (event) => {
        const line = event.payload;
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          const parsed = parseSidecarEvent(msg);
          if (parsed) {
            events.push(parsed);
            resolveNext?.();
          }
        } catch {
          // Partial or non-JSON line
        }
      });

      const unlistenStderr = await listen<string>("agent-stderr", (event) => {
        console.warn("[sidecar stderr]", event.payload);
      });

      const unlistenError = await listen<string>("agent-error", (event) => {
        events.push({ type: "message", content: event.payload });
        resolveNext?.();
      });

      const unlistenDone = await listen("agent-done", () => {
        done = true;
        if (!events.some((e) => e.type === "done")) {
          events.push({ type: "done" });
        }
        resolveNext?.();
      });

      // Start the agent via Rust → sidecar
      try {
        await invoke("run_agent", {
          prompt,
          cwd,
          sessionId: useStore.getState().agentSessionId,
          permissionMode: "default",
        });
      } catch (err) {
        done = true;
        events.push({
          type: "message",
          content: `Failed to start agent: ${err}`,
        });
        events.push({ type: "done" });
      }

      // Yield events as they arrive
      try {
        while (!done || events.length > 0) {
          if (events.length > 0) {
            const event = events.shift()!;
            yield event;
            if (event.type === "done") return;
          } else {
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
          }
        }
      } finally {
        unlistenEvent();
        unlistenStderr();
        unlistenError();
        unlistenDone();
      }
    },

    respond(message: Record<string, unknown>) {
      invoke("send_to_agent", { message: JSON.stringify(message) }).catch(
        console.error,
      );
    },

    abort() {
      invoke("abort_agent").catch(console.error);
    },

    resetSession() {
      useStore.getState().setAgentSessionId(null);
    },
  };
}

function parseSidecarEvent(msg: Record<string, unknown>): AgentEvent | null {
  switch (msg.type) {
    case "session_init":
      if (typeof msg.sessionId === "string") {
        useStore.getState().setAgentSessionId(msg.sessionId);
      }
      return { type: "session_init", sessionId: msg.sessionId as string };

    case "message":
      return { type: "message", content: msg.content as string };

    case "tool_use":
      return {
        type: "tool_use",
        toolName: msg.toolName as string,
        toolInput: msg.toolInput as Record<string, unknown>,
      };

    case "tool_result":
      return {
        type: "tool_result",
        content: msg.content as string,
        isError: msg.isError as boolean,
      };

    case "subagent_start":
      return {
        type: "subagent_start",
        subagentId: msg.subagentId as string,
      };

    case "permission_request":
      return {
        type: "permission_request",
        requestId: msg.id as string,
        toolName: msg.toolName as string,
        toolInput: msg.toolInput as Record<string, unknown>,
      };

    case "ask_user":
      return {
        type: "ask_user",
        requestId: msg.id as string,
        questions: msg.questions as Array<Record<string, unknown>>,
      };

    case "done": {
      const parts: string[] = [];
      if (msg.numTurns) parts.push(`${msg.numTurns} turns`);
      if (msg.durationMs)
        parts.push(`${((msg.durationMs as number) / 1000).toFixed(1)}s`);
      if (msg.costUsd) parts.push(`$${(msg.costUsd as number).toFixed(4)}`);
      return {
        type: "done",
        content: parts.length > 0 ? parts.join(" · ") : undefined,
      };
    }

    case "error":
      return { type: "message", content: `Error: ${msg.message}` };

    default:
      return null;
  }
}

// Fallback simulated provider for dev/testing without Tauri
export function createSimulatedProvider(): AgentProvider {
  let aborted = false;

  return {
    async *send(prompt: string, _cwd: string): AsyncGenerator<AgentEvent> {
      aborted = false;

      yield {
        type: "tool_use",
        toolName: "Read",
        toolInput: { file_path: "src/index.ts" },
      };
      await sleep(800);
      if (aborted) return;

      yield {
        type: "message",
        content: `Analyzing the project structure to understand how to: ${prompt}`,
      };
      await sleep(1200);
      if (aborted) return;

      // Simulate a permission request
      yield {
        type: "permission_request",
        requestId: "sim-1",
        toolName: "Edit",
        toolInput: {
          file_path: "src/index.ts",
          old_string: "foo",
          new_string: "bar",
        },
      };
      await sleep(2000);
      if (aborted) return;

      yield {
        type: "tool_use",
        toolName: "Glob",
        toolInput: { pattern: "**/*.ts" },
      };
      await sleep(600);
      if (aborted) return;

      yield {
        type: "message",
        content:
          "I've scanned the project. I'll now make the necessary changes.",
      };
      await sleep(500);
      if (aborted) return;

      yield { type: "done" };
    },
    respond(message: Record<string, unknown>) {
      console.log("[simulated] respond:", message);
    },
    abort() {
      aborted = true;
    },
    resetSession() {
      // no-op
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
