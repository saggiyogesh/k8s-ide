import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { KubeResource } from "@k8s-ide/core";
import { ageFromTimestamp } from "@k8s-ide/core";
import { cn } from "../lib/cn.js";

type Props = {
  items: KubeResource[];
  selectedName: string | null;
  onSelect: (item: KubeResource) => void;
  loading?: boolean;
};

export function ResourceTable({ items, selectedName, onSelect, loading }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading resources...</div>;
  }

  if (items.length === 0) {
    return <div className="p-6 text-sm text-zinc-400">No resources found.</div>;
  }

  return (
    <div ref={parentRef} className="k8s-scroll h-full overflow-auto">
      <div className="sticky top-0 z-10 grid grid-cols-[1.5fr_1fr_1fr_80px] border-b border-white/10 bg-zinc-950 px-4 py-2 text-xs uppercase tracking-wide text-zinc-500">
        <span>Name</span>
        <span>Namespace</span>
        <span>Created</span>
        <span>Age</span>
      </div>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          const name = item.metadata.name;
          const active = selectedName === name;
          return (
            <button
              key={item.metadata.uid ?? `${name}-${row.index}`}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "absolute left-0 grid w-full grid-cols-[1.5fr_1fr_1fr_80px] px-4 py-2.5 text-left text-sm",
                active ? "bg-sky-600/15 text-sky-100" : "hover:bg-white/5 text-zinc-200",
              )}
              style={{ transform: `translateY(${row.start}px)`, height: row.size }}
            >
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-zinc-400">{item.metadata.namespace ?? "—"}</span>
              <span className="truncate text-zinc-500">{item.metadata.creationTimestamp ?? "—"}</span>
              <span className="text-zinc-500">{ageFromTimestamp(item.metadata.creationTimestamp)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
