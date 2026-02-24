import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ProjectGraph,
  ViewLevel,
} from "../types/graph";
import type { RadiantState, AgentMessage, SubAgent } from "../agent/types";

export interface TerminalLine {
  type: "tool" | "tool_result" | "file" | "message" | "error" | "system" | "done" | "user";
  text: string;
  toolName?: string;
  isError?: boolean;
  timestamp: number;
}

interface AppState {
  // Project
  projectPath: string | null;
  setProjectPath: (path: string) => void;

  // Graph data
  graph: ProjectGraph;
  setGraph: (graph: ProjectGraph) => void;

  // View state
  viewLevel: ViewLevel;
  setViewLevel: (level: ViewLevel) => void;
  expandedModuleId: string | null;
  setExpandedModuleId: (id: string | null) => void;

  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  // Agent / Radiant state
  radiantState: RadiantState;
  radiantTargetNodeId: string | null;
  setRadiantState: (state: RadiantState, targetNodeId?: string | null) => void;
  subAgents: SubAgent[];
  addSubAgent: (agent: SubAgent) => void;
  removeSubAgent: (id: string) => void;

  // Agent messages
  agentMessages: AgentMessage[];
  addAgentMessage: (message: AgentMessage) => void;
  agentBusy: boolean;
  setAgentBusy: (busy: boolean) => void;

  // Agent session
  agentSessionId: string | null;
  setAgentSessionId: (id: string | null) => void;

  // Terminal
  terminalLines: TerminalLine[];
  addTerminalLine: (line: TerminalLine) => void;
  clearTerminal: () => void;
}

const emptyGraph: ProjectGraph = {
  modules: [],
  filesByModule: {},
  services: [],
  moduleEdges: [],
  fileEdges: [],
  serviceEdges: [],
};

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      projectPath: null,
      setProjectPath: (path) => set({ projectPath: path }),

      graph: emptyGraph,
      setGraph: (graph) => set({ graph }),

      viewLevel: "strategic",
      setViewLevel: (level) => set({ viewLevel: level }),
      expandedModuleId: null,
      setExpandedModuleId: (id) =>
        set({
          expandedModuleId: id,
          viewLevel: id ? "tactical" : "strategic",
        }),

      selectedNodeId: null,
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),

      radiantState: "idle",
      radiantTargetNodeId: null,
      setRadiantState: (state, targetNodeId = null) =>
        set({ radiantState: state, radiantTargetNodeId: targetNodeId }),
      subAgents: [],
      addSubAgent: (agent) =>
        set((s) => ({ subAgents: [...s.subAgents, agent] })),
      removeSubAgent: (id) =>
        set((s) => ({ subAgents: s.subAgents.filter((a) => a.id !== id) })),

      agentMessages: [],
      addAgentMessage: (message) =>
        set((s) => ({ agentMessages: [...s.agentMessages, message] })),
      agentBusy: false,
      setAgentBusy: (busy) => set({ agentBusy: busy }),

      agentSessionId: null,
      setAgentSessionId: (id) => set({ agentSessionId: id }),

      terminalLines: [],
      addTerminalLine: (line) =>
        set((s) => ({
          terminalLines: [...s.terminalLines.slice(-500), line],
        })),
      clearTerminal: () => set({ terminalLines: [] }),
    }),
    {
      name: "prime-radiant-store",
      partialize: (state) => ({
        projectPath: state.projectPath,
        terminalLines: state.terminalLines,
        agentSessionId: state.agentSessionId,
      }),
      onRehydrate: () => {
        return (state) => {
          if (state) {
            // Can't reconnect to a mid-flight subprocess after reload
            state.agentBusy = false;
            state.radiantState = "idle";
            state.radiantTargetNodeId = null;
          }
        };
      },
    },
  ),
);
