import type { ApiResourceDescriptor } from "@k8s-ide/core";
import { resourceRoute } from "@k8s-ide/core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  resources: ApiResourceDescriptor[];
  activeResource?: ApiResourceDescriptor | null;
  onSelect: (resource: ApiResourceDescriptor) => void;
};

export function ResourceExplorer({ resources, activeResource, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return resources;
    return resources.filter((item) => {
      const haystack = [
        item.kind,
        item.resource,
        item.group,
        ...(item.shortNames ?? []),
        ...(item.categories ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, resources]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApiResourceDescriptor[]>();
    for (const item of filtered) {
      const key = item.categories?.[0] ?? (item.namespaced ? "Namespaced" : "Cluster");
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <aside className="k8s-panel k8s-scroll" style={{ padding: "0.9rem", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <Search size={16} className="k8s-muted" />
        <input
          className="k8s-input"
          placeholder="Search API resources"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {grouped.map(([category, items]) => (
          <section key={category}>
            <h3
              className="k8s-muted"
              style={{ fontSize: "0.75rem", textTransform: "uppercase", margin: "0 0 0.5rem" }}
            >
              {category}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {items.map((item) => {
                const active =
                  activeResource?.group === item.group &&
                  activeResource.version === item.version &&
                  activeResource.resource === item.resource;
                return (
                  <button
                    key={resourceRoute(item)}
                    className="k8s-button"
                    style={{
                      justifyContent: "space-between",
                      background: active ? "var(--accent-soft)" : undefined,
                      borderColor: active ? "var(--accent)" : undefined,
                    }}
                    onClick={() => onSelect(item)}
                  >
                    <span>{item.kind}</span>
                    <span className="k8s-muted" style={{ fontSize: "0.75rem" }}>
                      {item.resource}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
