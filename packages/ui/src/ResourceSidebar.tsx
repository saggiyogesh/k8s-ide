import type { ApiResourceDescriptor } from "@k8s-ide/core"
import { useExplorerStore } from "@k8s-ide/store"
import { ChevronRight, Database, Layers } from "lucide-react"
import { cn } from "./utils.js"

interface GVR {
  group: string
  version: string
  resource: string
}

interface ResourceSidebarProps {
  descriptors: ApiResourceDescriptor[]
  className?: string
}

export function ResourceSidebar({ descriptors, className }: ResourceSidebarProps) {
  const { activeGVR, setActiveGVR } = useExplorerStore()

  // Group descriptors by API group
  const groups = new Map<string, ApiResourceDescriptor[]>()
  for (const d of descriptors) {
    const g = d.group || "core"
    const existing = groups.get(g) ?? []
    existing.push(d)
    groups.set(g, existing)
  }

  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === "core") return -1
    if (b === "core") return 1
    return a.localeCompare(b)
  })

  return (
    <nav className={cn("flex flex-col gap-1 overflow-y-auto", className)}>
      {sortedGroups.map(([group, resources]) => (
        <GroupSection
          key={group}
          group={group}
          resources={resources}
          activeGVR={activeGVR}
          onSelect={setActiveGVR}
        />
      ))}
    </nav>
  )
}

interface GroupSectionProps {
  group: string
  resources: ApiResourceDescriptor[]
  activeGVR: GVR | null
  onSelect: (gvr: GVR) => void
}

function GroupSection({ group, resources, activeGVR, onSelect }: GroupSectionProps) {
  const sorted = resources.slice().sort((a, b) => a.resource.localeCompare(b.resource))

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <Layers className="h-3 w-3" />
        <span>{group}</span>
      </div>
      {sorted.map((r) => {
        const isActive =
          activeGVR?.group === r.group &&
          activeGVR?.version === r.version &&
          activeGVR?.resource === r.resource
        return (
          <button
            key={`${r.group}/${r.version}/${r.resource}`}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-left transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50 text-foreground/70 hover:text-foreground",
            )}
            onClick={() =>
              onSelect({ group: r.group, version: r.version, resource: r.resource })
            }
          >
            <Database className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="flex-1 truncate">{r.resource}</span>
            <ChevronRight className="h-3.5 w-3.5 opacity-40" />
          </button>
        )
      })}
    </div>
  )
}
