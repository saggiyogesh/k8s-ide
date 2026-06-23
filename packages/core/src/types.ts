// ─── Kubernetes object model ─────────────────────────────────────────────────

export interface ObjectMeta {
  name: string;
  namespace?: string;
  uid?: string;
  resourceVersion?: string;
  generation?: number;
  creationTimestamp?: string;
  deletionTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ownerReferences?: OwnerReference[];
  finalizers?: string[];
}

export interface OwnerReference {
  apiVersion: string;
  kind: string;
  name: string;
  uid: string;
  controller?: boolean;
  blockOwnerDeletion?: boolean;
}

export interface TypeMeta {
  apiVersion: string;
  kind: string;
}

export interface KubeResource extends TypeMeta {
  metadata: ObjectMeta;
  spec?: unknown;
  status?: unknown;
  data?: unknown;
  stringData?: Record<string, string>;
}

// ─── Cluster context ──────────────────────────────────────────────────────────

export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  isCurrent: boolean;
}

export interface SessionInfo {
  context: string;
  serverVersion: string;
  connected: boolean;
}

// ─── API discovery ────────────────────────────────────────────────────────────

export interface ApiResourceDescriptor {
  group: string;
  version: string;
  kind: string;
  resource: string;
  namespaced: boolean;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
}

export interface GroupVersion {
  group: string;
  version: string;
}

// ─── Resource addressing ──────────────────────────────────────────────────────

export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  kind: string;
  namespace?: string;
  name?: string;
}

// ─── Watch / stream events ────────────────────────────────────────────────────

export type WatchEventType = "ADDED" | "MODIFIED" | "DELETED" | "BOOKMARK" | "ERROR";

export interface WatchEvent<T = KubeResource> {
  type: WatchEventType;
  object: T;
}

// ─── List types ───────────────────────────────────────────────────────────────

export interface ListMeta {
  resourceVersion: string;
  continue?: string;
  remainingItemCount?: number;
}

export interface KubeList<T = KubeResource> {
  apiVersion: string;
  kind: string;
  metadata: ListMeta;
  items: T[];
}

// ─── Action models ────────────────────────────────────────────────────────────

export type ResourceActionType =
  | "delete"
  | "scale"
  | "restart"
  | "port-forward"
  | "apply-yaml";

export interface ResourceActionRequest {
  action: ResourceActionType;
  ref: ResourceRef;
  payload?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface ApplyResult {
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
  operation: "created" | "configured" | "unchanged";
}

// ─── Port-forward & exec sessions ────────────────────────────────────────────

export interface PortForwardSession {
  id: string;
  localPort: number;
  remotePort: number;
  namespace: string;
  pod: string;
}

export interface ExecSession {
  id: string;
  wsUrl: string;
}
