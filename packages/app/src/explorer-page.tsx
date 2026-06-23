import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { stringify } from 'yaml';
import {
  inferCapabilities,
  type ApiResourceDescriptor,
  type KubeResource,
  type ResourceRef,
} from '@k8s-ide/core';
import {
  contextsQuery,
  discoveryQuery,
  resourceListQuery,
  useExplorerStore,
  usePreferencesStore,
  useSessionStore,
} from '@k8s-ide/store';
import {
  ActionBar,
  ContextSwitcher,
  ExplorerLayout,
  ResourceDetail,
  ResourceTable,
  YamlEditor,
} from '@k8s-ide/ui';
import { useAppEnvironment } from './environment';

export function ExplorerPage() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const { apiClient, platform } = useAppEnvironment();
  const sessionStore = useSessionStore();
  const explorerStore = useExplorerStore();
  const preferences = usePreferencesStore();

  const [yamlDraft, setYamlDraft] = useState<{ resourceKey?: string; value: string }>({ value: '' });
  const [streamPreview, setStreamPreview] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const contexts = useQuery(contextsQuery(apiClient));
  const discovery = useQuery(discoveryQuery(apiClient, sessionStore.currentContext));

  useEffect(() => {
    if (!sessionStore.currentContext && contexts.data && contexts.data.length > 0) {
      const active = contexts.data.find((item) => item.isCurrent) ?? contexts.data[0];
      sessionStore.setContext(active?.name);
      sessionStore.setNamespace(active?.namespace ?? preferences.lastNamespace ?? 'default');
    }
  }, [contexts.data, preferences.lastNamespace, sessionStore]);

  const openSession = useMutation({
    mutationFn: async (context: string) => {
      sessionStore.setBackendStatus('connecting');
      return apiClient.openSession(context, sessionStore.kubeconfigPath);
    },
    onSuccess: (session) => {
      sessionStore.setSession(session);
      sessionStore.setBackendStatus('ready');
    },
    onError: (error) => {
      sessionStore.setBackendStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Failed to open session');
    },
  });

  useEffect(() => {
    if (sessionStore.currentContext && sessionStore.session?.context !== sessionStore.currentContext) {
      void openSession.mutateAsync(sessionStore.currentContext);
    }
  }, [openSession, sessionStore.currentContext, sessionStore.session?.context]);

  useEffect(() => {
    if (!discovery.data || discovery.data.length === 0) {
      return;
    }

    const matchedRouteDescriptor = params.group
      ? discovery.data.find(
          (descriptor) =>
            (descriptor.group || 'core') === params.group &&
            descriptor.version === params.version &&
            descriptor.resource === params.resource,
        )
      : undefined;

    if (matchedRouteDescriptor) {
      explorerStore.setSelectedDescriptor(matchedRouteDescriptor);
      return;
    }

    if (!explorerStore.selectedDescriptor) {
      explorerStore.setSelectedDescriptor(discovery.data[0]);
    }
  }, [
    discovery.data,
    explorerStore,
    params.group,
    params.resource,
    params.version,
  ]);

  const descriptorSearch = explorerStore.search.toLowerCase();
  const descriptors = useMemo(
    () =>
      (discovery.data ?? []).filter((descriptor) => {
        const target = `${descriptor.kind} ${descriptor.resource} ${descriptor.group}`.toLowerCase();
        return target.includes(descriptorSearch);
      }),
    [descriptorSearch, discovery.data],
  );

  const activeDescriptor = explorerStore.selectedDescriptor;
  const listOptions =
    activeDescriptor && sessionStore.currentContext
      ? {
          context: sessionStore.currentContext,
          group: activeDescriptor.group,
          version: activeDescriptor.version,
          resource: activeDescriptor.resource,
          namespace:
            activeDescriptor.namespaced
              ? explorerStore.namespaceFilter ?? sessionStore.currentNamespace
              : undefined,
        }
      : undefined;
  const listQuery = useQuery({
    ...(listOptions
      ? resourceListQuery(apiClient, listOptions)
      : {
          queryKey: ['resources', 'idle', '', '', '', '', '', ''] as const,
          queryFn: () => Promise.resolve({ items: [] }),
        }),
    enabled: Boolean(listOptions),
  });

  const resources = useMemo(() => listQuery.data?.items ?? [], [listQuery.data?.items]);

  useEffect(() => {
    if (explorerStore.selectedResource) {
      const selected = resources.find(
        (item) =>
          item.metadata?.name === explorerStore.selectedResource?.name &&
          item.metadata?.namespace === explorerStore.selectedResource?.namespace,
      );
      if (selected) {
        return;
      }
    }

    const firstItem = resources[0];
    if (!firstItem || !activeDescriptor || !sessionStore.currentContext) {
      return;
    }

    const nextRef: ResourceRef = {
      context: sessionStore.currentContext,
      group: activeDescriptor.group,
      version: activeDescriptor.version,
      resource: activeDescriptor.resource,
      namespace: firstItem.metadata?.namespace,
      name: firstItem.metadata?.name ?? 'unknown',
    };
    explorerStore.setSelectedResource(nextRef);
  }, [
    activeDescriptor,
    explorerStore,
    resources,
    sessionStore.currentContext,
  ]);

  const selectedResource = useMemo(
    () =>
      resources.find(
        (item) =>
          item.metadata?.name === explorerStore.selectedResource?.name &&
          item.metadata?.namespace === explorerStore.selectedResource?.namespace,
      ),
    [explorerStore.selectedResource, resources],
  );
  const selectedResourceKey = selectedResource
    ? makeResourceKey(selectedResource.metadata?.namespace, selectedResource.metadata?.name)
    : undefined;
  const yamlText = useMemo(() => {
    if (yamlDraft.resourceKey && yamlDraft.resourceKey === selectedResourceKey) {
      return yamlDraft.value;
    }

    return selectedResource ? stringify(selectedResource) : '';
  }, [selectedResource, selectedResourceKey, yamlDraft]);

  const capabilities = activeDescriptor ? inferCapabilities(activeDescriptor) : fallbackCapabilities;

  const applyYaml = useMutation({
    mutationFn: async () => {
      if (!sessionStore.currentContext) {
        throw new Error('No cluster context selected');
      }
      return apiClient.applyYaml(yamlText, sessionStore.currentContext);
    },
    onSuccess: () => {
      setStatusMessage('Applied YAML successfully');
      void listQuery.refetch();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : 'Apply failed');
    },
  });

  const deleteResource = useMutation({
    mutationFn: async () => {
      if (!activeDescriptor || !explorerStore.selectedResource) {
        throw new Error('No resource selected');
      }
      return apiClient.deleteResource({
        ...explorerStore.selectedResource,
      });
    },
    onSuccess: () => {
      setStatusMessage('Deleted resource');
      explorerStore.setSelectedResource(undefined);
      void listQuery.refetch();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : 'Delete failed');
    },
  });

  async function attachLogs() {
    if (!selectedResource || !sessionStore.currentContext || selectedResource.kind !== 'Pod') {
      setStreamPreview(['Log streaming is currently wired for Pod resources.']);
      return;
    }

    const namespace = selectedResource.metadata?.namespace;
    const name = selectedResource.metadata?.name;
    if (!namespace || !name) {
      return;
    }

    const output: string[] = [];
    try {
      for await (const line of apiClient.streamLogs({
        context: sessionStore.currentContext,
        namespace,
        pod: name,
        follow: false,
        tailLines: 20,
      })) {
        output.push(line);
        if (output.length >= 20) {
          break;
        }
      }
      setStreamPreview(output);
    } catch (error) {
      setStreamPreview([error instanceof Error ? error.message : 'Unable to stream logs']);
    }
  }

  function handleDescriptorSelect(descriptor: ApiResourceDescriptor) {
    explorerStore.setSelectedDescriptor(descriptor);
    explorerStore.setSelectedResource(undefined);
    setStreamPreview([]);
    void navigate({
      to: '/resources/$group/$version/$resource',
      params: {
        group: descriptor.group || 'core',
        version: descriptor.version,
        resource: descriptor.resource,
      },
    });
  }

  function handleResourceSelect(item: KubeResource) {
    if (!activeDescriptor || !sessionStore.currentContext) {
      return;
    }

    explorerStore.setSelectedResource({
      context: sessionStore.currentContext,
      group: activeDescriptor.group,
      version: activeDescriptor.version,
      resource: activeDescriptor.resource,
      namespace: item.metadata?.namespace,
      name: item.metadata?.name ?? 'unknown',
    });
  }

  return (
    <ExplorerLayout
      isMobile={platform === 'mobile'}
      header={
        <>
          <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>Kubernetes IDE</h1>
            <span style={{ color: '#9ca3af' }}>
              Shared explorer shell for desktop, web, and responsive companion views.
            </span>
          </div>
          <ContextSwitcher
            contexts={contexts.data ?? []}
            value={sessionStore.currentContext}
            namespace={sessionStore.currentNamespace}
            onContextChange={(context) => sessionStore.setContext(context)}
            onNamespaceChange={(namespace) => {
              sessionStore.setNamespace(namespace);
              explorerStore.setNamespaceFilter(namespace);
              preferences.setLastNamespace(namespace);
            }}
          />
          {statusMessage ? <StatusBanner message={statusMessage} /> : null}
        </>
      }
      sidebar={
        <div style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={{ color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
              Search resources
            </span>
            <input
              value={explorerStore.search}
              onChange={(event) => explorerStore.setSearch(event.target.value)}
              placeholder="deployments, pods, services..."
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'grid', gap: 8 }}>
            {descriptors.map((descriptor) => {
              const active =
                descriptor.group === activeDescriptor?.group &&
                descriptor.version === activeDescriptor?.version &&
                descriptor.resource === activeDescriptor?.resource;

              return (
                <button
                  key={`${descriptor.group}/${descriptor.version}/${descriptor.resource}`}
                  type="button"
                  onClick={() => handleDescriptorSelect(descriptor)}
                  style={{
                    background: active ? '#1d4ed8' : '#111827',
                    border: '1px solid #1f2937',
                    borderRadius: 12,
                    color: '#f9fafb',
                    padding: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ display: 'block' }}>{descriptor.kind}</strong>
                  <span style={{ color: '#cbd5e1', fontSize: 13 }}>{descriptor.resource}</span>
                </button>
              );
            })}
          </div>
        </div>
      }
      detail={
        <div style={{ display: 'grid', gap: 16 }}>
          <ActionBar
            capabilities={capabilities}
            onApply={capabilities.supportsYamlEditor ? () => void applyYaml.mutateAsync() : undefined}
            onDelete={capabilities.canDelete ? () => void deleteResource.mutateAsync() : undefined}
            onLogs={capabilities.supportsLogs ? () => void attachLogs() : undefined}
          />
          <ResourceDetail
            resource={selectedResource}
            logs={streamPreview}
            yamlEditor={
              <YamlEditor
                value={yamlText}
                onChange={(value) =>
                  setYamlDraft({
                    resourceKey: selectedResourceKey,
                    value,
                  })
                }
                onApply={capabilities.supportsYamlEditor ? () => void applyYaml.mutateAsync() : undefined}
                disabled={applyYaml.isPending}
              />
            }
          />
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 16, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              {activeDescriptor ? `${activeDescriptor.kind} explorer` : 'Discovery browser'}
            </h2>
            <span style={{ color: '#9ca3af' }}>
              {listQuery.isFetching ? 'Refreshing...' : `${resources.length} item(s) loaded`}
            </span>
          </div>
          <button
            onClick={() => void listQuery.refetch()}
            type="button"
            style={{
              background: '#111827',
              border: '1px solid #1f2937',
              borderRadius: 10,
              color: '#fff',
              padding: '8px 12px',
            }}
          >
            Refresh
          </button>
        </div>

        <ResourceTable
          items={resources}
          selectedName={explorerStore.selectedResource?.name}
          onSelect={handleResourceSelect}
        />
      </div>
    </ExplorerLayout>
  );
}

function makeResourceKey(namespace?: string, name?: string): string | undefined {
  if (!name) {
    return undefined;
  }

  return `${namespace ?? '_cluster'}:${name}`;
}

function StatusBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #1f2937',
        borderRadius: 12,
        color: '#cbd5e1',
        padding: 12,
      }}
    >
      {message}
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: '#111827',
  color: '#f9fafb',
  border: '1px solid #374151',
  borderRadius: 10,
  padding: '10px 12px',
};

const fallbackCapabilities = {
  canRead: false,
  canList: false,
  canWatch: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
  supportsYamlEditor: false,
  supportsLogs: false,
  supportsExec: false,
  supportsPortForward: false,
  supportsScale: false,
  supportsRestart: false,
};
