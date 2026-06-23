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
  LogStreamOptions,
  PortForwardOptions,
  PortForwardSession,
  ResourceActionRequest,
  ResourceListResult,
  SessionInfo,
  WatchEvent,
  WatchResourcesOptions,
} from '@k8s-ide/core';

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string, kubeconfigPath?: string): Promise<SessionInfo>;
  getDiscovery(): Promise<ApiResourceDescriptor[]>;
  listResources(opts: ListResourcesOptions): Promise<ResourceListResult>;
  getResource(opts: GetResourceOptions): Promise<KubeResource>;
  applyYaml(yaml: string, context: string): Promise<ApplyResult>;
  deleteResource(opts: DeleteResourceOptions): Promise<void>;
  invokeAction(action: ResourceActionRequest): Promise<ActionResult>;
  watchResources(opts: WatchResourcesOptions): AsyncGenerator<WatchEvent>;
  streamLogs(opts: LogStreamOptions): AsyncGenerator<string>;
  execPod(opts: ExecOptions): Promise<ExecSession>;
  portForward(opts: PortForwardOptions): Promise<PortForwardSession>;
}

export type HttpK8sApiClientOptions = {
  baseUrl: string;
  fetchFn?: typeof fetch;
  websocketFactory?: (url: string) => WebSocket;
};

type Queue<T> = {
  push: (value: T) => void;
  fail: (error: unknown) => void;
  close: () => void;
  next: () => Promise<IteratorResult<T>>;
};

function createQueue<T>(): Queue<T> {
  const values: T[] = [];
  const waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  let done = false;

  const flush = () => {
    while (values.length > 0 && waiters.length > 0) {
      const waiter = waiters.shift();
      const value = values.shift();
      if (!waiter || value === undefined) {
        continue;
      }
      waiter.resolve({ done: false, value });
    }

    if (done) {
      while (waiters.length > 0) {
        waiters.shift()?.resolve({ done: true, value: undefined });
      }
    }
  };

  return {
    push(value) {
      values.push(value);
      flush();
    },
    fail(error) {
      while (waiters.length > 0) {
        waiters.shift()?.reject(error);
      }
      done = true;
    },
    close() {
      done = true;
      flush();
    },
    next() {
      if (values.length > 0) {
        const value = values.shift() as T;
        return Promise.resolve({ done: false, value });
      }

      if (done) {
        return Promise.resolve({ done: true, value: undefined });
      }

      return new Promise<IteratorResult<T>>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
  };
}

export class HttpK8sApiClient implements K8sApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly websocketFactory: (url: string) => WebSocket;

  constructor(options: HttpK8sApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
    this.websocketFactory = options.websocketFactory ?? ((url) => new WebSocket(url));
  }

  listContexts(): Promise<ClusterContext[]> {
    return this.request('/api/contexts');
  }

  openSession(context: string, kubeconfigPath?: string): Promise<SessionInfo> {
    return this.request('/api/session/open', {
      method: 'POST',
      body: JSON.stringify({ context, kubeconfigPath }),
    });
  }

  getDiscovery(): Promise<ApiResourceDescriptor[]> {
    return this.request('/api/discovery');
  }

  listResources(opts: ListResourcesOptions): Promise<ResourceListResult> {
    const path = this.resourcePath(opts);
    const url = new URL(this.toAbsoluteUrl(path));
    url.searchParams.set('context', opts.context);
    if (opts.namespace) {
      url.searchParams.set('namespace', opts.namespace);
    }
    if (opts.labelSelector) {
      url.searchParams.set('labelSelector', opts.labelSelector);
    }
    if (opts.fieldSelector) {
      url.searchParams.set('fieldSelector', opts.fieldSelector);
    }
    if (opts.limit) {
      url.searchParams.set('limit', String(opts.limit));
    }

    return this.request(url.toString(), { absolute: true });
  }

  getResource(opts: GetResourceOptions): Promise<KubeResource> {
    const path = `${this.resourcePath(opts)}/${encodeURIComponent(opts.name)}`;
    const url = new URL(this.toAbsoluteUrl(path));
    url.searchParams.set('context', opts.context);
    return this.request(url.toString(), { absolute: true });
  }

  applyYaml(yaml: string, context: string): Promise<ApplyResult> {
    return this.request('/api/resources/apply', {
      method: 'POST',
      body: JSON.stringify({ yaml, context }),
    });
  }

  async deleteResource(opts: DeleteResourceOptions): Promise<void> {
    const path = `${this.resourcePath(opts)}/${encodeURIComponent(opts.name)}?context=${encodeURIComponent(opts.context)}`;
    await this.request(path, { method: 'DELETE' });
  }

  invokeAction(action: ResourceActionRequest): Promise<ActionResult> {
    return this.request(`/api/actions/${action.action}`, {
      method: 'POST',
      body: JSON.stringify(action),
    });
  }

  async *watchResources(opts: WatchResourcesOptions): AsyncGenerator<WatchEvent> {
    const url = new URL(this.toWsUrl('/ws/watch'));
    url.searchParams.set('context', opts.context);
    url.searchParams.set('group', opts.group);
    url.searchParams.set('version', opts.version);
    url.searchParams.set('resource', opts.resource);
    if (opts.namespace) {
      url.searchParams.set('namespace', opts.namespace);
    }
    if (opts.labelSelector) {
      url.searchParams.set('labelSelector', opts.labelSelector);
    }
    if (opts.fieldSelector) {
      url.searchParams.set('fieldSelector', opts.fieldSelector);
    }

    yield* this.streamJson<WatchEvent>(url.toString());
  }

  async *streamLogs(opts: LogStreamOptions): AsyncGenerator<string> {
    const url = new URL(
      this.toWsUrl(
        `/ws/logs/${encodeURIComponent(opts.namespace)}/${encodeURIComponent(opts.pod)}/${encodeURIComponent(opts.container ?? '_')}`,
      ),
    );
    url.searchParams.set('context', opts.context);
    if (opts.tailLines) {
      url.searchParams.set('tailLines', String(opts.tailLines));
    }
    if (opts.follow !== undefined) {
      url.searchParams.set('follow', String(opts.follow));
    }

    yield* this.streamText(url.toString());
  }

  execPod(opts: ExecOptions): Promise<ExecSession> {
    return this.request('/api/actions/exec', {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  portForward(opts: PortForwardOptions): Promise<PortForwardSession> {
    return this.request('/api/actions/port-forward', {
      method: 'POST',
      body: JSON.stringify(opts),
    });
  }

  private resourcePath(
    opts: Pick<GetResourceOptions, 'group' | 'version' | 'resource' | 'namespace'>,
  ): string {
    const group = encodeURIComponent(opts.group || 'core');
    const version = encodeURIComponent(opts.version);
    const resource = encodeURIComponent(opts.resource);
    if (opts.namespace) {
      return `/api/resources/${group}/${version}/${resource}/n/${encodeURIComponent(opts.namespace)}`;
    }
    return `/api/resources/${group}/${version}/${resource}`;
  }

  private async request<T>(
    input: string,
    init?: RequestInit & { absolute?: boolean },
  ): Promise<T> {
    const response = await this.fetchFn(init?.absolute ? input : this.toAbsoluteUrl(input), {
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API request failed: ${response.status} ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async *streamJson<T>(url: string): AsyncGenerator<T> {
    for await (const payload of this.streamRaw(url)) {
      yield JSON.parse(payload) as T;
    }
  }

  private async *streamText(url: string): AsyncGenerator<string> {
    yield* this.streamRaw(url);
  }

  private async *streamRaw(url: string): AsyncGenerator<string> {
    const queue = createQueue<string>();
    const socket = this.websocketFactory(url);

    socket.onmessage = (event) => {
      queue.push(String(event.data));
    };
    socket.onerror = () => {
      queue.fail(new Error(`WebSocket stream failed for ${url}`));
    };
    socket.onclose = () => {
      queue.close();
    };

    try {
      while (true) {
        const next = await queue.next();
        if (next.done) {
          return;
        }
        yield next.value;
      }
    } finally {
      socket.close();
    }
  }

  private toAbsoluteUrl(path: string): string {
    if (/^https?:\/\//.test(path)) {
      return path;
    }
    return `${this.baseUrl}${path}`;
  }

  private toWsUrl(path: string): string {
    const httpUrl = new URL(this.toAbsoluteUrl(path));
    httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return httpUrl.toString();
  }
}
