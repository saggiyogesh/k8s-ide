import type { KubeResource } from "@k8s-ide/core";

type Props = {
  resource: KubeResource;
};

export function ResourceDetail({ resource }: Props) {
  return (
    <div className="k8s-panel" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h2 style={{ margin: 0 }}>{resource.metadata.name}</h2>
        <p className="k8s-muted" style={{ margin: "0.35rem 0 0" }}>
          {resource.apiVersion} · {resource.kind}
          {resource.metadata.namespace ? ` · ${resource.metadata.namespace}` : ""}
        </p>
      </div>

      <section>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>Metadata</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "0.5rem", margin: 0 }}>
          <dt className="k8s-muted">UID</dt>
          <dd style={{ margin: 0 }}>{resource.metadata.uid ?? "—"}</dd>
          <dt className="k8s-muted">Resource version</dt>
          <dd style={{ margin: 0 }}>{resource.metadata.resourceVersion ?? "—"}</dd>
          <dt className="k8s-muted">Created</dt>
          <dd style={{ margin: 0 }}>
            {resource.metadata.creationTimestamp
              ? new Date(resource.metadata.creationTimestamp).toLocaleString()
              : "—"}
          </dd>
        </dl>
      </section>

      {resource.status && (
        <section>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>Status</h3>
          <pre
            style={{
              margin: 0,
              padding: "0.75rem",
              borderRadius: "8px",
              background: "var(--panel-elevated)",
              overflow: "auto",
              fontSize: "0.8rem",
            }}
          >
            {JSON.stringify(resource.status, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
