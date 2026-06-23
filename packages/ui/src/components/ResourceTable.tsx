import type { ResourceListItem } from "@k8s-ide/core";
import { cn } from "../lib/utils.js";
import { EmptyState } from "./primitives.js";

interface ResourceTableProps {
  items: ResourceListItem[];
  selectedName?: string;
  loading?: boolean;
  onSelect: (item: ResourceListItem) => void;
}

export function ResourceTable({
  items,
  selectedName,
  loading,
  onSelect,
}: ResourceTableProps) {
  if (loading && items.length === 0) {
    return <EmptyState title="Loading resources..." />;
  }
  if (items.length === 0) {
    return <EmptyState title="No resources found" description="Try another namespace or resource type." />;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[hsl(var(--background))] text-left text-xs uppercase text-white/40">
          <tr className="border-b border-white/10">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Namespace</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.ref.namespace ?? ""}/${item.ref.name}`}
              onClick={() => onSelect(item)}
              className={cn(
                "cursor-pointer border-b border-white/5 hover:bg-white/5",
                selectedName === item.ref.name && "bg-blue-600/20",
              )}
            >
              <td className="px-3 py-2 font-medium">{item.ref.name}</td>
              <td className="px-3 py-2 text-white/60">{item.ref.namespace ?? "—"}</td>
              <td className="px-3 py-2 text-white/60">{item.status ?? "—"}</td>
              <td className="px-3 py-2 text-white/40">{item.createdAt ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
