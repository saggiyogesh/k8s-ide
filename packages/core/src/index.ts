export type {
  ClusterContext,
  ApiResourceDescriptor,
  ResourceRef,
  KubeResource,
  OwnerReference,
  WatchEvent,
  WatchEventType,
  ResourceListResult,
  SessionInfo,
  ResourceCapabilities,
  ApplyResult,
  ActionResult,
  ExecSession,
  PortForwardSession,
} from "./types.js";

export {
  resolveCapabilities,
  resolveCapabilitiesMap,
  descriptorKey,
} from "./capabilities.js";

export {
  refKey,
  resourceRoute,
  isNamespaced,
  supportsLogs,
  supportsExec,
  toRef,
  isTerminating,
  resourceAge,
} from "./helpers.js";
