import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import type { KubeResource } from '@k8s-ide/core'
import { cn } from '../lib/utils.js'

export interface ResourceTableProps {
  items: KubeResource[]
  selectedName?: string
  onSelect: (item: KubeResource) => void
  isLoading?: boolean
}

export function ResourceTable({ items, selectedName, onSelect, isLoading }: ResourceTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Loading resources…
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        No resources found
      </div>
    )
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_140px_180px] border-b border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        <span>Name</span>
        <span>Namespace</span>
        <span>Created</span>
      </div>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index]
          const name = item.metadata.name
          const ns = item.metadata.namespace ?? '—'
          const created = item.metadata.creationTimestamp
            ? new Date(item.metadata.creationTimestamp).toLocaleString()
            : '—'
          const selected = selectedName === name

          return (
            <button
              key={item.metadata.uid ?? `${name}-${row.index}`}
              type="button"
              className={cn(
                'absolute left-0 top-0 grid w-full grid-cols-[1fr_140px_180px] border-b border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-accent)]',
                selected && 'bg-[var(--color-accent)]',
              )}
              style={{ height: `${row.size}px`, transform: `translateY(${row.start}px)` }}
              onClick={() => onSelect(item)}
            >
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-[var(--color-muted-foreground)]">{ns}</span>
              <span className="truncate text-[var(--color-muted-foreground)]">{created}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
