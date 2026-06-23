import type { ApiResourceDescriptor, ResourceCapabilities, ResourceRef } from "./types.js"

/**
 * Derive capabilities for a resource from its discovery descriptor and
 * any well-known kind-specific knowledge.
 */
export function buildCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const v = descriptor.verbs
  const has = (verb: string) => v.includes(verb)

  const kind = descriptor.kind
  const scalable = ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(kind)
  const logsKind = kind === "Pod"
  const execKind = kind === "Pod"
  const pfKind = kind === "Pod" || kind === "Service"

  return {
    canList: has("list"),
    canGet: has("get"),
    canCreate: has("create"),
    canUpdate: has("update"),
    canPatch: has("patch"),
    canDelete: has("delete"),
    canWatch: has("watch"),
    hasLogs: logsKind,
    hasExec: execKind,
    hasPortForward: pfKind,
    hasScale: scalable,
    hasRolloutRestart: scalable,
  }
}

/** Stable string key for a ResourceRef, suitable for Map keys and cache keys. */
export function refKey(ref: ResourceRef): string {
  const ns = ref.namespace ? `/${ref.namespace}` : ""
  return `${ref.group}/${ref.version}/${ref.resource}${ns}/${ref.name}`
}

/**
 * Build the frontend route path for a resource reference.
 * e.g. /resources/apps/v1/deployments/default/my-deploy
 */
export function resourceRoute(ref: ResourceRef): string {
  const base = `/resources/${ref.group || "_"}/${ref.version}/${ref.resource}`
  if (ref.namespace) return `${base}/${ref.namespace}/${ref.name}`
  return `${base}/${ref.name}`
}

export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced
}

export function supportsLogs(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.kind === "Pod"
}

export function supportsExec(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.kind === "Pod"
}

export function supportsPortForward(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.kind === "Pod" || descriptor.kind === "Service"
}

export function supportsScale(descriptor: ApiResourceDescriptor): boolean {
  return ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(descriptor.kind)
}

/**
 * Group + version string in the form used by Kubernetes API paths.
 * Core group resources use "v1", others use "group/version".
 */
export function gvString(group: string, version: string): string {
  return group ? `${group}/${version}` : version
}

/**
 * Find a descriptor by group, version, and resource name.
 */
export function findDescriptor(
  descriptors: ApiResourceDescriptor[],
  group: string,
  version: string,
  resource: string,
): ApiResourceDescriptor | undefined {
  return descriptors.find(
    (d) => d.group === group && d.version === version && d.resource === resource,
  )
}
