import { createClaudeProvider, createSimulatedProvider } from "./claude";
import type { AgentProvider } from "./provider";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const agentProvider: AgentProvider = isTauri
  ? createClaudeProvider()
  : createSimulatedProvider();
