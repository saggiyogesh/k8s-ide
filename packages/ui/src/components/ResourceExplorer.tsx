import { useState, useMemo } from "react";
import { Search, ChevronRight, ChevronDown, Layers } from "lucide-react";
import type { ApiResourceDescriptor } from "@k8s-ide/core";
import { cn } from "../lib/utils.js";
import { Input } from "./ui/input.js";

export interface ResourceExplorerProps {
  resources: ApiResourceDescriptor[];
  selectedResource?: string;
  selectedGroup?: string;
  onSelect?: (descriptor: ApiResourceDescriptor) => void;
}

interface GroupEntry {
  group: string;
  resources: ApiResourceDescriptor[];
}

const PRIORITY_GROUPS = ["", "apps", "batch", "networking.k8s.io", "storage.k8s.io", "rbac.authorization.k8s.io"];

export function ResourceExplorer({
  resources,
  selectedResource,
  selectedGroup,
  onSelect,
}: ResourceExplorerProps) {
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(PRIORITY_GROUPS));

  const grouped = useMemo<GroupEntry[]>(() => {
    const map = new Map<string, ApiResourceDescriptor[]>();
    for (const r of resources) {
      if (
        search &&
        !r.resource.toLowerCase().includes(search.toLowerCase()) &&
        !r.kind.toLowerCase().includes(search.toLowerCase())
      ) {
        continue;
      }
      const entries = map.get(r.group) ?? [];
      entries.push(r);
      map.set(r.group, entries);
    }

    return [...map.entries()]
      .sort(([a], [b]) => {
        const ai = PRIORITY_GROUPS.indexOf(a);
        const bi = PRIORITY_GROUPS.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(([group, rs]) => ({
        group,
        resources: rs.sort((a, b) => a.resource.localeCompare(b.resource)),
      }));
  }, [resources, search]);

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {grouped.map(({ group, resources: rs }) => {
          const isExpanded = expandedGroups.has(group);
          const displayGroup = group || "core";
          return (
            <div key={group}>
              <button
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent"
                onClick={() => toggleGroup(group)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <Layers className="h-3 w-3" />
                <span>{displayGroup}</span>
              </button>
              {isExpanded &&
                rs.map((r) => {
                  const isActive = r.resource === selectedResource && r.group === selectedGroup;
                  return (
                    <button
                      key={`${r.group}/${r.version}/${r.resource}`}
                      className={cn(
                        "flex w-full items-center gap-2 px-6 py-1.5 text-sm transition-colors hover:bg-accent",
                        isActive && "bg-accent text-accent-foreground font-medium",
                      )}
                      onClick={() => onSelect?.(r)}
                    >
                      <span className="truncate">{r.resource}</span>
                      {r.namespaced && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">ns</span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
