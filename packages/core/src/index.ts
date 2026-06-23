export type ClusterContext = {
  name: string;
  cluster?: string;
  user?: string;
  namespace?: string;
  isCurrent: boolean;
};

export type SessionInfo = {
  context: string;
  namespace?: string;
  backendVersion: string;
  capabilities: string[];
  transport: string[];
};

export type ApiResourceDescriptor = {
  group: string;
  version: string;
  kind: string;
  resource: string;
  singularName?: string;
  scope: 'Namespaced' | 'Cluster';
  shortNames: string[];
  categories: string[];
  verbs: string[];
};

export type ResourceRef = {
  context: string;
  group: string;
  version: string;
  resource: string;
  name: string;
  namespace?: string;
  kind?: string;
  apiVersion?: string;
};

export type KubeMetadata = {
  name: string;
  namespace?: string;
  uid?: string;
  resourceVersion?: string;
  generation?: number;
  creationTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
};

export type KubeResource = {
  apiVersion: string;
  kind: string;
  metadata: KubeMetadata;
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  [key: string]: unknown;
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
  continue?: string;
};

export type GetResourceOptions = ResourceRef;

export type ResourceListResult = {
  items: KubeResource[];
  resourceVersion?: string;
  continue?: string;
};

export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR';

export type WatchEvent = {
  type: WatchEventType;
  object: KubeResource;
};

export type ApplyYamlRequest = {
  context: string;
  yaml: string;
};

export type ApplyResult = {
  applied: ResourceRef[];
  warnings: string[];
};

export type ScaleActionRequest = {
  context: string;
  group: string;
  version: string;
  resource: string;
  name: string;
  namespace?: string;
  replicas: number;
};

export type RestartActionRequest = {
  context: string;
  group: string;
  version: string;
  resource: string;
  name: string;
  namespace?: string;
};

export type ActionResult = {
  action: string;
  message: string;
  resource?: ResourceRef;
};

export type WatchOptions = Omit<ListResourcesOptions, 'limit' | 'continue'>;

export type LogOptions = {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
  tailLines?: number;
};

export type ExecOptions = {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
  command: string[];
};

export type PortForwardOptions = {
  context: string;
  namespace: string;
  resourceType: string;
  name: string;
  remotePort: number;
  localPort?: number;
};

export type ExecSession = {
  id: string;
  websocketUrl: string;
};

export type PortForwardSession = {
  id: string;
  websocketUrl: string;
  localPort: number;
  remotePort: number;
};

export type ResourceCapabilities = {
  canList: boolean;
  canRead: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canWatch: boolean;
  canLogs: boolean;
  canExec: boolean;
  canScale: boolean;
  canRestart: boolean;
  canPortForward: boolean;
};

const workloadKinds = new Set(['Deployment', 'StatefulSet', 'DaemonSet']);
const logKinds = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet']);
const execKinds = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet']);
const portForwardKinds = new Set(['Pod', 'Service', 'Deployment', 'StatefulSet', 'DaemonSet']);

export function refKey(ref: ResourceRef): string {
  return [
    ref.context,
    ref.group || 'core',
    ref.version,
    ref.resource,
    ref.namespace || 'cluster',
    ref.name,
  ].join(':');
}

export function descriptorKey(descriptor: Pick<ApiResourceDescriptor, 'group' | 'version' | 'resource'>): string {
  return [descriptor.group || 'core', descriptor.version, descriptor.resource].join(':');
}

export function normalizeGroup(group: string): string {
  return group || 'core';
}

export function isNamespaced(descriptor: Pick<ApiResourceDescriptor, 'scope'>): boolean {
  return descriptor.scope === 'Namespaced';
}

export function supportsLogs(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return logKinds.has(descriptor.kind);
}

export function supportsExec(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return execKinds.has(descriptor.kind);
}

export function supportsScale(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return workloadKinds.has(descriptor.kind);
}

export function supportsRestart(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return workloadKinds.has(descriptor.kind);
}

export function supportsPortForward(descriptor: Pick<ApiResourceDescriptor, 'kind'>): boolean {
  return portForwardKinds.has(descriptor.kind);
}

export function resourceRoute(ref: ResourceRef): string {
  const base = ['/api/resources', normalizeGroup(ref.group), ref.version, ref.resource];
  if (ref.namespace) {
    return `${base.join('/')}/n/${ref.namespace}/${ref.name}`;
  }
  return `${base.join('/')}/${ref.name}`;
}

export function inferResourceCapabilities(
  descriptor: ApiResourceDescriptor,
): ResourceCapabilities {
  const verbs = new Set(descriptor.verbs);
  return {
    canList: verbs.has('list'),
    canRead: verbs.has('get'),
    canEdit: verbs.has('update') || verbs.has('patch'),
    canDelete: verbs.has('delete'),
    canWatch: verbs.has('watch'),
    canLogs: supportsLogs(descriptor),
    canExec: supportsExec(descriptor),
    canScale: supportsScale(descriptor),
    canRestart: supportsRestart(descriptor),
    canPortForward: supportsPortForward(descriptor),
  };
}
