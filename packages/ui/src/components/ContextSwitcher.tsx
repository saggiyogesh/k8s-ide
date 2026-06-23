import type { ClusterContext } from "@k8s-ide/core";
import { cn } from "../lib/cn.js";

type Props = {
  contexts: ClusterContext[];
  current: string | null;
  onSelect: (context: string) => void;
  loading?: boolean;
};

export function ContextSwitcher({ contexts, current, onSelect, loading }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs uppercase tracking-wide text-zinc-400">Context</label>
      <select
        className={cn(
          "rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm",
          "focus:border-sky-500 focus:outline-none",
        )}
        value={current ?? ""}
        disabled={loading || contexts.length === 0}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          Select context
        </option>
        {contexts.map((ctx) => (
          <option key={ctx.name} value={ctx.name}>
            {ctx.name}
          </option>
        ))}
      </select>
    </div>
  );
}
