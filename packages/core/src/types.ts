/**
 * Represents a kubeconfig context entry.
 */
export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
}

/**
 * Describes a single API resource discovered from the cluster.
 * Derived from the server's API group / version / resource discovery endpoint.
 */
export interface ApiResourceDescriptor {
  group: string;
  version: string;
  kind: string;
  resource: string;
  namespaced: boolean;
  verbs: string[];
  shortNames: string[];
  categories: string[];
}

/**
 * A canonical reference to a single Kubernetes object.
 */
export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
}

/**
 * A full Kubernetes object with type metadata preserved.
 */
export interface KubeResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid: string;
    resourceVersion: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: OwnerReference[];
    deletionTimestamp?: string;
    finalizers?: string[];
    generation?: number;
  };
  spec?: unknown;
  status?: unknown;
  data?: unknown;
}

export interface OwnerReference {
  apiVersion: string;
  kind: string;
  name: string;
  uid: string;
  controller?: boolean;
  blockOwnerDeletion?: boolean;
}

/**
 * A single watch event delivered over the WebSocket stream.
 */
export type WatchEventType = "ADDED" | "MODIFIED" | "DELETED" | "BOOKMARK" | "ERROR";

export interface WatchEvent {
  type: WatchEventType;
  object: KubeResource;
}

/**
 * A paginated resource list result.
 */
export interface ResourceListResult {
  items: KubeResource[];
  total: number;
  continueToken?: string;
  resourceVersion: string;
}

/**
 * Resolved session info returned after opening a cluster context.
 */
export interface SessionInfo {
  context: string;
  cluster: string;
  serverVersion: string;
  namespaces: string[];
}

/**
 * Capabilities resolved from discovery for a single resource type.
 */
export interface ResourceCapabilities {
  descriptor: ApiResourceDescriptor;
  canList: boolean;
  canGet: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canPatch: boolean;
  canDelete: boolean;
  canWatch: boolean;
  supportsLogs: boolean;
  supportsExec: boolean;
  supportsScale: boolean;
  supportsRollout: boolean;
  supportsPortForward: boolean;
}

export interface ApplyResult {
  resource: KubeResource;
  created: boolean;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  resource?: KubeResource;
}

export interface ExecSession {
  sessionId: string;
  wsUrl: string;
}

export interface PortForwardSession {
  sessionId: string;
  localPort: number;
  podNamespace: string;
  podName: string;
  targetPort: number;
}
