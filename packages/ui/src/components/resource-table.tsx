import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { KubeResource } from '@k8s-ide/core';

type ResourceTableProps = {
  items: KubeResource[];
  selectedName?: string;
  onSelect: (item: KubeResource) => void;
};

export function ResourceTable({ items, selectedName, onSelect }: ResourceTableProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(
    () =>
      items.map((item) => ({
        name: item.metadata?.name ?? 'unknown',
        namespace: item.metadata?.namespace ?? 'cluster',
        kind: item.kind ?? 'Unknown',
        age: item.metadata?.creationTimestamp
          ? new Date(item.metadata.creationTimestamp).toLocaleString()
          : '-',
        item,
      })),
    [items],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 46,
    getScrollElement: () => parentRef.current,
    overscan: 10,
  });

  return (
    <div style={{ display: 'grid', gap: 12, height: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr',
          gap: 12,
          padding: '0 12px',
          color: '#9ca3af',
          fontSize: 12,
          textTransform: 'uppercase',
        }}
      >
        <span>Name</span>
        <span>Namespace</span>
        <span>Kind</span>
        <span>Created</span>
      </div>

      <div
        ref={parentRef}
        style={{
          height: '100%',
          minHeight: 320,
          overflow: 'auto',
          border: '1px solid #1f2937',
          borderRadius: 12,
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) {
              return null;
            }

            const isSelected = row.name === selectedName;
            return (
              <button
                key={row.name}
                onClick={() => onSelect(row.item)}
                type="button"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  height: `${virtualItem.size}px`,
                  background: isSelected ? '#1d4ed8' : 'transparent',
                  color: '#f9fafb',
                  border: 'none',
                  borderBottom: '1px solid #111827',
                  padding: '0 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    gap: 12,
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <span>{row.name}</span>
                  <span>{row.namespace}</span>
                  <span>{row.kind}</span>
                  <span>{row.age}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
