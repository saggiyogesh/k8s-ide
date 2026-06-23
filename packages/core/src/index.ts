export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  current: boolean;
}

export interface SessionInfo {
  context: string;
  serverVersion: string;
  namespaces: string[];
}

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

export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  kind: string;
  namespace?: string;
  name: string;
  uid?: string;
}

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
    ownerReferences?: Array<{
      apiVersion: string;
      kind: string;
      name: string;
      uid: string;
    }>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResourceListItem {
  ref: ResourceRef;
  createdAt?: string;
  labels?: Record<string, string>;
  status?: string;
  extra?: Record<string, string>;
}

export interface ResourceListResult {
  items: ResourceListItem[];
  continue?: string;
  resourceVersion?: string;
}

export interface ListOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
  continue?: string;
}

export interface GetOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
}

export interface DeleteOpts extends GetOpts {}

export interface ApplyResult {
  action: "created" | "updated" | "unchanged";
  resource: ResourceRef;
}

export type WatchEventType = "ADDED" | "MODIFIED" | "DELETED" | "BOOKMARK" | "ERROR";

export interface WatchEvent {
  type: WatchEventType;
  resource?: KubeResource;
  error?: string;
}

export interface WatchOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  resourceVersion?: string;
}

export interface LogOpts {
  namespace: string;
  pod: string;
  container?: string;
  follow?: boolean;
  tailLines?: number;
  previous?: boolean;
}

export interface ExecOpts {
  namespace: string;
  pod: string;
  container?: string;
  command: string[];
  tty?: boolean;
}

export interface ExecSession {
  sessionId: string;
}

export interface PortForwardOpts {
  namespace: string;
  pod: string;
  ports: Array<{ local: number; remote: number }>;
}

export interface PortForwardSession {
  sessionId: string;
  localPorts: number[];
}

export type ResourceAction =
  | "scale"
  | "restart"
  | "port-forward"
  | "delete"
  | "apply";

export interface ResourceActionRequest {
  action: ResourceAction;
  ref: ResourceRef;
  params?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ResourceCapabilities {
  canList: boolean;
  canGet: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canWatch: boolean;
  canScale: boolean;
  canRestart: boolean;
  canLogs: boolean;
  canExec: boolean;
  canPortForward: boolean;
}

export function refKey(ref: Pick<ResourceRef, "group" | "version" | "resource" | "namespace" | "name">): string {
  const ns = ref.namespace ?? "_cluster";
  return `${ref.group}/${ref.version}/${ref.resource}/${ns}/${ref.name}`;
}

export function gvrKey(group: string, version: string, resource: string): string {
  return `${group}/${version}/${resource}`;
}

export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced;
}

export function resourceRoute(ref: ResourceRef): string {
  const base = `/resources/${ref.group || "core"}/${ref.version}/${ref.resource}`;
  if (ref.namespace) {
    return `${base}/n/${ref.namespace}/${ref.name}`;
  }
  return `${base}/${ref.name}`;
}

export function listRoute(group: string, version: string, resource: string, namespace?: string): string {
  const base = `/resources/${group || "core"}/${version}/${resource}`;
  if (namespace) {
    return `${base}?namespace=${encodeURIComponent(namespace)}`;
  }
  return base;
}

const SCALE_KINDS = new Set(["Deployment", "StatefulSet", "ReplicaSet"]);
const RESTART_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet"]);
const LOG_KINDS = new Set(["Pod"]);
const EXEC_KINDS = new Set(["Pod"]);
const PORT_FORWARD_KINDS = new Set(["Pod", "Service"]);

export function supportsLogs(kind: string): boolean {
  return LOG_KINDS.has(kind);
}

export function supportsExec(kind: string): boolean {
  return EXEC_KINDS.has(kind);
}

export function supportsPortForward(kind: string): boolean {
  return PORT_FORWARD_KINDS.has(kind);
}

export function supportsScale(kind: string): boolean {
  return SCALE_KINDS.has(kind);
}

export function supportsRestart(kind: string): boolean {
  return RESTART_KINDS.has(kind);
}

export function deriveCapabilities(
  descriptor: ApiResourceDescriptor,
  kind?: string,
): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs ?? []);
  const k = kind ?? descriptor.kind;
  return {
    canList: verbs.has("list") || verbs.has("watch"),
    canGet: verbs.has("get"),
    canCreate: verbs.has("create"),
    canUpdate: verbs.has("update") || verbs.has("patch"),
    canDelete: verbs.has("delete"),
    canWatch: verbs.has("watch") || verbs.has("list"),
    canScale: supportsScale(k) && (verbs.has("patch") || verbs.has("update")),
    canRestart: supportsRestart(k) && (verbs.has("patch") || verbs.has("update")),
    canLogs: supportsLogs(k),
    canExec: supportsExec(k),
    canPortForward: supportsPortForward(k),
  };
}

export function normalizeGroup(group: string): string {
  return group === "core" ? "" : group;
}

export function displayGroup(group: string): string {
  return group || "core";
}
