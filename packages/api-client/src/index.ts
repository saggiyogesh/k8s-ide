import type {
  ActionResult,
  ApplyResult,
  ClusterContext,
  DeleteOptions,
  ExecOptions,
  ExecSession,
  GetOptions,
  KubeResource,
  ListOptions,
  LogOptions,
  PortForwardOptions,
  PortForwardSession,
  ResourceActionRequest,
  ResourceListResult,
  SessionInfo,
  WatchEvent,
  WatchOptions,
  ApiResourceDescriptor
} from "@k8s-ide/core";
import { resourceRoute } from "@k8s-ide/core";

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string): Promise<SessionInfo>;
  getDiscovery(): Promise<ApiResourceDescriptor[]>;
  listResources(opts: ListOptions): Promise<ResourceListResult>;
  getResource(opts: GetOptions): Promise<KubeResource>;
  applyYaml(yaml: string): Promise<ApplyResult>;
  deleteResource(opts: DeleteOptions): Promise<void>;
  invokeAction(action: ResourceActionRequest): Promise<ActionResult>;
  watchResources(opts: WatchOptions): AsyncGenerator<WatchEvent>;
  streamLogs(opts: LogOptions): AsyncGenerator<string>;
  execPod(opts: ExecOptions): Promise<ExecSession>;
  portForward(opts: PortForwardOptions): Promise<PortForwardSession>;
}

async function checkResponse(response: Response): Promise<Response> {
  if (response.ok) {
    return response;
  }

  const text = await response.text();
  throw new Error(text || `Request failed with status ${response.status}`);
}

function withSearchParams(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(path, "http://placeholder.local");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return `${url.pathname}${url.search}`;
}

async function* websocketStream<T>(url: string): AsyncGenerator<T> {
  const socket = new WebSocket(url);
  const queue: T[] = [];
  let closed = false;
  let pendingResolve: ((value: IteratorResult<T>) => void) | undefined;
  let failure: Error | undefined;

  socket.onmessage = (event) => {
    const nextValue = JSON.parse(String(event.data)) as T;

    if (pendingResolve) {
      pendingResolve({ value: nextValue, done: false });
      pendingResolve = undefined;
      return;
    }

    queue.push(nextValue);
  };

  socket.onerror = () => {
    failure = new Error(`WebSocket request failed for ${url}`);

    if (pendingResolve) {
      pendingResolve(Promise.reject(failure) as never);
      pendingResolve = undefined;
    }
  };

  socket.onclose = () => {
    closed = true;

    if (pendingResolve) {
      pendingResolve({ value: undefined as T, done: true });
      pendingResolve = undefined;
    }
  };

  try {
    while (!closed || queue.length > 0) {
      if (queue.length > 0) {
        const nextItem = queue.shift();

        if (nextItem !== undefined) {
          yield nextItem;
        }

        continue;
      }

      if (failure) {
        throw failure;
      }

      const next = await new Promise<IteratorResult<T>>((resolve) => {
        pendingResolve = resolve;
      });

      if (next.done) {
        break;
      }

      yield next.value;
    }
  } finally {
    socket.close();
  }
}

export class HttpK8sApiClient implements K8sApiClient {
  constructor(private readonly baseUrl = "") {}

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await checkResponse(await fetch(`${this.baseUrl}${path}`, init));
    return (await response.json()) as T;
  }

  async listContexts(): Promise<ClusterContext[]> {
    return this.requestJson<ClusterContext[]>("/api/contexts");
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.requestJson<SessionInfo>("/api/session/open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ context })
    });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.requestJson<ApiResourceDescriptor[]>("/api/discovery");
  }

  async listResources(opts: ListOptions): Promise<ResourceListResult> {
    return this.requestJson<ResourceListResult>(
      withSearchParams(resourceRoute(opts, opts.namespace), {
        labelSelector: opts.labelSelector,
        fieldSelector: opts.fieldSelector,
        limit: opts.limit
      })
    );
  }

  async getResource(opts: GetOptions): Promise<KubeResource> {
    return this.requestJson<KubeResource>(resourceRoute(opts, opts.namespace, opts.name));
  }

  async applyYaml(yaml: string): Promise<ApplyResult> {
    return this.requestJson<ApplyResult>("/api/resources/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ yaml })
    });
  }

  async deleteResource(opts: DeleteOptions): Promise<void> {
    await checkResponse(
      await fetch(`${this.baseUrl}${resourceRoute(opts, opts.namespace, opts.name)}`, {
        method: "DELETE"
      })
    );
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    return this.requestJson<ActionResult>(`/api/actions/${action.action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(action)
    });
  }

  async *watchResources(opts: WatchOptions): AsyncGenerator<WatchEvent> {
    const url = withSearchParams(
      `/ws/watch/${opts.group || "core"}/${opts.version}/${opts.resource}`,
      {
        namespace: opts.namespace,
        labelSelector: opts.labelSelector,
        fieldSelector: opts.fieldSelector
      }
    );

    yield* websocketStream<WatchEvent>(this.toWebSocketUrl(url));
  }

  async *streamLogs(opts: LogOptions): AsyncGenerator<string> {
    const url = withSearchParams(`/ws/logs/${opts.namespace}/${opts.pod}`, {
      container: opts.container,
      tailLines: opts.tailLines
    });

    for await (const event of websocketStream<{ line: string }>(this.toWebSocketUrl(url))) {
      yield event.line;
    }
  }

  async execPod(opts: ExecOptions): Promise<ExecSession> {
    const url = withSearchParams(`/ws/exec/${opts.namespace}/${opts.pod}`, {
      container: opts.container,
      command: opts.command.join(" ")
    });

    return {
      url: this.toWebSocketUrl(url),
      protocol: "websocket"
    };
  }

  async portForward(opts: PortForwardOptions): Promise<PortForwardSession> {
    return this.requestJson<PortForwardSession>("/api/actions/port-forward", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "port-forward",
        target: {
          group: "",
          version: "v1",
          resource: opts.resource,
          namespace: opts.namespace,
          name: opts.name
        },
        payload: {
          localPort: opts.localPort,
          remotePort: opts.remotePort
        }
      })
    });
  }

  private toWebSocketUrl(path: string): string {
    if (this.baseUrl.startsWith("http://")) {
      return `ws://${this.baseUrl.slice("http://".length)}${path}`;
    }

    if (this.baseUrl.startsWith("https://")) {
      return `wss://${this.baseUrl.slice("https://".length)}${path}`;
    }

    if (typeof window !== "undefined") {
      const base = new URL(this.baseUrl || window.location.origin);
      base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
      base.pathname = path;
      base.search = "";
      return base.toString();
    }

    return path;
  }
}
