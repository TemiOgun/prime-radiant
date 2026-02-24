import type { RadiantState } from "./types";

export interface AgentEvent {
  type:
    | "message"
    | "tool_use"
    | "tool_result"
    | "subagent_start"
    | "subagent_stop"
    | "done"
    | "session_init"
    | "permission_request"
    | "ask_user";
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  subagentId?: string;
  isError?: boolean;
  // session_init
  sessionId?: string;
  // permission_request / ask_user — request ID for responding
  requestId?: string;
  // ask_user
  questions?: Array<Record<string, unknown>>;
}

export interface AgentProvider {
  send(prompt: string, cwd: string): AsyncGenerator<AgentEvent>;
  respond(message: Record<string, unknown>): void;
  abort(): void;
  resetSession(): void;
}

export function toolToRadiantState(toolName: string): RadiantState {
  switch (toolName) {
    case "Read":
    case "Glob":
    case "Grep":
      return "reading";
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return "writing";
    case "WebFetch":
    case "WebSearch":
      return "querying";
    case "Task":
      return "thinking";
    default:
      return "thinking";
  }
}

export function toolTargetFile(toolInput: Record<string, unknown>): string | null {
  if (typeof toolInput.file_path === "string") return toolInput.file_path;
  if (typeof toolInput.path === "string") return toolInput.path;
  if (typeof toolInput.pattern === "string") return null; // glob — no single file
  return null;
}
