import type {
  ActionResult,
  ApiResourceDescriptor,
  ApplyResult,
  ClusterContext,
  DeleteOpts,
  ExecOpts,
  ExecSession,
  GetOpts,
  KubeResource,
  ListOpts,
  LogOpts,
  PortForwardOpts,
  PortForwardSession,
  ResourceActionRequest,
  ResourceListResult,
  SessionInfo,
  WatchEvent,
  WatchOpts,
} from '@k8s-ide/core'

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>
  openSession(context: string): Promise<SessionInfo>
  getDiscovery(): Promise<ApiResourceDescriptor[]>
  listResources(opts: ListOpts): Promise<ResourceListResult>
  getResource(opts: GetOpts): Promise<KubeResource>
  applyYaml(yaml: string): Promise<ApplyResult>
  deleteResource(opts: DeleteOpts): Promise<void>
  invokeAction(action: ResourceActionRequest): Promise<ActionResult>
  watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent>
  streamLogs(opts: LogOpts): AsyncGenerator<string>
  execPod(opts: ExecOpts): Promise<ExecSession>
  portForward(opts: PortForwardOpts): Promise<PortForwardSession>
}

export interface K8sApiClientOptions {
  baseUrl: string
  token?: string
}
