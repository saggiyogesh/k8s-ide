import type { ApiResourceDescriptor, GroupVersionResource, ResourceRef } from './types.js'

/** Build a stable cache key for a resource reference. */
export function refKey(ref: ResourceRef): string {
  const ns = ref.namespace ?? '_cluster'
  return `${ref.group}/${ref.version}/${ref.resource}/${ns}/${ref.name}`
}

/** Build a stable cache key for a GVR + namespace list. */
export function listKey(gvr: GroupVersionResource, namespace?: string): string {
  const ns = namespace ?? '_all'
  return `${gvr.group}/${gvr.version}/${gvr.resource}/${ns}`
}

/** Build a route path segment for a resource. */
export function resourceRoute(ref: ResourceRef): string {
  const base = `/resources/${encodeGVR(ref)}/${encodeURIComponent(ref.name)}`
  if (ref.namespace) {
    return `${base}?namespace=${encodeURIComponent(ref.namespace)}`
  }
  return base
}

export function encodeGVR(gvr: GroupVersionResource): string {
  const group = gvr.group || '_'
  return `${encodeURIComponent(group)}/${encodeURIComponent(gvr.version)}/${encodeURIComponent(gvr.resource)}`
}

export function decodeGVR(encoded: string): GroupVersionResource {
  const [group, version, resource] = encoded.split('/')
  return {
    group: group === '_' ? '' : decodeURIComponent(group),
    version: decodeURIComponent(version),
    resource: decodeURIComponent(resource),
  }
}

export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced
}

export function gvrFromDescriptor(d: ApiResourceDescriptor): GroupVersionResource {
  return { group: d.group, version: d.version, resource: d.resource }
}

export function refFromResource(
  gvr: GroupVersionResource,
  resource: { metadata: { name: string; namespace?: string } },
): ResourceRef {
  return {
    ...gvr,
    name: resource.metadata.name,
    namespace: resource.metadata.namespace,
  }
}
