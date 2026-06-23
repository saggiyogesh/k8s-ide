import type {
  ClusterContext,
  SessionInfo,
  ApiResourceDescriptor,
  ResourceListResult,
  KubeResource,
  ApplyResult,
  ActionResult,
  ResourceActionRequest,
  WatchEvent,
  ListOpts,
  GetOpts,
  DeleteOpts,
  WatchOpts,
  LogOpts,
  ExecOpts,
  PortForwardOpts,
  ExecSession,
  PortForwardSession,
} from "@k8s-ide/core";

/**
 * The single contract implemented by all K8s API clients.
 * Desktop, web, and mobile all use exactly this interface.
 */
export interface K8sApiClient {
  /** Return all contexts from the current kubeconfig. */
  listContexts(): Promise<ClusterContext[]>;

  /** Activate a context and return session info. */
  openSession(contextName: string): Promise<SessionInfo>;

  /** Return all discovered API resource descriptors for the active session. */
  getDiscovery(): Promise<ApiResourceDescriptor[]>;

  /** List resources optionally filtered by namespace and selectors. */
  listResources(opts: ListOpts): Promise<ResourceListResult>;

  /** Fetch a single resource by reference. */
  getResource(opts: GetOpts): Promise<KubeResource>;

  /** Apply (create or update) a resource from YAML. */
  applyYaml(yaml: string): Promise<ApplyResult>;

  /** Delete a resource by reference. */
  deleteResource(opts: DeleteOpts): Promise<void>;

  /** Invoke a higher-level action (scale, restart, …). */
  invokeAction(action: ResourceActionRequest): Promise<ActionResult>;

  /** Stream watch events for a resource type over WebSocket. */
  watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent>;

  /** Stream log lines for a pod/container over WebSocket. */
  streamLogs(opts: LogOpts): AsyncGenerator<string>;

  /** Open a WebSocket-backed exec session inside a pod. */
  execPod(opts: ExecOpts): Promise<ExecSession>;

  /** Start a port-forward and return the local port mapping. */
  portForward(opts: PortForwardOpts): Promise<PortForwardSession>;
}
