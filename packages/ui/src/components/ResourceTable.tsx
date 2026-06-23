import { useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RefreshCw, Loader2, AlertCircle } from "lucide-react";
import {
  useResources,
  useExplorerStore,
  useSessionStore,
  useDeleteResource,
} from "@k8s-ide/store";
import { ageFromTimestamp, isBeingDeleted } from "@k8s-ide/core";
import type { KubeResource } from "@k8s-ide/core";
import { cn } from "../utils.js";

interface Column {
  key: string;
  header: string;
  width: string;
  render: (item: KubeResource) => React.ReactNode;
}

const BASE_COLUMNS: Column[] = [
  {
    key: "name",
    header: "Name",
    width: "flex-1 min-w-0",
    render: (r) => (
      <span
        className={cn(
          "truncate font-mono text-xs",
          isBeingDeleted(r) && "line-through opacity-60",
        )}
      >
        {r.metadata.name}
      </span>
    ),
  },
  {
    key: "namespace",
    header: "Namespace",
    width: "w-36",
    render: (r) => (
      <span className="text-muted-foreground text-xs truncate">{r.metadata.namespace ?? "—"}</span>
    ),
  },
  {
    key: "age",
    header: "Age",
    width: "w-20",
    render: (r) => (
      <span className="text-muted-foreground text-xs">
        {r.metadata.creationTimestamp ? ageFromTimestamp(r.metadata.creationTimestamp) : "—"}
      </span>
    ),
  },
];

export function ResourceTable() {
  const { selectedResource, setSelectedItem, selectedItem } = useExplorerStore();
  const { activeContext, selectedNamespace } = useSessionStore((s) => ({
    activeContext: s.activeContext,
    selectedNamespace: s.selectedNamespace,
  }));

  const opts = useMemo(
    () =>
      selectedResource
        ? {
            group: selectedResource.group,
            version: selectedResource.version,
            resource: selectedResource.resource,
            ...(selectedNamespace ? { namespace: selectedNamespace } : {}),
          }
        : null,
    [selectedResource, selectedNamespace],
  );

  const { data, isLoading, isError, error, refetch } = useResources(
    opts ?? { group: "", version: "v1", resource: "pods" },
  );

  const { mutate: deleteResource } = useDeleteResource();

  const items = data?.items ?? [];

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 15,
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, item: KubeResource) => {
      if (e.key === "Enter" || e.key === " ") {
        setSelectedItem({
          ...(item.metadata.namespace ? { namespace: item.metadata.namespace } : {}),
          name: item.metadata.name,
        });
      }
      if (e.key === "Delete" && e.shiftKey) {
        if (confirm(`Delete ${item.metadata.name}?`)) {
          deleteResource({
            group: selectedResource?.group ?? "",
            version: selectedResource?.version ?? "v1",
            resource: selectedResource?.resource ?? "",
            ...(item.metadata.namespace ? { namespace: item.metadata.namespace } : {}),
            name: item.metadata.name,
          });
        }
      }
    },
    [setSelectedItem, deleteResource, selectedResource],
  );

  if (!selectedResource || !activeContext) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a resource type from the sidebar
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading {selectedResource.kind}…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-sm">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <p className="text-destructive">{String(error)}</p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {BASE_COLUMNS.map((col) => (
            <div
              key={col.key}
              className={cn("text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0", col.width)}
            >
              {col.header}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-muted-foreground">{items.length} items</span>
          <button
            onClick={() => refetch()}
            className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Virtual rows */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index]!;
            const isSelected =
              selectedItem?.name === item.metadata.name &&
              selectedItem?.namespace === item.metadata.namespace;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={cn(
                  "absolute top-0 left-0 right-0 flex items-center px-3 py-2 cursor-pointer border-b border-border/50 hover:bg-accent/30 transition-colors text-sm",
                  isSelected && "bg-accent",
                )}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
                onClick={() =>
                  setSelectedItem({
                    ...(item.metadata.namespace ? { namespace: item.metadata.namespace } : {}),
                    name: item.metadata.name,
                  })
                }
                onKeyDown={(e) => handleKeyDown(e, item)}
                tabIndex={0}
                role="row"
              >
                {BASE_COLUMNS.map((col) => (
                  <div key={col.key} className={cn("flex items-center shrink-0", col.width)}>
                    {col.render(item)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
