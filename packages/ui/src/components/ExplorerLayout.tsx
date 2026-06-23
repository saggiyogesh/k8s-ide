import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  toolbar?: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  detail?: ReactNode;
};

export function ExplorerLayout({ title, subtitle, status, toolbar, sidebar, main, detail }: Props) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h1>
          {subtitle && (
            <p className="k8s-muted" style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>
              {subtitle}
            </p>
          )}
        </div>
        {status}
        {toolbar}
      </header>

      <div
        className="k8s-explorer-layout"
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: detail ? "260px minmax(0, 1fr) minmax(320px, 0.9fr)" : "260px minmax(0, 1fr)",
          gap: "1rem",
          padding: "1rem",
        }}
      >
        {sidebar}
        <main style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>{main}</main>
        {detail}
      </div>
    </div>
  );
}
