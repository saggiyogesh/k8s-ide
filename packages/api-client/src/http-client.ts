import type {
  ClusterContext,
  SessionInfo,
  ApiResourceDescriptor,
  KubeResource,
  WatchEvent,
} from "@k8s-ide/core"
import type {
  K8sApiClient,
  ListOpts,
  GetOpts,
  DeleteOpts,
  WatchOpts,
  LogOpts,
  ExecOpts,
  PortForwardOpts,
  ResourceListResult,
  ApplyResult,
  ResourceActionRequest,
  ActionResult,
  ExecSession,
  PortForwardSession,
} from "./types.js"

/**
 * HTTP + WebSocket implementation of K8sApiClient.
 *
 * All REST calls go to `baseUrl` (e.g. "http://localhost:7080").
 * WebSocket streams upgrade the same origin with the "ws://" or "wss://" scheme.
 */
export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string
  private readonly wsBaseUrl: string

  constructor(baseUrl: string = "http://localhost:7080") {
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.wsBaseUrl = this.baseUrl.replace(/^http/, "ws")
  }

  // -------------------------------------------------------------------------
  // REST helpers
  // -------------------------------------------------------------------------

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v)
      }
    }
    const res = await fetch(url.toString())
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new ApiError(res.status, body || res.statusText)
    }
    return res.json() as Promise<T>
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new ApiError(res.status, text || res.statusText)
    }
    return res.json() as Promise<T>
  }

  private async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: "DELETE" })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new ApiError(res.status, text || res.statusText)
    }
  }

  // -------------------------------------------------------------------------
  // Client contract
  // -------------------------------------------------------------------------

  listContexts(): Promise<ClusterContext[]> {
    return this.get<ClusterContext[]>("/api/contexts")
  }

  openSession(context: string): Promise<SessionInfo> {
    return this.post<SessionInfo>("/api/session/open", { context })
  }

  getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.get<ApiResourceDescriptor[]>("/api/discovery")
  }

  listResources(opts: ListOpts): Promise<ResourceListResult> {
    const { group, version, resource, namespace, labelSelector, fieldSelector, limit, continueToken } =
      opts
    const base = namespace
      ? `/api/resources/${group || "_"}/${version}/${resource}/n/${namespace}`
      : `/api/resources/${group || "_"}/${version}/${resource}`
    const params: Record<string, string> = {}
    if (labelSelector) params["labelSelector"] = labelSelector
    if (fieldSelector) params["fieldSelector"] = fieldSelector
    if (limit !== undefined) params["limit"] = String(limit)
    if (continueToken) params["continue"] = continueToken
    return this.get<ResourceListResult>(base, params)
  }

  getResource(opts: GetOpts): Promise<KubeResource> {
    const { group, version, resource, name, namespace } = opts
    const path = namespace
      ? `/api/resources/${group || "_"}/${version}/${resource}/n/${namespace}/${name}`
      : `/api/resources/${group || "_"}/${version}/${resource}/${name}`
    return this.get<KubeResource>(path)
  }

  applyYaml(yaml: string): Promise<ApplyResult> {
    return this.post<ApplyResult>("/api/resources/apply", { yaml })
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    const { group, version, resource, name, namespace } = opts
    const path = namespace
      ? `/api/resources/${group || "_"}/${version}/${resource}/n/${namespace}/${name}`
      : `/api/resources/${group || "_"}/${version}/${resource}/${name}`
    return this.del(path)
  }

  invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    const endpoint = `/api/actions/${action.action}`
    return this.post<ActionResult>(endpoint, action)
  }

  async *watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent> {
    const { group, version, resource, namespace, labelSelector, resourceVersion } = opts
    const url = new URL(`${this.wsBaseUrl}/ws/watch`)
    url.searchParams.set("group", group)
    url.searchParams.set("version", version)
    url.searchParams.set("resource", resource)
    if (namespace) url.searchParams.set("namespace", namespace)
    if (labelSelector) url.searchParams.set("labelSelector", labelSelector)
    if (resourceVersion) url.searchParams.set("resourceVersion", resourceVersion)

    yield* openWsStream<WatchEvent>(url.toString())
  }

  async *streamLogs(opts: LogOpts): AsyncGenerator<string> {
    const { namespace, pod, container, follow, tailLines, sinceSeconds } = opts
    const url = new URL(`${this.wsBaseUrl}/ws/logs/${namespace}/${pod}/${container}`)
    if (follow !== undefined) url.searchParams.set("follow", String(follow))
    if (tailLines !== undefined) url.searchParams.set("tailLines", String(tailLines))
    if (sinceSeconds !== undefined) url.searchParams.set("sinceSeconds", String(sinceSeconds))

    yield* openWsStream<string>(url.toString())
  }

  execPod(opts: ExecOpts): Promise<ExecSession> {
    return this.post<ExecSession>(
      `/api/exec/${opts.namespace}/${opts.pod}/${opts.container}`,
      { command: opts.command },
    )
  }

  portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    return this.post<PortForwardSession>("/api/actions/port-forward", opts)
  }
}

// ---------------------------------------------------------------------------
// WebSocket streaming helper
// ---------------------------------------------------------------------------

async function* openWsStream<T>(url: string): AsyncGenerator<T> {
  const ws = new WebSocket(url)
  const queue: (T | Error | null)[] = []
  let resolve: (() => void) | null = null

  ws.onmessage = (evt: MessageEvent) => {
    const data = evt.data as string
    try {
      queue.push(JSON.parse(data) as T)
    } catch {
      queue.push(data as unknown as T)
    }
    resolve?.()
    resolve = null
  }

  ws.onerror = () => {
    queue.push(new Error("WebSocket error"))
    resolve?.()
    resolve = null
  }

  ws.onclose = () => {
    queue.push(null)
    resolve?.()
    resolve = null
  }

  try {
    // Wait for open
    await new Promise<void>((res, rej) => {
      if (ws.readyState === WebSocket.OPEN) {
        res()
        return
      }
      ws.onopen = () => res()
      ws.onerror = () => rej(new Error("WebSocket failed to connect"))
    })

    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((res) => {
          resolve = res
        })
      }
      const item = queue.shift()
      if (item === undefined || item === null) return
      if (item instanceof Error) throw item
      yield item as T
    }
  } finally {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}
