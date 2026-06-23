import type {
  ActionResult,
  ApplyResult,
  ApplyYamlRequest,
  ApiResourceDescriptor,
  ClusterContext,
  ExecOptions,
  ExecSession,
  GetResourceOptions,
  KubeResource,
  ListResourcesOptions,
  LogOptions,
  PortForwardOptions,
  PortForwardSession,
  ResourceListResult,
  RestartActionRequest,
  ScaleActionRequest,
  SessionInfo,
  WatchEvent,
  WatchOptions,
} from '@k8s-ide/core';
import { normalizeGroup, resourceRoute } from '@k8s-ide/core';

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string): Promise<SessionInfo>;
  getDiscovery(context: string): Promise<ApiResourceDescriptor[]>;
  listResources(options: ListResourcesOptions): Promise<ResourceListResult>;
  getResource(options: GetResourceOptions): Promise<KubeResource>;
  applyYaml(request: ApplyYamlRequest): Promise<ApplyResult>;
  deleteResource(options: GetResourceOptions): Promise<void>;
  scaleWorkload(request: ScaleActionRequest): Promise<ActionResult>;
  restartWorkload(request: RestartActionRequest): Promise<ActionResult>;
  watchResources(options: WatchOptions): AsyncGenerator<WatchEvent>;
  streamLogs(options: LogOptions): AsyncGenerator<string>;
  execPod(options: ExecOptions): Promise<ExecSession>;
  portForward(options: PortForwardOptions): Promise<PortForwardSession>;
}

export type HttpK8sApiClientOptions = {
  baseUrl: string;
  wsBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

function withQuery(path: string, query: URLSearchParams): string {
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string;
  private readonly wsBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpK8sApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.wsBaseUrl =
      options.wsBaseUrl ??
      this.baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    });
    return readJson<T>(response);
  }

  private async requestVoid(path: string, init?: RequestInit): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `Request failed with ${response.status}`);
    }
  }

  private resourcePath(options: GetResourceOptions): string {
    return resourceRoute(options);
  }

  async listContexts(): Promise<ClusterContext[]> {
    return this.request<ClusterContext[]>('/api/contexts');
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.request<SessionInfo>('/api/session/open', {
      method: 'POST',
      body: JSON.stringify({ context }),
    });
  }

  async getDiscovery(context: string): Promise<ApiResourceDescriptor[]> {
    return this.request<ApiResourceDescriptor[]>(`/api/discovery?context=${encodeURIComponent(context)}`);
  }

  async listResources(options: ListResourcesOptions): Promise<ResourceListResult> {
    const query = new URLSearchParams({ context: options.context });
    if (options.namespace) query.set('namespace', options.namespace);
    if (options.labelSelector) query.set('labelSelector', options.labelSelector);
    if (options.fieldSelector) query.set('fieldSelector', options.fieldSelector);
    if (typeof options.limit === 'number') query.set('limit', String(options.limit));
    if (options.continue) query.set('continue', options.continue);

    return this.request<ResourceListResult>(
      withQuery(
        `/api/resources/${normalizeGroup(options.group)}/${options.version}/${options.resource}`,
        query,
      ),
    );
  }

  async getResource(options: GetResourceOptions): Promise<KubeResource> {
    const query = new URLSearchParams({ context: options.context });
    return this.request<KubeResource>(withQuery(this.resourcePath(options), query));
  }

  async applyYaml(request: ApplyYamlRequest): Promise<ApplyResult> {
    return this.request<ApplyResult>('/api/resources/apply', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async deleteResource(options: GetResourceOptions): Promise<void> {
    const query = new URLSearchParams({ context: options.context });
    return this.requestVoid(withQuery(this.resourcePath(options), query), { method: 'DELETE' });
  }

  async scaleWorkload(request: ScaleActionRequest): Promise<ActionResult> {
    return this.request<ActionResult>('/api/actions/scale', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async restartWorkload(request: RestartActionRequest): Promise<ActionResult> {
    return this.request<ActionResult>('/api/actions/restart', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async *watchResources(options: WatchOptions): AsyncGenerator<WatchEvent> {
    const query = new URLSearchParams({
      context: options.context,
      group: normalizeGroup(options.group),
      version: options.version,
      resource: options.resource,
    });
    if (options.namespace) query.set('namespace', options.namespace);
    if (options.labelSelector) query.set('labelSelector', options.labelSelector);
    if (options.fieldSelector) query.set('fieldSelector', options.fieldSelector);

    const socket = new WebSocket(`${this.wsBaseUrl}/ws/watch?${query.toString()}`);
    const queue: WatchEvent[] = [];
    let resolver: ((value: IteratorResult<WatchEvent>) => void) | undefined;
    let terminalError: Error | undefined;
    let closed = false;

    socket.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as WatchEvent;
      if (resolver) {
        resolver({ done: false, value: parsed });
        resolver = undefined;
      } else {
        queue.push(parsed);
      }
    };
    socket.onerror = () => {
      terminalError = new Error('Watch websocket failed');
    };
    socket.onclose = () => {
      closed = true;
      if (resolver) {
        resolver({ done: true, value: undefined });
        resolver = undefined;
      }
    };

    try {
      while (!closed) {
        if (terminalError) {
          throw terminalError;
        }
        if (queue.length > 0) {
          yield queue.shift() as WatchEvent;
          continue;
        }
        const next = await new Promise<IteratorResult<WatchEvent>>((resolve) => {
          resolver = resolve;
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

  async *streamLogs(options: LogOptions): AsyncGenerator<string> {
    const container = options.container ?? '_';
    const query = new URLSearchParams({ context: options.context });
    if (options.tailLines) query.set('tailLines', String(options.tailLines));
    const socket = new WebSocket(
      `${this.wsBaseUrl}/ws/logs/${encodeURIComponent(options.namespace)}/${encodeURIComponent(options.pod)}/${encodeURIComponent(container)}?${query.toString()}`,
    );

    const queue: string[] = [];
    let resolver: ((value: IteratorResult<string>) => void) | undefined;
    let closed = false;

    socket.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as { message?: string };
      const line = parsed.message ?? String(event.data);
      if (resolver) {
        resolver({ done: false, value: line });
        resolver = undefined;
      } else {
        queue.push(line);
      }
    };
    socket.onclose = () => {
      closed = true;
      if (resolver) {
        resolver({ done: true, value: undefined });
        resolver = undefined;
      }
    };

    try {
      while (!closed) {
        if (queue.length > 0) {
          yield queue.shift() as string;
          continue;
        }
        const next = await new Promise<IteratorResult<string>>((resolve) => {
          resolver = resolve;
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

  async execPod(options: ExecOptions): Promise<ExecSession> {
    const container = options.container ?? '_';
    const query = new URLSearchParams({ context: options.context });
    return {
      id: crypto.randomUUID(),
      websocketUrl: `${this.wsBaseUrl}/ws/exec/${encodeURIComponent(options.namespace)}/${encodeURIComponent(options.pod)}/${encodeURIComponent(container)}?${query.toString()}`,
    };
  }

  async portForward(options: PortForwardOptions): Promise<PortForwardSession> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/actions/port-forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `Request failed with ${response.status}`);
    }
    const localPort = options.localPort ?? options.remotePort;
    return {
      id: crypto.randomUUID(),
      websocketUrl: `${this.wsBaseUrl}/ws/port-forward`,
      localPort,
      remotePort: options.remotePort,
    };
  }
}
