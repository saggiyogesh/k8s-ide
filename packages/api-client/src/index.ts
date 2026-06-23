import type {
  ApiResourceDescriptor,
  ClusterContext,
  KubeResource,
  KubeResourceListResult,
  ResourceRef,
  WatchEvent
} from '@k8s-ide/core';

export interface OpenSessionResponse {
  context: string;
  namespace?: string;
  connectedAt: string;
}

export interface ListResourcesOptions {
  context: string;
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
}

export type GetResourceOptions = ResourceRef;

export type DeleteResourceOptions = ResourceRef;

export interface ApplyYamlOptions {
  context: string;
  yaml: string;
}

export interface ApplyResult {
  applied: number;
  refs: ResourceRef[];
}

export interface ResourceActionRequest {
  context: string;
  action: 'scale' | 'restart' | 'delete' | 'port-forward' | 'logs' | 'exec';
  target: ResourceRef;
  payload?: Record<string, unknown>;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface WatchResourcesOptions {
  context: string;
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
}

export interface StreamLogsOptions {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
}

export interface ExecPodOptions {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
  command: string[];
}

export interface ExecSession {
  url: string;
  protocols: string[];
}

export interface PortForwardOptions {
  context: string;
  namespace: string;
  resource: string;
  name: string;
  ports: number[];
}

export interface PortForwardSession {
  id: string;
  ports: number[];
}

export interface K8sApiClient {
  listContexts(): Promise<ClusterContext[]>;
  openSession(context: string): Promise<OpenSessionResponse>;
  getDiscovery(context: string): Promise<ApiResourceDescriptor[]>;
  listResources(options: ListResourcesOptions): Promise<KubeResourceListResult>;
  getResource(options: GetResourceOptions): Promise<KubeResource>;
  applyYaml(options: ApplyYamlOptions): Promise<ApplyResult>;
  deleteResource(options: DeleteResourceOptions): Promise<void>;
  invokeAction(request: ResourceActionRequest): Promise<ActionResult>;
  watchResources(options: WatchResourcesOptions): AsyncGenerator<WatchEvent>;
  streamLogs(options: StreamLogsOptions): AsyncGenerator<string>;
  execPod(options: ExecPodOptions): Promise<ExecSession>;
  portForward(options: PortForwardOptions): Promise<PortForwardSession>;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value || 'core');
}

function toWsUrl(url: string): string {
  if (url.startsWith('https://')) {
    return `wss://${url.slice('https://'.length)}`;
  }

  if (url.startsWith('http://')) {
    return `ws://${url.slice('http://'.length)}`;
  }

  return url;
}

function buildPath(baseUrl: string, segments: string[]): string {
  return `${baseUrl.replace(/\/$/, '')}/${segments.map(encodeSegment).join('/')}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function* createSocketStream<T>(url: string, mapMessage: (data: string) => T): AsyncGenerator<T> {
  const queue: T[] = [];
  let closed = false;
  let wake: (() => void) | undefined;
  let socketError: Error | undefined;

  const socket = new WebSocket(url);

  socket.addEventListener('message', (event) => {
    queue.push(mapMessage(String(event.data)));
    wake?.();
  });

  socket.addEventListener('close', () => {
    closed = true;
    wake?.();
  });

  socket.addEventListener('error', () => {
    socketError = new Error(`WebSocket stream failed: ${url}`);
    closed = true;
    wake?.();
  });

  try {
    while (!closed || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = () => {
            wake = undefined;
            resolve();
          };
        });
        continue;
      }

      const next = queue.shift();
      if (next !== undefined) {
        yield next;
      }
    }

    if (socketError) {
      throw socketError;
    }
  } finally {
    socket.close();
  }
}

export class HttpK8sApiClient implements K8sApiClient {
  constructor(
    private readonly apiBaseUrl = '/api',
    private readonly wsBaseUrl = '/ws'
  ) {}

  async listContexts(): Promise<ClusterContext[]> {
    const response = await fetch(buildPath(this.apiBaseUrl, ['contexts']));
    return readJson<ClusterContext[]>(response);
  }

  async openSession(context: string): Promise<OpenSessionResponse> {
    const response = await fetch(buildPath(this.apiBaseUrl, ['session', 'open']), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ context })
    });

    return readJson<OpenSessionResponse>(response);
  }

  async getDiscovery(context: string): Promise<ApiResourceDescriptor[]> {
    const response = await fetch(`${buildPath(this.apiBaseUrl, ['discovery'])}?context=${encodeURIComponent(context)}`);
    return readJson<ApiResourceDescriptor[]>(response);
  }

  async listResources(options: ListResourcesOptions): Promise<KubeResourceListResult> {
    const path = options.namespace
      ? ['resources', options.group || 'core', options.version, options.resource, 'n', options.namespace]
      : ['resources', options.group || 'core', options.version, options.resource];
    const params = new URLSearchParams({ context: options.context });

    if (options.labelSelector) {
      params.set('labelSelector', options.labelSelector);
    }

    if (options.fieldSelector) {
      params.set('fieldSelector', options.fieldSelector);
    }

    const response = await fetch(`${buildPath(this.apiBaseUrl, path)}?${params.toString()}`);
    return readJson<KubeResourceListResult>(response);
  }

  async getResource(options: GetResourceOptions): Promise<KubeResource> {
    const path = options.namespace
      ? ['resources', options.group || 'core', options.version, options.resource, 'n', options.namespace, options.name]
      : ['resources', options.group || 'core', options.version, options.resource, options.name];
    const response = await fetch(`${buildPath(this.apiBaseUrl, path)}?context=${encodeURIComponent(options.context)}`);
    return readJson<KubeResource>(response);
  }

  async applyYaml(options: ApplyYamlOptions): Promise<ApplyResult> {
    const response = await fetch(buildPath(this.apiBaseUrl, ['resources', 'apply']), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(options)
    });

    return readJson<ApplyResult>(response);
  }

  async deleteResource(options: DeleteResourceOptions): Promise<void> {
    const path = options.namespace
      ? ['resources', options.group || 'core', options.version, options.resource, 'n', options.namespace, options.name]
      : ['resources', options.group || 'core', options.version, options.resource, options.name];
    const response = await fetch(`${buildPath(this.apiBaseUrl, path)}?context=${encodeURIComponent(options.context)}`, {
      method: 'DELETE'
    });

    await readJson<Record<string, never>>(response);
  }

  async invokeAction(request: ResourceActionRequest): Promise<ActionResult> {
    const response = await fetch(buildPath(this.apiBaseUrl, ['actions', request.action]), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    return readJson<ActionResult>(response);
  }

  watchResources(options: WatchResourcesOptions): AsyncGenerator<WatchEvent> {
    const params = new URLSearchParams({
      context: options.context,
      group: options.group,
      version: options.version,
      resource: options.resource
    });

    if (options.namespace) {
      params.set('namespace', options.namespace);
    }
    if (options.labelSelector) {
      params.set('labelSelector', options.labelSelector);
    }
    if (options.fieldSelector) {
      params.set('fieldSelector', options.fieldSelector);
    }

    const url = `${toWsUrl(this.wsBaseUrl.replace(/\/$/, ''))}/watch?${params.toString()}`;
    return createSocketStream(url, (data) => JSON.parse(data) as WatchEvent);
  }

  streamLogs(options: StreamLogsOptions): AsyncGenerator<string> {
    const segments = ['logs', options.namespace, options.pod, options.container || ''];
    const url = `${toWsUrl(this.wsBaseUrl.replace(/\/$/, ''))}/${segments.map(encodeSegment).join('/')}?context=${encodeURIComponent(
      options.context
    )}`;
    return createSocketStream(url, (data) => data);
  }

  async execPod(options: ExecPodOptions): Promise<ExecSession> {
    const url = `${toWsUrl(this.wsBaseUrl.replace(/\/$/, ''))}/${[
      'exec',
      options.namespace,
      options.pod,
      options.container || ''
    ]
      .map(encodeSegment)
      .join('/')}?context=${encodeURIComponent(options.context)}&command=${options.command
      .map(encodeURIComponent)
      .join(',')}`;

    return {
      url,
      protocols: ['v4.channel.k8s.io']
    };
  }

  async portForward(options: PortForwardOptions): Promise<PortForwardSession> {
    const response = await fetch(buildPath(this.apiBaseUrl, ['actions', 'port-forward']), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(options)
    });

    return readJson<PortForwardSession>(response);
  }
}
