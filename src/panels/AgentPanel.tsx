import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../store";
import { agentProvider } from "../agent";
import { toolToRadiantState, toolTargetFile } from "../agent/provider";
import { scanProject } from "../scanner/bridge";

const panelStyle: React.CSSProperties = {
  padding: "16px 20px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: "13px",
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
};

const headingStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#666",
  marginBottom: "8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  backgroundColor: "#1a1a1a",
  border: "1px solid #2a2a2a",
  borderRadius: "6px",
  color: "#e0e0e0",
  fontSize: "13px",
  fontFamily: "inherit",
  outline: "none",
  resize: "none",
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  marginBottom: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

// --- Approval card styles ---

const approvalCardStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "6px",
  backgroundColor: "#1a1a1a",
  borderLeft: "3px solid #c9a000",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const toolBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "4px",
  backgroundColor: "#2a2a3a",
  color: "#a0a0ff",
  fontSize: "11px",
  fontFamily: "monospace",
  fontWeight: 600,
};

const approvalBtnRow: React.CSSProperties = {
  display: "flex",
  gap: "8px",
};

const allowBtnStyle: React.CSSProperties = {
  padding: "4px 16px",
  borderRadius: "4px",
  border: "1px solid #2a4a2a",
  backgroundColor: "#1a2a1a",
  color: "#6a9a6a",
  fontSize: "12px",
  cursor: "pointer",
};

const denyBtnStyle: React.CSSProperties = {
  padding: "4px 16px",
  borderRadius: "4px",
  border: "1px solid #4a2a2a",
  backgroundColor: "#2a1a1a",
  color: "#9a6a6a",
  fontSize: "12px",
  cursor: "pointer",
};

// --- Helpers ---

function summarizeToolInput(toolName: string, toolInput: Record<string, unknown>): string {
  const filePath = toolInput.file_path || toolInput.path;
  switch (toolName) {
    case "Edit":
      return `${filePath}`;
    case "Write":
    case "Read":
      return `${filePath}`;
    case "Bash":
      return `$ ${(toolInput.command as string)?.slice(0, 120) ?? ""}`;
    case "Glob":
      return `${toolInput.pattern}`;
    case "Grep":
      return `/${toolInput.pattern}/ in ${toolInput.path ?? "."}`;
    default:
      return JSON.stringify(toolInput).slice(0, 120);
  }
}

// --- Component ---

interface PendingApproval {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

interface PendingQuestion {
  id: string;
  questions: Array<Record<string, unknown>>;
}

export default function AgentPanel() {
  const [input, setInput] = useState("");
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentMessages = useStore((s) => s.agentMessages);
  const agentBusy = useStore((s) => s.agentBusy);
  const addAgentMessage = useStore((s) => s.addAgentMessage);
  const setAgentBusy = useStore((s) => s.setAgentBusy);
  const setRadiantState = useStore((s) => s.setRadiantState);
  const setGraph = useStore((s) => s.setGraph);
  const addTerminalLine = useStore((s) => s.addTerminalLine);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages.length, pendingApproval, pendingQuestion]);

  const findNodeForFile = useCallback((filePath: string | null): string | null => {
    if (!filePath) return null;
    const graph = useStore.getState().graph;
    for (const mod of graph.modules) {
      if (mod.path && filePath.startsWith(mod.path)) {
        return mod.id;
      }
    }
    return null;
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

  const handleApprove = useCallback((id: string) => {
    agentProvider.respond({ type: "permission_response", id, behavior: "allow" });
    setPendingApproval(null);
    addTerminalLine({ type: "system", text: "Approved", timestamp: Date.now() });
  }, [addTerminalLine]);

  const handleDeny = useCallback((id: string) => {
    agentProvider.respond({
      type: "permission_response",
      id,
      behavior: "deny",
      message: "User denied",
    });
    setPendingApproval(null);
    addTerminalLine({ type: "system", text: "Denied", timestamp: Date.now() });
  }, [addTerminalLine]);

  const handleQuestionSubmit = useCallback((id: string, questions: Array<Record<string, unknown>>) => {
    agentProvider.respond({
      type: "ask_user_response",
      id,
      questions,
      answers: questionAnswers,
    });
    setPendingQuestion(null);
    setQuestionAnswers({});
  }, [questionAnswers]);

  const runAgent = useCallback(async (prompt: string) => {
    setAgentBusy(true);
    setRadiantState("thinking");
    addTerminalLine({ type: "system", text: `> ${prompt}`, timestamp: Date.now() });

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

            const target = filePath || JSON.stringify(event.toolInput || {}).slice(0, 80);
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
          case "message":
            if (event.content) {
              addAgentMessage({
                id: crypto.randomUUID(),
                role: "assistant",
                content: event.content,
                timestamp: Date.now(),
              });
              const preview = event.content.slice(0, 120) + (event.content.length > 120 ? "..." : "");
              addTerminalLine({ type: "message", text: preview, timestamp: Date.now() });
            }
            break;
          case "permission_request":
            setPendingApproval({
              id: event.requestId!,
              toolName: event.toolName!,
              toolInput: event.toolInput!,
            });
            setRadiantState("idle");
            addTerminalLine({
              type: "system",
              text: `Approval needed: ${event.toolName}`,
              timestamp: Date.now(),
            });
            break;
          case "ask_user":
            setPendingQuestion({
              id: event.requestId!,
              questions: event.questions!,
            });
            setRadiantState("idle");
            break;
          case "done":
            if (event.content) {
              addTerminalLine({ type: "done", text: event.content, timestamp: Date.now() });
            }
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
      addAgentMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${errMsg}`,
        timestamp: Date.now(),
      });
      addTerminalLine({ type: "error", text: errMsg, timestamp: Date.now() });
      setRadiantState("idle");
    } finally {
      setAgentBusy(false);
      setPendingApproval(null);
      setPendingQuestion(null);
    }
  }, [addAgentMessage, setAgentBusy, setRadiantState, addTerminalLine, findNodeForFile, rescanProject]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || agentBusy) return;

    const prompt = input.trim();
    addAgentMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    });
    setInput("");
    runAgent(prompt);
  };

  return (
    <div style={panelStyle}>
      <div style={headingStyle}>Agent</div>
      <div style={messagesStyle}>
        {agentMessages.length === 0 && (
          <div style={{ color: "#444", fontSize: "12px" }}>
            Direct the agent from here. Select a node and describe what to build.
          </div>
        )}
        {agentMessages.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: "8px 10px",
              borderRadius: "6px",
              backgroundColor: msg.role === "user" ? "#1a1a2e" : "#1a1a1a",
              color: msg.role === "user" ? "#a0a0ff" : "#c0c0c0",
              fontSize: "12px",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {msg.content}
          </div>
        ))}

        {/* Permission approval card */}
        {pendingApproval && (
          <div style={approvalCardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={toolBadgeStyle}>{pendingApproval.toolName}</span>
              <span style={{ color: "#888", fontSize: "11px" }}>wants to run</span>
            </div>
            <div
              style={{
                color: "#999",
                fontSize: "12px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: "80px",
                overflow: "auto",
              }}
            >
              {summarizeToolInput(pendingApproval.toolName, pendingApproval.toolInput)}
            </div>
            <div style={approvalBtnRow}>
              <button style={allowBtnStyle} onClick={() => handleApprove(pendingApproval.id)}>
                Allow
              </button>
              <button style={denyBtnStyle} onClick={() => handleDeny(pendingApproval.id)}>
                Deny
              </button>
            </div>
          </div>
        )}

        {/* AskUser card */}
        {pendingQuestion && (
          <div style={{ ...approvalCardStyle, borderLeftColor: "#4a7ac9" }}>
            <div style={{ color: "#a0a0ff", fontSize: "11px", fontWeight: 600 }}>
              Agent has a question
            </div>
            {pendingQuestion.questions.map((q, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ color: "#c0c0c0", fontSize: "12px" }}>
                  {(q.question as string) || JSON.stringify(q)}
                </div>
                {q.options ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {(q.options as Array<Record<string, unknown>>).map((opt, j) => (
                      <button
                        key={j}
                        style={{
                          ...allowBtnStyle,
                          textAlign: "left",
                          borderColor:
                            questionAnswers[q.question as string] === (opt.label as string)
                              ? "#4a7ac9"
                              : "#2a2a2a",
                          backgroundColor:
                            questionAnswers[q.question as string] === (opt.label as string)
                              ? "#1a2a3a"
                              : "#1a1a1a",
                          color: "#c0c0c0",
                        }}
                        onClick={() =>
                          setQuestionAnswers((prev) => ({
                            ...prev,
                            [q.question as string]: opt.label as string,
                          }))
                        }
                      >
                        {opt.label as string}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    style={{ ...inputStyle, padding: "6px 10px" }}
                    placeholder="Type your answer..."
                    value={questionAnswers[q.question as string] || ""}
                    onChange={(e) =>
                      setQuestionAnswers((prev) => ({
                        ...prev,
                        [q.question as string]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleQuestionSubmit(pendingQuestion.id, pendingQuestion.questions);
                      }
                    }}
                  />
                )}
              </div>
            ))}
            <button
              style={allowBtnStyle}
              onClick={() => handleQuestionSubmit(pendingQuestion.id, pendingQuestion.questions)}
            >
              Submit
            </button>
          </div>
        )}

        {agentBusy && !pendingApproval && !pendingQuestion && (
          <div style={{ color: "#666", fontSize: "12px", fontStyle: "italic" }}>
            Working...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit}>
        <textarea
          rows={2}
          style={inputStyle}
          placeholder={
            useStore.getState().projectPath
              ? "Tell the agent what to build..."
              : "Open a project first, or type to demo..."
          }
          value={input}
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
