import type { ApiResourceDescriptor, ResourceCapabilities } from "./types.js";

/**
 * Resource kinds that support log streaming.
 */
const LOG_SUPPORTING_KINDS = new Set(["Pod"]);

/**
 * Resource kinds that support exec.
 */
const EXEC_SUPPORTING_KINDS = new Set(["Pod"]);

/**
 * Resource kinds that support scale sub-resource.
 */
const SCALE_SUPPORTING_KINDS = new Set(["Deployment", "StatefulSet", "ReplicaSet", "ReplicationController"]);

/**
 * Resource kinds that support rollout restart.
 */
const ROLLOUT_SUPPORTING_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet"]);

/**
 * Resource kinds that support port-forward.
 */
const PORT_FORWARD_SUPPORTING_KINDS = new Set(["Pod", "Service", "Deployment", "StatefulSet"]);

export function resolveCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs);
  return {
    descriptor,
    canList: verbs.has("list"),
    canGet: verbs.has("get"),
    canCreate: verbs.has("create"),
    canUpdate: verbs.has("update"),
    canPatch: verbs.has("patch"),
    canDelete: verbs.has("delete"),
    canWatch: verbs.has("watch"),
    supportsLogs: LOG_SUPPORTING_KINDS.has(descriptor.kind),
    supportsExec: EXEC_SUPPORTING_KINDS.has(descriptor.kind),
    supportsScale: SCALE_SUPPORTING_KINDS.has(descriptor.kind),
    supportsRollout: ROLLOUT_SUPPORTING_KINDS.has(descriptor.kind),
    supportsPortForward: PORT_FORWARD_SUPPORTING_KINDS.has(descriptor.kind),
  };
}

export function resolveCapabilitiesMap(
  descriptors: ApiResourceDescriptor[],
): Map<string, ResourceCapabilities> {
  const map = new Map<string, ResourceCapabilities>();
  for (const d of descriptors) {
    map.set(descriptorKey(d), resolveCapabilities(d));
  }
  return map;
}

export function descriptorKey(d: ApiResourceDescriptor): string {
  return `${d.group}/${d.version}/${d.resource}`;
}
