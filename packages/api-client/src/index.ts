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
} from '@k8s-ide/core';
import { encodeApiGroup } from '@k8s-ide/core';

export interface K8sApiClient {
  listContexts(kubeconfigPath?: string): Promise<ClusterContext[]>;
  openSession(context: string, kubeconfigPath?: string): Promise<SessionInfo>;
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

export class HttpK8sApiClient implements K8sApiClient {
  constructor(private readonly baseUrl = 'http://127.0.0.1:3010') {}

  async listContexts(kubeconfigPath?: string) {
    const search = new URLSearchParams();
    if (kubeconfigPath) {
      search.set('kubeconfigPath', kubeconfigPath);
    }
    const suffix = search.toString();
    return this.request<ClusterContext[]>(suffix ? `/api/contexts?${suffix}` : '/api/contexts');
  }

  async openSession(context: string, kubeconfigPath?: string) {
    return this.request<SessionInfo>('/api/session/open', {
      method: 'POST',
      body: JSON.stringify({ context, kubeconfigPath }),
    });
  }

  async getDiscovery() {
    return this.request<ApiResourceDescriptor[]>('/api/discovery');
  }

  async listResources(opts: ListOpts) {
    const path = this.buildResourcePath(opts.group, opts.version, opts.resource, opts.namespace);
    const search = new URLSearchParams();
    if (opts.labelSelector) {
      search.set('labelSelector', opts.labelSelector);
    }
    if (opts.fieldSelector) {
      search.set('fieldSelector', opts.fieldSelector);
    }
    if (opts.limit) {
      search.set('limit', String(opts.limit));
    }
    if (opts.continue) {
      search.set('continue', opts.continue);
    }
    const suffix = search.toString();
    return this.request<ResourceListResult>(suffix ? `${path}?${suffix}` : path);
  }

  async getResource(opts: GetOpts) {
    const prefix = this.buildResourcePath(opts.group, opts.version, opts.resource, opts.namespace);
    return this.request<KubeResource>(`${prefix}/${encodeURIComponent(opts.name)}`);
  }

  async applyYaml(yaml: string) {
    return this.request<ApplyResult>('/api/resources/apply', {
      method: 'POST',
      body: JSON.stringify({ yaml }),
    });
  }

  async deleteResource(opts: DeleteOpts) {
    const prefix = this.buildResourcePath(opts.group, opts.version, opts.resource, opts.namespace);
    await this.request(`${prefix}/${encodeURIComponent(opts.name)}`, {
      method: 'DELETE',
    });
  }

  async invokeAction(action: ResourceActionRequest) {
    return this.request<ActionResult>(`/api/actions/${encodeURIComponent(action.action)}`, {
      method: 'POST',
      body: JSON.stringify(action),
    });
  }

  async *watchResources(opts: WatchOpts) {
    const search = new URLSearchParams({
      group: encodeApiGroup(opts.group),
      version: opts.version,
      resource: opts.resource,
    });
    if (opts.namespace) {
      search.set('namespace', opts.namespace);
    }
    for (const [key, value] of Object.entries(opts.selectors ?? {}) as Array<[string, string | undefined]>) {
      if (value) {
        search.set(key, value);
      }
    }
    yield* this.streamJson<WatchEvent>(`/ws/watch?${search.toString()}`);
  }

  async *streamLogs(opts: LogOpts) {
    const search = new URLSearchParams();
    if (opts.follow !== undefined) {
      search.set('follow', String(opts.follow));
    }
    if (opts.tailLines !== undefined) {
      search.set('tailLines', String(opts.tailLines));
    }
    const containerPath = `/${encodeURIComponent(opts.container ?? '_')}`;
    const suffix = search.toString();
    yield* this.streamText(
      `/ws/logs/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}${containerPath}${suffix ? `?${suffix}` : ''}`,
    );
  }

  async execPod(opts: ExecOpts) {
    const search = new URLSearchParams();
    for (const part of opts.command) {
      search.append('command', part);
    }
    if (opts.container) {
      search.set('container', opts.container);
    }
    const suffix = search.toString();
    return {
      url: this.toWebSocketUrl(
        `/ws/exec/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}/${encodeURIComponent(opts.container ?? '_')}${suffix ? `?${suffix}` : ''}`,
      ),
      protocols: ['base64.channel.k8s.io'],
    };
  }

  async portForward(opts: PortForwardOpts) {
    return this.request<PortForwardSession>('/api/actions/port-forward', {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  private async request<T = void>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.toHttpUrl(path), {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        // ignore non-json responses
      }
      throw new Error(message || `Request failed with status ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private buildResourcePath(group: string, version: string, resource: string, namespace?: string) {
    const prefix = `/api/resources/${encodeApiGroup(group)}/${encodeURIComponent(version)}/${encodeURIComponent(resource)}`;
    if (namespace) {
      return `${prefix}/n/${encodeURIComponent(namespace)}`;
    }
    return prefix;
  }

  private toHttpUrl(path: string) {
    return new URL(path, this.withTrailingSlash(this.baseUrl)).toString();
  }

  private toWebSocketUrl(path: string) {
    const url = new URL(path, this.withTrailingSlash(this.baseUrl));
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  }

  private withTrailingSlash(url: string) {
    return url.endsWith('/') ? url : `${url}/`;
  }

  private async *streamJson<T>(path: string) {
    for await (const message of this.streamSocket(path)) {
      yield JSON.parse(message) as T;
    }
  }

  private async *streamText(path: string) {
    for await (const message of this.streamSocket(path)) {
      yield message;
    }
  }

  private async *streamSocket(path: string) {
    const socket = new WebSocket(this.toWebSocketUrl(path));
    const queue: string[] = [];
    let closed = false;
    let error: Error | null = null;

    socket.addEventListener('message', (event) => {
      queue.push(typeof event.data === 'string' ? event.data : String(event.data));
    });
    socket.addEventListener('close', () => {
      closed = true;
    });
    socket.addEventListener('error', () => {
      error = new Error(`WebSocket request failed for ${path}`);
      closed = true;
    });

    while (!closed || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift() as string;
        continue;
      }

      if (error) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    if (error) {
      throw error;
    }
  }
}
