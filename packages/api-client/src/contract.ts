import type {
  ActionResult,
  ApiResourceDescriptor,
  ApplyResult,
  ClusterContext,
  ExecSession,
  KubeResource,
  PortForwardSession,
  ResourceActionRequest,
  SessionInfo,
  WatchEvent,
} from "@k8s-ide/core";

// ─── Request option types ─────────────────────────────────────────────────────

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
  name: string;
  namespace?: string;
}

export type DeleteOpts = GetOpts;

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
  previous?: boolean;
}

export interface ExecOpts {
  namespace: string;
  pod: string;
  container: string;
  command?: string[];
}

export interface PortForwardOpts {
  namespace: string;
  pod: string;
  remotePort: number;
  localPort?: number;
}

export interface ResourceListResult {
  items: KubeResource[];
  resourceVersion: string;
  continueToken?: string;
}

// ─── Client contract ──────────────────────────────────────────────────────────

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string): Promise<SessionInfo>;
  getDiscovery(): Promise<ApiResourceDescriptor[]>;
  listResources(opts: ListOpts): Promise<ResourceListResult>;
  getResource(opts: GetOpts): Promise<KubeResource>;
  applyYaml(yaml: string): Promise<ApplyResult[]>;
  deleteResource(opts: DeleteOpts): Promise<void>;
  invokeAction(action: ResourceActionRequest): Promise<ActionResult>;
  watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent>;
  streamLogs(opts: LogOpts): AsyncGenerator<string>;
  execPod(opts: ExecOpts): Promise<ExecSession>;
  portForward(opts: PortForwardOpts): Promise<PortForwardSession>;
}
