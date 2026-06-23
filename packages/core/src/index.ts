export type JsonObject = Record<string, unknown>;

export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  isCurrent: boolean;
}

export interface SessionInfo {
  context: string;
  kubeconfigPath: string;
  connectedAt: string;
  capabilities: {
    discovery: boolean;
    dynamicCrud: boolean;
    watch: boolean;
    logs: boolean;
    exec: boolean;
    portForward: boolean;
  };
}

export interface ApiResourceDescriptor {
  group: string;
  version: string;
  kind: string;
  resource: string;
  singularResource?: string;
  shortNames: string[];
  namespaced: boolean;
  verbs: string[];
  categories: string[];
}

export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  name?: string;
  namespace?: string;
}

export interface ResourceListResult {
  items: JsonObject[];
  continueToken?: string;
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
  continueToken?: string;
}

export interface GetOpts extends ResourceRef {
  name: string;
}

export interface DeleteOpts extends ResourceRef {
  name: string;
}

export interface ApplyResult {
  applied: Array<{
    ref: ResourceRef & { name: string };
    operation: 'created' | 'configured';
  }>;
}

export interface ResourceActionRequest {
  action: 'scale' | 'restart' | 'delete' | 'port-forward' | 'logs' | 'exec';
  ref: ResourceRef & { name: string };
  payload?: JsonObject;
}

export interface ActionResult {
  status: 'ok' | 'error';
  message: string;
  data?: JsonObject;
}

export interface WatchOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
}

export interface WatchEvent<TResource = JsonObject> {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR' | 'SYNC';
  object: TResource;
}

export interface LogOpts {
  namespace: string;
  pod: string;
  container?: string;
  follow?: boolean;
  previous?: boolean;
  tailLines?: number;
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
  streamUrl: string;
}

export interface PortForwardOpts {
  namespace: string;
  resource: string;
  name: string;
  ports: number[];
}

export interface PortForwardSession {
  sessionId: string;
  localPorts: number[];
  startedAt: string;
}

export interface ResourceCapabilities {
  canList: boolean;
  canGet: boolean;
  canWatch: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  supportsLogs: boolean;
  supportsExec: boolean;
  supportsScale: boolean;
  supportsRestart: boolean;
  supportsPortForward: boolean;
}

const workloadKinds = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet']);

export const CORE_API_GROUP_SENTINEL = '_';

export function normalizeApiGroup(group: string): string {
  return group === CORE_API_GROUP_SENTINEL ? '' : group;
}

export function encodeApiGroup(group: string): string {
  return group.length > 0 ? group : CORE_API_GROUP_SENTINEL;
}

export function groupVersion(group: string, version: string): string {
  return group ? `${group}/${version}` : version;
}

export function gvrKey(ref: Pick<ResourceRef, 'group' | 'version' | 'resource'>): string {
  return `${ref.group || 'core'}:${ref.version}:${ref.resource}`;
}

export function refKey(ref: ResourceRef & { name?: string }): string {
  return [gvrKey(ref), ref.namespace || '_cluster', ref.name || '_list'].join(':');
}

export function resourceRoute(ref: ResourceRef & { name?: string }): string {
  const base = `/api/resources/${encodeApiGroup(ref.group)}/${ref.version}/${ref.resource}`;
  if (!ref.name) {
    return ref.namespace ? `${base}?namespace=${encodeURIComponent(ref.namespace)}` : base;
  }

  if (ref.namespace) {
    return `${base}/n/${encodeURIComponent(ref.namespace)}/${encodeURIComponent(ref.name)}`;
  }

  return `${base}/${encodeURIComponent(ref.name)}`;
}

export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced;
}

export function supportsLogs(input: ApiResourceDescriptor | ResourceCapabilities): boolean {
  if ('supportsLogs' in input) {
    return input.supportsLogs;
  }

  return input.kind === 'Pod' || workloadKinds.has(input.kind);
}

export function deriveCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs);
  const isPod = descriptor.kind === 'Pod';
  const isService = descriptor.kind === 'Service';
  const workload = workloadKinds.has(descriptor.kind);

  return {
    canList: verbs.has('list'),
    canGet: verbs.has('get'),
    canWatch: verbs.has('watch'),
    canCreate: verbs.has('create'),
    canUpdate: verbs.has('update') || verbs.has('patch'),
    canDelete: verbs.has('delete'),
    supportsLogs: isPod || workload,
    supportsExec: isPod || workload,
    supportsScale: workload,
    supportsRestart: workload,
    supportsPortForward: isPod || workload || isService
  };
}

export function supportsExec(input: ApiResourceDescriptor | ResourceCapabilities): boolean {
  return 'supportsExec' in input ? input.supportsExec : deriveCapabilities(input).supportsExec;
}

export function supportsScale(input: ApiResourceDescriptor | ResourceCapabilities): boolean {
  return 'supportsScale' in input ? input.supportsScale : deriveCapabilities(input).supportsScale;
}

export function supportsRestart(input: ApiResourceDescriptor | ResourceCapabilities): boolean {
  return 'supportsRestart' in input ? input.supportsRestart : deriveCapabilities(input).supportsRestart;
}

export function supportsPortForward(input: ApiResourceDescriptor | ResourceCapabilities): boolean {
  return 'supportsPortForward' in input
    ? input.supportsPortForward
    : deriveCapabilities(input).supportsPortForward;
}
