import type {
  ClusterContext,
  SessionInfo,
  ApiResourceDescriptor,
  KubeResource,
  WatchEvent,
} from "@k8s-ide/core"

// ---------------------------------------------------------------------------
// Option types
// ---------------------------------------------------------------------------

export interface ListOpts {
  group: string
  version: string
  resource: string
  namespace?: string
  labelSelector?: string
  fieldSelector?: string
  limit?: number
  continueToken?: string
}

export interface GetOpts {
  group: string
  version: string
  resource: string
  name: string
  namespace?: string
}

export interface DeleteOpts {
  group: string
  version: string
  resource: string
  name: string
  namespace?: string
}

export interface WatchOpts {
  group: string
  version: string
  resource: string
  namespace?: string
  labelSelector?: string
  resourceVersion?: string
}

export interface LogOpts {
  namespace: string
  pod: string
  container: string
  follow?: boolean
  tailLines?: number
  sinceSeconds?: number
}

export interface ExecOpts {
  namespace: string
  pod: string
  container: string
  command: string[]
}

export interface PortForwardOpts {
  namespace: string
  name: string
  kind: "pod" | "service"
  localPort?: number
  remotePort: number
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ResourceListResult {
  items: KubeResource[]
  metadata: {
    resourceVersion: string
    continueToken?: string
    remainingItemCount?: number
  }
}

export interface ApplyResult {
  resource: KubeResource
  action: "created" | "updated" | "unchanged"
}

export interface ResourceActionRequest {
  action: "scale" | "restart" | "delete"
  group: string
  version: string
  resource: string
  name: string
  namespace?: string
  params?: Record<string, unknown>
}

export interface ActionResult {
  success: boolean
  message?: string
  resource?: KubeResource
}

export interface ExecSession {
  sessionId: string
  wsUrl: string
}

export interface PortForwardSession {
  sessionId: string
  localPort: number
  remotePort: number
}

// ---------------------------------------------------------------------------
// Client contract
// ---------------------------------------------------------------------------

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
