import type {
  ActionResult,
  ApplyResult,
  ClusterContext,
  ExecSession,
  ApiResourceDescriptor,
  KubeResource,
  PortForwardSession,
  ResourceListResult,
  SessionInfo,
  WatchEvent,
} from "@k8s-ide/core";

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

export interface GetOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
}

export interface DeleteOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
}

export interface WatchOpts {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  resourceVersion?: string;
}

export interface LogOpts {
  namespace: string;
  pod: string;
  container: string;
  follow?: boolean;
  tailLines?: number;
  sinceSeconds?: number;
  timestamps?: boolean;
}

export interface ExecOpts {
  namespace: string;
  pod: string;
  container: string;
  command: string[];
  tty?: boolean;
}

export interface PortForwardOpts {
  namespace: string;
  pod: string;
  targetPort: number;
  localPort?: number;
}

export interface ScaleOpts {
  group: string;
  version: string;
  resource: string;
  namespace: string;
  name: string;
  replicas: number;
}

export interface RestartOpts {
  group?: string;
  version?: string;
  resource: string;
  namespace: string;
  name: string;
}

export interface ResourceActionRequest {
  action: "scale" | "restart" | "delete";
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
  params?: Record<string, unknown>;
}

/**
 * The single API surface for all Kubernetes operations.
 * One implementation (HttpK8sApiClient) is used everywhere.
 */
export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string): Promise<SessionInfo>;
  getDiscovery(): Promise<ApiResourceDescriptor[]>;
  listResources(opts: ListOpts): Promise<ResourceListResult>;
  getResource(opts: GetOpts): Promise<KubeResource>;
  applyYaml(yaml: string): Promise<ApplyResult[]>;
  deleteResource(opts: DeleteOpts): Promise<void>;
  scaleResource(opts: ScaleOpts): Promise<ActionResult>;
  restartResource(opts: RestartOpts): Promise<ActionResult>;
  invokeAction(action: ResourceActionRequest): Promise<ActionResult>;
  watchResources(opts: WatchOpts, signal?: AbortSignal): AsyncGenerator<WatchEvent>;
  streamLogs(opts: LogOpts, signal?: AbortSignal): AsyncGenerator<string>;
  execPod(opts: ExecOpts): Promise<ExecSession>;
  portForward(opts: PortForwardOpts): Promise<PortForwardSession>;
}
