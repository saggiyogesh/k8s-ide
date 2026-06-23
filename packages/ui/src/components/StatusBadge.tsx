import type { BackendStatus } from "@k8s-ide/core";
import { cn } from "../lib/cn.js";

const statusColors: Record<BackendStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-zinc-500",
  error: "bg-red-500",
};

export function StatusBadge({ status }: { status: BackendStatus }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-300">
      <span className={cn("h-2 w-2 rounded-full", statusColors[status])} />
      {status}
    </span>
  );
}
