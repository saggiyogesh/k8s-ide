import React, { useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { KubeResource } from "@k8s-ide/core";
import { formatAge } from "../utils.js";

export interface Column<T> {
  key: string;
  header: string;
  width?: number;
  cell: (row: T) => React.ReactNode;
}

interface ResourceTableProps {
  items: KubeResource[];
  columns?: Column<KubeResource>[];
  onSelect?: (item: KubeResource) => void;
  selectedName?: string;
  filterText?: string;
  isLoading?: boolean;
  error?: string;
}

const defaultColumns: Column<KubeResource>[] = [
  {
    key: "name",
    header: "Name",
    width: 300,
    cell: (r) => <span className="font-mono text-sky-300">{r.metadata.name}</span>,
  },
  {
    key: "namespace",
    header: "Namespace",
    width: 160,
    cell: (r) => r.metadata.namespace ?? "–",
  },
  {
    key: "age",
    header: "Age",
    width: 80,
    cell: (r) => formatAge(r.metadata.creationTimestamp),
  },
];

export function ResourceTable({
  items,
  columns = defaultColumns,
  onSelect,
  selectedName,
  filterText = "",
  isLoading,
  error,
}: ResourceTableProps) {
  const filtered = useMemo(() => {
    if (!filterText) return items;
    const q = filterText.toLowerCase();
    return items.filter(
      (i) =>
        i.metadata.name.toLowerCase().includes(q) ||
        (i.metadata.namespace ?? "").toLowerCase().includes(q),
    );
  }, [items, filterText]);

  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex border-b border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        {columns.map((col) => (
          <div
            key={col.key}
            className="px-3 py-2 truncate"
            style={{ width: col.width ?? 200, minWidth: col.width ?? 200 }}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{ height: rowVirtualizer.getTotalSize() }}
          className="relative w-full"
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = filtered[virtualRow.index]!;
            const isSelected = item.metadata.name === selectedName;
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: virtualRow.start,
                  left: 0,
                  height: virtualRow.size,
                  width: "100%",
                }}
                className={`flex items-center cursor-pointer border-b border-zinc-800 text-sm transition-colors ${
                  isSelected
                    ? "bg-sky-900/40 text-zinc-100"
                    : "hover:bg-zinc-800 text-zinc-300"
                }`}
                onClick={() => onSelect?.(item)}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="px-3 truncate"
                    style={{ width: col.width ?? 200, minWidth: col.width ?? 200 }}
                  >
                    {col.cell(item)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-500">
        {filtered.length} / {items.length} items
      </div>
    </div>
  );
}
