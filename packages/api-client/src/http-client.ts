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
import type { K8sApiClient, K8sApiClientOptions } from './types.js'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function buildUrl(base: string, path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

function gvrPath(group: string, version: string, resource: string): string {
  const g = group || '_'
  return `api/resources/${encodeURIComponent(g)}/${encodeURIComponent(version)}/${encodeURIComponent(resource)}`
}

export class HttpK8sApiClient implements K8sApiClient {
  private baseUrl: string
  private token?: string

  constructor(options: K8sApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.token = options.token
  }

  private headers(contentType = 'application/json'): HeadersInit {
    const h: Record<string, string> = { Accept: 'application/json' }
    if (contentType) h['Content-Type'] = contentType
    if (this.token) h['Authorization'] = `Bearer ${this.token}`
    return h
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/${path.replace(/^\//, '')}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers as Record<string, string>) },
    })
    if (!res.ok) {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        body = await res.text()
      }
      throw new ApiError(`API error: ${res.status} ${res.statusText}`, res.status, body)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  async listContexts(): Promise<ClusterContext[]> {
    const data = await this.request<{ contexts: ClusterContext[] }>('api/contexts')
    return data.contexts
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.request<SessionInfo>('api/session/open', {
      method: 'POST',
      body: JSON.stringify({ context }),
    })
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    const data = await this.request<{ resources: ApiResourceDescriptor[] }>('api/discovery')
    return data.resources
  }

  async listResources(opts: ListOpts): Promise<ResourceListResult> {
    const path = gvrPath(opts.group, opts.version, opts.resource)
    const url = new URL(path, `${this.baseUrl}/`)
    if (opts.namespace) url.searchParams.set('namespace', opts.namespace)
    if (opts.labelSelector) url.searchParams.set('labelSelector', opts.labelSelector)
    if (opts.fieldSelector) url.searchParams.set('fieldSelector', opts.fieldSelector)
    if (opts.limit) url.searchParams.set('limit', String(opts.limit))
    if (opts.continue) url.searchParams.set('continue', opts.continue)

    const res = await fetch(url.toString(), { headers: this.headers() })
    if (!res.ok) {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        body = await res.text()
      }
      throw new ApiError(`API error: ${res.status} ${res.statusText}`, res.status, body)
    }
    return res.json() as Promise<ResourceListResult>
  }

  async getResource(opts: GetOpts): Promise<KubeResource> {
    const base = gvrPath(opts.group, opts.version, opts.resource)
    const path = opts.namespace
      ? `${base}/n/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.name)}`
      : `${base}/${encodeURIComponent(opts.name)}`
    return this.request<KubeResource>(path)
  }

  async applyYaml(yaml: string): Promise<ApplyResult> {
    return this.request<ApplyResult>('api/resources/apply', {
      method: 'POST',
      body: JSON.stringify({ yaml }),
    })
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    const base = gvrPath(opts.group, opts.version, opts.resource)
    const path = opts.namespace
      ? `${base}/n/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.name)}`
      : `${base}/${encodeURIComponent(opts.name)}`
    await this.request<void>(path, { method: 'DELETE' })
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    const endpoint =
      action.action === 'scale'
        ? 'api/actions/scale'
        : action.action === 'restart'
          ? 'api/actions/restart'
          : action.action === 'port-forward'
            ? 'api/actions/port-forward'
            : `api/actions/${action.action}`

    return this.request<ActionResult>(endpoint, {
      method: 'POST',
      body: JSON.stringify(action),
    })
  }

  async *watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent> {
    const params: Record<string, string | undefined> = {
      group: opts.group || '_',
      version: opts.version,
      resource: opts.resource,
      namespace: opts.namespace,
      labelSelector: opts.labelSelector,
      fieldSelector: opts.fieldSelector,
      resourceVersion: opts.resourceVersion,
    }

    const wsBase = this.baseUrl.replace(/^http/, 'ws')
    const url = buildUrl(wsBase, 'ws/watch', params)
    const ws = new WebSocket(url)

    const queue: WatchEvent[] = []
    let resolve: (() => void) | null = null
    let done = false
    let error: Error | null = null

    ws.onmessage = (ev: MessageEvent) => {
      try {
        queue.push(JSON.parse(ev.data as string) as WatchEvent)
        resolve?.()
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e))
        resolve?.()
      }
    }

    ws.onerror = () => {
      error = new Error('WebSocket watch error')
      resolve?.()
    }

    ws.onclose = () => {
      done = true
      resolve?.()
    }

    try {
      while (!done || queue.length > 0) {
        if (error) throw error
        if (queue.length === 0 && !done) {
          await new Promise<void>((r) => {
            resolve = r
          })
          resolve = null
          continue
        }
        const event = queue.shift()
        if (event) yield event
      }
    } finally {
      ws.close()
    }
  }

  async *streamLogs(opts: LogOpts): AsyncGenerator<string> {
    const wsBase = this.baseUrl.replace(/^http/, 'ws')
    const container = opts.container ?? '_'
    const path = `ws/logs/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}/${encodeURIComponent(container)}`
    const url = buildUrl(wsBase, path, {
      follow: opts.follow ? 'true' : undefined,
      tailLines: opts.tailLines,
      previous: opts.previous ? 'true' : undefined,
    })

    const ws = new WebSocket(url)
    const queue: string[] = []
    let resolve: (() => void) | null = null
    let done = false
    let error: Error | null = null

    ws.onmessage = (ev: MessageEvent) => {
      queue.push(ev.data as string)
      resolve?.()
    }
    ws.onerror = () => {
      error = new Error('WebSocket logs error')
      resolve?.()
    }
    ws.onclose = () => {
      done = true
      resolve?.()
    }

    try {
      while (!done || queue.length > 0) {
        if (error) throw error
        if (queue.length === 0 && !done) {
          await new Promise<void>((r) => {
            resolve = r
          })
          resolve = null
          continue
        }
        const line = queue.shift()
        if (line !== undefined) yield line
      }
    } finally {
      ws.close()
    }
  }

  async execPod(opts: ExecOpts): Promise<ExecSession> {
    const container = opts.container ?? '_'
    const path = `api/exec/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}/${encodeURIComponent(container)}`
    return this.request<ExecSession>(path, {
      method: 'POST',
      body: JSON.stringify({ command: opts.command }),
    })
  }

  async portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    return this.request<PortForwardSession>('api/actions/port-forward', {
      method: 'POST',
      body: JSON.stringify(opts),
    })
  }
}
