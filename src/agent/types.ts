export type RadiantState =
  | "idle"
  | "reading"
  | "writing"
  | "querying"
  | "thinking"
  | "complete";

export interface RadiantPosition {
  targetNodeId: string | null;
  state: RadiantState;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface SubAgent {
  id: string;
  parentId: string;
  targetNodeId: string | null;
  state: RadiantState;
}
