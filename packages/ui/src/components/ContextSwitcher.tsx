import type { ClusterContext } from "@k8s-ide/core";

type Props = {
  contexts: ClusterContext[];
  value: string | null;
  onChange: (context: string) => void;
  loading?: boolean;
};

export function ContextSwitcher({ contexts, value, onChange, loading }: Props) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <span className="k8s-muted" style={{ fontSize: "0.8rem" }}>
        Cluster context
      </span>
      <select
        className="k8s-input"
        value={value ?? ""}
        disabled={loading || contexts.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          {loading ? "Loading contexts..." : "Select a context"}
        </option>
        {contexts.map((context) => (
          <option key={context.name} value={context.name}>
            {context.name}
            {context.current ? " (current)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
