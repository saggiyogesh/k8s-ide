import type { ApiResourceDescriptor, KubeResource, ResourceRef } from "@k8s-ide/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

type Props = {
  items: KubeResource[];
  descriptor?: ApiResourceDescriptor | null;
  selected?: ResourceRef | null;
  onSelect: (resource: ResourceRef) => void;
  loading?: boolean;
};

function toRef(item: KubeResource, descriptor?: ApiResourceDescriptor | null): ResourceRef {
  if (descriptor) {
    return {
      group: descriptor.group,
      version: descriptor.version,
      resource: descriptor.resource,
      kind: descriptor.kind,
      namespace: item.metadata.namespace,
      name: item.metadata.name,
      uid: item.metadata.uid,
    };
  }

  const [group, version] = item.apiVersion.includes("/")
    ? item.apiVersion.split("/", 2)
    : ["", item.apiVersion];

  return {
    group,
    version,
    resource: item.kind.toLowerCase() + "s",
    kind: item.kind,
    namespace: item.metadata.namespace,
    name: item.metadata.name,
    uid: item.metadata.uid,
  };
}

export function ResourceTable({ items, descriptor, selected, onSelect, loading }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  if (loading) {
    return <div className="k8s-panel" style={{ padding: "1rem" }}>Loading resources...</div>;
  }

  if (items.length === 0) {
    return <div className="k8s-panel" style={{ padding: "1rem" }}>No resources found.</div>;
  }

  return (
    <div className="k8s-panel" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        className="k8s-table-row k8s-muted"
        style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600 }}
      >
        <span>Name</span>
        <span>Namespace</span>
        <span>Created</span>
        <span>Labels</span>
      </div>
      <div ref={parentRef} className="k8s-scroll" style={{ flex: 1, minHeight: 320 }}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            const ref = toRef(item, descriptor);
            const isSelected =
              selected?.name === ref.name &&
              selected.namespace === ref.namespace &&
              selected.kind === ref.kind;

            return (
              <button
                key={item.metadata.uid ?? `${ref.namespace}/${ref.name}`}
                className={`k8s-table-row ${isSelected ? "k8s-table-row-selected" : ""}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                }}
                onClick={() => onSelect(ref)}
              >
                <span>{item.metadata.name}</span>
                <span className="k8s-muted">{item.metadata.namespace ?? "—"}</span>
                <span className="k8s-muted">
                  {item.metadata.creationTimestamp
                    ? new Date(item.metadata.creationTimestamp).toLocaleString()
                    : "—"}
                </span>
                <span className="k8s-muted">
                  {Object.keys(item.metadata.labels ?? {}).length || "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
