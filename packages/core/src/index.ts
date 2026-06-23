export interface ClusterContext {
  name: string;
  cluster?: string;
  user?: string;
  namespace?: string;
  isCurrent: boolean;
}

export interface SessionInfo {
  context: string;
  namespace: string;
  connectedAt: string;
  backendVersion: string;
}

export interface ApiResourceDescriptor {
  group: string;
  version: string;
  kind: string;
  resource: string;
  singularResource: string;
  namespaced: boolean;
  verbs: string[];
  shortNames: string[];
  categories: string[];
  scope: 'Cluster' | 'Namespaced';
}

export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  name: string;
  namespace?: string;
}

export interface ResourceCapabilities {
  canDelete: boolean;
  canEditYaml: boolean;
  canScale: boolean;
  canRestart: boolean;
  canStreamLogs: boolean;
  canExec: boolean;
  canPortForward: boolean;
  canWatch: boolean;
}

export type ResourcePhase = 'ready' | 'warning' | 'error' | 'unknown';

export interface KubeResource {
  ref: ResourceRef;
  kind: string;
  apiVersion: string;
  metadata: {
    uid: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: Record<string, unknown>;
  status: Record<string, unknown>;
  summary: Record<string, string | number | boolean | null>;
  yaml: string;
  phase: ResourcePhase;
}

export interface ResourceListResult {
  items: KubeResource[];
  total: number;
  continue?: string;
  resourceVersion?: string;
}

export interface ListResourcesOptions {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  search?: string;
  labelSelector?: string;
}

export type GetResourceOptions = ResourceRef;

export type DeleteResourceOptions = ResourceRef;

export interface ApplyResult {
  applied: ResourceRef[];
  warnings: string[];
}

export type ResourceActionKind =
  | 'apply'
  | 'delete'
  | 'scale'
  | 'restart'
  | 'logs'
  | 'exec'
  | 'port-forward';

export interface ResourceActionRequest {
  action: ResourceActionKind;
  ref: ResourceRef;
  args?: Record<string, unknown>;
}

export interface ActionResult {
  action: ResourceActionKind;
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface WatchEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR';
  ref: ResourceRef;
  resource?: KubeResource;
  resourceVersion?: string;
  message?: string;
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
  sessionId: string;
  streamUrl: string;
}

export interface PortForwardOptions {
  namespace: string;
  resource: string;
  name: string;
  remotePort: number;
  localPort?: number;
}

export interface PortForwardSession {
  sessionId: string;
  address: string;
  localPort: number;
}

export const refKey = (ref: ResourceRef): string =>
  [ref.group || 'core', ref.version, ref.resource, ref.namespace || 'cluster', ref.name].join(':');

export const resourceRoute = (ref: ResourceRef): string => {
  const base = `/resources/${encodeURIComponent(ref.group || 'core')}/${encodeURIComponent(
    ref.version,
  )}/${encodeURIComponent(ref.resource)}`;

  return ref.namespace
    ? `${base}/n/${encodeURIComponent(ref.namespace)}/${encodeURIComponent(ref.name)}`
    : `${base}/${encodeURIComponent(ref.name)}`;
};

export const isNamespaced = (resource: Pick<ApiResourceDescriptor, 'namespaced'>): boolean =>
  resource.namespaced;

const workloadKinds = new Set(['Deployment', 'StatefulSet', 'DaemonSet']);
const logsKinds = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet']);
const execKinds = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet']);
const portForwardKinds = new Set(['Pod', 'Service', 'Deployment', 'StatefulSet', 'DaemonSet']);

export const getResourceCapabilities = (
  resource: ApiResourceDescriptor,
): ResourceCapabilities => {
  const verbs = new Set(resource.verbs);
  const canDelete = verbs.has('delete');
  const canEditYaml = verbs.has('patch') || verbs.has('update');
  const canWatch = verbs.has('watch');
  const canScale = workloadKinds.has(resource.kind);
  const canRestart = workloadKinds.has(resource.kind);
  const canStreamLogs = logsKinds.has(resource.kind);
  const canExec = execKinds.has(resource.kind);
  const canPortForward = portForwardKinds.has(resource.kind);

  return {
    canDelete,
    canEditYaml,
    canScale,
    canRestart,
    canStreamLogs,
    canExec,
    canPortForward,
    canWatch,
  };
};

export const supportsLogs = (resource: ApiResourceDescriptor): boolean =>
  getResourceCapabilities(resource).canStreamLogs;

export const supportsExec = (resource: ApiResourceDescriptor): boolean =>
  getResourceCapabilities(resource).canExec;

export const supportsPortForward = (resource: ApiResourceDescriptor): boolean =>
  getResourceCapabilities(resource).canPortForward;
