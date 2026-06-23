import type { ReactNode } from "react";

import type { ApiResourceDescriptor, KubeResource, ResourceCapabilities } from "@k8s-ide/core";

const frameStyle = {
  background: "#0f172a",
  color: "#e2e8f0",
  minHeight: "100vh",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
} satisfies Record<string, string | number>;

const panelStyle = {
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: 12,
  padding: 16
} satisfies Record<string, string | number>;

export function AppShell(props: {
  title: string;
  subtitle?: string;
  sidebar: ReactNode;
  toolbar?: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div style={frameStyle}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: 16,
          padding: 16
        }}
      >
        <aside style={{ ...panelStyle, alignSelf: "start" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{props.title}</div>
            {props.subtitle ? (
              <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>{props.subtitle}</div>
            ) : null}
          </div>
          {props.sidebar}
        </aside>
        <main style={{ display: "grid", gap: 16 }}>
          {props.toolbar ? <section style={panelStyle}>{props.toolbar}</section> : null}
          <section style={panelStyle}>{props.detail}</section>
        </main>
      </div>
    </div>
  );
}

export function BackendStatusBadge(props: { status: "idle" | "connecting" | "ready" | "error" }) {
  const colors = {
    idle: "#64748b",
    connecting: "#f59e0b",
    ready: "#22c55e",
    error: "#ef4444"
  } as const;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        background: "#0b1220",
        border: `1px solid ${colors[props.status]}`,
        color: "#e2e8f0",
        fontSize: 12,
        textTransform: "uppercase"
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: colors[props.status]
        }}
      />
      {props.status}
    </span>
  );
}

export function ContextSwitcher(props: {
  contexts: Array<{ name: string; current?: boolean }>;
  value?: string;
  onChange: (context: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Context</span>
      <select
        value={props.value ?? ""}
        onChange={(event) => props.onChange(event.target.value)}
        style={{
          background: "#020617",
          color: "#e2e8f0",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: 10
        }}
      >
        <option value="" disabled>
          Select a context
        </option>
        {props.contexts.map((context) => (
          <option key={context.name} value={context.name}>
            {context.name}
            {context.current ? " (current)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ResourceExplorerNav(props: {
  descriptors: ApiResourceDescriptor[];
  selected?: ApiResourceDescriptor;
  onSelect: (descriptor: ApiResourceDescriptor) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>Resources</div>
      <div style={{ display: "grid", gap: 6, maxHeight: "70vh", overflow: "auto" }}>
        {props.descriptors.map((descriptor) => {
          const selected =
            descriptor.group === props.selected?.group &&
            descriptor.version === props.selected?.version &&
            descriptor.resource === props.selected?.resource;

          return (
            <button
              key={`${descriptor.group || "core"}:${descriptor.version}:${descriptor.resource}`}
              type="button"
              onClick={() => props.onSelect(descriptor)}
              style={{
                textAlign: "left",
                background: selected ? "#1d4ed8" : "#020617",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: 10,
                padding: 12
              }}
            >
              <div style={{ fontWeight: 600 }}>{descriptor.kind}</div>
              <div style={{ color: "#cbd5e1", fontSize: 12 }}>
                {(descriptor.group || "core")}/{descriptor.version} · {descriptor.resource}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function metadataValue(resource: KubeResource, key: "name" | "namespace"): string {
  const metadata = resource.metadata as Record<string, unknown> | undefined;
  const value = metadata?.[key];
  return typeof value === "string" ? value : "n/a";
}

export function ResourceTable(props: {
  items: KubeResource[];
  selectedName?: string;
  onSelect: (resource: KubeResource) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>
        Live resource list
      </div>
      <div style={{ overflow: "auto", border: "1px solid #1e293b", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#020617" }}>
            <tr>
              {["Name", "Namespace", "Kind"].map((column) => (
                <th
                  key={column}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    color: "#94a3b8",
                    fontSize: 12,
                    textTransform: "uppercase"
                  }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.items.map((resource) => {
              const name = metadataValue(resource, "name");
              const kind = typeof resource.kind === "string" ? resource.kind : "Unknown";
              const selected = name === props.selectedName;

              return (
                <tr
                  key={`${kind}:${name}`}
                  onClick={() => props.onSelect(resource)}
                  style={{
                    cursor: "pointer",
                    background: selected ? "#172554" : "transparent"
                  }}
                >
                  <td style={{ padding: 12, borderTop: "1px solid #1e293b" }}>{name}</td>
                  <td style={{ padding: 12, borderTop: "1px solid #1e293b" }}>
                    {metadataValue(resource, "namespace")}
                  </td>
                  <td style={{ padding: 12, borderTop: "1px solid #1e293b" }}>{kind}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResourceCapabilityBar(props: { capabilities: ResourceCapabilities }) {
  const active = Object.entries(props.capabilities)
    .filter(([, value]) => value)
    .map(([key]) => key.replace(/^can/, ""));

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {active.map((capability) => (
        <span
          key={capability}
          style={{
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: 12,
            background: "#1e293b",
            color: "#bfdbfe"
          }}
        >
          {capability}
        </span>
      ))}
    </div>
  );
}

export function YamlEditorPanel(props: {
  value: string;
  onChange: (value: string) => void;
  onApply?: () => void;
  applyDisabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase" }}>YAML editor</div>
        {props.onApply ? (
          <button
            type="button"
            onClick={props.onApply}
            disabled={props.applyDisabled}
            style={{
              background: props.applyDisabled ? "#334155" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "10px 14px"
            }}
          >
            Apply
          </button>
        ) : null}
      </div>
      <textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        spellCheck={false}
        style={{
          minHeight: 360,
          width: "100%",
          resize: "vertical",
          borderRadius: 10,
          border: "1px solid #334155",
          background: "#020617",
          color: "#e2e8f0",
          padding: 12,
          fontFamily: 'ui-monospace, "SFMono-Regular", monospace'
        }}
      />
    </div>
  );
}

export function EmptyState(props: { title: string; message: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        placeItems: "start",
        minHeight: 180,
        alignContent: "center"
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700 }}>{props.title}</div>
      <div style={{ color: "#94a3b8", maxWidth: 560 }}>{props.message}</div>
    </div>
  );
}
