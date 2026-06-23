export const CORE_API_GROUP = '_';

export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  current: boolean;
}

export interface SessionInfo {
  contextName: string;
  cluster: string;
  namespace?: string;
  kubeconfigPath: string;
  openedAt: string;
  connected: boolean;
}

export interface ResourceCapabilities {
  viewYaml: boolean;
  editYaml: boolean;
  delete: boolean;
  watch: boolean;
  logs: boolean;
  exec: boolean;
  scale: boolean;
  restart: boolean;
  portForward: boolean;
}

export interface ApiResourceDescriptor {
  group: string;
  version: string;
  kind: string;
  resource: string;
  singularName: string;
  namespaced: boolean;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
  scope: 'Namespaced' | 'Cluster';
  capabilities: ResourceCapabilities;
}

export interface ResourceRef {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
  kind?: string;
}

export interface ResourceListResult {
  items: KubeResource[];
  continue?: string;
  resourceVersion?: string;
}

export interface ApplyResult {
  resources: ResourceRef[];
}

export interface ActionResult {
  message: string;
  resource?: ResourceRef;
}

export interface ResourceActionRequest {
  action: string;
  resource: ResourceRef;
  replicas?: number;
  options?: Record<string, unknown>;
}

export interface WatchEvent<T = KubeResource> {
  type: 'ADDED' | 'MODIFIED' | 'DELETED' | 'BOOKMARK' | 'ERROR';
  object: T;
}

export interface ListOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  fieldSelector?: string;
  labelSelector?: string;
  limit?: number;
  continue?: string;
}

export interface GetOpts {
  group: string;
  version: string;
  resource: string;
  name: string;
  namespace?: string;
}

export type DeleteOpts = GetOpts;

export interface WatchOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  selectors?: Record<string, string | undefined>;
}

export interface LogOpts {
  namespace: string;
  pod: string;
  container?: string;
  follow?: boolean;
  tailLines?: number;
}

export interface ExecOpts {
  namespace: string;
  pod: string;
  container?: string;
  command: string[];
}

export interface ExecSession {
  url: string;
  protocols: string[];
}

export interface PortForwardOpts {
  namespace: string;
  resource: ResourceRef;
  ports: number[];
}

export interface PortForwardSession {
  url: string;
  localPorts: number[];
}

export type KubeMetadata = {
  name?: string;
  namespace?: string;
  creationTimestamp?: string;
  uid?: string;
  [key: string]: unknown;
};

export type KubeResource = {
  apiVersion?: string;
  kind?: string;
  metadata?: KubeMetadata;
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  [key: string]: unknown;
};

export const hasVerb = (verbs: string[], verb: string) => verbs.includes(verb);

export const isNamespaced = (resource: Pick<ApiResourceDescriptor, 'namespaced'>) =>
  resource.namespaced;

export const supportsLogs = (resource: Pick<ApiResourceDescriptor, 'capabilities'>) =>
  resource.capabilities.logs;

export const supportsExec = (resource: Pick<ApiResourceDescriptor, 'capabilities'>) =>
  resource.capabilities.exec;

export const supportsScale = (resource: Pick<ApiResourceDescriptor, 'capabilities'>) =>
  resource.capabilities.scale;

export const supportsRestart = (resource: Pick<ApiResourceDescriptor, 'capabilities'>) =>
  resource.capabilities.restart;

export const buildCapabilities = ({
  kind,
  verbs,
}: {
  kind: string;
  verbs: string[];
}): ResourceCapabilities => {
  const workloadLike = ['Deployment', 'StatefulSet', 'DaemonSet'].includes(kind);
  const podLike = kind === 'Pod';
  const serviceLike = kind === 'Service';

  return {
    viewYaml: true,
    editYaml: hasVerb(verbs, 'patch') || hasVerb(verbs, 'update'),
    delete: hasVerb(verbs, 'delete'),
    watch: hasVerb(verbs, 'watch'),
    logs: podLike || workloadLike,
    exec: podLike || workloadLike,
    scale: workloadLike,
    restart: workloadLike,
    portForward: podLike || workloadLike || serviceLike,
  };
};

export const encodeApiGroup = (group?: string | null) =>
  group && group.length > 0 ? group : CORE_API_GROUP;

export const decodeApiGroup = (group: string) =>
  group === CORE_API_GROUP ? '' : group;

export const descriptorKey = ({
  group,
  version,
  resource,
}: Pick<ApiResourceDescriptor, 'group' | 'version' | 'resource'>) =>
  [encodeApiGroup(group), version, resource].join('/');

export const refKey = ({ group, version, resource, namespace, name }: ResourceRef) =>
  [encodeApiGroup(group), version, resource, namespace ?? '_', name].join(':');

export const resourceRoute = (
  resource:
    | Pick<ApiResourceDescriptor, 'group' | 'version' | 'resource'>
    | Pick<ResourceRef, 'group' | 'version' | 'resource'>,
) => `/resources/${encodeApiGroup(resource.group)}/${resource.version}/${resource.resource}`;
