import React from "react";
import type { ClusterContext } from "@k8s-ide/core";
import { cn } from "../utils.js";

interface ContextSwitcherProps {
  contexts: ClusterContext[];
  activeContext: string | null;
  onSelect: (contextName: string) => void;
  status: "disconnected" | "connecting" | "connected" | "error";
}

const statusDot: Record<ContextSwitcherProps["status"], string> = {
  disconnected: "bg-zinc-500",
  connecting: "bg-amber-400 animate-pulse",
  connected: "bg-emerald-400",
  error: "bg-red-400",
};

export function ContextSwitcher({
  contexts,
  activeContext,
  onSelect,
  status,
}: ContextSwitcherProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className={cn("h-2 w-2 rounded-full shrink-0", statusDot[status])} />
      <select
        value={activeContext ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="bg-transparent text-sm text-zinc-200 focus:outline-none cursor-pointer min-w-0 truncate"
      >
        {!activeContext && (
          <option value="" disabled>
            Select context…
          </option>
        )}
        {contexts.map((ctx) => (
          <option key={ctx.name} value={ctx.name}>
            {ctx.name}
          </option>
        ))}
      </select>
    </div>
  );
}
