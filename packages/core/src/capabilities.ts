import type { ApiResourceDescriptor, KubeResource } from "./types.js";

/**
 * Derived capability flags for a given resource kind.
 */
export interface ResourceCapabilities {
  canList: boolean;
  canGet: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canPatch: boolean;
  canDelete: boolean;
  canWatch: boolean;
  isNamespaced: boolean;
  supportsLogs: boolean;
  supportsExec: boolean;
  supportsPortForward: boolean;
  supportsScale: boolean;
  supportsRollout: boolean;
}

const SCALABLE_KINDS = new Set(["Deployment", "StatefulSet", "ReplicaSet", "ReplicationController"]);
const ROLLOUT_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet"]);

/** Derive capabilities from a discovery descriptor. */
export function getCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs);
  const kind = descriptor.kind;

  return {
    canList: verbs.has("list"),
    canGet: verbs.has("get"),
    canCreate: verbs.has("create"),
    canUpdate: verbs.has("update"),
    canPatch: verbs.has("patch"),
    canDelete: verbs.has("delete"),
    canWatch: verbs.has("watch"),
    isNamespaced: descriptor.namespaced,
    supportsLogs: kind === "Pod",
    supportsExec: kind === "Pod",
    supportsPortForward: kind === "Pod" || kind === "Service",
    supportsScale: SCALABLE_KINDS.has(kind),
    supportsRollout: ROLLOUT_KINDS.has(kind),
  };
}

/** Compute a stable string key for a resource reference. */
export function refKey(opts: {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name?: string;
}): string {
  const ns = opts.namespace ?? "_";
  const name = opts.name ?? "_";
  return `${opts.group}/${opts.version}/${opts.resource}/${ns}/${name}`;
}

/** Build the canonical route path for a resource inside the UI. */
export function resourceRoute(opts: {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name?: string;
}): string {
  const base = `/resources/${opts.group || "core"}/${opts.version}/${opts.resource}`;
  if (opts.namespace && opts.name) return `${base}/${opts.namespace}/${opts.name}`;
  if (opts.namespace) return `${base}?namespace=${opts.namespace}`;
  if (opts.name) return `${base}/${opts.name}`;
  return base;
}

/** Return true if the resource is namespaced. */
export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced;
}

/** Return true if the resource kind supports streaming logs. */
export function supportsLogs(kindOrDescriptor: string | ApiResourceDescriptor): boolean {
  const kind =
    typeof kindOrDescriptor === "string" ? kindOrDescriptor : kindOrDescriptor.kind;
  return kind === "Pod";
}

/** Return true if the resource kind supports exec sessions. */
export function supportsExec(kindOrDescriptor: string | ApiResourceDescriptor): boolean {
  const kind =
    typeof kindOrDescriptor === "string" ? kindOrDescriptor : kindOrDescriptor.kind;
  return kind === "Pod";
}

/** Derive a human-readable status summary for common resource kinds. */
export function resourceStatusSummary(resource: KubeResource): string {
  const status = resource.status as Record<string, unknown> | undefined;
  if (!status) return "Unknown";

  const conditions = status["conditions"] as Array<Record<string, unknown>> | undefined;
  if (conditions) {
    const ready = conditions.find((c) => c["type"] === "Ready");
    if (ready) {
      return ready["status"] === "True" ? "Ready" : (ready["message"] as string) ?? "Not Ready";
    }
    const available = conditions.find((c) => c["type"] === "Available");
    if (available) {
      return available["status"] === "True"
        ? "Available"
        : (available["message"] as string) ?? "Unavailable";
    }
  }

  const phase = status["phase"] as string | undefined;
  if (phase) return phase;

  return "Running";
}
