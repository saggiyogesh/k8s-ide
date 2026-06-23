/** Kubernetes API group/version/resource tuple. */
export interface GroupVersionResource {
  group: string
  version: string
  resource: string
}

/** A reference to a specific Kubernetes resource instance. */
export interface ResourceRef extends GroupVersionResource {
  name: string
  namespace?: string
}

/** Cluster context from kubeconfig. */
export interface ClusterContext {
  name: string
  cluster: string
  user: string
  namespace: string
  isCurrent: boolean
}

/** Active session info returned after opening a context. */
export interface SessionInfo {
  context: string
  namespace: string
  serverVersion?: string
}

/** Backend connection status. */
export type BackendStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** Discovery descriptor for an API resource type. */
export interface ApiResourceDescriptor {
  group: string
  version: string
  resource: string
  kind: string
  namespaced: boolean
  verbs: string[]
  shortNames?: string[]
  categories?: string[]
  singularName?: string
}

/** Generic Kubernetes resource object. */
export interface KubeResource {
  apiVersion: string
  kind: string
  metadata: ResourceMetadata
  [key: string]: unknown
}

export interface ResourceMetadata {
  name: string
  namespace?: string
  uid?: string
  resourceVersion?: string
  creationTimestamp?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  ownerReferences?: OwnerReference[]
  deletionTimestamp?: string
}

export interface OwnerReference {
  apiVersion: string
  kind: string
  name: string
  uid: string
  controller?: boolean
}

/** List response for a resource collection. */
export interface ResourceListResult {
  items: KubeResource[]
  resourceVersion: string
  continue?: string
  remainingItemCount?: number
}

export interface ListOpts {
  group: string
  version: string
  resource: string
  namespace?: string
  labelSelector?: string
  fieldSelector?: string
  limit?: number
  continue?: string
}

export interface GetOpts {
  group: string
  version: string
  resource: string
  name: string
  namespace?: string
}

export interface DeleteOpts extends GetOpts {}

export interface ApplyResult {
  action: 'created' | 'updated' | 'unchanged'
  resource: KubeResource
}

/** Watch event from the backend. */
export interface WatchEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR'
  object?: KubeResource
  message?: string
}

export interface WatchOpts {
  group: string
  version: string
  resource: string
  namespace?: string
  labelSelector?: string
  fieldSelector?: string
  resourceVersion?: string
}

/** Supported resource actions. */
export type ResourceAction =
  | 'scale'
  | 'restart'
  | 'port-forward'
  | 'logs'
  | 'exec'
  | 'delete'
  | 'apply'

export interface ResourceActionRequest {
  action: ResourceAction
  ref: ResourceRef
  params?: Record<string, unknown>
}

export interface ActionResult {
  success: boolean
  message?: string
  data?: unknown
}

export interface LogOpts {
  namespace: string
  pod: string
  container?: string
  follow?: boolean
  tailLines?: number
  previous?: boolean
}

export interface ExecOpts {
  namespace: string
  pod: string
  container?: string
  command: string[]
}

export interface ExecSession {
  sessionId: string
  wsUrl: string
}

export interface PortForwardOpts {
  namespace: string
  pod: string
  localPort: number
  remotePort: number
}

export interface PortForwardSession {
  sessionId: string
  localPort: number
}

/** Capabilities derived from discovery and known adapters. */
export interface ResourceCapabilities {
  canGet: boolean
  canList: boolean
  canWatch: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canApply: boolean
  canScale: boolean
  canRestart: boolean
  canLogs: boolean
  canExec: boolean
  canPortForward: boolean
}
