import type { BackendStatus } from "@k8s-ide/core";

const labels: Record<BackendStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  error: "Error",
};

const colors: Record<BackendStatus, string> = {
  connected: "var(--success)",
  connecting: "var(--accent)",
  disconnected: "var(--muted)",
  error: "var(--danger)",
};

export function BackendStatusBadge({ status }: { status: BackendStatus }) {
  return (
    <span
      className="k8s-badge"
      style={{ background: `${colors[status]}22`, color: colors[status] }}
    >
      {labels[status]}
    </span>
  );
}
