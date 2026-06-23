import type { ApiResourceDescriptor } from "@k8s-ide/core";
import { displayGroup } from "@k8s-ide/core";
import { cn } from "../lib/utils.js";
import { Input } from "./primitives.js";

interface ResourceExplorerProps {
  resources: ApiResourceDescriptor[];
  selected?: { group: string; version: string; resource: string };
  search: string;
  onSearchChange: (q: string) => void;
  onSelect: (r: ApiResourceDescriptor) => void;
}

export function ResourceExplorer({
  resources,
  selected,
  search,
  onSearchChange,
  onSelect,
}: ResourceExplorerProps) {
  const q = search.toLowerCase();
  const filtered = resources.filter(
    (r) =>
      r.kind.toLowerCase().includes(q) ||
      r.resource.toLowerCase().includes(q) ||
      (r.shortNames ?? []).some((s) => s.toLowerCase().includes(q)),
  );

  const grouped = new Map<string, ApiResourceDescriptor[]>();
  for (const r of filtered) {
    const g = displayGroup(r.group);
    const list = grouped.get(g) ?? [];
    list.push(r);
    grouped.set(g, list);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 p-3">
        <Input
          placeholder="Search resources..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-auto p-2">
        {[...grouped.entries()].map(([group, items]) => (
          <div key={group} className="mb-3">
            <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white/40">
              {group}
            </div>
            {items.map((r) => {
              const active =
                selected?.group === r.group &&
                selected?.version === r.version &&
                selected?.resource === r.resource;
              return (
                <button
                  key={`${r.group}/${r.version}/${r.resource}`}
                  type="button"
                  onClick={() => onSelect(r)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm",
                    active ? "bg-blue-600/30 text-white" : "hover:bg-white/5 text-white/80",
                  )}
                >
                  <span>{r.kind}</span>
                  <span className="text-xs text-white/40">{r.resource}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
