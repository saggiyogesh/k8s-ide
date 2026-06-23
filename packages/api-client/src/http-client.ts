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
import type { K8sApiClient } from "./contract.js";

export interface HttpK8sApiClientOptions {
  /** Base URL for the backend, e.g. http://localhost:8080 */
  baseUrl: string;
}

/**
 * Production HTTP/WebSocket implementation of K8sApiClient.
 */
export class HttpK8sApiClient implements K8sApiClient {
  private readonly base: string;

  constructor(opts: HttpK8sApiClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "");
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ApiError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  async listContexts(): Promise<ClusterContext[]> {
    return this.json<ClusterContext[]>("/api/contexts");
  }

  async openSession(contextName: string): Promise<SessionInfo> {
    return this.json<SessionInfo>("/api/session/open", {
      method: "POST",
      body: JSON.stringify({ context: contextName }),
    });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.json<ApiResourceDescriptor[]>("/api/discovery");
  }

  async listResources(opts: ListOpts): Promise<ResourceListResult> {
    const url = this.resourcesPath(opts);
    const params = new URLSearchParams();
    if (opts.labelSelector) params.set("labelSelector", opts.labelSelector);
    if (opts.fieldSelector) params.set("fieldSelector", opts.fieldSelector);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.continueToken) params.set("continue", opts.continueToken);
    const qs = params.toString();
    return this.json<ResourceListResult>(`${url}${qs ? `?${qs}` : ""}`);
  }

  async getResource(opts: GetOpts): Promise<KubeResource> {
    const base = this.resourcesPath(opts);
    const path = opts.namespace
      ? `${base}/n/${opts.namespace}/${opts.name}`
      : `${base}/${opts.name}`;
    return this.json<KubeResource>(path);
  }

  async applyYaml(yaml: string): Promise<ApplyResult> {
    return this.json<ApplyResult>("/api/resources/apply", {
      method: "POST",
      body: JSON.stringify({ yaml }),
    });
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    const base = this.resourcesPath(opts);
    const path = opts.namespace
      ? `${base}/n/${opts.namespace}/${opts.name}`
      : `${base}/${opts.name}`;
    await this.json<void>(path, { method: "DELETE" });
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    return this.json<ActionResult>(`/api/actions/${action.action}`, {
      method: "POST",
      body: JSON.stringify(action),
    });
  }

  async *watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent> {
    const params = new URLSearchParams({
      group: opts.group,
      version: opts.version,
      resource: opts.resource,
    });
    if (opts.namespace) params.set("namespace", opts.namespace);
    if (opts.labelSelector) params.set("labelSelector", opts.labelSelector);
    if (opts.resourceVersion) params.set("resourceVersion", opts.resourceVersion);

    const wsUrl = this.toWsUrl(`/ws/watch?${params}`);
    yield* this.streamWebSocket<WatchEvent>(wsUrl);
  }

  async *streamLogs(opts: LogOpts): AsyncGenerator<string> {
    const params = new URLSearchParams();
    if (opts.container) params.set("container", opts.container);
    if (opts.follow !== undefined) params.set("follow", String(opts.follow));
    if (opts.tailLines !== undefined) params.set("tailLines", String(opts.tailLines));
    if (opts.sinceSeconds !== undefined) params.set("sinceSeconds", String(opts.sinceSeconds));
    const qs = params.toString();
    const wsUrl = this.toWsUrl(
      `/ws/logs/${opts.namespace}/${opts.pod}${qs ? `?${qs}` : ""}`,
    );
    yield* this.streamWebSocket<string>(wsUrl, (raw) => raw);
  }

  async execPod(opts: ExecOpts): Promise<ExecSession> {
    return this.json<ExecSession>(
      `/api/exec/${opts.namespace}/${opts.pod}`,
      {
        method: "POST",
        body: JSON.stringify(opts),
      },
    );
  }

  async portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    return this.json<PortForwardSession>("/api/actions/port-forward", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private resourcesPath(opts: { group: string; version: string; resource: string }): string {
    return `/api/resources/${encodeURIComponent(opts.group || "core")}/${encodeURIComponent(opts.version)}/${encodeURIComponent(opts.resource)}`;
  }

  private toWsUrl(path: string): string {
    const httpBase = this.base;
    const wsBase = httpBase.replace(/^http/, "ws");
    return `${wsBase}${path}`;
  }

  private async *streamWebSocket<T>(
    url: string,
    transform?: (raw: string) => T,
  ): AsyncGenerator<T> {
    const ws = new WebSocket(url);
    const queue: T[] = [];
    let resolve: (() => void) | null = null;
    let reject: ((e: unknown) => void) | null = null;
    let done = false;
    let error: unknown = null;

    ws.addEventListener("message", (ev) => {
      const raw = ev.data as string;
      const item = transform ? transform(raw) : (JSON.parse(raw) as T);
      queue.push(item);
      resolve?.();
    });

    ws.addEventListener("close", () => {
      done = true;
      resolve?.();
    });

    ws.addEventListener("error", (ev) => {
      error = ev;
      done = true;
      reject?.(ev);
    });

    try {
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((res, rej) => {
            resolve = res;
            reject = rej;
          });
          resolve = null;
          reject = null;
          if (error) throw error;
        }
      }
    } finally {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
