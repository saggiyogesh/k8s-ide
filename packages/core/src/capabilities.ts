import type { ApiResourceDescriptor, KubeResource, ResourceRef } from "./types.js";

// ─── Verb helpers ─────────────────────────────────────────────────────────────

export function hasVerb(descriptor: ApiResourceDescriptor, verb: string): boolean {
  return descriptor.verbs.includes(verb);
}

export interface ResourceCapabilities {
  canList: boolean;
  canGet: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canPatch: boolean;
  canDelete: boolean;
  canWatch: boolean;
  supportsLogs: boolean;
  supportsExec: boolean;
  supportsPortForward: boolean;
  supportsScale: boolean;
  supportsRestart: boolean;
}

const SCALABLE_KINDS = new Set(["Deployment", "StatefulSet", "ReplicaSet", "DaemonSet"]);
const RESTARTABLE_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet"]);
const LOG_KINDS = new Set(["Pod"]);
const EXEC_KINDS = new Set(["Pod"]);
const PORT_FORWARD_KINDS = new Set(["Pod", "Service"]);

export function getCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  return {
    canList: hasVerb(descriptor, "list"),
    canGet: hasVerb(descriptor, "get"),
    canCreate: hasVerb(descriptor, "create"),
    canUpdate: hasVerb(descriptor, "update"),
    canPatch: hasVerb(descriptor, "patch"),
    canDelete: hasVerb(descriptor, "delete"),
    canWatch: hasVerb(descriptor, "watch"),
    supportsLogs: LOG_KINDS.has(descriptor.kind),
    supportsExec: EXEC_KINDS.has(descriptor.kind),
    supportsPortForward: PORT_FORWARD_KINDS.has(descriptor.kind),
    supportsScale: SCALABLE_KINDS.has(descriptor.kind),
    supportsRestart: RESTARTABLE_KINDS.has(descriptor.kind),
  };
}

// ─── Resource addressing utilities ───────────────────────────────────────────

export function refKey(ref: ResourceRef): string {
  const ns = ref.namespace ?? "_";
  const name = ref.name ?? "*";
  return `${ref.group}/${ref.version}/${ref.resource}/${ns}/${name}`;
}

export function watchKey(
  group: string,
  version: string,
  resource: string,
  namespace?: string,
): string {
  return `${group}/${version}/${resource}/${namespace ?? "_"}`;
}

export function resourceRoute(ref: ResourceRef): string {
  const base = ref.group
    ? `/resources/${ref.group}/${ref.version}/${ref.resource}`
    : `/resources/core/${ref.version}/${ref.resource}`;
  if (ref.namespace && ref.name) return `${base}/${ref.namespace}/${ref.name}`;
  if (ref.name) return `${base}/${ref.name}`;
  if (ref.namespace) return `${base}?namespace=${ref.namespace}`;
  return base;
}

export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced;
}

export function supportsLogs(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.kind === "Pod";
}

export function groupVersionString(group: string, version: string): string {
  return group ? `${group}/${version}` : version;
}

// ─── Resource name helpers ────────────────────────────────────────────────────

export function resourceName(resource: KubeResource): string {
  return resource.metadata.name;
}

export function resourceNamespace(resource: KubeResource): string | undefined {
  return resource.metadata.namespace;
}

export function isBeingDeleted(resource: KubeResource): boolean {
  return !!resource.metadata.deletionTimestamp;
}

export function ageFromTimestamp(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ─── Discovery index ──────────────────────────────────────────────────────────

export class DiscoveryIndex {
  private byKind = new Map<string, ApiResourceDescriptor[]>();
  private byResource = new Map<string, ApiResourceDescriptor>();

  constructor(descriptors: ApiResourceDescriptor[]) {
    for (const d of descriptors) {
      const kindList = this.byKind.get(d.kind) ?? [];
      kindList.push(d);
      this.byKind.set(d.kind, kindList);
      this.byResource.set(`${d.group}/${d.version}/${d.resource}`, d);
    }
  }

  findByKind(kind: string): ApiResourceDescriptor | undefined {
    const list = this.byKind.get(kind);
    return list?.[0];
  }

  findByGVR(group: string, version: string, resource: string): ApiResourceDescriptor | undefined {
    return this.byResource.get(`${group}/${version}/${resource}`);
  }

  getCapabilities(kind: string): ResourceCapabilities | undefined {
    const d = this.findByKind(kind);
    return d ? getCapabilities(d) : undefined;
  }

  allResources(): ApiResourceDescriptor[] {
    return [...this.byResource.values()];
  }
}
