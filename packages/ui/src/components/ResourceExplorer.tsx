import type { ApiResourceDescriptor } from "@k8s-ide/core";
import { formatGVR } from "@k8s-ide/core";
import { cn } from "../lib/cn.js";

type Props = {
  resources: ApiResourceDescriptor[];
  selected: ApiResourceDescriptor | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (descriptor: ApiResourceDescriptor) => void;
};

export function ResourceExplorer({
  resources,
  selected,
  searchQuery,
  onSearchChange,
  onSelect,
}: Props) {
  return (
    <aside className="flex h-full w-72 flex-col border-r border-white/10 bg-zinc-950/80">
      <div className="border-b border-white/10 p-3">
        <input
          type="search"
          placeholder="Search resources..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
        />
      </div>
      <div className="k8s-scroll flex-1 overflow-y-auto p-2">
        {resources.map((res) => {
          const active =
            selected?.group === res.group &&
            selected?.version === res.version &&
            selected?.resource === res.resource;
          return (
            <button
              key={`${res.group}/${res.version}/${res.resource}`}
              type="button"
              onClick={() => onSelect(res)}
              className={cn(
                "mb-1 flex w-full flex-col rounded-md px-3 py-2 text-left text-sm transition",
                active ? "bg-sky-600/20 text-sky-200" : "hover:bg-white/5 text-zinc-300",
              )}
            >
              <span className="font-medium">{res.kind}</span>
              <span className="text-xs text-zinc-500">
                {formatGVR(res.group, res.version, res.resource)}
              </span>
            </button>
          );
        })}
        {resources.length === 0 && (
          <p className="px-2 py-4 text-sm text-zinc-500">No resources discovered.</p>
        )}
      </div>
    </aside>
  );
}
