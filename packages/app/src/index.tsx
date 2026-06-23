import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { HttpK8sApiClient } from '@k8s-ide/api-client';
import type {
  ActionResult,
  ApiResourceDescriptor,
  KubeResource,
  ResourceActionRequest,
  ResourceRef,
} from '@k8s-ide/core';
import { getResourceCapabilities } from '@k8s-ide/core';
import {
  createK8sQueryClient,
  queryKeys,
  useExplorerStore,
  usePreferencesStore,
  useSessionStore,
} from '@k8s-ide/store';
import {
  ActionBar,
  ResourceDetail,
  ResourceExplorerSidebar,
  ResourceTable,
  SectionCard,
} from '@k8s-ide/ui';

export interface K8sIdeAppProps {
  platform: 'web' | 'desktop' | 'mobile';
  defaultApiBaseUrl?: string;
}

export function K8sIdeApp({ platform, defaultApiBaseUrl }: K8sIdeAppProps) {
  const [queryClient] = useState(() => createK8sQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <K8sIdeShell platform={platform} defaultApiBaseUrl={defaultApiBaseUrl} />
    </QueryClientProvider>
  );
}

function K8sIdeShell({ platform, defaultApiBaseUrl }: K8sIdeAppProps) {
  const queryClient = useQueryClient();
  const {
    backendUrl,
    currentContext,
    availableContexts,
    namespace,
    backendHealthy,
    session,
    setBackendUrl,
    setBackendHealthy,
    setContexts,
    setCurrentContext,
    setNamespace,
    setSession,
  } = useSessionStore();
  const { activeResource, search, selectedResource, setActiveResource, setSearch, setSelectedResource } =
    useExplorerStore();
  const { compactMode, refreshPolicy, setCompactMode, setLastNamespace } = usePreferencesStore();
  const [lastAction, setLastAction] = useState<ActionResult | undefined>(undefined);

  useEffect(() => {
    if (defaultApiBaseUrl && backendUrl !== defaultApiBaseUrl) {
      setBackendUrl(defaultApiBaseUrl);
    }
  }, [backendUrl, defaultApiBaseUrl, setBackendUrl]);

  const api = useMemo(() => new HttpK8sApiClient(backendUrl), [backendUrl]);

  const contextsQuery = useQuery({
    queryKey: queryKeys.contexts,
    queryFn: () => api.listContexts(),
  });

  useEffect(() => {
    if (contextsQuery.data) {
      setContexts(contextsQuery.data);
      setBackendHealthy(true);
    } else if (contextsQuery.error) {
      setBackendHealthy(false);
    }
  }, [contextsQuery.data, contextsQuery.error, setBackendHealthy, setContexts]);

  useEffect(() => {
    const preferredContext =
      availableContexts.find((context) => context.name === currentContext?.name) ??
      availableContexts.find((context) => context.isCurrent) ??
      availableContexts[0];

    if (preferredContext && preferredContext.name !== currentContext?.name) {
      setCurrentContext(preferredContext);
    }
  }, [availableContexts, currentContext?.name, setCurrentContext]);

  const sessionMutation = useMutation({
    mutationFn: (contextName: string) => api.openSession(contextName, namespace),
    onSuccess: (nextSession) => {
      setSession(nextSession);
      setNamespace(nextSession.namespace);
      setLastNamespace(nextSession.namespace);
    },
  });

  useEffect(() => {
    if (!currentContext?.name) {
      return;
    }

    if (session?.context === currentContext.name) {
      return;
    }

    void sessionMutation.mutateAsync(currentContext.name);
  }, [currentContext?.name, session?.context, sessionMutation]);

  const discoveryQuery = useQuery({
    queryKey: queryKeys.discovery,
    queryFn: () => api.getDiscovery() as Promise<ApiResourceDescriptor[]>,
    enabled: backendHealthy,
  });

  useEffect(() => {
    if (!activeResource && discoveryQuery.data?.length) {
      const firstResource = discoveryQuery.data[0];
      setActiveResource({
        group: firstResource.group,
        version: firstResource.version,
        resource: firstResource.resource,
        namespace: firstResource.namespaced ? namespace : undefined,
      });
    }
  }, [activeResource, discoveryQuery.data, namespace, setActiveResource]);

  const resourcesQuery = useQuery({
    queryKey: activeResource
      ? queryKeys.resources({
          group: activeResource.group,
          version: activeResource.version,
          resource: activeResource.resource,
          namespace: activeResource.namespace || namespace,
          search,
        })
      : ['resources', 'idle'],
    queryFn: () =>
      api.listResources({
        group: activeResource?.group || '',
        version: activeResource?.version || 'v1',
        resource: activeResource?.resource || '',
        namespace: activeResource?.namespace ?? namespace,
        search,
      }),
    enabled: Boolean(activeResource),
    refetchInterval: refreshPolicy === 'poll' ? 10_000 : false,
  });

  const selectedDescriptor = discoveryQuery.data?.find(
    (resource) =>
      resource.group === activeResource?.group &&
      resource.version === activeResource?.version &&
      resource.resource === activeResource?.resource,
  );

  const selectedResourceQuery = useQuery({
    queryKey: selectedResource ? queryKeys.resource(selectedResource) : ['resource', 'idle'],
    queryFn: () => api.getResource(selectedResource as ResourceRef),
    enabled: Boolean(selectedResource),
  });

  const actionMutation = useMutation({
    mutationFn: (request: ResourceActionRequest) => api.invokeAction(request),
    onSuccess: async (result) => {
      setLastAction(result);

      if (activeResource) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.resources({
            group: activeResource.group,
            version: activeResource.version,
            resource: activeResource.resource,
            namespace: activeResource.namespace || namespace,
            search,
          }),
        });
      }
    },
  });

  const onAction = (action: ResourceActionRequest['action']) => {
    if (!selectedResource) {
      return;
    }

    const args = action === 'scale' ? { replicas: 2 } : undefined;
    void actionMutation.mutateAsync({ action, ref: selectedResource, args });
  };

  const onResourceSelect = (resource: KubeResource) => {
    setSelectedResource(resource.ref);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(59, 130, 246, 0.22), transparent 28%), #020617',
        color: '#e2e8f0',
        padding: 24,
      }}
    >
      <div style={{ display: 'grid', gap: 20 }}>
        <header
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, opacity: 0.75 }}>
              {platform} shell
            </div>
            <h1 style={{ margin: '6px 0 0', fontSize: 30 }}>Kubernetes IDE</h1>
            <p style={{ maxWidth: 780, opacity: 0.76 }}>
              Shared resource explorer mounted by the web app, Tauri shell, and future responsive
              companion layout.
            </p>
          </div>
          <SectionCard>
            <div style={{ display: 'grid', gap: 12, minWidth: 320 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Backend API base URL</span>
                <input
                  value={backendUrl}
                  onChange={(event) => setBackendUrl(event.target.value)}
                  style={inputStyle}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'grid', gap: 6, flex: 1, minWidth: 130 }}>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>Context</span>
                  <select
                    value={currentContext?.name || ''}
                    onChange={(event) =>
                      setCurrentContext(
                        availableContexts.find((context) => context.name === event.target.value),
                      )
                    }
                    style={inputStyle}
                  >
                    {availableContexts.map((context) => (
                      <option key={context.name} value={context.name}>
                        {context.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6, flex: 1, minWidth: 120 }}>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>Namespace</span>
                  <input
                    value={namespace}
                    onChange={(event) => setNamespace(event.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
            </div>
          </SectionCard>
        </header>

        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: compactMode ? '320px 1fr' : '320px minmax(380px, 1fr) minmax(360px, 1fr)',
          }}
        >
          <ResourceExplorerSidebar
            resources={discoveryQuery.data || []}
            activeResource={activeResource}
            onSelect={(resource) =>
              setActiveResource({
                group: resource.group,
                version: resource.version,
                resource: resource.resource,
                namespace: resource.namespaced ? namespace : undefined,
              })
            }
          />

          <div style={{ display: 'grid', gap: 16 }}>
            <SectionCard>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 6, minWidth: 260, flex: 1 }}>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>Filter resources</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="deployment, kube-system, app=api..."
                    style={inputStyle}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setCompactMode(!compactMode)}
                  style={secondaryButtonStyle}
                >
                  {compactMode ? 'Expand detail pane' : 'Compact layout'}
                </button>
              </div>
            </SectionCard>
            <ResourceTable
              items={resourcesQuery.data?.items || []}
              selectedResource={selectedResource}
              onSelect={onResourceSelect}
            />
          </div>

          {!compactMode ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <ActionBar
                capabilities={selectedDescriptor ? getResourceCapabilities(selectedDescriptor) : undefined}
                busy={actionMutation.isPending}
                lastAction={lastAction}
                onAction={onAction}
              />
              <ResourceDetail resource={selectedResourceQuery.data} />
            </div>
          ) : null}
        </div>

        <SectionCard>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.7 }}>Status</div>
            <div>
              Backend {backendHealthy ? 'reachable' : 'pending'} · Session{' '}
              {session ? `${session.context} (${session.namespace})` : 'not opened'} · Discovery{' '}
              {discoveryQuery.isLoading ? 'loading' : `${discoveryQuery.data?.length || 0} resources`}
            </div>
            {contextsQuery.error ? (
              <div style={{ color: '#fda4af' }}>{String(contextsQuery.error)}</div>
            ) : null}
            {resourcesQuery.error ? (
              <div style={{ color: '#fda4af' }}>{String(resourcesQuery.error)}</div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#e2e8f0',
  padding: '10px 12px',
};

const secondaryButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: '1px solid rgba(148, 163, 184, 0.24)',
  background: 'rgba(15, 23, 42, 0.55)',
  color: '#e2e8f0',
  padding: '10px 14px',
  cursor: 'pointer',
};
