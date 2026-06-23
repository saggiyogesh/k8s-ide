/**
 * Core domain types shared across all packages.
 */

/** A loaded kubeconfig context */
export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
}

/** A discovered API resource from /apis or /api */
export interface ApiResourceDescriptor {
  group: string;
  version: string;
  resource: string;
  kind: string;
  namespaced: boolean;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
}

/** A minimal reference to any Kubernetes resource */
export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  name: string;
  namespace?: string;
}

/** Minimal Kubernetes object shape */
export interface KubeResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    resourceVersion?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: OwnerReference[];
    deletionTimestamp?: string;
    finalizers?: string[];
  };
  spec?: unknown;
  status?: unknown;
  [key: string]: unknown;
}

export interface OwnerReference {
  apiVersion: string;
  kind: string;
  name: string;
  uid: string;
  controller?: boolean;
}

/** Result of a list operation */
export interface ResourceListResult {
  items: KubeResource[];
  totalCount: number;
  continue?: string;
  resourceVersion?: string;
}

/** A watch event pushed over WebSocket */
export interface WatchEvent {
  type: "ADDED" | "MODIFIED" | "DELETED" | "ERROR" | "BOOKMARK";
  object: KubeResource;
}

/** Session information returned after opening a cluster context */
export interface SessionInfo {
  contextName: string;
  serverVersion: string;
  sessionId: string;
}

/** Options for listing resources */
export interface ListOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
  continueToken?: string;
}

/** Options for getting a single resource */
export interface GetOpts {
  group: string;
  version: string;
  resource: string;
  name: string;
  namespace?: string;
}

/** Options for deleting a resource */
export interface DeleteOpts {
  group: string;
  version: string;
  resource: string;
  name: string;
  namespace?: string;
}

/** Options for watching resources */
export interface WatchOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  resourceVersion?: string;
}

/** Options for streaming logs */
export interface LogOpts {
  namespace: string;
  pod: string;
  container?: string;
  follow?: boolean;
  tailLines?: number;
  sinceSeconds?: number;
}

/** Options for exec into a pod */
export interface ExecOpts {
  namespace: string;
  pod: string;
  container?: string;
  command?: string[];
  tty?: boolean;
}

/** Options for port-forward */
export interface PortForwardOpts {
  namespace: string;
  resource: string;
  name: string;
  ports: Array<{ localPort: number; remotePort: number }>;
}

/** Generic resource action request */
export interface ResourceActionRequest {
  action: ResourceActionType;
  ref: ResourceRef;
  params?: Record<string, unknown>;
}

export type ResourceActionType =
  | "scale"
  | "restart"
  | "apply"
  | "delete"
  | "port-forward"
  | "logs"
  | "exec";

/** Result of an apply or action call */
export interface ApplyResult {
  resource: KubeResource;
  created: boolean;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

/** An active exec session handle */
export interface ExecSession {
  sessionId: string;
  wsUrl: string;
}

/** An active port-forward session handle */
export interface PortForwardSession {
  sessionId: string;
  localPorts: Array<{ localPort: number; remotePort: number }>;
}
