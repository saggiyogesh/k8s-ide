import type {
  ActionResult,
  ApiResourceDescriptor,
  ApplyResourceRequest,
  ApplyResult,
  ClusterContext,
  DeleteResourceOptions,
  ExecOptions,
  ExecSession,
  GetResourceOptions,
  KubeResource,
  ListResourcesOptions,
  LogStreamOptions,
  PortForwardOptions,
  PortForwardSession,
  ResourceListResult,
  RestartActionRequest,
  ScaleActionRequest,
  SessionInfo,
  WatchEvent,
  WatchResourcesOptions
} from '@k8s-ide/core';
import { descriptorPath, resourceRoute } from '@k8s-ide/core';

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string): Promise<SessionInfo>;
  getSession(): Promise<SessionInfo | null>;
  getDiscovery(): Promise<ApiResourceDescriptor[]>;
  listResources(options: ListResourcesOptions): Promise<ResourceListResult>;
  getResource(options: GetResourceOptions): Promise<KubeResource>;
  applyYaml(request: ApplyResourceRequest): Promise<ApplyResult>;
  deleteResource(options: DeleteResourceOptions): Promise<void>;
  scaleResource(request: ScaleActionRequest): Promise<ActionResult>;
  restartResource(request: RestartActionRequest): Promise<ActionResult>;
  watchResources(options: WatchResourcesOptions): AsyncGenerator<WatchEvent>;
  streamLogs(options: LogStreamOptions): AsyncGenerator<string>;
  execPod(options: ExecOptions): Promise<ExecSession>;
  portForward(options: PortForwardOptions): Promise<PortForwardSession>;
}

export interface HttpK8sApiClientOptions {
  baseUrl?: string;
  websocketBaseUrl?: string;
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string;
  private readonly websocketBaseUrl: string;

  constructor(options: HttpK8sApiClientOptions = {}) {
    this.baseUrl = trimTrailingSlash(options.baseUrl ?? '');
    this.websocketBaseUrl = trimTrailingSlash(
      options.websocketBaseUrl ?? toWebsocketBaseUrl(this.baseUrl || window.location.origin)
    );
  }

  async listContexts(): Promise<ClusterContext[]> {
    return this.getJson<ClusterContext[]>('/api/contexts');
  }

  async openSession(context: string): Promise<SessionInfo> {
    return this.postJson<SessionInfo>('/api/session/open', { context });
  }

  async getSession(): Promise<SessionInfo | null> {
    return this.getJson<SessionInfo | null>('/api/session');
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.getJson<ApiResourceDescriptor[]>('/api/discovery');
  }

  async listResources(options: ListResourcesOptions): Promise<ResourceListResult> {
    const path = descriptorPath(options);
    const search = new URLSearchParams();

    if (options.namespace) {
      search.set('namespace', options.namespace);
    }
    if (options.labelSelector) {
      search.set('labelSelector', options.labelSelector);
    }
    if (options.fieldSelector) {
      search.set('fieldSelector', options.fieldSelector);
    }
    if (options.limit) {
      search.set('limit', String(options.limit));
    }
    if (options.continue) {
      search.set('continue', options.continue);
    }

    const query = search.toString();
    return this.getJson<ResourceListResult>(query ? `${path}?${query}` : path);
  }

  async getResource(options: GetResourceOptions): Promise<KubeResource> {
    return this.getJson<KubeResource>(resourceRoute(options));
  }

  async applyYaml(request: ApplyResourceRequest): Promise<ApplyResult> {
    return this.postJson<ApplyResult>('/api/resources/apply', request);
  }

  async deleteResource(options: DeleteResourceOptions): Promise<void> {
    await this.fetch(resourceRoute(options), { method: 'DELETE' });
  }

  async scaleResource(request: ScaleActionRequest): Promise<ActionResult> {
    return this.postJson<ActionResult>('/api/actions/scale', request);
  }

  async restartResource(request: RestartActionRequest): Promise<ActionResult> {
    return this.postJson<ActionResult>('/api/actions/restart', request);
  }

  watchResources(options: WatchResourcesOptions): AsyncGenerator<WatchEvent> {
    const search = new URLSearchParams({
      group: options.group,
      version: options.version,
      resource: options.resource
    });

    if (options.namespace) {
      search.set('namespace', options.namespace);
    }
    if (options.labelSelector) {
      search.set('labelSelector', options.labelSelector);
    }
    if (options.fieldSelector) {
      search.set('fieldSelector', options.fieldSelector);
    }

    return this.streamWebSocketJson<WatchEvent>(`/ws/watch?${search.toString()}`);
  }

  streamLogs(options: LogStreamOptions): AsyncGenerator<string> {
    const search = new URLSearchParams();
    if (options.container) {
      search.set('container', options.container);
    }
    if (options.follow !== undefined) {
      search.set('follow', String(options.follow));
    }
    if (options.tailLines !== undefined) {
      search.set('tailLines', String(options.tailLines));
    }

    const suffix = search.toString();
    return this.streamWebSocketText(
      `/ws/logs/${encodeURIComponent(options.namespace)}/${encodeURIComponent(
        options.pod
      )}${suffix ? `?${suffix}` : ''}`
    );
  }

  async execPod(options: ExecOptions): Promise<ExecSession> {
    return this.postJson<ExecSession>('/api/actions/exec', options);
  }

  async portForward(options: PortForwardOptions): Promise<PortForwardSession> {
    return this.postJson<PortForwardSession>('/api/actions/port-forward', options);
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetch(path);
    return (await response.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    return (await response.json()) as T;
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, init);

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed with status ${response.status}`);
    }

    return response;
  }

  private async *streamWebSocketJson<T>(path: string): AsyncGenerator<T> {
    for await (const message of this.streamWebSocket(path)) {
      yield JSON.parse(message) as T;
    }
  }

  private async *streamWebSocketText(path: string): AsyncGenerator<string> {
    for await (const message of this.streamWebSocket(path)) {
      yield message;
    }
  }

  private async *streamWebSocket(path: string): AsyncGenerator<string> {
    const socket = new WebSocket(`${this.websocketBaseUrl}${path}`);
    const queue: string[] = [];
    let isClosed = false;
    let rejectWaiter: ((reason?: unknown) => void) | undefined;
    let resolveWaiter: (() => void) | undefined;

    socket.addEventListener('message', (event) => {
      queue.push(String(event.data));
      resolveWaiter?.();
    });
    socket.addEventListener('close', () => {
      isClosed = true;
      resolveWaiter?.();
    });
    socket.addEventListener('error', () => {
      rejectWaiter?.(new Error('WebSocket stream error'));
    });

    try {
      while (!isClosed || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift() as string;
          continue;
        }

        await new Promise<void>((resolve, reject) => {
          resolveWaiter = resolve;
          rejectWaiter = reject;
        });
      }
    } finally {
      socket.close();
    }
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function toWebsocketBaseUrl(value: string): string {
  if (value.startsWith('https://')) {
    return `wss://${value.slice('https://'.length)}`;
  }
  if (value.startsWith('http://')) {
    return `ws://${value.slice('http://'.length)}`;
  }
  if (value.startsWith('ws://') || value.startsWith('wss://')) {
    return value;
  }

  return value;
}
