export type {
  ClusterContext,
  ApiResourceDescriptor,
  ResourceRef,
  KubeResource,
  OwnerReference,
  SessionInfo,
  WatchEvent,
  WatchEventType,
  ResourceCapabilities,
} from "./types.js"

export {
  buildCapabilities,
  refKey,
  resourceRoute,
  isNamespaced,
  supportsLogs,
  supportsExec,
  supportsPortForward,
  supportsScale,
  gvString,
  findDescriptor,
} from "./capabilities.js"
