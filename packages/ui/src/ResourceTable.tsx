import { useVirtualizer } from "@tanstack/react-virtual"
import type { KubeResource } from "@k8s-ide/core"
import { useRef } from "react"
import { cn, formatAge, truncate } from "./utils.js"

interface Column {
  key: string
  header: string
  width?: number
  render?: (resource: KubeResource) => React.ReactNode
}

interface ResourceTableProps {
  resources: KubeResource[]
  columns?: Column[]
  onSelect?: (resource: KubeResource) => void
  selectedName?: string
  className?: string
}

const DEFAULT_COLUMNS: Column[] = [
  { key: "name", header: "Name", render: (r) => r.metadata.name },
  {
    key: "namespace",
    header: "Namespace",
    render: (r) => r.metadata.namespace ?? "—",
  },
  {
    key: "age",
    header: "Age",
    width: 80,
    render: (r) => formatAge(r.metadata.creationTimestamp),
  },
  {
    key: "status",
    header: "Status",
    width: 100,
    render: (r) => {
      const phase = (r.status as Record<string, unknown> | undefined)?.["phase"]
      return typeof phase === "string" ? phase : "—"
    },
  },
]

export function ResourceTable({
  resources,
  columns = DEFAULT_COLUMNS,
  onSelect,
  selectedName,
  className,
}: ResourceTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: resources.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center border-b bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0 z-10">
        {columns.map((col) => (
          <div
            key={col.key}
            className="px-3 py-2 truncate"
            style={{ width: col.width ?? "auto", flex: col.width ? "none" : 1 }}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Virtualised rows */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vrow) => {
            const resource = resources[vrow.index]
            if (!resource) return null
            const isSelected = resource.metadata.name === selectedName
            return (
              <div
                key={vrow.key}
                data-index={vrow.index}
                ref={virtualizer.measureElement}
                className={cn(
                  "absolute top-0 left-0 w-full flex items-center border-b text-sm cursor-pointer transition-colors",
                  isSelected ? "bg-accent" : "hover:bg-accent/30",
                )}
                style={{ transform: `translateY(${vrow.start}px)` }}
                onClick={() => onSelect?.(resource)}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="px-3 py-2 truncate"
                    style={{ width: col.width ?? "auto", flex: col.width ? "none" : 1 }}
                  >
                    {col.render
                      ? col.render(resource)
                      : truncate(String((resource as Record<string, unknown>)[col.key] ?? ""))}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="px-3 py-1 text-xs text-muted-foreground border-t">
        {resources.length} item{resources.length !== 1 ? "s" : ""}
      </div>
    </div>
  )
}
