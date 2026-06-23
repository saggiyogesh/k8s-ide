import {
  type ActionResult,
  type ApiResourceDescriptor,
  type ApplyResult,
  type ClusterContext,
  type DeleteOpts,
  type ExecOpts,
  type ExecSession,
  type GetOpts,
  type JsonObject,
  type ListOpts,
  type LogOpts,
  type PortForwardOpts,
  type PortForwardSession,
  type ResourceActionRequest,
  type ResourceListResult,
  type SessionInfo,
  type WatchEvent,
  type WatchOpts,
  resourceRoute
} from '@k8s-ide/core';

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string, kubeconfigPath?: string): Promise<SessionInfo>;
  getDiscovery(): Promise<ApiResourceDescriptor[]>;
  listResources(opts: ListOpts): Promise<ResourceListResult>;
  getResource(opts: GetOpts): Promise<JsonObject>;
  applyYaml(yaml: string): Promise<ApplyResult>;
  deleteResource(opts: DeleteOpts): Promise<void>;
  invokeAction(action: ResourceActionRequest): Promise<ActionResult>;
  watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent>;
  streamLogs(opts: LogOpts): AsyncGenerator<string>;
  execPod(opts: ExecOpts): Promise<ExecSession>;
  portForward(opts: PortForwardOpts): Promise<PortForwardSession>;
}

export interface HttpK8sApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  webSocketFactory?: (url: string) => WebSocket;
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly webSocketFactory: (url: string) => WebSocket;

  constructor(options: HttpK8sApiClientOptions = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, '') ?? '';
    this.fetchImpl = options.fetch ?? fetch;
    this.webSocketFactory = options.webSocketFactory ?? ((url: string) => new WebSocket(url));
  }

  async listContexts(): Promise<ClusterContext[]> {
    return this.request('/api/contexts');
  }

  async openSession(context: string, kubeconfigPath?: string): Promise<SessionInfo> {
    return this.request('/api/session/open', {
      method: 'POST',
      body: JSON.stringify({ context, kubeconfigPath })
    });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.request('/api/discovery');
  }

  async listResources(opts: ListOpts): Promise<ResourceListResult> {
    const url = new URL(this.resolveUrl(resourceRoute(opts)), window.location.origin);
    if (opts.labelSelector) {
      url.searchParams.set('labelSelector', opts.labelSelector);
    }
    if (opts.fieldSelector) {
      url.searchParams.set('fieldSelector', opts.fieldSelector);
    }
    if (opts.limit) {
      url.searchParams.set('limit', String(opts.limit));
    }
    if (opts.continueToken) {
      url.searchParams.set('continue', opts.continueToken);
    }

    return this.request(url.pathname + url.search);
  }

  async getResource(opts: GetOpts): Promise<JsonObject> {
    return this.request(resourceRoute(opts));
  }

  async applyYaml(yaml: string): Promise<ApplyResult> {
    return this.request('/api/resources/apply', {
      method: 'POST',
      body: JSON.stringify({ yaml })
    });
  }

  async deleteResource(opts: DeleteOpts): Promise<void> {
    await this.request(resourceRoute(opts), { method: 'DELETE' });
  }

  async invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    return this.request(`/api/actions/${action.action}`, {
      method: 'POST',
      body: JSON.stringify(action)
    });
  }

  async *watchResources(opts: WatchOpts): AsyncGenerator<WatchEvent> {
    const ws = this.openSocket('/ws/watch', {
      group: opts.group,
      version: opts.version,
      resource: opts.resource,
      namespace: opts.namespace,
      labelSelector: opts.labelSelector,
      fieldSelector: opts.fieldSelector
    });

    yield* streamSocket<WatchEvent>(ws);
  }

  async *streamLogs(opts: LogOpts): AsyncGenerator<string> {
    const ws = this.openSocket(
      `/ws/logs/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}/${encodeURIComponent(
        opts.container || '_'
      )}`,
      {
        follow: String(opts.follow ?? true),
        previous: String(opts.previous ?? false),
        tailLines: opts.tailLines ? String(opts.tailLines) : undefined
      }
    );

    yield* streamSocket<string>(ws);
  }

  async execPod(opts: ExecOpts): Promise<ExecSession> {
    return this.request('/api/actions/exec', {
      method: 'POST',
      body: JSON.stringify(opts)
    });
  }

  async portForward(opts: PortForwardOpts): Promise<PortForwardSession> {
    return this.request('/api/actions/port-forward', {
      method: 'POST',
      body: JSON.stringify(opts)
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(this.resolveUrl(path), {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      ...init
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed with status ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private openSocket(path: string, params: Record<string, string | undefined>): WebSocket {
    const httpUrl = new URL(this.resolveUrl(path), window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        httpUrl.searchParams.set(key, value);
      }
    });

    httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    return this.webSocketFactory(httpUrl.toString());
  }

  private resolveUrl(path: string): string {
    if (!this.baseUrl) {
      return path;
    }

    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

async function* streamSocket<T>(ws: WebSocket): AsyncGenerator<T> {
  const queue: T[] = [];
  let rejectWaiter: ((reason?: unknown) => void) | undefined;
  let resolveWaiter: (() => void) | undefined;
  let closed = false;

  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data)) as T;
    queue.push(payload);
    resolveWaiter?.();
    resolveWaiter = undefined;
  });

  ws.addEventListener('error', (event) => {
    rejectWaiter?.(event);
    rejectWaiter = undefined;
  });

  ws.addEventListener('close', () => {
    closed = true;
    resolveWaiter?.();
    resolveWaiter = undefined;
  });

  try {
    while (!closed || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve, reject) => {
          resolveWaiter = resolve;
          rejectWaiter = reject;
        });
      }

      while (queue.length > 0) {
        const item = queue.shift();
        if (item !== undefined) {
          yield item;
        }
      }
    }
  } finally {
    ws.close();
  }
}
