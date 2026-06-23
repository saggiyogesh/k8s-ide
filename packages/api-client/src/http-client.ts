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
import type {
  DeleteOpts,
  ExecOpts,
  GetOpts,
  K8sApiClient,
  ListOpts,
  LogOpts,
  PortForwardOpts,
  ResourceListResult,
  WatchOpts,
} from "./contract.js";

export interface HttpK8sApiClientOptions {
  baseUrl: string;
  /** Called on every request to obtain a bearer token (optional). */
  getToken?: () => string | undefined;
}

function gvrPath(group: string, version: string, resource: string): string {
  const g = group || "core";
  return `${g}/${version}/${resource}`;
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly base: string;
  private readonly getToken: (() => string | undefined) | undefined;

  constructor(opts: HttpK8sApiClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "");
    this.getToken = opts.getToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const token = this.getToken?.();
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(res.status, body || res.statusText);
    }
    return res.json() as Promise<T>;
  }

  private wsUrl(path: string, params?: Record<string, string>): string {
    const base = this.base.replace(/^http/, "ws");
    const query = params
      ? "?" + new URLSearchParams(params).toString()
      : "";
    return `${base}${path}${query}`;
  }

  async listContexts(): Promise<ClusterContext[]> {
    return this.fetch<ClusterContext[]>("/api/contexts");
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.fetch<SessionInfo>("/api/session/open", {
      method: "POST",
      body: JSON.stringify({ context }),
    });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.fetch<ApiResourceDescriptor[]>("/api/discovery");
  }

  async listResources(opts: ListOpts): Promise<ResourceListResult> {
    const params = new URLSearchParams();
    if (opts.namespace) params.set("namespace", opts.namespace);
    if (opts.labelSelector) params.set("labelSelector", opts.labelSelector);
    if (opts.fieldSelector) params.set("fieldSelector", opts.fieldSelector);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.continueToken) params.set("continue", opts.continueToken);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.fetch<ResourceListResult>(
      `/api/resources/${gvrPath(opts.group, opts.version, opts.resource)}${qs}`,
    );
  }

  async getResource(opts: GetOpts): Promise<KubeResource> {
    if (opts.namespace) {
      return this.fetch<KubeResource>(
        `/api/resources/${gvrPath(opts.group, opts.version, opts.resource)}/n/${opts.namespace}/${opts.name}`,
      );
    }
    return this.fetch<KubeResource>(
      `/api/resources/${gvrPath(opts.group, opts.version, opts.resource)}/${opts.name}`,
    );
  }

  async applyYaml(yaml: string): Promise<ApplyResult[]> {
    return this.fetch<ApplyResult[]>("/api/resources/apply", {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml,
    });
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    const path = opts.namespace
      ? `/api/resources/${gvrPath(opts.group, opts.version, opts.resource)}/n/${opts.namespace}/${opts.name}`
      : `/api/resources/${gvrPath(opts.group, opts.version, opts.resource)}/${opts.name}`;
    await this.fetch<void>(path, { method: "DELETE" });
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    return this.fetch<ActionResult>(`/api/actions/${action.action}`, {
      method: "POST",
      body: JSON.stringify(action),
    });
  }

  async *watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent> {
    const params: Record<string, string> = {
      group: opts.group,
      version: opts.version,
      resource: opts.resource,
    };
    if (opts.namespace) params["namespace"] = opts.namespace;
    if (opts.labelSelector) params["labelSelector"] = opts.labelSelector;
    if (opts.resourceVersion) params["resourceVersion"] = opts.resourceVersion;
    yield* connectWebSocket<WatchEvent>(this.wsUrl("/ws/watch", params));
  }

  async *streamLogs(opts: LogOpts): AsyncGenerator<string> {
    const params: Record<string, string> = {};
    if (opts.follow !== undefined) params["follow"] = String(opts.follow);
    if (opts.tailLines !== undefined) params["tailLines"] = String(opts.tailLines);
    if (opts.sinceSeconds !== undefined) params["sinceSeconds"] = String(opts.sinceSeconds);
    if (opts.previous !== undefined) params["previous"] = String(opts.previous);
    const path = `/ws/logs/${opts.namespace}/${opts.pod}/${opts.container}`;
    yield* connectWebSocket<string>(this.wsUrl(path, params), (msg) => msg);
  }

  async execPod(opts: ExecOpts): Promise<ExecSession> {
    return this.fetch<ExecSession>(
      `/api/exec/${opts.namespace}/${opts.pod}/${opts.container}`,
      {
        method: "POST",
        body: JSON.stringify({ command: opts.command ?? ["/bin/sh"] }),
      },
    );
  }

  async portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    return this.fetch<PortForwardSession>("/api/port-forward", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }
}

// ─── WebSocket async generator helper ────────────────────────────────────────

async function* connectWebSocket<T>(
  url: string,
  transform?: (raw: string) => T,
): AsyncGenerator<T> {
  const ws = new WebSocket(url);
  const queue: T[] = [];
  let done = false;
  let error: Error | null = null;
  let resolve: (() => void) | null = null;

  ws.addEventListener("message", (ev: MessageEvent<string>) => {
    const item = transform ? transform(ev.data) : (JSON.parse(ev.data) as T);
    queue.push(item);
    resolve?.();
    resolve = null;
  });

  ws.addEventListener("close", () => {
    done = true;
    resolve?.();
    resolve = null;
  });

  ws.addEventListener("error", (ev) => {
    error = new Error(`WebSocket error: ${JSON.stringify(ev)}`);
    done = true;
    resolve?.();
    resolve = null;
  });

  while (!done || queue.length > 0) {
    if (queue.length === 0 && !done) {
      await new Promise<void>((r) => {
        resolve = r;
      });
    }
    while (queue.length > 0) {
      yield queue.shift()!;
    }
  }

  if (error) throw error;
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
