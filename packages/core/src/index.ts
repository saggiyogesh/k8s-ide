export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  current: boolean;
}

export interface SessionInfo {
  context: string;
  kubeconfigPath: string;
  openedAt: string;
}

export interface ApiResourceDescriptor {
  group: string;
  version: string;
  kind: string;
  resource: string;
  singularName: string;
  shortNames: string[];
  categories: string[];
  namespaced: boolean;
  verbs: string[];
}

export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
}

export interface ObjectMeta {
  name?: string;
  namespace?: string;
  uid?: string;
  resourceVersion?: string;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface KubeResource {
  apiVersion?: string;
  kind?: string;
  metadata?: ObjectMeta;
  [key: string]: unknown;
}

export interface ResourceListResult {
  items: KubeResource[];
  continue?: string;
  resourceVersion?: string;
}

export interface ListResourcesOptions {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
  continue?: string;
}

export type GetResourceOptions = ResourceRef;

export type DeleteResourceOptions = ResourceRef;

export interface ApplyResourceRequest {
  yaml: string;
  fieldManager?: string;
  force?: boolean;
}

export interface ApplyResult {
  resources: ResourceRef[];
}

export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR';

export interface WatchEvent {
  type: WatchEventType;
  object: KubeResource;
}

export interface WatchResourcesOptions {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
}

export interface LogStreamOptions {
  namespace: string;
  pod: string;
  container?: string;
  follow?: boolean;
  tailLines?: number;
}

export interface ExecOptions {
  namespace: string;
  pod: string;
  container?: string;
  command: string[];
}

export interface ExecSession {
  id: string;
  connected: boolean;
}

export interface PortForwardOptions {
  namespace: string;
  resourceType: string;
  resourceName: string;
  localPort: number;
  remotePort: number;
}

export interface PortForwardSession {
  id: string;
  localPort: number;
  remotePort: number;
}

export interface ScaleActionRequest extends ResourceRef {
  replicas: number;
}

export type RestartActionRequest = ResourceRef;

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface ResourceCapabilities {
  canRead: boolean;
  canList: boolean;
  canWatch: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApply: boolean;
  supportsLogs: boolean;
  supportsExec: boolean;
  supportsPortForward: boolean;
  supportsScale: boolean;
  supportsRestart: boolean;
}

const LOG_KINDS = new Set(['pod', 'deployment', 'statefulset', 'daemonset']);
const EXEC_KINDS = new Set(['pod', 'deployment', 'statefulset']);
const PORT_FORWARD_KINDS = new Set(['pod', 'deployment', 'statefulset', 'service']);
const SCALE_KINDS = new Set(['deployment', 'statefulset']);
const RESTART_KINDS = new Set(['deployment', 'statefulset', 'daemonset']);

export function refKey(ref: ResourceRef): string {
  return [
    ref.group || 'core',
    ref.version,
    ref.resource,
    ref.namespace || '_cluster',
    ref.name
  ].join('/');
}

export function isNamespaced(descriptor: ApiResourceDescriptor): boolean {
  return descriptor.namespaced;
}

export function descriptorPath(descriptor: Pick<ApiResourceDescriptor, 'group' | 'version' | 'resource'>): string {
  return `/api/resources/${encodeURIComponent(descriptor.group || '_')}/${encodeURIComponent(
    descriptor.version
  )}/${encodeURIComponent(descriptor.resource)}`;
}

export function resourceRoute(ref: ResourceRef): string {
  const base = descriptorPath(ref);
  if (ref.namespace) {
    return `${base}/n/${encodeURIComponent(ref.namespace)}/${encodeURIComponent(ref.name)}`;
  }

  return `${base}/${encodeURIComponent(ref.name)}`;
}

export function normalizeKind(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function supportsLogs(value: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return LOG_KINDS.has(normalizeKind(value.kind));
}

export function supportsExec(value: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return EXEC_KINDS.has(normalizeKind(value.kind));
}

export function supportsPortForward(value: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return PORT_FORWARD_KINDS.has(normalizeKind(value.kind));
}

export function supportsScale(value: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return SCALE_KINDS.has(normalizeKind(value.kind));
}

export function supportsRestart(value: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return RESTART_KINDS.has(normalizeKind(value.kind));
}

export function deriveCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs);

  return {
    canRead: verbs.has('get'),
    canList: verbs.has('list'),
    canWatch: verbs.has('watch'),
    canUpdate: verbs.has('update') || verbs.has('patch'),
    canDelete: verbs.has('delete'),
    canApply: verbs.has('patch'),
    supportsLogs: supportsLogs(descriptor),
    supportsExec: supportsExec(descriptor),
    supportsPortForward: supportsPortForward(descriptor),
    supportsScale: supportsScale(descriptor),
    supportsRestart: supportsRestart(descriptor)
  };
}
