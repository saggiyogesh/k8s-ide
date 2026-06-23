import type { ApiResourceDescriptor, ResourceRef } from '@k8s-ide/core'
import { filterByCategory, groupByApiGroup, searchDescriptors } from '@k8s-ide/core'
import { useExplorerStore } from '@k8s-ide/store'
import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Input } from './input.js'
import { YamlEditor } from './yaml-editor.js'
import { cn } from '../lib/utils.js'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'workloads', label: 'Workloads' },
  { id: 'networking', label: 'Networking' },
  { id: 'config', label: 'Config' },
  { id: 'storage', label: 'Storage' },
  { id: 'cluster', label: 'Cluster' },
]

export interface ResourceExplorerProps {
  descriptors: ApiResourceDescriptor[]
  onSelectDescriptor: (d: ApiResourceDescriptor) => void
}

export function ResourceExplorer({ descriptors, onSelectDescriptor }: ResourceExplorerProps) {
  const { selectedDescriptor, category, setCategory, setSearchQuery } = useExplorerStore()
  const [localSearch, setLocalSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['core', 'apps']))

  const filtered = useMemo(() => {
    let result = filterByCategory(descriptors, category)
    result = searchDescriptors(result, localSearch)
    return result
  }, [descriptors, category, localSearch])

  const grouped = useMemo(() => groupByApiGroup(filtered), [filtered])

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-sidebar)]">
      <div className="border-b border-[var(--color-border)] p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
          <Input
            className="pl-8"
            placeholder="Search resources…"
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value)
              setSearchQuery(e.target.value)
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                'rounded-md px-2 py-1 text-xs',
                category === c.id
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {[...grouped.entries()].map(([group, items]) => (
          <div key={group} className="mb-1">
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-[var(--color-accent)]"
              onClick={() => toggleGroup(group)}
            >
              <ChevronRight
                className={cn(
                  'h-4 w-4 transition-transform',
                  expandedGroups.has(group) && 'rotate-90',
                )}
              />
              {group}
            </button>
            {expandedGroups.has(group) && (
              <div className="ml-4">
                {items.map((d) => (
                  <button
                    key={`${d.group}/${d.version}/${d.resource}`}
                    type="button"
                    className={cn(
                      'block w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-[var(--color-accent)]',
                      selectedDescriptor?.kind === d.kind &&
                        selectedDescriptor?.group === d.group &&
                        'bg-[var(--color-accent)] font-medium',
                    )}
                    onClick={() => onSelectDescriptor(d)}
                  >
                    {d.kind}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export interface ResourceDetailProps {
  resource: ResourceRef | null
  yaml: string
  onApply?: (yaml: string) => Promise<void>
  capabilities?: { canDelete?: boolean; canApply?: boolean }
  onDelete?: () => void
}

export function ResourceDetail({
  resource,
  yaml,
  onApply,
  capabilities,
  onDelete,
}: ResourceDetailProps) {
  if (!resource) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        Select a resource to view details
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] p-3">
        <div>
          <h2 className="text-lg font-semibold">{resource.name}</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {resource.group || 'core'}/{resource.version}/{resource.resource}
            {resource.namespace ? ` · ${resource.namespace}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {capabilities?.canDelete && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-[var(--color-destructive)] px-3 py-1.5 text-sm text-[var(--color-destructive)] hover:bg-[var(--color-destructive)] hover:text-white"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <YamlEditor
          value={yaml}
          readOnly={!capabilities?.canApply}
          onApply={capabilities?.canApply ? onApply : undefined}
        />
      </div>
    </div>
  )
}
