import { useEffect, useMemo, type ReactElement } from 'react';
import {
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import YAML from 'yaml';
import { type K8sApiClient } from '@k8s-ide/api-client';
import {
  deriveCapabilities,
  gvrKey,
  type JsonObject
} from '@k8s-ide/core';
import {
  createQueryClient,
  queryKeys,
  useExplorerStore,
  usePreferencesStore,
  useSessionStore
} from '@k8s-ide/store';
import {
  ActionBar,
  AppShell,
  ContextSwitcher,
  refFromResource,
  ResourceDetail,
  ResourceExplorer,
  ResourceTable,
  StatusBadge,
  YamlEditor
} from '@k8s-ide/ui';

export interface K8sIdeAppProps {
  client: K8sApiClient;
  platform: 'web' | 'desktop' | 'mobile';
}

export function K8sIdeApp(props: K8sIdeAppProps): ReactElement {
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <K8sIdeAppInner {...props} />
    </QueryClientProvider>
  );
}

function K8sIdeAppInner({ client, platform }: K8sIdeAppProps): ReactElement {
  const queryClient = useQueryClient();
  const selectedContext = useSessionStore((state) => state.selectedContext);
  const namespace = useSessionStore((state) => state.namespace);
  const backendStatus = useSessionStore((state) => state.backendStatus);
  const setContext = useSessionStore((state) => state.setContext);
  const setNamespace = useSessionStore((state) => state.setNamespace);
  const setBackendStatus = useSessionStore((state) => state.setBackendStatus);
  const rememberNamespace = usePreferencesStore((state) => state.rememberNamespace);

  const selectedDescriptorKey = useExplorerStore((state) => state.selectedDescriptorKey);
  const selectedResource = useExplorerStore((state) => state.selectedResource);
  const search = useExplorerStore((state) => state.search);
  const filters = useExplorerStore((state) => state.filters);
  const showYamlEditor = useExplorerStore((state) => state.showYamlEditor);
  const setSelectedDescriptorKey = useExplorerStore((state) => state.setSelectedDescriptorKey);
  const setSelectedResource = useExplorerStore((state) => state.setSelectedResource);
  const setSearch = useExplorerStore((state) => state.setSearch);
  const toggleYamlEditor = useExplorerStore((state) => state.toggleYamlEditor);

  const contextsQuery = useQuery({
    queryKey: queryKeys.contexts,
    queryFn: () => client.listContexts()
  });

  const sessionMutation = useMutation({
    mutationFn: (context: string) => client.openSession(context),
    onMutate: () => setBackendStatus('connecting'),
    onSuccess: () => {
      setBackendStatus('ready');
      void queryClient.invalidateQueries({ queryKey: queryKeys.discovery });
    },
    onError: () => setBackendStatus('error')
  });

  useEffect(() => {
    if (!selectedContext && contextsQuery.data?.length) {
      const fallback = contextsQuery.data.find((context) => context.isCurrent)?.name ?? contextsQuery.data[0]?.name;
      if (fallback) {
        setContext(fallback);
      }
    }
  }, [contextsQuery.data, selectedContext, setContext]);

  useEffect(() => {
    if (selectedContext) {
      void sessionMutation.mutateAsync(selectedContext);
    }
  }, [selectedContext, sessionMutation]);

  const discoveryQuery = useQuery({
    queryKey: queryKeys.discovery,
    queryFn: () => client.getDiscovery(),
    enabled: backendStatus === 'ready'
  });

  const selectedDescriptor = useMemo(
    () => discoveryQuery.data?.find((descriptor) => gvrKey(descriptor) === selectedDescriptorKey),
    [discoveryQuery.data, selectedDescriptorKey]
  );

  useEffect(() => {
    if (!selectedDescriptorKey && discoveryQuery.data?.length) {
      setSelectedDescriptorKey(gvrKey(discoveryQuery.data[0]));
    }
  }, [discoveryQuery.data, selectedDescriptorKey, setSelectedDescriptorKey]);

  const resourcesQuery = useQuery({
    queryKey:
      selectedDescriptor && selectedContext
        ? queryKeys.resources({
            group: selectedDescriptor.group,
            version: selectedDescriptor.version,
            resource: selectedDescriptor.resource,
            namespace,
            labelSelector: filters.labelSelector,
            fieldSelector: filters.fieldSelector
          })
        : ['resources', 'idle'],
    queryFn: () =>
      client.listResources({
        group: selectedDescriptor?.group ?? '',
        version: selectedDescriptor?.version ?? 'v1',
        resource: selectedDescriptor?.resource ?? 'pods',
        namespace,
        labelSelector: filters.labelSelector,
        fieldSelector: filters.fieldSelector,
        limit: 250
      }),
    enabled: Boolean(selectedDescriptor && selectedContext)
  });

  const detailQuery = useQuery({
    queryKey: selectedResource ? queryKeys.resource(selectedResource) : ['resource', 'idle'],
    queryFn: () =>
      selectedResource
        ? client.getResource(selectedResource)
        : Promise.resolve({} as JsonObject),
    enabled: Boolean(selectedResource)
  });

  const resourceYaml = useMemo(() => {
    if (!detailQuery.data) {
      return '';
    }

    return YAML.stringify(detailQuery.data);
  }, [detailQuery.data]);

  const invalidateCurrentList = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['resources'] });
    await queryClient.invalidateQueries({ queryKey: ['resource'] });
  };

  const applyMutation = useMutation<unknown, Error, string>({
    mutationFn: (yaml: string) => client.applyYaml(yaml),
    onSuccess: () => {
      toggleYamlEditor(false);
      void invalidateCurrentList();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => (selectedResource ? client.deleteResource(selectedResource) : Promise.resolve()),
    onSuccess: () => {
      setSelectedResource(undefined);
      void invalidateCurrentList();
    }
  });

  const actionMutation = useMutation({
    mutationFn: (action: { action: 'scale' | 'restart' | 'logs' | 'delete'; payload?: JsonObject }) => {
      if (!selectedResource) {
        throw new Error('No resource selected.');
      }

      return client.invokeAction({
        action: action.action,
        ref: selectedResource,
        payload: action.payload
      });
    },
    onSuccess: () => void invalidateCurrentList()
  });

  const capabilities = selectedDescriptor ? deriveCapabilities(selectedDescriptor) : undefined;
  const platformLabel =
    platform === 'desktop'
      ? 'Desktop shell'
      : platform === 'mobile'
        ? 'Mobile companion'
        : 'Web client';

  return (
    <AppShell
      header={
        <div className="row space-between wrap">
          <div>
            <h1>Kubernetes IDE</h1>
            <p>Shared single-user explorer powered by one Go engine and one React app.</p>
          </div>
          <StatusBadge>{platformLabel}</StatusBadge>
        </div>
      }
      sidebar={
        <div className="stack gap-lg">
          <ContextSwitcher
            contexts={contextsQuery.data ?? []}
            value={selectedContext}
            status={backendStatus}
            onChange={(context) => {
              setContext(context);
              setSelectedResource(undefined);
            }}
          />

          <label className="label">
            Namespace
            <input
              value={namespace ?? ''}
              onChange={(event) => {
                const nextNamespace = event.target.value || undefined;
                setNamespace(nextNamespace);
                if (selectedContext && nextNamespace) {
                  rememberNamespace(selectedContext, nextNamespace);
                }
              }}
              placeholder="default"
            />
          </label>

          <ResourceExplorer
            descriptors={discoveryQuery.data ?? []}
            selectedKey={selectedDescriptorKey}
            search={search}
            onSearch={setSearch}
            onSelect={(descriptor) => {
              setSelectedDescriptorKey(gvrKey(descriptor));
              setSelectedResource(undefined);
            }}
          />
        </div>
      }
      content={
        <div className="stack gap-md">
          <ActionBar
            capabilities={capabilities}
            onApplyYaml={() => toggleYamlEditor(true)}
            onDelete={() => void deleteMutation.mutateAsync()}
            onScale={() => {
              const value = window.prompt('Replica count', '2');
              if (!value) {
                return;
              }

              void actionMutation.mutateAsync({
                action: 'scale',
                payload: { replicas: Number(value) }
              });
            }}
            onRestart={() => void actionMutation.mutateAsync({ action: 'restart' })}
            onLogs={() => window.alert('Log streaming is available through the shared API client and websocket endpoints.')}
          />

          <ResourceTable
            rows={resourcesQuery.data?.items ?? []}
            onSelect={(resource) => {
              if (!selectedDescriptor) {
                return;
              }

              setSelectedResource(refFromResource(selectedDescriptor, resource));
            }}
          />
        </div>
      }
      detail={
        <div className="stack gap-lg">
          {showYamlEditor ? (
            <YamlEditor
              key={
                selectedResource
                  ? `${selectedResource.group}:${selectedResource.version}:${selectedResource.resource}:${selectedResource.namespace ?? '_'}:${selectedResource.name}`
                  : 'new-resource'
              }
              initialValue={resourceYaml}
              onApply={(value: string) => {
                void applyMutation.mutateAsync(value);
              }}
            />
          ) : (
            <ResourceDetail
              descriptor={selectedDescriptor}
              resource={detailQuery.data}
              onOpenYaml={() => toggleYamlEditor(true)}
            />
          )}
        </div>
      }
    />
  );
}
