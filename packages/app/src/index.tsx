import * as React from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpK8sApiClient, type K8sApiClient } from '@k8s-ide/api-client';
import {
  decodeApiGroup,
  descriptorKey,
  type ApiResourceDescriptor,
  type ClusterContext,
  type KubeResource,
  resourceRoute,
} from '@k8s-ide/core';
import {
  createQueryClient,
  queryKeys,
  useExplorerStore,
  usePreferencesStore,
  useSessionStore,
} from '@k8s-ide/store';
import {
  EmptyState,
  KeyValueList,
  ResourceTable,
  SectionCard,
  ShellLayout,
  StatusBadge,
  type TableColumn,
} from '@k8s-ide/ui';

export interface K8sIdeAppProps {
  backendUrl?: string;
  platform?: 'desktop' | 'web' | 'mobile';
}

const ApiClientContext = React.createContext<K8sApiClient | null>(null);
const PlatformContext = React.createContext<'desktop' | 'web' | 'mobile'>('web');

const rootRoute = createRootRoute({
  component: RootRouteComponent,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const resourceRouteNode = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/$group/$version/$resource',
  component: ResourcePage,
});

const routeTree = rootRoute.addChildren([dashboardRoute, resourceRouteNode]);
const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function K8sIdeApp({
  backendUrl = 'http://127.0.0.1:3010',
  platform = 'web',
}: K8sIdeAppProps) {
  const [queryClient] = React.useState(() => createQueryClient());

  React.useEffect(() => {
    useSessionStore.getState().setBackendUrl(backendUrl);
  }, [backendUrl]);

  return (
    <PlatformContext.Provider value={platform}>
      <QueryClientProvider client={queryClient}>
        <StatefulApiClientProvider>
          <RouterProvider router={router} />
        </StatefulApiClientProvider>
      </QueryClientProvider>
    </PlatformContext.Provider>
  );
}

function StatefulApiClientProvider({ children }: { children: React.ReactNode }) {
  const backendUrl = useSessionStore((state) => state.backendUrl);
  const client = React.useMemo(() => new HttpK8sApiClient(backendUrl), [backendUrl]);

  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

function RootRouteComponent() {
  return <Outlet />;
}

function DashboardPage() {
  const navigate = useNavigate();
  const state = useExplorerData();

  return (
    <ExplorerScreen
      title="Discovery Explorer"
      subtitle="Browse every discovered API resource through the shared backend contract."
      state={state}
      content={
        <SectionCard title="Discovery" description="Server-reported resources from client-go discovery.">
          <ResourceTable
            items={state.discoveryRows}
            columns={discoveryColumns}
            selectedId={state.selectedDiscoveryKey}
            onSelect={(item) => {
              state.setSelectedDiscoveryKey(item.id);
              state.setSelectedResourceKey(null);
              void navigate({
                to: resourceRoute({
                  group: decodeApiGroup(item.groupParam),
                  version: item.version,
                  resource: item.resource,
                }),
              });
            }}
            emptyState={
              <EmptyState
                title="No resources discovered"
                body="Connect to a cluster context and the API discovery tree will appear here."
              />
            }
          />
        </SectionCard>
      }
      detail={
        state.selectedDescriptor ? (
          <DescriptorDetail descriptor={state.selectedDescriptor} />
        ) : (
          <EmptyState
            title="Select a resource"
            body="Choose a discovered resource to inspect capabilities and begin browsing instances."
          />
        )
      }
    />
  );
}

function ResourcePage() {
  const params = useParams({ from: '/resources/$group/$version/$resource' });
  const state = useExplorerData();
  const group = decodeApiGroup(params.group);
  const descriptor = state.discovery.find(
    (item) => item.group === group && item.version === params.version && item.resource === params.resource,
  );
  const listQuery = useResourceList({
    backendUrl: state.backendUrl,
    context: state.selectedContext,
    descriptor,
    namespace: descriptor?.namespaced ? state.namespace : undefined,
  });

  const rows = React.useMemo(() => {
    const items = listQuery.data?.items ?? [];
    return items.map((item) => {
      const metadata = getMetadata(item);
      return {
        id: [metadata.namespace ?? '_', metadata.name ?? 'unknown'].join(':'),
        name: metadata.name ?? 'unknown',
        namespace: metadata.namespace ?? '-',
        createdAt: metadata.creationTimestamp ?? '-',
        resource: item,
      };
    });
  }, [listQuery.data?.items]);

  const selectedResource = React.useMemo(() => {
    if (!state.selectedResourceKey) {
      return null;
    }
    return rows.find((item) => item.id === state.selectedResourceKey) ?? null;
  }, [rows, state.selectedResourceKey]);

  return (
    <ExplorerScreen
      title={descriptor ? `${descriptor.kind} Instances` : 'Resource View'}
      subtitle={
        descriptor
          ? `Generic listing for ${descriptor.resource}.${descriptor.group || 'core'} with the shared dynamic backend.`
          : 'Select a discovered resource from the dashboard before browsing objects.'
      }
      state={state}
      content={
        descriptor ? (
          <SectionCard
            title="Resources"
            description="Backed by the dynamic client with context-aware query keys and namespace filters."
            action={
              <StatusBadge
                label={listQuery.isFetching ? 'Refreshing' : `${rows.length} loaded`}
                tone={listQuery.isFetching ? 'warning' : 'success'}
              />
            }
          >
            {listQuery.error ? (
              <EmptyState
                title="Unable to load resources"
                body={formatError(listQuery.error)}
              />
            ) : (
              <ResourceTable
                items={rows}
                columns={resourceColumns}
                        selectedId={state.selectedResourceKey}
                        onSelect={(item) => state.setSelectedResourceKey(item.id)}
                emptyState={
                  <EmptyState
                    title="No resources returned"
                    body="The backend returned an empty list for the current context and namespace filter."
                  />
                }
              />
            )}
          </SectionCard>
        ) : (
          <SectionCard title="Resources" description="Discovery metadata is still loading.">
            <EmptyState
              title="Discovery entry missing"
              body="Return to the dashboard, connect a context, and select a resource from the discovery list."
            />
          </SectionCard>
        )
      }
      detail={
        selectedResource ? (
          <ResourceDetail descriptor={descriptor} resource={selectedResource.resource} />
        ) : descriptor ? (
          <DescriptorDetail descriptor={descriptor} />
        ) : (
          <EmptyState
            title="No detail selected"
            body="Pick a discovered resource or returned instance to populate the detail pane."
          />
        )
      }
    />
  );
}

function ExplorerScreen({
  title,
  subtitle,
  state,
  content,
  detail,
}: {
  title: string;
  subtitle: string;
  state: ReturnType<typeof useExplorerData>;
  content: React.ReactNode;
  detail: React.ReactNode;
}) {
  const platform = React.useContext(PlatformContext);

  return (
    <ShellLayout
      header={
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{platform} shell</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">{subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={state.backendStatus}
                tone={state.backendStatus === 'ready' ? 'success' : state.backendStatus === 'error' ? 'danger' : 'warning'}
              />
              <StatusBadge label={state.refreshPolicy} />
            </div>
          </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),220px,220px,220px,140px]">
            <label className="grid gap-2 text-sm text-slate-300">
              Backend URL
              <input
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
                value={state.backendUrl}
                onChange={(event) => state.setBackendUrl(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Context
              <select
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
                value={state.selectedContext ?? ''}
                onChange={(event) => state.setSelectedContext(event.target.value || null)}
              >
                <option value="">Select a context</option>
                {state.contexts.map((context) => (
                  <option key={context.name} value={context.name}>
                    {context.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Namespace
              <input
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
                value={state.namespace}
                onChange={(event) => state.setNamespace(event.target.value)}
              />
            </label>
                    <label className="grid gap-2 text-sm text-slate-300">
                      Search
                      <input
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
                        value={state.search}
                        onChange={(event) => state.setSearch(event.target.value)}
                      />
                    </label>
            <button
              type="button"
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              disabled={!state.selectedContext || state.openSessionMutation.isPending}
              onClick={() => state.openSessionMutation.mutate()}
            >
              {state.openSessionMutation.isPending ? 'Connecting...' : 'Connect'}
            </button>
          </div>
          {state.lastError ? <p className="text-sm text-rose-300">{state.lastError}</p> : null}
        </>
      }
      sidebar={
        <>
          <SectionCard title="Contexts" description="Kubeconfig contexts discovered by the shared Go engine.">
            <div className="space-y-2">
              {state.contexts.length === 0 ? (
                <EmptyState
                  title="No contexts found"
                  body="Create ~/.kube/config or point the backend at another kubeconfig to continue."
                />
              ) : (
                state.contexts.map((context) => (
                  <button
                    key={context.name}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                      context.name === state.selectedContext
                        ? 'border-sky-500/50 bg-sky-500/10 text-sky-100'
                        : 'border-slate-800 bg-slate-950/50 text-slate-200 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                    onClick={() => state.setSelectedContext(context.name)}
                  >
                    <div>
                      <div className="font-medium">{context.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{context.cluster}</div>
                    </div>
                    {context.current ? <StatusBadge label="current" /> : null}
                  </button>
                ))
              )}
            </div>
          </SectionCard>
          <SectionCard title="Explorer State" description="Shared Zustand stores keep filters, layout, and platform preferences aligned.">
            <KeyValueList
              values={[
                { label: 'Search', value: state.search || 'No filter set' },
                { label: 'Namespace', value: state.namespace },
                { label: 'Layout', value: state.layoutMode },
                { label: 'Theme', value: state.theme },
              ]}
            />
          </SectionCard>
        </>
      }
      content={content}
      detail={detail}
    />
  );
}

function DescriptorDetail({ descriptor }: { descriptor: ApiResourceDescriptor }) {
  return (
    <SectionCard title="Descriptor" description="Discovery metadata and generated capability hints.">
      <div className="space-y-4">
        <KeyValueList
          values={[
            { label: 'Kind', value: descriptor.kind },
            { label: 'Group', value: descriptor.group || 'core' },
            { label: 'Version', value: descriptor.version },
            { label: 'Resource', value: descriptor.resource },
            { label: 'Scope', value: descriptor.scope },
            { label: 'Short names', value: descriptor.shortNames?.join(', ') || 'None' },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {Object.entries(descriptor.capabilities).map(([key, enabled]) => (
            <StatusBadge
              key={key}
              label={key}
              tone={enabled ? 'success' : 'neutral'}
            />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function ResourceDetail({
  descriptor,
  resource,
}: {
  descriptor?: ApiResourceDescriptor;
  resource: KubeResource;
}) {
  const metadata = getMetadata(resource);
  return (
    <SectionCard title="Resource Detail" description="Current selection rendered from the generic resource payload.">
      <div className="space-y-4">
        <KeyValueList
          values={[
            { label: 'Name', value: metadata.name ?? 'unknown' },
            { label: 'Namespace', value: metadata.namespace ?? 'cluster-scoped' },
            { label: 'Kind', value: resource.kind ?? descriptor?.kind ?? 'unknown' },
            { label: 'Created', value: metadata.creationTimestamp ?? 'unknown' },
          ]}
        />
        <pre className="max-h-[360px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
          {JSON.stringify(resource, null, 2)}
        </pre>
      </div>
    </SectionCard>
  );
}

function useExplorerData() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const backendUrl = useSessionStore((state) => state.backendUrl);
  const backendStatus = useSessionStore((state) => state.backendStatus);
  const selectedContext = useSessionStore((state) => state.selectedContext);
  const lastError = useSessionStore((state) => state.lastError);
  const setBackendUrl = useSessionStore((state) => state.setBackendUrl);
  const setBackendStatus = useSessionStore((state) => state.setBackendStatus);
  const setSelectedContext = useSessionStore((state) => state.setSelectedContext);
  const setLastError = useSessionStore((state) => state.setLastError);
  const namespace = useExplorerStore((state) => state.namespace);
  const search = useExplorerStore((state) => state.search);
  const layoutMode = useExplorerStore((state) => state.layoutMode);
  const selectedDiscoveryKey = useExplorerStore((state) => state.selectedDiscoveryKey);
  const selectedResourceKey = useExplorerStore((state) => state.selectedResourceKey);
  const setNamespace = useExplorerStore((state) => state.setNamespace);
  const setSearch = useExplorerStore((state) => state.setSearch);
  const setSelectedDiscoveryKey = useExplorerStore((state) => state.setSelectedDiscoveryKey);
  const setSelectedResourceKey = useExplorerStore((state) => state.setSelectedResourceKey);
  const refreshPolicy = usePreferencesStore((state) => state.refreshPolicy);
  const theme = usePreferencesStore((state) => state.theme);

  const contextsQuery = useQuery({
    queryKey: queryKeys.contexts(backendUrl),
    queryFn: () => client.listContexts(),
  });
  const discoveryQuery = useQuery({
    queryKey: queryKeys.discovery(backendUrl, selectedContext),
    queryFn: () => client.getDiscovery(),
    enabled: backendStatus === 'ready' && Boolean(selectedContext),
  });

  React.useEffect(() => {
    if (!selectedContext && contextsQuery.data?.length) {
      const current = contextsQuery.data.find((context) => context.current) ?? contextsQuery.data[0];
      setSelectedContext(current.name);
    }
  }, [contextsQuery.data, selectedContext, setSelectedContext]);

  React.useEffect(() => {
    if (contextsQuery.error) {
      setBackendStatus('error');
      setLastError(formatError(contextsQuery.error));
    }
  }, [contextsQuery.error, setBackendStatus, setLastError]);

  React.useEffect(() => {
    if (discoveryQuery.error) {
      setBackendStatus('error');
      setLastError(formatError(discoveryQuery.error));
    }
  }, [discoveryQuery.error, setBackendStatus, setLastError]);

  const openSessionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContext) {
        throw new Error('Select a context before opening a session.');
      }
      return client.openSession(selectedContext);
    },
    onMutate: () => {
      setBackendStatus('connecting');
      setLastError(null);
    },
    onSuccess: async () => {
      setBackendStatus('ready');
      await queryClient.invalidateQueries({
        queryKey: queryKeys.discovery(backendUrl, selectedContext),
      });
    },
    onError: (error) => {
      setBackendStatus('error');
      setLastError(formatError(error));
    },
  });

  const discovery = discoveryQuery.data ?? [];
  const discoveryRows = discovery
    .filter((item) => {
      if (!search) {
        return true;
      }
      const haystack = `${item.kind} ${item.resource} ${item.group} ${item.version}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    })
    .map((item) => ({
      id: descriptorKey(item),
      kind: item.kind,
      resource: item.resource,
      group: item.group || 'core',
      groupParam: item.group || '_',
      version: item.version,
      scope: item.scope,
      item,
    }));

  const selectedDescriptor = discovery.find((item) => descriptorKey(item) === selectedDiscoveryKey) ?? null;

  return {
    backendUrl,
    backendStatus,
    contexts: contextsQuery.data ?? ([] as ClusterContext[]),
    discovery,
    discoveryRows,
    selectedContext,
    selectedDescriptor,
    selectedDiscoveryKey,
    selectedResourceKey,
    lastError,
    namespace,
    search,
    layoutMode,
    refreshPolicy,
    theme,
    openSessionMutation,
    setBackendUrl,
    setSelectedContext,
    setSearch,
    setNamespace,
    setSelectedDiscoveryKey,
    setSelectedResourceKey,
  };
}

function useResourceList({
  backendUrl,
  context,
  descriptor,
  namespace,
}: {
  backendUrl: string;
  context: string | null;
  descriptor?: ApiResourceDescriptor | null;
  namespace?: string;
}) {
  const client = useApiClient();
  const backendStatus = useSessionStore((state) => state.backendStatus);

  return useQuery({
    queryKey: descriptor
      ? queryKeys.resourceList(
          backendUrl,
          context,
          descriptor.group,
          descriptor.version,
          descriptor.resource,
          namespace,
        )
      : ['resource-list', 'idle'],
    queryFn: () =>
      client.listResources({
        group: descriptor?.group ?? '',
        version: descriptor?.version ?? 'v1',
        resource: descriptor?.resource ?? 'pods',
        namespace,
      }),
    enabled: backendStatus === 'ready' && Boolean(context) && Boolean(descriptor),
  });
}

function useApiClient() {
  const client = React.useContext(ApiClientContext);
  if (!client) {
    throw new Error('K8sApiClient context is missing.');
  }
  return client;
}

const discoveryColumns: TableColumn<{
  id: string;
  kind: string;
  resource: string;
  group: string;
  groupParam: string;
  version: string;
  scope: string;
}>[] = [
  {
    id: 'kind',
    header: 'Kind',
    className: 'col-span-3',
    cell: (item) => <span className="font-medium">{item.kind}</span>,
  },
  {
    id: 'resource',
    header: 'Resource',
    className: 'col-span-4 text-slate-300',
    cell: (item) => item.resource,
  },
  {
    id: 'group',
    header: 'API Group',
    className: 'col-span-3 text-slate-300',
    cell: (item) => `${item.group} / ${item.version}`,
  },
  {
    id: 'scope',
    header: 'Scope',
    className: 'col-span-2 text-slate-300',
    cell: (item) => item.scope,
  },
];

const resourceColumns: TableColumn<{
  id: string;
  name: string;
  namespace: string;
  createdAt: string;
}>[] = [
  {
    id: 'name',
    header: 'Name',
    className: 'col-span-5',
    cell: (item) => <span className="font-medium">{item.name}</span>,
  },
  {
    id: 'namespace',
    header: 'Namespace',
    className: 'col-span-3 text-slate-300',
    cell: (item) => item.namespace,
  },
  {
    id: 'createdAt',
    header: 'Created',
    className: 'col-span-4 text-slate-300',
    cell: (item) => item.createdAt,
  },
];

function getMetadata(resource: KubeResource) {
  return resource.metadata ?? {};
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
