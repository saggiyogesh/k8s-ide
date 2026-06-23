import type { ApiResourceDescriptor, ResourceCapabilities, ResourceRef } from "./types.js";

export function refKey(ref: Pick<ResourceRef, "group" | "version" | "resource" | "namespace" | "name">): string {
  const ns = ref.namespace ?? "_cluster";
  return `${ref.group}/${ref.version}/${ref.resource}/${ns}/${ref.name}`;
}

export function listKey(opts: {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
}): string {
  const ns = opts.namespace ?? "_all";
  const labels = opts.labelSelector ?? "";
  const fields = opts.fieldSelector ?? "";
  return `${opts.group}/${opts.version}/${opts.resource}/${ns}?labels=${labels}&fields=${fields}`;
}

export function resourceRoute(descriptor: ApiResourceDescriptor): string {
  const groupPath = descriptor.group ? `${descriptor.group}/` : "";
  return `/resources/${groupPath}${descriptor.version}/${descriptor.resource}`;
}

export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced;
}

const LOG_KINDS = new Set(["Pod", "Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob", "ReplicaSet"]);
const SCALE_KINDS = new Set(["Deployment", "StatefulSet", "ReplicaSet"]);
const RESTART_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet"]);

export function supportsLogs(kind: string): boolean {
  return LOG_KINDS.has(kind);
}

export function supportsScale(kind: string): boolean {
  return SCALE_KINDS.has(kind);
}

export function supportsRestart(kind: string): boolean {
  return RESTART_KINDS.has(kind);
}

export function supportsExec(kind: string): boolean {
  return kind === "Pod";
}

export function supportsPortForward(kind: string): boolean {
  return kind === "Pod" || kind === "Service";
}

export function deriveCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs.map((v) => v.toLowerCase()));
  const kind = descriptor.kind;

  return {
    canList: verbs.has("list") || verbs.has("get"),
    canGet: verbs.has("get"),
    canCreate: verbs.has("create"),
    canUpdate: verbs.has("update") || verbs.has("patch"),
    canDelete: verbs.has("delete"),
    canWatch: verbs.has("watch") || verbs.has("list"),
    canScale: supportsScale(kind) && (verbs.has("patch") || verbs.has("update")),
    canRestart: supportsRestart(kind) && (verbs.has("patch") || verbs.has("update")),
    canLogs: supportsLogs(kind),
    canExec: supportsExec(kind),
    canPortForward: supportsPortForward(kind),
  };
}

export function gvrFromDescriptor(descriptor: ApiResourceDescriptor): {
  group: string;
  version: string;
  resource: string;
} {
  return {
    group: descriptor.group,
    version: descriptor.version,
    resource: descriptor.resource,
  };
}

export function formatGroupVersion(group: string, version: string): string {
  if (!group) return version;
  return `${group}/${version}`;
}
