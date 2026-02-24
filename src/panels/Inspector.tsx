import { useStore } from "../store";

const panelStyle: React.CSSProperties = {
  padding: "16px 20px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: "13px",
  lineHeight: 1.6,
  borderBottom: "1px solid #1e1e1e",
  overflow: "auto",
};

const headingStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#666",
  marginBottom: "8px",
};

const nameStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 500,
  color: "#e0e0e0",
  marginBottom: "4px",
};

const metaStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "12px",
};

export default function Inspector() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const graph = useStore((s) => s.graph);

  if (!selectedNodeId) {
    return (
      <div style={panelStyle}>
        <div style={headingStyle}>Inspector</div>
        <div style={{ color: "#555", fontSize: "12px" }}>
          Select a node to view details
        </div>
      </div>
    );
  }

  // Find the selected node
  const mod = graph.modules.find((m) => m.id === selectedNodeId);
  if (mod) {
    const outgoing = graph.moduleEdges.filter((e) => e.source === mod.id);
    const incoming = graph.moduleEdges.filter((e) => e.target === mod.id);
    const svcEdges = graph.serviceEdges.filter((e) => e.source === mod.id);
    const connectedServices = svcEdges
      .map((e) => graph.services.find((s) => s.id === e.target))
      .filter(Boolean);

    return (
      <div style={panelStyle}>
        <div style={headingStyle}>Module</div>
        <div style={nameStyle}>{mod.name}/</div>
        <div style={metaStyle}>{mod.fileCount} files</div>
        <div style={metaStyle}>{mod.path}</div>

        {outgoing.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <div style={headingStyle}>Depends on</div>
            {outgoing.map((e) => {
              const target = graph.modules.find((m) => m.id === e.target);
              return (
                <div key={e.target} style={metaStyle}>
                  {target?.name}/ ({e.weight} imports)
                </div>
              );
            })}
          </div>
        )}

        {incoming.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <div style={headingStyle}>Depended on by</div>
            {incoming.map((e) => {
              const source = graph.modules.find((m) => m.id === e.source);
              return (
                <div key={e.source} style={metaStyle}>
                  {source?.name}/ ({e.weight} imports)
                </div>
              );
            })}
          </div>
        )}

        {connectedServices.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <div style={headingStyle}>Integrations</div>
            {connectedServices.map((svc) =>
              svc ? (
                <div key={svc.id} style={metaStyle}>
                  {svc.label} ({svc.category.replace("_", " ")})
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    );
  }

  const svc = graph.services.find((s) => s.id === selectedNodeId);
  if (svc) {
    const connectedModules = graph.serviceEdges
      .filter((e) => e.target === svc.id)
      .map((e) => graph.modules.find((m) => m.id === e.source))
      .filter(Boolean);

    return (
      <div style={panelStyle}>
        <div style={headingStyle}>Service</div>
        <div style={nameStyle}>{svc.label}</div>
        <div style={metaStyle}>{svc.category.replace("_", " ")}</div>
        <div style={{ marginTop: "8px" }}>
          <div style={headingStyle}>Env vars</div>
          {svc.envVars.map((v) => (
            <div key={v} style={{ ...metaStyle, fontFamily: "monospace", fontSize: "11px" }}>
              {v}
            </div>
          ))}
        </div>
        {connectedModules.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <div style={headingStyle}>Used by</div>
            {connectedModules.map((m) =>
              m ? (
                <div key={m.id} style={metaStyle}>
                  {m.name}/
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={headingStyle}>Inspector</div>
      <div style={{ color: "#555", fontSize: "12px" }}>Node not found</div>
    </div>
  );
}
