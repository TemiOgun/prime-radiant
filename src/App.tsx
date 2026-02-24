import { useEffect, useRef, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import Canvas from "./canvas/Canvas";
import Inspector from "./panels/Inspector";
import Terminal from "./panels/Terminal";
import { useLayout } from "./canvas/useLayout";
import { useStore } from "./store";
import { loadDemoGraph } from "./demo";
import { scanProject } from "./scanner/bridge";
import { agentProvider } from "./agent";

export default function App() {
  const projectPath = useStore((s) => s.projectPath);
  const setProjectPath = useStore((s) => s.setProjectPath);
  const setGraph = useStore((s) => s.setGraph);
  const viewLevel = useStore((s) => s.viewLevel);
  const expandedModuleId = useStore((s) => s.expandedModuleId);
  const setExpandedModuleId = useStore((s) => s.setExpandedModuleId);
  const graph = useStore((s) => s.graph);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useLayout();

  // Escape key → back to strategic view
  useEffect(() => {
    if (viewLevel !== "tactical") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpandedModuleId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewLevel, setExpandedModuleId]);

  // On mount: rescan if we have a persisted project path, otherwise show demo
  const hasScanned = useRef(false);
  useEffect(() => {
    if (!projectPath) {
      loadDemoGraph();
      return;
    }
    if (hasScanned.current) return;
    hasScanned.current = true;
    scanProject(projectPath)
      .then((graph) => {
        setGraph({
          ...graph,
          modules: graph.modules.map((m) => ({ ...m, x: 0, y: 0 })),
          services: graph.services.map((s) => ({ ...s, x: 0, y: 0 })),
        });
      })
      .catch((err) => console.error("Rescan on mount failed:", err));
  }, [projectPath, setGraph]);

  const openProject = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setProjectPath(selected);
        agentProvider.resetSession();
        const graph = await scanProject(selected);
        const withPositions = {
          ...graph,
          modules: graph.modules.map((m) => ({ ...m, x: 0, y: 0 })),
          services: graph.services.map((s) => ({ ...s, x: 0, y: 0 })),
        };
        setGraph(withPositions);
      }
    } catch (err) {
      console.error("Failed to open project:", err);
    }
  }, [setProjectPath, setGraph]);

  // Resolve expanded module name for breadcrumb
  const expandedModuleName = expandedModuleId
    ? graph.modules.find((m) => m.id === expandedModuleId)?.name ?? null
    : null;

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", overflow: "hidden" }}>
      {/* Canvas */}
      <div ref={canvasContainerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <Canvas containerRef={canvasContainerRef} />
        {/* Header overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "40px",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: "12px",
            background: "linear-gradient(to bottom, rgba(10,10,10,0.9), transparent)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <span
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: "13px",
              fontWeight: 500,
              color: "#666",
              letterSpacing: "0.02em",
            }}
          >
            Prime Radiant
          </span>
          {projectPath && (
            <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#444" }}>
              {projectPath.split("/").pop()}
            </span>
          )}
          {expandedModuleName && (
            <>
              <span style={{ fontSize: "11px", color: "#333" }}>/</span>
              <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#0d9488" }}>
                {expandedModuleName}
              </span>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={openProject}
            style={{
              pointerEvents: "auto",
              background: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "4px",
              color: "#999",
              fontSize: "11px",
              padding: "4px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Open Project
          </button>
        </div>

        {/* Back button — tactical view only */}
        {viewLevel === "tactical" && (
          <button
            onClick={() => setExpandedModuleId(null)}
            style={{
              position: "absolute",
              top: "48px",
              left: "16px",
              pointerEvents: "auto",
              background: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "4px",
              color: "#999",
              fontSize: "11px",
              padding: "4px 10px",
              cursor: "pointer",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              zIndex: 10,
            }}
          >
            Esc
          </button>
        )}
      </div>

      {/* Right panel: Inspector + Terminal */}
      <div
        style={{
          width: "380px",
          minWidth: "380px",
          backgroundColor: "#111111",
          borderLeft: "1px solid #1e1e1e",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Inspector />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Terminal />
        </div>
      </div>
    </div>
  );
}
