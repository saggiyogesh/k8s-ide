import type { ApiResourceDescriptor, KubeResource, ResourceRef } from "./types.js";

/**
 * Returns a stable string key for a ResourceRef.
 */
export function refKey(ref: ResourceRef): string {
  const ns = ref.namespace ? `/${ref.namespace}` : "";
  return `${ref.group}/${ref.version}/${ref.resource}${ns}/${ref.name}`;
}

/**
 * Builds a browser route path for navigating to a resource list or detail page.
 */
export function resourceRoute(
  ref: Pick<ResourceRef, "group" | "version" | "resource" | "namespace">,
  name?: string,
): string {
  const base = `/resources/${ref.group || "core"}/${ref.version}/${ref.resource}`;
  const ns = ref.namespace ? `/n/${ref.namespace}` : "";
  return name ? `${base}${ns}/${name}` : `${base}${ns}`;
}

/**
 * Returns true when the descriptor is for a namespace-scoped resource.
 */
export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced;
}

/**
 * Returns true when the resource kind should show logs.
 */
export function supportsLogs(resource: KubeResource): boolean {
  return resource.kind === "Pod";
}

/**
 * Returns true when the resource kind should show exec.
 */
export function supportsExec(resource: KubeResource): boolean {
  return resource.kind === "Pod";
}

/**
 * Extracts a ResourceRef from a full KubeResource.
 */
export function toRef(resource: KubeResource): ResourceRef {
  const [group, version] = parseApiVersion(resource.apiVersion);
  const ref: ResourceRef = {
    group,
    version,
    resource: kindToResource(resource.kind),
    name: resource.metadata.name,
  };
  if (resource.metadata.namespace !== undefined) {
    ref.namespace = resource.metadata.namespace;
  }
  return ref;
}

function parseApiVersion(apiVersion: string): [string, string] {
  if (apiVersion.includes("/")) {
    const [group, version] = apiVersion.split("/");
    return [group ?? "", version ?? ""];
  }
  return ["", apiVersion];
}

/**
 * Naive kind → resource plural conversion for display use.
 * Canonical resource names must come from the discovery API.
 */
function kindToResource(kind: string): string {
  return kind.toLowerCase() + "s";
}

/**
 * Returns true when the resource has been marked for deletion.
 */
export function isTerminating(resource: KubeResource): boolean {
  return !!resource.metadata.deletionTimestamp;
}

/**
 * Returns a human-readable age string from a creationTimestamp.
 */
export function resourceAge(creationTimestamp: string): string {
  const created = new Date(creationTimestamp).getTime();
  const diffMs = Date.now() - created;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
