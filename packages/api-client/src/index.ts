import type {
  ActionResult,
  ApiResourceDescriptor,
  ApplyResult,
  ClusterContext,
  DeleteResourceOptions,
  ExecOptions,
  ExecSession,
  GetResourceOptions,
  KubeResource,
  ListResourcesOptions,
  LogOptions,
  PortForwardOptions,
  PortForwardSession,
  ResourceActionRequest,
  ResourceListResult,
  SessionInfo,
  WatchEvent,
} from '@k8s-ide/core';
import { resourceRoute } from '@k8s-ide/core';

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string, namespace?: string): Promise<SessionInfo>;
  getDiscovery(): Promise<ApiResourceDescriptor[]>;
  listResources(opts: ListResourcesOptions): Promise<ResourceListResult>;
  getResource(opts: GetResourceOptions): Promise<KubeResource>;
  applyYaml(yaml: string): Promise<ApplyResult>;
  deleteResource(opts: DeleteResourceOptions): Promise<void>;
  invokeAction(request: ResourceActionRequest): Promise<ActionResult>;
  watchResources(opts: ListResourcesOptions): AsyncGenerator<WatchEvent>;
  streamLogs(opts: LogOptions): AsyncGenerator<string>;
  execPod(opts: ExecOptions): Promise<ExecSession>;
  portForward(opts: PortForwardOptions): Promise<PortForwardSession>;
}

type JsonInit = RequestInit & { json?: unknown };

const defaultHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//.test(value);

export class HttpK8sApiClient implements K8sApiClient {
  constructor(private readonly baseUrl = '/api') {}

  async listContexts(): Promise<ClusterContext[]> {
    return this.request('/contexts');
  }

  async openSession(context: string, namespace?: string): Promise<SessionInfo> {
    return this.request('/session/open', {
      method: 'POST',
      json: { context, namespace },
    });
  }

  async getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.request('/discovery');
  }

  async listResources(opts: ListResourcesOptions): Promise<ResourceListResult> {
    const params = new URLSearchParams();

    if (opts.namespace) {
      params.set('namespace', opts.namespace);
    }

    if (opts.search) {
      params.set('search', opts.search);
    }

    if (opts.labelSelector) {
      params.set('labelSelector', opts.labelSelector);
    }

    const resourcePath = this.getResourcePath(opts.group, opts.version, opts.resource);
    const query = params.toString();

    return this.request(`${resourcePath}${query ? `?${query}` : ''}`);
  }

  async getResource(opts: GetResourceOptions): Promise<KubeResource> {
    return this.request(resourceRoute(opts));
  }

  async applyYaml(yaml: string): Promise<ApplyResult> {
    return this.request('/resources/apply', {
      method: 'POST',
      json: { yaml },
    });
  }

  async deleteResource(opts: DeleteResourceOptions): Promise<void> {
    await this.request(resourceRoute(opts), { method: 'DELETE' });
  }

  async invokeAction(request: ResourceActionRequest): Promise<ActionResult> {
    return this.request(`/actions/${request.action}`, {
      method: 'POST',
      json: request,
    });
  }

  watchResources(opts: ListResourcesOptions): AsyncGenerator<WatchEvent> {
    const params = new URLSearchParams({
      group: opts.group,
      version: opts.version,
      resource: opts.resource,
    });

    if (opts.namespace) {
      params.set('namespace', opts.namespace);
    }

    if (opts.search) {
      params.set('search', opts.search);
    }

    return this.streamJson<WatchEvent>(`/ws/watch?${params.toString()}`);
  }

  streamLogs(opts: LogOptions): AsyncGenerator<string> {
    const params = new URLSearchParams();

    if (opts.container) {
      params.set('container', opts.container);
    }

    if (opts.tailLines) {
      params.set('tailLines', String(opts.tailLines));
    }

    const query = params.toString();

    return this.streamText(
      `/ws/logs/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}${
        query ? `?${query}` : ''
      }`,
    );
  }

  async execPod(opts: ExecOptions): Promise<ExecSession> {
    return this.request('/actions/exec-session', {
      method: 'POST',
      json: opts,
    });
  }

  async portForward(opts: PortForwardOptions): Promise<PortForwardSession> {
    return this.request('/actions/port-forward-session', {
      method: 'POST',
      json: opts,
    });
  }

  private async request<T>(path: string, init: JsonInit = {}): Promise<T> {
    const response = await fetch(this.resolveUrl(path), {
      ...init,
      headers: {
        ...defaultHeaders,
        ...init.headers,
      },
      body: init.json === undefined ? init.body : JSON.stringify(init.json),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async *streamJson<T>(path: string): AsyncGenerator<T> {
    for await (const message of this.openSocket(path)) {
      yield JSON.parse(message) as T;
    }
  }

  private async *streamText(path: string): AsyncGenerator<string> {
    for await (const message of this.openSocket(path)) {
      yield message;
    }
  }

  private async *openSocket(path: string): AsyncGenerator<string> {
    const url = this.resolveWsUrl(path);
    const socket = new WebSocket(url);
    const queue: string[] = [];
    let resolveNext: ((value: IteratorResult<string>) => void) | undefined;
    let completed = false;
    let failure: Error | undefined;

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return;
      }

      if (resolveNext) {
        resolveNext({ done: false, value: event.data });
        resolveNext = undefined;
        return;
      }

      queue.push(event.data);
    });

    socket.addEventListener('error', () => {
      failure = new Error(`WebSocket failed for ${url}`);
    });

    socket.addEventListener('close', () => {
      completed = true;

      if (resolveNext) {
        resolveNext({ done: true, value: undefined });
        resolveNext = undefined;
      }
    });

    try {
      while (!completed || queue.length > 0) {
        if (failure) {
          throw failure;
        }

        if (queue.length > 0) {
          yield queue.shift() as string;
          continue;
        }

        const next = await new Promise<IteratorResult<string>>((resolve) => {
          resolveNext = resolve;
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

  private getResourcePath(group: string, version: string, resource: string): string {
    return `/resources/${encodeURIComponent(group || 'core')}/${encodeURIComponent(
      version,
    )}/${encodeURIComponent(resource)}`;
  }

  private resolveUrl(path: string): string {
    if (isAbsoluteUrl(this.baseUrl)) {
      return new URL(path.replace(/^\//, ''), `${this.baseUrl}/`).toString();
    }

    return `${this.baseUrl}${path}`;
  }

  private resolveWsUrl(path: string): string {
    const baseOrigin = isAbsoluteUrl(this.baseUrl)
      ? new URL(this.baseUrl).origin
      : window.location.origin;
    const url = new URL(path, baseOrigin);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

    return url.toString();
  }
}
