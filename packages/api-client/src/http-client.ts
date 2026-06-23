import type {
  ActionResult,
  ApplyResult,
  ClusterContext,
  ExecSession,
  ApiResourceDescriptor,
  KubeResource,
  PortForwardSession,
  ResourceListResult,
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
  ResourceActionRequest,
  RestartOpts,
  ScaleOpts,
  WatchOpts,
} from "./contract.js";

export interface HttpK8sApiClientConfig {
  baseUrl: string;
  wsBaseUrl?: string;
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string;
  private readonly wsBaseUrl: string;

  constructor({ baseUrl, wsBaseUrl }: HttpK8sApiClientConfig) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.wsBaseUrl =
      wsBaseUrl?.replace(/\/$/, "") ??
      this.baseUrl.replace(/^http/, "ws");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ApiError(res.status, text);
    }
    return res.json() as Promise<T>;
  }

  async listContexts(): Promise<ClusterContext[]> {
    return this.request<ClusterContext[]>("GET", "/api/contexts");
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.request<SessionInfo>("POST", "/api/session/open", { context });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.request<ApiResourceDescriptor[]>("GET", "/api/discovery");
  }

  async listResources(opts: ListOpts): Promise<ResourceListResult> {
    const { group, version, resource, namespace, ...params } = opts;
    const base = namespace
      ? `/api/resources/${group}/${version}/${resource}/n/${namespace}`
      : `/api/resources/${group}/${version}/${resource}`;
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return this.request<ResourceListResult>("GET", qs ? `${base}?${qs}` : base);
  }

  async getResource(opts: GetOpts): Promise<KubeResource> {
    const { group, version, resource, namespace, name } = opts;
    const path = namespace
      ? `/api/resources/${group}/${version}/${resource}/n/${namespace}/${name}`
      : `/api/resources/${group}/${version}/${resource}/${name}`;
    return this.request<KubeResource>("GET", path);
  }

  async applyYaml(yaml: string): Promise<ApplyResult[]> {
    return this.request<ApplyResult[]>("POST", "/api/resources/apply", { yaml });
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    const { group, version, resource, namespace, name } = opts;
    const path = namespace
      ? `/api/resources/${group}/${version}/${resource}/n/${namespace}/${name}`
      : `/api/resources/${group}/${version}/${resource}/${name}`;
    await this.request<unknown>("DELETE", path);
  }

  async scaleResource(opts: ScaleOpts): Promise<ActionResult> {
    return this.request<ActionResult>("POST", "/api/actions/scale", opts);
  }

  async restartResource(opts: RestartOpts): Promise<ActionResult> {
    return this.request<ActionResult>("POST", "/api/actions/restart", opts);
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    return this.request<ActionResult>("POST", `/api/actions/${action.action}`, action);
  }

  async *watchResources(
    opts: WatchOpts,
    signal?: AbortSignal,
  ): AsyncGenerator<WatchEvent> {
    const { group, version, resource, namespace, labelSelector, resourceVersion } = opts;
    const qs = new URLSearchParams({
      group,
      version,
      resource,
      ...(namespace ? { namespace } : {}),
      ...(labelSelector ? { labelSelector } : {}),
      ...(resourceVersion ? { resourceVersion } : {}),
    }).toString();
    const url = `${this.wsBaseUrl}/ws/watch?${qs}`;
    yield* this.streamWebSocket<WatchEvent>(url, signal);
  }

  async *streamLogs(opts: LogOpts, signal?: AbortSignal): AsyncGenerator<string> {
    const { namespace, pod, container, ...params } = opts;
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    const url = `${this.wsBaseUrl}/ws/logs/${namespace}/${pod}/${container}${qs ? `?${qs}` : ""}`;
    for await (const event of this.streamWebSocket<{ data: string }>(url, signal)) {
      yield event.data;
    }
  }

  async execPod(opts: ExecOpts): Promise<ExecSession> {
    return this.request<ExecSession>("POST", "/api/exec", opts);
  }

  async portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    return this.request<PortForwardSession>("POST", "/api/port-forward", opts);
  }

  private streamWebSocket<T>(url: string, signal?: AbortSignal): AsyncGenerator<T> {
    const ws = new WebSocket(url);

    type QueueItem = { value: T } | { error: unknown } | { done: true };
    const queue: QueueItem[] = [];
    let resolve: (() => void) | null = null;

    function push(item: QueueItem) {
      queue.push(item);
      resolve?.();
      resolve = null;
    }

    ws.onmessage = (event) => {
      try {
        push({ value: JSON.parse(event.data as string) as T });
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => push({ error: new Error("WebSocket error") });
    ws.onclose = (ev) => {
      if (ev.wasClean) {
        push({ done: true });
      } else {
        push({ error: new Error(`WebSocket closed: code=${ev.code}`) });
      }
    };
    signal?.addEventListener("abort", () => {
      ws.close(1000, "aborted");
      push({ done: true });
    });

    async function* gen(): AsyncGenerator<T> {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
        const item = queue.shift()!;
        if ("done" in item) return;
        if ("error" in item) throw item.error;
        yield item.value;
      }
    }

    return gen();
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
