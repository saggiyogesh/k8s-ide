import { useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { KubeResource } from "@k8s-ide/core";
import { resourceAge, isTerminating } from "@k8s-ide/core";
import { cn } from "../lib/utils.js";
import { Badge } from "./ui/badge.js";

export interface ColumnDef {
  key: string;
  header: string;
  width?: number;
  render?: (resource: KubeResource) => React.ReactNode;
}

const defaultColumns: ColumnDef[] = [
  { key: "name", header: "Name", width: 300 },
  { key: "namespace", header: "Namespace", width: 160 },
  { key: "age", header: "Age", width: 80 },
  { key: "status", header: "Status", width: 100 },
];

function getCellValue(resource: KubeResource, key: string): React.ReactNode {
  switch (key) {
    case "name":
      return (
        <span className="font-mono text-sm">
          {isTerminating(resource) ? (
            <span className="text-muted-foreground line-through">{resource.metadata.name}</span>
          ) : (
            resource.metadata.name
          )}
        </span>
      );
    case "namespace":
      return resource.metadata.namespace ? (
        <Badge variant="secondary">{resource.metadata.namespace}</Badge>
      ) : null;
    case "age":
      return (
        <span className="text-xs text-muted-foreground">
          {resourceAge(resource.metadata.creationTimestamp)}
        </span>
      );
    case "status":
      return isTerminating(resource) ? (
        <Badge variant="destructive">Terminating</Badge>
      ) : (
        <Badge variant="success">Active</Badge>
      );
    default:
      return null;
  }
}

export interface ResourceTableProps {
  items: KubeResource[];
  columns?: ColumnDef[];
  selectedName?: string;
  onSelect?: (resource: KubeResource) => void;
  isLoading?: boolean;
}

export function ResourceTable({
  items,
  columns = defaultColumns,
  selectedName,
  onSelect,
  isLoading,
}: ResourceTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const handleRowClick = useCallback(
    (resource: KubeResource) => onSelect?.(resource),
    [onSelect],
  );

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  const headerCols = useMemo(
    () =>
      columns.map((col) => (
        <th
          key={col.key}
          className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
          style={{ width: col.width }}
        >
          {col.header}
        </th>
      )),
    [columns],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading resources…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No resources found
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <table className="min-w-full table-fixed border-collapse">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border">{headerCols}</tr>
        </thead>
      </table>
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ height: totalSize, position: "relative" }}>
          {virtualItems.map((virtualRow) => {
            const resource = items[virtualRow.index]!;
            const isSelected = resource.metadata.name === selectedName;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: virtualRow.start,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                }}
              >
                <table className="min-w-full table-fixed border-collapse">
                  <tbody>
                    <tr
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors hover:bg-accent",
                        isSelected && "bg-accent",
                      )}
                      onClick={() => handleRowClick(resource)}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className="px-3 py-2"
                          style={{ width: col.width }}
                        >
                          {col.render
                            ? col.render(resource)
                            : getCellValue(resource, col.key)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
