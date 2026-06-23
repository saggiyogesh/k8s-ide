import type {
  ActionResult,
  ApiResourceDescriptor,
  ApplyResult,
  ClusterContext,
  DeleteOpts,
  ExecOpts,
  GetOpts,
  KubeResource,
  ListOpts,
  LogOpts,
  PortForwardOpts,
  ResourceActionRequest,
  ResourceListResult,
  SessionInfo,
  WatchEvent,
  WatchOpts,
} from "@k8s-ide/core";

export type ExecSession = {
  close: () => void;
};

export type PortForwardSession = {
  localPort: number;
  close: () => void;
};

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
  healthCheck(): Promise<boolean>;
}

export type HttpK8sApiClientOptions = {
  baseUrl: string;
  getAuthToken?: () => string | undefined;
};

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function resourcePath(group: string, version: string, resource: string, namespace?: string, name?: string): string {
  const groupSegment = group ? `${encodeURIComponent(group)}/` : "";
  const base = `/api/resources/${groupSegment}${encodeURIComponent(version)}/${encodeURIComponent(resource)}`;
  if (namespace && name) {
    return `${base}/n/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
  }
  if (name) {
    return `${base}/${encodeURIComponent(name)}`;
  }
  return base;
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string;
  private readonly getAuthToken?: () => string | undefined;

  constructor(options: HttpK8sApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getAuthToken = options.getAuthToken;
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    headers.set("Accept", "application/json");
    const token = this.getAuthToken?.();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init?.headers),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, { headers: this.headers() });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listContexts(): Promise<ClusterContext[]> {
    return this.request<ClusterContext[]>("/api/contexts");
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.request<SessionInfo>("/api/session/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.request<ApiResourceDescriptor[]>("/api/discovery");
  }

  async listResources(opts: ListOpts): Promise<ResourceListResult> {
    const path =
      resourcePath(opts.group, opts.version, opts.resource) +
      buildQuery({
        namespace: opts.namespace,
        labelSelector: opts.labelSelector,
        fieldSelector: opts.fieldSelector,
        limit: opts.limit,
        continue: opts.continue,
      });
    return this.request<ResourceListResult>(path);
  }

  async getResource(opts: GetOpts): Promise<KubeResource> {
    const path = resourcePath(opts.group, opts.version, opts.resource, opts.namespace, opts.name);
    return this.request<KubeResource>(path);
  }

  async applyYaml(yaml: string): Promise<ApplyResult> {
    return this.request<ApplyResult>("/api/resources/apply", {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml,
    });
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    const path = resourcePath(opts.group, opts.version, opts.resource, opts.namespace, opts.name);
    await this.request<void>(path, { method: "DELETE" });
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    const endpoint =
      action.action === "scale"
        ? "/api/actions/scale"
        : action.action === "restart"
          ? "/api/actions/restart"
          : action.action === "port-forward"
            ? "/api/actions/port-forward"
            : `/api/actions/${action.action}`;

    return this.request<ActionResult>(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
  }

  async *watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent> {
    const path =
      `/ws/watch` +
      buildQuery({
        group: opts.group,
        version: opts.version,
        resource: opts.resource,
        namespace: opts.namespace,
        labelSelector: opts.labelSelector,
        fieldSelector: opts.fieldSelector,
        resourceVersion: opts.resourceVersion,
      });

    const wsUrl = this.toWebSocketUrl(path);
    const socket = new WebSocket(wsUrl);

    const queue: WatchEvent[] = [];
    let resolveNext: ((value: IteratorResult<WatchEvent>) => void) | null = null;
    let done = false;
    let error: Error | null = null;

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as WatchEvent;
        if (resolveNext) {
          resolveNext({ value: parsed, done: false });
          resolveNext = null;
        } else {
          queue.push(parsed);
        }
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
      }
    };

    socket.onerror = () => {
      error = new Error("WebSocket watch error");
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as WatchEvent, done: true });
        resolveNext = null;
      }
      done = true;
    };

    socket.onclose = () => {
      done = true;
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as WatchEvent, done: true });
        resolveNext = null;
      }
    };

    try {
      while (!done || queue.length > 0) {
        if (error) throw error;
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        const next = await new Promise<IteratorResult<WatchEvent>>((resolve) => {
          resolveNext = resolve;
        });
        if (next.done) break;
        yield next.value;
      }
    } finally {
      socket.close();
    }
  }

  async *streamLogs(opts: LogOpts): AsyncGenerator<string> {
    const path =
      `/ws/logs/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}` +
      buildQuery({
        container: opts.container,
        tailLines: opts.tailLines,
        follow: opts.follow ?? true,
        previous: opts.previous,
      });

    yield* this.streamWebSocketText(this.toWebSocketUrl(path));
  }

  async execPod(opts: ExecOpts): Promise<ExecSession> {
    const path =
      `/ws/exec/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}` +
      buildQuery({
        container: opts.container,
        command: opts.command.join(" "),
      });

    const socket = new WebSocket(this.toWebSocketUrl(path));
    return {
      close: () => socket.close(),
    };
  }

  async portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    const result = await this.invokeAction({
      action: "port-forward",
      ref: {
        group: "",
        version: "v1",
        resource: "pods",
        kind: "Pod",
        namespace: opts.namespace,
        name: opts.pod,
      },
      payload: {
        localPort: opts.localPort,
        remotePort: opts.remotePort,
      },
    });

    return {
      localPort: (result.data?.localPort as number) ?? opts.localPort,
      close: () => undefined,
    };
  }

  private toWebSocketUrl(path: string): string {
    const url = new URL(`${this.baseUrl}${path}`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const token = this.getAuthToken?.();
    if (token) {
      url.searchParams.set("token", token);
    }
    return url.toString();
  }

  private async *streamWebSocketText(url: string): AsyncGenerator<string> {
    const socket = new WebSocket(url);
    const queue: string[] = [];
    let resolveNext: ((value: IteratorResult<string>) => void) | null = null;
    let done = false;

    socket.onmessage = (event) => {
      const chunk = String(event.data);
      if (resolveNext) {
        resolveNext({ value: chunk, done: false });
        resolveNext = null;
      } else {
        queue.push(chunk);
      }
    };

    socket.onclose = () => {
      done = true;
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as string, done: true });
        resolveNext = null;
      }
    };

    try {
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        const next = await new Promise<IteratorResult<string>>((resolve) => {
          resolveNext = resolve;
        });
        if (next.done) break;
        yield next.value;
      }
    } finally {
      socket.close();
    }
  }
}

export function createK8sApiClient(options: HttpK8sApiClientOptions): K8sApiClient {
  return new HttpK8sApiClient(options);
}
