import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "../store";
import { agentProvider } from "../agent";
import { toolToRadiantState, toolTargetFile } from "../agent/provider";
import { scanProject } from "../scanner/bridge";

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "#0d0d0d",
  borderTop: "1px solid #1e1e1e",
  overflow: "hidden",
};

const outputStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 12px",
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Code", monospace',
  fontSize: "12px",
  lineHeight: 1.7,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  backgroundColor: "#111",
  border: "none",
  borderTop: "1px solid #1e1e1e",
  color: "#e0e0e0",
  fontSize: "12px",
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Code", monospace',
  outline: "none",
  resize: "none",
};

const lineColors: Record<string, string> = {
  tool: "#8b5cf6",
  agent: "#c0c0c0",
  user: "#a0a0ff",
  error: "#ef4444",
  system: "#555",
};

function describeToolUse(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
      return String(input.file_path || "");
    case "Edit":
      return String(input.file_path || "");
    case "Write":
      return String(input.file_path || "");
    case "Glob":
      return String(input.pattern || "");
    case "Grep":
      return `"${input.pattern || ""}" ${input.path ? `in ${input.path}` : ""}`.trim();
    case "Bash":
      return String(input.command || "").slice(0, 120);
    case "Task":
      return String(input.description || input.prompt || "").slice(0, 100);
    case "WebSearch":
      return String(input.query || "");
    case "WebFetch":
      return String(input.url || "");
    default:
      return JSON.stringify(input).slice(0, 100);
  }
}

export default function Terminal() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const terminalLines = useStore((s) => s.terminalLines);
  const agentBusy = useStore((s) => s.agentBusy);
  const addTerminalLine = useStore((s) => s.addTerminalLine);
  const setAgentBusy = useStore((s) => s.setAgentBusy);
  const setRadiantState = useStore((s) => s.setRadiantState);
  const setGraph = useStore((s) => s.setGraph);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [terminalLines.length]);

  const findNodeForFile = useCallback((filePath: string | null): string | null => {
    if (!filePath) return null;
    const graph = useStore.getState().graph;
    for (const mod of graph.modules) {
      if (filePath.includes(`/${mod.name}/`) || filePath.startsWith(mod.name)) {
        return mod.id;
      }
    }
    const modules = graph.modules;
    return modules.length > 0 ? modules[Math.floor(Math.random() * modules.length)].id : null;
  }, []);

  const rescanProject = useCallback(async () => {
    const path = useStore.getState().projectPath;
    if (!path) return;
    try {
      const graph = await scanProject(path);
      const withPositions = {
        ...graph,
        modules: graph.modules.map((m) => ({ ...m, x: 0, y: 0 })),
        services: graph.services.map((s) => ({ ...s, x: 0, y: 0 })),
      };
      setGraph(withPositions);
    } catch (err) {
      console.error("Rescan failed:", err);
    }
  }, [setGraph]);

  const shellBusyRef = useRef(false);

  const runShell = useCallback(async (command: string) => {
    const cwd = useStore.getState().projectPath || "/tmp";
    shellBusyRef.current = true;

    const unlistenOutput = await listen<string>("shell-output", (event) => {
      addTerminalLine({ type: "system", text: event.payload, timestamp: Date.now() });
    });

    const unlistenDone = await listen("shell-done", () => {
      shellBusyRef.current = false;
      unlistenOutput();
      unlistenDone();
    });

    try {
      await invoke("run_shell", { command, cwd });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addTerminalLine({ type: "error", text: errMsg, timestamp: Date.now() });
      shellBusyRef.current = false;
      unlistenOutput();
      unlistenDone();
    }
  }, [addTerminalLine]);

  const runAgent = useCallback(async (prompt: string) => {
    setAgentBusy(true);
    setRadiantState("thinking");

    const cwd = useStore.getState().projectPath || "/tmp";
    let hasWritten = false;

    try {
      for await (const event of agentProvider.send(prompt, cwd)) {
        switch (event.type) {
          case "tool_use": {
            const radState = toolToRadiantState(event.toolName || "");
            const filePath = toolTargetFile(event.toolInput || {});
            const nodeId = findNodeForFile(filePath);
            setRadiantState(radState, nodeId);

            const target = describeToolUse(event.toolName || "", event.toolInput || {});
            addTerminalLine({
              type: "tool",
              text: target,
              toolName: event.toolName,
              timestamp: Date.now(),
            });

            if (event.toolName === "Edit" || event.toolName === "Write") {
              hasWritten = true;
            }
            break;
          }
          case "tool_result":
            if (event.content) {
              addTerminalLine({
                type: "tool_result",
                text: event.content,
                isError: event.isError,
                timestamp: Date.now(),
              });
            }
            break;
          case "message":
            if (event.content) {
              addTerminalLine({
                type: "message",
                text: event.content,
                timestamp: Date.now(),
              });
            }
            break;
          case "done":
            setRadiantState("complete");
            setTimeout(() => setRadiantState("idle"), 2000);
            if (hasWritten) {
              rescanProject();
            }
            break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addTerminalLine({ type: "error", text: errMsg, timestamp: Date.now() });
      setRadiantState("idle");
    } finally {
      setAgentBusy(false);
    }
  }, [setAgentBusy, setRadiantState, addTerminalLine, findNodeForFile, rescanProject]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("!")) {
      const command = trimmed.slice(1).trim();
      if (!command || shellBusyRef.current) return;
      addTerminalLine({ type: "user", text: trimmed, timestamp: Date.now() });
      setInput("");
      runShell(command);
    } else {
      if (agentBusy) return;
      addTerminalLine({ type: "user", text: trimmed, timestamp: Date.now() });
      setInput("");
      runAgent(trimmed);
    }
  };

  return (
    <div style={containerStyle}>
      <div ref={scrollRef} style={outputStyle}>
        {terminalLines.length === 0 && (
          <div style={{ color: "#333" }}>Agent mode by default. Prefix with ! for shell commands.</div>
        )}
        {terminalLines.map((line, i) => (
          <div key={i} style={{ color: lineColors[line.type] || "#888" }}>
            {line.type === "user" ? (
              <>
                <span style={{ color: "#6366f1" }}>{line.text.startsWith("!") ? "$" : ">"} </span>
                <span style={{ color: line.text.startsWith("!") ? "#22c55e" : "#a0a0ff" }}>{line.text.startsWith("!") ? line.text.slice(1).trim() : line.text}</span>
              </>
            ) : line.type === "tool" ? (
              <>
                <span style={{ color: "#555" }}>[{line.toolName}] </span>
                <span style={{ color: "#666" }}>{line.text}</span>
              </>
            ) : line.type === "tool_result" ? (
              <span style={{ color: line.isError ? "#ef4444" : "#444", paddingLeft: "12px" }}>
                {line.isError ? "err: " : ""}{line.text}
              </span>
            ) : line.type === "error" ? (
              <span style={{ color: "#ef4444" }}>{line.text}</span>
            ) : (
              <span>{line.text}</span>
            )}
          </div>
        ))}
        {agentBusy && (
          <div style={{ color: "#555", fontStyle: "italic" }}>working...</div>
        )}
      </div>
      <form onSubmit={handleSubmit}>
        <textarea
          rows={1}
          style={inputStyle}
          placeholder={agentBusy ? "Agent is working..." : "Agent prompt, or !command for shell"}
          value={input}
          disabled={false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
      </form>
    </div>
  );
}
