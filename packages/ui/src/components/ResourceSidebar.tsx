import { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Search,
  Database,
  Box,
  Network,
  Settings,
  Shield,
  HardDrive,
} from "lucide-react";
import { useDiscovery, useExplorerStore, useSessionStore } from "@k8s-ide/store";
import type { ApiResourceDescriptor } from "@k8s-ide/core";
import { cn } from "../utils.js";

interface ResourceGroup {
  name: string;
  label: string;
  icon: React.ReactNode;
  resources: ApiResourceDescriptor[];
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  "": <Box className="w-4 h-4" />,
  "apps": <Database className="w-4 h-4" />,
  "networking.k8s.io": <Network className="w-4 h-4" />,
  "rbac.authorization.k8s.io": <Shield className="w-4 h-4" />,
  "storage.k8s.io": <HardDrive className="w-4 h-4" />,
};

function groupLabel(group: string): string {
  if (!group) return "Core";
  const parts = group.split(".");
  return parts[0]!.charAt(0).toUpperCase() + parts[0]!.slice(1);
}

export function ResourceSidebar() {
  const { data: discovery } = useDiscovery();
  const { setSelectedResource } = useExplorerStore();
  const { selectedResource, resourceGroupExpanded, toggleResourceGroup } = useExplorerStore();
  const activeContext = useSessionStore((s) => s.activeContext);
  const [search, setSearch] = useState("");

  const groups = useMemo<ResourceGroup[]>(() => {
    if (!discovery) return [];
    const groupMap = new Map<string, ApiResourceDescriptor[]>();
    for (const r of discovery) {
      if (!r.verbs.includes("list")) continue;
      const list = groupMap.get(r.group) ?? [];
      list.push(r);
      groupMap.set(r.group, list);
    }

    return Array.from(groupMap.entries())
      .map(([name, resources]) => ({
        name,
        label: groupLabel(name),
        icon: GROUP_ICONS[name] ?? <Settings className="w-4 h-4" />,
        resources: resources.filter((r) =>
          search
            ? r.kind.toLowerCase().includes(search.toLowerCase()) ||
              r.resource.toLowerCase().includes(search.toLowerCase())
            : true,
        ),
      }))
      .filter((g) => g.resources.length > 0)
      .sort((a, b) => {
        // Put Core first
        if (a.name === "") return -1;
        if (b.name === "") return 1;
        return a.label.localeCompare(b.label);
      });
  }, [discovery, search]);

  if (!activeContext) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-sm text-muted-foreground">
        <Database className="w-8 h-8 mb-2 opacity-50" />
        <p>No context selected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted text-sm">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="Filter resources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto py-1">
        {groups.map((group) => {
          const expanded = resourceGroupExpanded[group.name] !== false;
          return (
            <div key={group.name}>
              <button
                className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                onClick={() => toggleResourceGroup(group.name)}
              >
                {expanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                {group.icon}
                <span className="uppercase tracking-wider">{group.label}</span>
              </button>
              {expanded && (
                <div>
                  {group.resources.map((r) => {
                    const isActive =
                      selectedResource?.group === r.group &&
                      selectedResource?.version === r.version &&
                      selectedResource?.resource === r.resource;
                    return (
                      <button
                        key={`${r.group}/${r.version}/${r.resource}`}
                        className={cn(
                          "flex items-center w-full px-6 py-1 text-sm hover:bg-accent/50 transition-colors text-left",
                          isActive && "bg-accent text-accent-foreground font-medium",
                        )}
                        onClick={() =>
                          setSelectedResource({
                            group: r.group,
                            version: r.version,
                            resource: r.resource,
                            kind: r.kind,
                          })
                        }
                      >
                        {r.kind}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
