import React, { useState, useMemo } from "react";
import type { ApiResourceDescriptor } from "@k8s-ide/core";
import { cn } from "../utils.js";

const PINNED_RESOURCES = [
  { group: "", version: "v1", resource: "pods", label: "Pods" },
  { group: "", version: "v1", resource: "services", label: "Services" },
  { group: "", version: "v1", resource: "configmaps", label: "ConfigMaps" },
  { group: "", version: "v1", resource: "secrets", label: "Secrets" },
  { group: "", version: "v1", resource: "persistentvolumeclaims", label: "PVCs" },
  { group: "", version: "v1", resource: "namespaces", label: "Namespaces" },
  { group: "", version: "v1", resource: "nodes", label: "Nodes" },
  {
    group: "apps",
    version: "v1",
    resource: "deployments",
    label: "Deployments",
  },
  {
    group: "apps",
    version: "v1",
    resource: "statefulsets",
    label: "StatefulSets",
  },
  {
    group: "apps",
    version: "v1",
    resource: "daemonsets",
    label: "DaemonSets",
  },
  {
    group: "networking.k8s.io",
    version: "v1",
    resource: "ingresses",
    label: "Ingresses",
  },
];

interface SidebarProps {
  descriptors: ApiResourceDescriptor[];
  selectedResource: string;
  selectedGroup: string;
  onSelect: (group: string, version: string, resource: string) => void;
  isOpen?: boolean;
}

export function Sidebar({
  descriptors,
  selectedResource,
  selectedGroup,
  onSelect,
  isOpen = true,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const allItems = useMemo(() => {
    if (!showAll) return PINNED_RESOURCES;
    return descriptors.map((d) => ({
      group: d.group,
      version: d.version,
      resource: d.resource,
      label: d.kind,
    }));
  }, [descriptors, showAll]);

  const filtered = useMemo(() => {
    if (!search) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(
      (i) => i.label.toLowerCase().includes(q) || i.resource.toLowerCase().includes(q),
    );
  }, [allItems, search]);

  if (!isOpen) return null;

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-zinc-900 border-r border-zinc-700 h-full">
      <div className="p-2 border-b border-zinc-700">
        <input
          type="search"
          placeholder="Filter resources…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-800 text-zinc-200 text-xs px-2 py-1.5 rounded border border-zinc-700 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500"
        />
      </div>
      <nav className="flex-1 overflow-y-auto py-1">
        {filtered.map((item) => {
          const isActive =
            item.resource === selectedResource && item.group === selectedGroup;
          return (
            <button
              key={`${item.group}/${item.resource}`}
              onClick={() => onSelect(item.group, item.version, item.resource)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-sky-900/50 text-sky-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="p-2 border-t border-zinc-700">
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-300 w-full text-left"
        >
          {showAll ? "Show pinned only" : `Show all (${descriptors.length})`}
        </button>
      </div>
    </aside>
  );
}
