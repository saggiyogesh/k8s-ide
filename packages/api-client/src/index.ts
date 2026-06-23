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
} from "@k8s-ide/core";

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string): Promise<SessionInfo>;
  getDiscovery(): Promise<ApiResourceDescriptor[]>;
  listResources(opts: ListOpts): Promise<ResourceListResult>;
  getResource(opts: GetOpts): Promise<KubeResource>;
  applyYaml(yaml: string): Promise<ApplyResult>;
  deleteResource(opts: DeleteOpts): Promise<void>;
  invokeAction(action: ResourceActionRequest): Promise<ActionResult>;
  watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent>;
  streamLogs(opts: LogOpts): AsyncGenerator<string>;
  execPod(opts: ExecOpts): Promise<ExecSession>;
  portForward(opts: PortForwardOpts): Promise<PortForwardSession>;
}

export interface HttpK8sApiClientOptions {
  baseUrl: string;
  getToken?: () => string | undefined;
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string;
  private readonly getToken?: () => string | undefined;

  constructor(options: HttpK8sApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getToken = options.getToken;
  }

  private headers(contentType = "application/json"): HeadersInit {
    const h: Record<string, string> = {};
    if (contentType) h["Content-Type"] = contentType;
    const token = this.getToken?.();
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(init?.body ? "application/json" : ""), ...init?.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listContexts(): Promise<ClusterContext[]> {
    const data = await this.request<{ contexts: ClusterContext[] }>("/api/contexts");
    return data.contexts;
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.request<SessionInfo>("/api/session/open", {
      method: "POST",
      body: JSON.stringify({ context }),
    });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    const data = await this.request<{ resources: ApiResourceDescriptor[] }>("/api/discovery");
    return data.resources;
  }

  async listResources(opts: ListOpts): Promise<ResourceListResult> {
    const group = opts.group || "core";
    const params = new URLSearchParams();
    if (opts.namespace) params.set("namespace", opts.namespace);
    if (opts.labelSelector) params.set("labelSelector", opts.labelSelector);
    if (opts.fieldSelector) params.set("fieldSelector", opts.fieldSelector);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.continue) params.set("continue", opts.continue);
    const qs = params.toString();
    const path = `/api/resources/${group}/${opts.version}/${opts.resource}${qs ? `?${qs}` : ""}`;
    return this.request<ResourceListResult>(path);
  }

  async getResource(opts: GetOpts): Promise<KubeResource> {
    const group = opts.group || "core";
    const path = opts.namespace
      ? `/api/resources/${group}/${opts.version}/${opts.resource}/n/${opts.namespace}/${opts.name}`
      : `/api/resources/${group}/${opts.version}/${opts.resource}/${opts.name}`;
    return this.request<KubeResource>(path);
  }

  async applyYaml(yaml: string): Promise<ApplyResult> {
    return this.request<ApplyResult>("/api/resources/apply", {
      method: "POST",
      body: JSON.stringify({ yaml }),
    });
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    const group = opts.group || "core";
    const path = opts.namespace
      ? `/api/resources/${group}/${opts.version}/${opts.resource}/n/${opts.namespace}/${opts.name}`
      : `/api/resources/${group}/${opts.version}/${opts.resource}/${opts.name}`;
    await this.request<void>(path, { method: "DELETE" });
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    const path =
      action.action === "scale"
        ? "/api/actions/scale"
        : action.action === "restart"
          ? "/api/actions/restart"
          : action.action === "port-forward"
            ? "/api/actions/port-forward"
            : `/api/actions/${action.action}`;
    return this.request<ActionResult>(path, {
      method: "POST",
      body: JSON.stringify(action),
    });
  }

  async *watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent> {
    const group = opts.group || "core";
    const params = new URLSearchParams({
      group,
      version: opts.version,
      resource: opts.resource,
    });
    if (opts.namespace) params.set("namespace", opts.namespace);
    if (opts.labelSelector) params.set("labelSelector", opts.labelSelector);
    if (opts.fieldSelector) params.set("fieldSelector", opts.fieldSelector);
    if (opts.resourceVersion) params.set("resourceVersion", opts.resourceVersion);

    const wsBase = this.baseUrl.replace(/^http/, "ws");
    const socket = new WebSocket(`${wsBase}/ws/watch?${params.toString()}`);

    const queue: WatchEvent[] = [];
    let resolve: (() => void) | null = null;
    let closed = false;
    let error: Error | null = null;

    socket.onmessage = (ev) => {
      try {
        queue.push(JSON.parse(ev.data as string) as WatchEvent);
        resolve?.();
        resolve = null;
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        resolve?.();
      }
    };
    socket.onerror = () => {
      error = new Error("WebSocket error");
      resolve?.();
    };
    socket.onclose = () => {
      closed = true;
      resolve?.();
    };

    await new Promise<void>((r) => {
      if (socket.readyState === WebSocket.OPEN) r();
      else socket.onopen = () => r();
    });

    try {
      while (!closed || queue.length > 0) {
        if (error) throw error;
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      socket.close();
    }
  }

  async *streamLogs(opts: LogOpts): AsyncGenerator<string> {
    const params = new URLSearchParams();
    if (opts.container) params.set("container", opts.container);
    if (opts.follow) params.set("follow", "true");
    if (opts.tailLines) params.set("tailLines", String(opts.tailLines));
    if (opts.previous) params.set("previous", "true");
    const qs = params.toString();
    const wsBase = this.baseUrl.replace(/^http/, "ws");
    const socket = new WebSocket(
      `${wsBase}/ws/logs/${opts.namespace}/${opts.pod}${qs ? `?${qs}` : ""}`,
    );

    const queue: string[] = [];
    let resolve: (() => void) | null = null;
    let closed = false;

    socket.onmessage = (ev) => {
      queue.push(ev.data as string);
      resolve?.();
      resolve = null;
    };
    socket.onclose = () => {
      closed = true;
      resolve?.();
    };

    await new Promise<void>((r) => {
      if (socket.readyState === WebSocket.OPEN) r();
      else socket.onopen = () => r();
    });

    try {
      while (!closed || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      socket.close();
    }
  }

  async execPod(opts: ExecOpts): Promise<ExecSession> {
    return this.request<ExecSession>("/api/exec", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    return this.request<PortForwardSession>("/api/actions/port-forward", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }
}

export { HttpK8sApiClient as createHttpK8sApiClient };
export type { K8sApiClient as IK8sApiClient };
