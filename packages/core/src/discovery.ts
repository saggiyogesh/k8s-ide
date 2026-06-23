import type { ApiResourceDescriptor } from './types.js'

/** Group discovery descriptors by API group for navigation trees. */
export function groupByApiGroup(
  descriptors: ApiResourceDescriptor[],
): Map<string, ApiResourceDescriptor[]> {
  const groups = new Map<string, ApiResourceDescriptor[]>()

  for (const d of descriptors) {
    const key = d.group || 'core'
    const list = groups.get(key) ?? []
    list.push(d)
    groups.set(key, list)
  }

  for (const [, list] of groups) {
    list.sort((a, b) => a.kind.localeCompare(b.kind))
  }

  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/** Find a descriptor by kind name (case-sensitive). */
export function findByKind(
  descriptors: ApiResourceDescriptor[],
  kind: string,
): ApiResourceDescriptor | undefined {
  return descriptors.find((d) => d.kind === kind)
}

/** Find descriptors matching a search query (kind, resource, shortNames). */
export function searchDescriptors(
  descriptors: ApiResourceDescriptor[],
  query: string,
): ApiResourceDescriptor[] {
  const q = query.toLowerCase().trim()
  if (!q) return descriptors

  return descriptors.filter((d) => {
    if (d.kind.toLowerCase().includes(q)) return true
    if (d.resource.toLowerCase().includes(q)) return true
    if (d.shortNames?.some((s) => s.toLowerCase().includes(q))) return true
    if (d.group.toLowerCase().includes(q)) return true
    return false
  })
}

/** Core workload categories for quick navigation. */
export const WORKLOAD_CATEGORIES = ['all', 'workloads', 'networking', 'config', 'storage', 'cluster']

export function filterByCategory(
  descriptors: ApiResourceDescriptor[],
  category: string,
): ApiResourceDescriptor[] {
  if (category === 'all') return descriptors

  const categoryMap: Record<string, string[]> = {
    workloads: ['pods', 'deployments', 'replicasets', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs'],
    networking: ['services', 'endpoints', 'ingresses', 'networkpolicies'],
    config: ['configmaps', 'secrets'],
    storage: ['persistentvolumeclaims', 'persistentvolumes', 'storageclasses'],
    cluster: ['nodes', 'namespaces', 'customresourcedefinitions'],
  }

  const resources = categoryMap[category]
  if (!resources) return descriptors

  return descriptors.filter(
    (d) =>
      resources.includes(d.resource) ||
      d.categories?.some((c) => c.toLowerCase() === category),
  )
}
