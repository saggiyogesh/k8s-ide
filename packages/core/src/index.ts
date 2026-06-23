export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  current: boolean;
}

export interface ApiResourceDescriptor {
  group: string;
  version: string;
  resource: string;
  kind: string;
  singularResource: string;
  namespaced: boolean;
  verbs: string[];
  shortNames: string[];
  categories: string[];
}

export interface ResourceRef {
  context: string;
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
}

export interface KubeResource {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface KubeResourceListResult {
  items: KubeResource[];
  continue?: string;
  resourceVersion?: string;
}

export interface KubeResourceSummary {
  ref: ResourceRef;
  kind: string;
  name: string;
  namespace?: string;
  age?: string;
  status?: string;
}

export interface WatchEvent<TResource = KubeResource> {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR';
  object: TResource;
}

export interface ResourceCapabilities {
  canList: boolean;
  canGet: boolean;
  canWatch: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canPatch: boolean;
  canDelete: boolean;
  supportsLogs: boolean;
  supportsExec: boolean;
  supportsPortForward: boolean;
  supportsScale: boolean;
  supportsRestart: boolean;
}

export const WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet']);

export function refKey(ref: ResourceRef): string {
  return [
    ref.context,
    ref.group || 'core',
    ref.version,
    ref.resource,
    ref.namespace || '_cluster',
    ref.name
  ].join(':');
}

export function gvrKey(descriptor: Pick<ApiResourceDescriptor, 'group' | 'version' | 'resource'>): string {
  return [descriptor.group || 'core', descriptor.version, descriptor.resource].join('/');
}

export function resourceRoute(ref: ResourceRef): string {
  const namespaceSegment = ref.namespace ? `/namespaces/${encodeURIComponent(ref.namespace)}` : '';
  return `/contexts/${encodeURIComponent(ref.context)}/${encodeURIComponent(ref.group || 'core')}/${encodeURIComponent(
    ref.version
  )}/${encodeURIComponent(ref.resource)}${namespaceSegment}/${encodeURIComponent(ref.name)}`;
}

export function isNamespaced(descriptor: Pick<ApiResourceDescriptor, 'namespaced'>): boolean {
  return descriptor.namespaced;
}

export function supportsLogs(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return descriptor.kind === 'Pod' || WORKLOAD_KINDS.has(descriptor.kind);
}

export function supportsExec(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return descriptor.kind === 'Pod' || WORKLOAD_KINDS.has(descriptor.kind);
}

export function supportsPortForward(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return descriptor.kind === 'Pod' || descriptor.kind === 'Service' || WORKLOAD_KINDS.has(descriptor.kind);
}

export function getResourceCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs);

  return {
    canList: verbs.has('list'),
    canGet: verbs.has('get'),
    canWatch: verbs.has('watch'),
    canCreate: verbs.has('create'),
    canUpdate: verbs.has('update'),
    canPatch: verbs.has('patch'),
    canDelete: verbs.has('delete'),
    supportsLogs: supportsLogs(descriptor),
    supportsExec: supportsExec(descriptor),
    supportsPortForward: supportsPortForward(descriptor),
    supportsScale: WORKLOAD_KINDS.has(descriptor.kind),
    supportsRestart: WORKLOAD_KINDS.has(descriptor.kind)
  };
}

export function toResourceSummary(refBase: Omit<ResourceRef, 'name' | 'namespace'>, resource: KubeResource): KubeResourceSummary {
  return {
    ref: {
      ...refBase,
      name: resource.metadata?.name || 'unknown',
      namespace: resource.metadata?.namespace
    },
    kind: resource.kind || 'Unknown',
    name: resource.metadata?.name || 'unknown',
    namespace: resource.metadata?.namespace,
    age: resource.metadata?.creationTimestamp,
    status: typeof resource.status?.phase === 'string' ? resource.status.phase : undefined
  };
}
