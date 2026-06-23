export type ClusterContext = {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  isCurrent: boolean;
};

export type SessionInfo = {
  context: string;
  kubeconfigPath?: string;
  connectedAt: string;
  backendVersion: string;
};

export type ApiResourceDescriptor = {
  group: string;
  version: string;
  kind: string;
  resource: string;
  singularResource: string;
  shortNames: string[];
  categories: string[];
  namespaced: boolean;
  verbs: string[];
};

export type ResourceRef = {
  context: string;
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
};

export type WatchEventType = 'added' | 'modified' | 'deleted' | 'bookmark' | 'error';

export type WatchEvent<TResource = KubeResource> = {
  type: WatchEventType;
  resourceVersion?: string;
  object: TResource;
};

export type ResourceCapabilities = {
  canRead: boolean;
  canList: boolean;
  canWatch: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  supportsYamlEditor: boolean;
  supportsLogs: boolean;
  supportsExec: boolean;
  supportsPortForward: boolean;
  supportsScale: boolean;
  supportsRestart: boolean;
};

export type ListResourcesOptions = {
  context: string;
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
};

export type GetResourceOptions = {
  context: string;
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
};

export type DeleteResourceOptions = GetResourceOptions;

export type WatchResourcesOptions = Omit<ListResourcesOptions, 'limit'>;

export type LogStreamOptions = {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
  tailLines?: number;
  follow?: boolean;
};

export type ExecOptions = {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
  command: string[];
  tty?: boolean;
};

export type PortForwardOptions = {
  context: string;
  namespace: string;
  resource: string;
  name: string;
  ports: number[];
};

export type ResourceAction =
  | 'apply'
  | 'delete'
  | 'scale'
  | 'restart'
  | 'logs'
  | 'exec'
  | 'port-forward';

export type ResourceActionRequest = {
  action: ResourceAction;
  target: ResourceRef;
  payload?: Record<string, unknown>;
};

export type ActionResult = {
  action: ResourceAction;
  message: string;
  details?: Record<string, unknown>;
};

export type ApplyResult = {
  results: Array<{
    kind: string;
    name: string;
    namespace?: string;
    operation: 'created' | 'configured' | 'unchanged';
  }>;
};

export type ResourceListResult<TResource = KubeResource> = {
  items: TResource[];
  continueToken?: string;
  resourceVersion?: string;
};

export type ExecSession = {
  sessionId: string;
  websocketUrl: string;
};

export type PortForwardSession = {
  sessionId: string;
  localPorts: number[];
  websocketUrl?: string;
};

export type KubeResource = Record<string, unknown> & {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
    resourceVersion?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
};

const podLikeKinds = new Set(['Pod']);
const scalableKinds = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet']);
const restartableKinds = new Set(['Deployment', 'StatefulSet', 'DaemonSet']);
const serviceKinds = new Set(['Service']);

export function refKey(ref: ResourceRef): string {
  return [
    ref.context,
    ref.group || 'core',
    ref.version,
    ref.resource,
    ref.namespace || '_cluster',
    ref.name,
  ].join(':');
}

export function resourceRoute(
  descriptor: Pick<ApiResourceDescriptor, 'group' | 'version' | 'resource' | 'namespaced'>,
  namespace?: string,
  name?: string,
): string {
  const group = descriptor.group || 'core';
  const prefix = descriptor.namespaced && namespace ? `/n/${namespace}` : '';
  const suffix = name ? `/${name}` : '';
  return `/resources/${group}/${descriptor.version}/${descriptor.resource}${prefix}${suffix}`;
}

export function isNamespaced(descriptor: Pick<ApiResourceDescriptor, 'namespaced'>): boolean {
  return descriptor.namespaced;
}

export function supportsLogs(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return podLikeKinds.has(descriptor.kind) || scalableKinds.has(descriptor.kind);
}

export function supportsExec(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return podLikeKinds.has(descriptor.kind) || scalableKinds.has(descriptor.kind);
}

export function supportsPortForward(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return podLikeKinds.has(descriptor.kind) || scalableKinds.has(descriptor.kind) || serviceKinds.has(descriptor.kind);
}

export function supportsScale(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return scalableKinds.has(descriptor.kind);
}

export function supportsRestart(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return restartableKinds.has(descriptor.kind);
}

export function inferCapabilities(
  descriptor: ApiResourceDescriptor,
): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs);
  return {
    canRead: verbs.has('get'),
    canList: verbs.has('list'),
    canWatch: verbs.has('watch'),
    canCreate: verbs.has('create'),
    canUpdate: verbs.has('update') || verbs.has('patch'),
    canDelete: verbs.has('delete'),
    supportsYamlEditor: verbs.has('get') && (verbs.has('update') || verbs.has('patch')),
    supportsLogs: supportsLogs(descriptor),
    supportsExec: supportsExec(descriptor),
    supportsPortForward: supportsPortForward(descriptor),
    supportsScale: supportsScale(descriptor),
    supportsRestart: supportsRestart(descriptor),
  };
}
