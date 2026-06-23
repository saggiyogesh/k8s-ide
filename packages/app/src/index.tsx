import { HttpK8sApiClient } from '@k8s-ide/api-client';
import type { ApiResourceDescriptor, ClusterContext, KubeResource, KubeResourceSummary } from '@k8s-ide/core';
import { toResourceSummary } from '@k8s-ide/core';
import { createAppQueryClient, resourceKeys, useExplorerStore, useSessionStore } from '@k8s-ide/store';
import { ResourceExplorer } from '@k8s-ide/ui';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider
} from '@tanstack/react-router';
import { useEffect, useMemo, type ReactElement } from 'react';

const FALLBACK_CONTEXTS: ClusterContext[] = [
  {
    name: 'local-kind',
    cluster: 'kind-k8s-ide',
    user: 'kind-k8s-ide',
    namespace: 'default',
    current: true
  }
];

const FALLBACK_DISCOVERY: ApiResourceDescriptor[] = [
  {
    group: '',
    version: 'v1',
    resource: 'pods',
    singularResource: 'pod',
    kind: 'Pod',
    namespaced: true,
    verbs: ['get', 'list', 'watch', 'delete'],
    shortNames: ['po'],
    categories: ['all']
  },
  {
    group: 'apps',
    version: 'v1',
    resource: 'deployments',
    singularResource: 'deployment',
    kind: 'Deployment',
    namespaced: true,
    verbs: ['get', 'list', 'watch', 'delete', 'patch', 'update'],
    shortNames: ['deploy'],
    categories: ['all']
  },
  {
    group: '',
    version: 'v1',
    resource: 'services',
    singularResource: 'service',
    kind: 'Service',
    namespaced: true,
    verbs: ['get', 'list', 'watch', 'delete'],
    shortNames: ['svc'],
    categories: ['all']
  }
];

const FALLBACK_RESOURCES: Record<string, KubeResource[]> = {
  pods: [
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'api-server-0',
        namespace: 'default',
        creationTimestamp: new Date().toISOString()
      },
      status: {
        phase: 'Running'
      }
    },
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'controller-0',
        namespace: 'kube-system',
        creationTimestamp: new Date().toISOString()
      },
      status: {
        phase: 'Running'
      }
    }
  ],
  deployments: [
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'web-ui',
        namespace: 'default',
        creationTimestamp: new Date().toISOString()
      },
      status: {
        phase: 'Ready'
      }
    }
  ],
  services: [
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'kubernetes',
        namespace: 'default',
        creationTimestamp: new Date().toISOString()
      }
    }
  ]
};

function describeResource(resource?: KubeResource): string {
  if (!resource) {
    return '# Select a resource\n\nUse the explorer to inspect YAML, watch live state, and trigger safe actions.';
  }

  const namespace = resource.metadata?.namespace ? `namespace: ${resource.metadata.namespace}\n` : '';
  return `apiVersion: ${resource.apiVersion || 'v1'}
kind: ${resource.kind || 'Unknown'}
metadata:
  name: ${resource.metadata?.name || 'unknown'}
  ${namespace}`.trimEnd();
}

function AppShell(): ReactElement {
  return (
    <div>
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
          background: '#020617',
          display: 'flex',
          gap: 16
        }}
      >
        <Link to="/" style={{ color: '#e2e8f0', textDecoration: 'none', fontWeight: 700 }}>
          Explorer
        </Link>
        <Link to="/settings" style={{ color: '#94a3b8', textDecoration: 'none' }}>
          Settings
        </Link>
      </header>
      <Outlet />
    </div>
  );
}

function ExplorerPage({
  client
}: {
  client: HttpK8sApiClient;
}): ReactElement {
  const { activeContext, activeNamespace, backendStatus, setActiveContext, setActiveNamespace, setBackendStatus } = useSessionStore();
  const {
    selectedDescriptor,
    selectedResource,
    search,
    setSearch,
    setSelectedDescriptor,
    setSelectedResource
  } = useExplorerStore();

  const contextsQuery = useQuery({
    queryKey: ['contexts'],
    queryFn: () => client.listContexts(),
    retry: false
  });

  const contexts = contextsQuery.data && contextsQuery.data.length > 0 ? contextsQuery.data : FALLBACK_CONTEXTS;

  useEffect(() => {
    if (!activeContext && contexts[0]) {
      setActiveContext(contexts[0].name);
      setActiveNamespace(contexts[0].namespace);
    }
  }, [activeContext, contexts, setActiveContext, setActiveNamespace]);

  useEffect(() => {
    if (contextsQuery.isPending) {
      setBackendStatus('connecting');
      return;
    }

    if (contextsQuery.isError) {
      setBackendStatus('error', contextsQuery.error instanceof Error ? contextsQuery.error.message : 'Unable to reach backend');
      return;
    }

    setBackendStatus('ready');
  }, [contextsQuery.error, contextsQuery.isError, contextsQuery.isPending, setBackendStatus]);

  const resolvedContext = activeContext || contexts[0]?.name || FALLBACK_CONTEXTS[0]!.name;
  const resolvedNamespace = activeNamespace || contexts[0]?.namespace;

  const discoveryQuery = useQuery({
    enabled: Boolean(activeContext),
    queryKey: ['discovery', activeContext],
    queryFn: () => client.getDiscovery(resolvedContext),
    retry: false
  });

  const discovery = discoveryQuery.data && discoveryQuery.data.length > 0 ? discoveryQuery.data : FALLBACK_DISCOVERY;

  useEffect(() => {
    if (!selectedDescriptor && discovery[0]) {
      setSelectedDescriptor(discovery[0]);
    }
  }, [discovery, selectedDescriptor, setSelectedDescriptor]);

  const resourcesQuery = useQuery({
    enabled: Boolean(activeContext && selectedDescriptor),
    queryKey: resourceKeys.list({
      context: resolvedContext,
      group: selectedDescriptor?.group || '',
      version: selectedDescriptor?.version || 'v1',
      resource: selectedDescriptor?.resource || 'pods',
      namespace: selectedDescriptor?.namespaced ? resolvedNamespace : undefined
    }),
    queryFn: () =>
      client.listResources({
        context: resolvedContext,
        group: selectedDescriptor?.group || '',
        version: selectedDescriptor?.version || 'v1',
        resource: selectedDescriptor?.resource || 'pods',
        namespace: selectedDescriptor?.namespaced ? resolvedNamespace : undefined
      }),
    retry: false
  });

  const resources = useMemo<KubeResourceSummary[]>(() => {
    const selected = selectedDescriptor?.resource || 'pods';
    const items = resourcesQuery.data?.items || FALLBACK_RESOURCES[selected] || [];

    return items.map((resource) =>
      toResourceSummary(
        {
          context: resolvedContext,
          group: selectedDescriptor?.group || '',
          version: selectedDescriptor?.version || 'v1',
          resource: selected
        },
        resource
      )
    );
  }, [resolvedContext, resourcesQuery.data?.items, selectedDescriptor]);

  useEffect(() => {
    if (!selectedResource && resources[0]) {
      setSelectedResource(resources[0].ref);
    }
  }, [resources, selectedResource, setSelectedResource]);

  const selectedResourceObject = useMemo(() => {
    const currentName = selectedResource?.name;
    return (resourcesQuery.data?.items || FALLBACK_RESOURCES[selectedDescriptor?.resource || 'pods'] || []).find(
      (resource) => resource.metadata?.name === currentName
    );
  }, [resourcesQuery.data?.items, selectedDescriptor?.resource, selectedResource?.name]);

  return (
    <ResourceExplorer
      descriptors={discovery}
      resources={resources}
      selectedDescriptor={selectedDescriptor}
      selectedResource={selectedResource}
      yamlValue={describeResource(selectedResourceObject)}
      search={search}
      backendStatus={backendStatus}
      onSearchChange={setSearch}
      onSelectDescriptor={(descriptor) => {
        setSelectedDescriptor(descriptor);
        setSelectedResource(undefined);
      }}
      onSelectResource={setSelectedResource}
    />
  );
}

function SettingsPage({
  apiBaseUrl,
  wsBaseUrl
}: {
  apiBaseUrl: string;
  wsBaseUrl: string;
}): ReactElement {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #020617 0%, #0f172a 100%)',
        color: '#e2e8f0',
        padding: 24
      }}
    >
      <h1>Connection settings</h1>
      <p style={{ color: '#94a3b8', maxWidth: 720 }}>
        Desktop, web, and mobile all consume the same shared React shell and API client. The desktop wrapper will eventually
        manage a local sidecar process, while web and mobile can target a self-hosted backend.
      </p>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '160px minmax(0, 1fr)',
          gap: 12,
          maxWidth: 720
        }}
      >
        <dt>HTTP base</dt>
        <dd>{apiBaseUrl}</dd>
        <dt>WebSocket base</dt>
        <dd>{wsBaseUrl}</dd>
      </dl>
    </div>
  );
}

export function K8sIdeApp({
  platform,
  apiBaseUrl = '/api',
  wsBaseUrl = '/ws'
}: {
  platform: 'desktop' | 'web' | 'mobile';
  apiBaseUrl?: string;
  wsBaseUrl?: string;
}): ReactElement {
  const queryClient = useMemo(() => createAppQueryClient(), []);
  const client = useMemo(() => new HttpK8sApiClient(apiBaseUrl, wsBaseUrl), [apiBaseUrl, wsBaseUrl]);

  const rootRoute = createRootRoute({
    component: AppShell
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <ExplorerPage client={client} />
  });

  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => <SettingsPage apiBaseUrl={apiBaseUrl} wsBaseUrl={wsBaseUrl} />
  });

  const routeTree = rootRoute.addChildren([indexRoute, settingsRoute]);
  const router = createRouter({
    routeTree,
    context: {
      platform
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
