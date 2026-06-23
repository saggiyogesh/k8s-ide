import type { ApiResourceDescriptor, ResourceRef } from "./types.js";

export function refKey(ref: Pick<ResourceRef, "group" | "version" | "resource" | "namespace" | "name">): string {
  const ns = ref.namespace ?? "_cluster";
  return `${ref.group}/${ref.version}/${ref.resource}/${ns}/${ref.name}`;
}

export function gvrKey(group: string, version: string, resource: string): string {
  return `${group}/${version}/${resource}`;
}

export function resourceRoute(ref: ResourceRef): string {
  const base = `/resources/${encodeURIComponent(ref.group)}/${encodeURIComponent(ref.version)}/${encodeURIComponent(ref.resource)}`;
  if (ref.namespace) {
    return `${base}/n/${encodeURIComponent(ref.namespace)}/${encodeURIComponent(ref.name)}`;
  }
  return `${base}/${encodeURIComponent(ref.name)}`;
}

export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced;
}

export function supportsLogs(kind: string): boolean {
  return kind === "Pod";
}

export function supportsExec(kind: string): boolean {
  return kind === "Pod";
}

export function supportsScale(kind: string): boolean {
  return ["Deployment", "StatefulSet", "ReplicaSet", "ReplicationController"].includes(kind);
}

export function supportsRestart(kind: string): boolean {
  return ["Deployment", "StatefulSet", "DaemonSet"].includes(kind);
}

export function supportsPortForward(kind: string): boolean {
  return ["Pod", "Service"].includes(kind);
}

export function deriveCapabilities(descriptor: ApiResourceDescriptor): import("./types.js").ResourceCapabilities {
  const verbs = new Set(descriptor.verbs);
  const kind = descriptor.kind;

  return {
    canList: verbs.has("list"),
    canGet: verbs.has("get"),
    canCreate: verbs.has("create"),
    canUpdate: verbs.has("update") || verbs.has("patch"),
    canDelete: verbs.has("delete"),
    canWatch: verbs.has("watch"),
    canApply: verbs.has("create") || verbs.has("update") || verbs.has("patch"),
    canScale: supportsScale(kind),
    canRestart: supportsRestart(kind),
    canLogs: supportsLogs(kind),
    canExec: supportsExec(kind),
    canPortForward: supportsPortForward(kind),
  };
}

export function formatGVR(group: string, version: string, resource: string): string {
  if (!group) {
    return `${version}/${resource}`;
  }
  return `${group}/${version}/${resource}`;
}

export function parseApiVersion(apiVersion: string): { group: string; version: string } {
  const parts = apiVersion.split("/");
  if (parts.length === 1) {
    return { group: "", version: parts[0] };
  }
  return { group: parts[0], version: parts[1] };
}

export function ageFromTimestamp(timestamp?: string): string {
  if (!timestamp) return "—";
  const created = new Date(timestamp).getTime();
  const diff = Date.now() - created;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
