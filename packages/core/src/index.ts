export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type KubeResource = Record<string, unknown>;

export interface ClusterContext {
  name: string;
  cluster: string;
  user?: string;
  namespace?: string;
  current: boolean;
}

export interface SessionInfo {
  activeContext: string;
  namespace?: string;
  backendVersion: string;
  mode: "desktop" | "web";
}

export interface ApiResourceDescriptor {
  group: string;
  version: string;
  kind: string;
  resource: string;
  singularResource: string;
  shortNames: string[];
  namespaced: boolean;
  verbs: string[];
  categories: string[];
}

export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  kind?: string;
  namespace?: string;
  name: string;
}

export interface ListOptions {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
}

export interface GetOptions {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
}

export type DeleteOptions = GetOptions;

export interface ApplyResult {
  applied: ResourceRef[];
  message: string;
}

export interface ResourceListResult {
  items: KubeResource[];
  count: number;
  resourceVersion?: string;
}

export interface WatchEvent {
  type: "ADDED" | "MODIFIED" | "DELETED" | "BOOKMARK" | "ERROR";
  object: KubeResource;
}

export interface LogOptions {
  namespace: string;
  pod: string;
  container?: string;
  tailLines?: number;
}

export interface ExecOptions {
  namespace: string;
  pod: string;
  container?: string;
  command: string[];
}

export interface ExecSession {
  url: string;
  protocol: "websocket";
}

export interface PortForwardOptions {
  namespace: string;
  resource: string;
  name: string;
  localPort: number;
  remotePort: number;
}

export interface PortForwardSession {
  id: string;
  localPort: number;
  remotePort: number;
  status: "starting" | "active" | "failed";
}

export interface WatchOptions {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
}

export interface ResourceActionRequest {
  action: "scale" | "restart" | "logs" | "exec" | "port-forward" | "delete";
  target: ResourceRef;
  payload?: Record<string, JsonValue>;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  details?: JsonValue;
}

export interface ResourceCapabilities {
  canRead: boolean;
  canEditYaml: boolean;
  canDelete: boolean;
  canWatch: boolean;
  canScale: boolean;
  canRestart: boolean;
  canLogs: boolean;
  canExec: boolean;
  canPortForward: boolean;
}

const WORKLOAD_KINDS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet"
]);
const POD_RESOURCE_NAMES = new Set(["pods"]);
const SERVICE_RESOURCE_NAMES = new Set(["services"]);

export function refKey(ref: Pick<ResourceRef, "group" | "version" | "resource" | "namespace" | "name">): string {
  return [ref.group || "core", ref.version, ref.resource, ref.namespace || "_cluster", ref.name].join(":");
}

export function resourceRoute(
  descriptor: Pick<ApiResourceDescriptor, "group" | "version" | "resource">,
  namespace?: string,
  name?: string
): string {
  const group = descriptor.group || "core";

  if (namespace && name) {
    return `/api/resources/${group}/${descriptor.version}/${descriptor.resource}/n/${namespace}/${name}`;
  }

  if (name) {
    return `/api/resources/${group}/${descriptor.version}/${descriptor.resource}/${name}`;
  }

  return `/api/resources/${group}/${descriptor.version}/${descriptor.resource}`;
}

export function isNamespaced(descriptor: Pick<ApiResourceDescriptor, "namespaced">): boolean {
  return descriptor.namespaced;
}

export function supportsLogs(descriptor: Pick<ApiResourceDescriptor, "kind" | "resource">): boolean {
  return WORKLOAD_KINDS.has(descriptor.kind) || POD_RESOURCE_NAMES.has(descriptor.resource);
}

export function getResourceCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const canLogs = supportsLogs(descriptor);
  const canExec = POD_RESOURCE_NAMES.has(descriptor.resource);
  const canScale = WORKLOAD_KINDS.has(descriptor.kind);
  const canRestart = WORKLOAD_KINDS.has(descriptor.kind);
  const canPortForward =
    canLogs || SERVICE_RESOURCE_NAMES.has(descriptor.resource) || WORKLOAD_KINDS.has(descriptor.kind);

  return {
    canRead: descriptor.verbs.includes("get") || descriptor.verbs.includes("list"),
    canEditYaml: descriptor.verbs.includes("update") || descriptor.verbs.includes("patch"),
    canDelete: descriptor.verbs.includes("delete"),
    canWatch: descriptor.verbs.includes("watch"),
    canScale,
    canRestart,
    canLogs,
    canExec,
    canPortForward
  };
}
