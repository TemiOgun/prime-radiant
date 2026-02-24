import type { ServiceCategory } from "../types/graph";

const CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: "database", label: "Database" },
  { value: "cache", label: "Cache" },
  { value: "auth", label: "Auth / Identity" },
  { value: "payments", label: "Payments" },
  { value: "storage", label: "Storage" },
  { value: "email", label: "Email" },
  { value: "monitoring", label: "Monitoring" },
  { value: "queue", label: "Message Queue" },
  { value: "external_api", label: "External API" },
  { value: "internal_service", label: "Internal Service" },
  { value: "config", label: "Config (hidden)" },
];

interface UnresolvedVar {
  name: string;
  bestGuess: ServiceCategory | null;
}

interface Props {
  unresolvedVars: UnresolvedVar[];
  onClassify: (varName: string, category: ServiceCategory, label: string) => void;
  onDone: () => void;
}

export default function ClassifyPanel({ unresolvedVars, onClassify, onDone }: Props) {
  if (unresolvedVars.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          backgroundColor: "#161616",
          border: "1px solid #2a2a2a",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "500px",
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 500,
            color: "#e0e0e0",
            marginBottom: "4px",
          }}
        >
          Classify integrations
        </h2>
        <p style={{ fontSize: "12px", color: "#666", marginBottom: "20px" }}>
          These environment variables couldn't be automatically classified.
          Select a category for each.
        </p>

        {unresolvedVars.map((v) => (
          <div
            key={v.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "12px",
            }}
          >
            <code
              style={{
                fontSize: "11px",
                color: "#aaa",
                backgroundColor: "#1a1a1a",
                padding: "4px 8px",
                borderRadius: "4px",
                minWidth: "180px",
              }}
            >
              {v.name}
            </code>
            <select
              defaultValue={v.bestGuess ?? ""}
              onChange={(e) => {
                const cat = e.target.value as ServiceCategory;
                onClassify(v.name, cat, v.name);
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                backgroundColor: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: "6px",
                color: "#e0e0e0",
                fontSize: "12px",
              }}
            >
              <option value="">Select category...</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        <button
          onClick={onDone}
          style={{
            marginTop: "16px",
            width: "100%",
            padding: "10px",
            backgroundColor: "#2a2a2a",
            border: "1px solid #3a3a3a",
            borderRadius: "6px",
            color: "#e0e0e0",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
