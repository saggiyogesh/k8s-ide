import type {
  ActionResult,
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
  ApiResourceDescriptor,
} from "@k8s-ide/core";
import type { HttpK8sApiClientOptions, K8sApiClient } from "./types.js";

function buildUrl(base: string, path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function resourcePath(opts: { group: string; version: string; resource: string; namespace?: string; name?: string }): string {
  const { group, version, resource, namespace, name } = opts;
  const g = encodeURIComponent(group || "_");
  const v = encodeURIComponent(version);
  const r = encodeURIComponent(resource);
  if (namespace && name) {
    return `/api/resources/${g}/${v}/${r}/n/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
  }
  if (name) {
    return `/api/resources/${g}/${v}/${r}/${encodeURIComponent(name)}`;
  }
  return `/api/resources/${g}/${v}/${r}`;
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string;
  private readonly getToken?: () => string | undefined;

  constructor(options: HttpK8sApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getToken = options.getToken;
  }

  private headers(contentType?: string): HeadersInit {
    const headers: Record<string, string> = {};
    if (contentType) headers["Content-Type"] = contentType;
    const token = this.getToken?.();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers as Record<string, string>) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(body || `Request failed: ${res.status} ${res.statusText}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, { headers: this.headers() });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listContexts(): Promise<ClusterContext[]> {
    const data = await this.request<{ contexts: ClusterContext[] }>("/api/contexts");
    return data.contexts;
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.request<SessionInfo>("/api/session/open", {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify({ context }),
    });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    const data = await this.request<{ resources: ApiResourceDescriptor[] }>("/api/discovery");
    return data.resources;
  }

  async listResources(opts: ListOpts): Promise<ResourceListResult> {
    const path = buildUrl(this.baseUrl, resourcePath(opts), {
      namespace: opts.namespace,
      labelSelector: opts.labelSelector,
      fieldSelector: opts.fieldSelector,
      limit: opts.limit,
      continue: opts.continue,
    });
    const res = await fetch(path, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(body || `List failed: ${res.status}`);
    }
    return res.json() as Promise<ResourceListResult>;
  }

  async getResource(opts: GetOpts): Promise<KubeResource> {
    const path = resourcePath(opts);
    return this.request<KubeResource>(path);
  }

  async applyYaml(yaml: string): Promise<ApplyResult> {
    return this.request<ApplyResult>("/api/resources/apply", {
      method: "POST",
      headers: this.headers("application/yaml"),
      body: yaml,
    });
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    await this.request<void>(resourcePath(opts), { method: "DELETE" });
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    const endpoint =
      action.action === "scale"
        ? "/api/actions/scale"
        : action.action === "restart"
          ? "/api/actions/restart"
          : action.action === "port-forward"
            ? "/api/actions/port-forward"
            : "/api/actions/generic";

    return this.request<ActionResult>(endpoint, {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify(action),
    });
  }

  async *watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent> {
    const wsUrl = this.baseUrl.replace(/^http/, "ws");
    const params = new URLSearchParams({
      group: opts.group,
      version: opts.version,
      resource: opts.resource,
    });
    if (opts.namespace) params.set("namespace", opts.namespace);
    if (opts.labelSelector) params.set("labelSelector", opts.labelSelector);
    if (opts.fieldSelector) params.set("fieldSelector", opts.fieldSelector);
    if (opts.resourceVersion) params.set("resourceVersion", opts.resourceVersion);

    const socket = new WebSocket(`${wsUrl}/ws/watch?${params}`);
    const queue: WatchEvent[] = [];
    let resolve: (() => void) | null = null;
    let closed = false;
    let error: Error | null = null;

    socket.onmessage = (ev) => {
      try {
        queue.push(JSON.parse(ev.data as string) as WatchEvent);
        resolve?.();
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        resolve?.();
      }
    };
    socket.onerror = () => {
      error = new Error("WebSocket watch error");
      resolve?.();
    };
    socket.onclose = () => {
      closed = true;
      resolve?.();
    };

    try {
      while (!closed || queue.length > 0) {
        if (error) throw error;
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
          resolve = null;
          if (error) throw error;
          if (closed && queue.length === 0) break;
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      socket.close();
    }
  }

  async *streamLogs(opts: LogOpts): AsyncGenerator<string> {
    const wsUrl = this.baseUrl.replace(/^http/, "ws");
    const container = opts.container ? `/${encodeURIComponent(opts.container)}` : "";
    const params = new URLSearchParams();
    if (opts.follow) params.set("follow", "true");
    if (opts.tailLines) params.set("tailLines", String(opts.tailLines));
    if (opts.previous) params.set("previous", "true");
    const qs = params.toString() ? `?${params}` : "";
    const socket = new WebSocket(
      `${wsUrl}/ws/logs/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}${container}${qs}`,
    );

    const queue: string[] = [];
    let resolve: (() => void) | null = null;
    let closed = false;

    socket.onmessage = (ev) => {
      queue.push(ev.data as string);
      resolve?.();
    };
    socket.onclose = () => {
      closed = true;
      resolve?.();
    };

    try {
      while (!closed || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
          resolve = null;
          if (closed && queue.length === 0) break;
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      socket.close();
    }
  }

  async execPod(opts: ExecOpts): Promise<ExecSession> {
    return this.request<ExecSession>("/api/exec/start", {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify(opts),
    });
  }

  async portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    return this.request<PortForwardSession>("/api/actions/port-forward", {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify(opts),
    });
  }
}

export function createK8sApiClient(options: HttpK8sApiClientOptions): K8sApiClient {
  return new HttpK8sApiClient(options);
}
