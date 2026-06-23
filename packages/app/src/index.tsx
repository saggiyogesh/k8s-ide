import { useEffect, useMemo } from 'react';
import { QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { K8sApiClient } from '@k8s-ide/api-client';
import type { ApiResourceDescriptor, KubeResource } from '@k8s-ide/core';
import { descriptorKey, inferResourceCapabilities, refKey } from '@k8s-ide/core';
import {
  createK8sIdeQueryClient,
  queryKeys,
  useExplorerStore,
  usePreferencesStore,
  useSessionStore,
} from '@k8s-ide/store';
import {
  AppLayout,
  EmptyState,
  ResourceDetailsPanel,
  ResourceSidebar,
  ResourceTable,
  type TableColumn,
} from '@k8s-ide/ui';

export type SharedAppProps = {
  client: K8sApiClient;
  platform: 'desktop' | 'web' | 'mobile';
  title?: string;
};

export function SharedApp({ client, platform, title = 'Kubernetes IDE' }: SharedAppProps) {
  const queryClient = useMemo(() => createK8sIdeQueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <SharedAppShell client={client} platform={platform} title={title} />
    </QueryClientProvider>
  );
}

function SharedAppShell({ client, platform, title }: SharedAppProps) {
  const queryClient = useQueryClient();
  const {
    currentContext,
    currentNamespace,
    backendStatus,
    setBackendStatus,
    setCurrentContext,
    setCurrentNamespace,
  } = useSessionStore();
  const {
    resourceSearch,
    selected,
    selectedName,
    setResourceSearch,
    setSelected,
    setSelectedName,
  } = useExplorerStore();
  const { compactTables } = usePreferencesStore();

  const contextsQuery = useQuery({
    queryKey: queryKeys.contexts(),
    queryFn: () => client.listContexts(),
  });

  useEffect(() => {
    if (contextsQuery.isLoading) {
      setBackendStatus('loading');
      return;
    }
    if (contextsQuery.isError) {
      setBackendStatus('error');
      return;
    }
    if (contextsQuery.isSuccess) {
      setBackendStatus('ready');
    }
  }, [contextsQuery.isError, contextsQuery.isLoading, contextsQuery.isSuccess, setBackendStatus]);

  useEffect(() => {
    if (currentContext || !contextsQuery.data || contextsQuery.data.length === 0) {
      return;
    }

    const current = contextsQuery.data.find((context) => context.isCurrent) ?? contextsQuery.data[0];
    setCurrentContext(current.name);
    if (current.namespace) {
      setCurrentNamespace(current.namespace);
    }
  }, [contextsQuery.data, currentContext, setCurrentContext, setCurrentNamespace]);

  const discoveryQuery = useQuery({
    enabled: Boolean(currentContext),
    queryKey: queryKeys.discovery(currentContext ?? 'unselected'),
    queryFn: () => client.getDiscovery(currentContext as string),
  });

  useEffect(() => {
    if (!selected && discoveryQuery.data && discoveryQuery.data.length > 0) {
      const first = discoveryQuery.data[0];
      setSelected({
        group: first.group,
        version: first.version,
        resource: first.resource,
        kind: first.kind,
        scope: first.scope,
      });
    }
  }, [discoveryQuery.data, selected, setSelected]);

  const filteredResources = useMemo(() => {
    const search = resourceSearch.trim().toLowerCase();
    const resources = discoveryQuery.data ?? [];
    if (!search) {
      return resources;
    }
    return resources.filter((resource) => {
      return [resource.kind, resource.resource, resource.group, ...resource.shortNames]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [discoveryQuery.data, resourceSearch]);

  const selectedDescriptor = useMemo<ApiResourceDescriptor | undefined>(() => {
    if (!selected) {
      return undefined;
    }
    return (discoveryQuery.data ?? []).find(
      (descriptor) =>
        descriptor.group === selected.group &&
        descriptor.version === selected.version &&
        descriptor.resource === selected.resource,
    );
  }, [discoveryQuery.data, selected]);

  const resourcesQuery = useQuery({
    enabled: Boolean(currentContext && selectedDescriptor),
    queryKey: queryKeys.resources({
      context: currentContext ?? 'unselected',
      group: selectedDescriptor?.group ?? '',
      version: selectedDescriptor?.version ?? '',
      resource: selectedDescriptor?.resource ?? '',
      namespace: selectedDescriptor?.scope === 'Namespaced' ? currentNamespace : undefined,
    }),
    queryFn: () =>
      client.listResources({
        context: currentContext as string,
        group: selectedDescriptor?.group ?? '',
        version: selectedDescriptor?.version ?? '',
        resource: selectedDescriptor?.resource ?? '',
        namespace: selectedDescriptor?.scope === 'Namespaced' ? currentNamespace : undefined,
      }),
  });

  useEffect(() => {
    if (!resourcesQuery.data || resourcesQuery.data.items.length === 0) {
      return;
    }
    if (!selectedName) {
      setSelectedName(resourcesQuery.data.items[0]?.metadata.name);
    }
  }, [resourcesQuery.data, selectedName, setSelectedName]);

  const selectedResource = useMemo<KubeResource | undefined>(() => {
    const items = resourcesQuery.data?.items ?? [];
    return items.find((item) => item.metadata.name === selectedName) ?? items[0];
  }, [resourcesQuery.data, selectedName]);

  const applyMutation = useMutation({
    mutationFn: async (yaml: string) => {
      if (!currentContext) {
        throw new Error('Select a Kubernetes context before applying YAML');
      }
      return client.applyYaml({ context: currentContext, yaml });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.discovery(currentContext ?? 'unselected') }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.resources({
            context: currentContext ?? 'unselected',
            group: selectedDescriptor?.group ?? '',
            version: selectedDescriptor?.version ?? '',
            resource: selectedDescriptor?.resource ?? '',
            namespace: selectedDescriptor?.scope === 'Namespaced' ? currentNamespace : undefined,
          }),
        }),
      ]);
    },
  });

  const columns = useMemo<TableColumn<KubeResource>[]>(() => {
    const capabilitySummary = selectedDescriptor
      ? Object.entries(inferResourceCapabilities(selectedDescriptor))
          .filter(([, enabled]) => enabled)
          .map(([name]) => name.replace(/^can/, '').toLowerCase())
          .join(', ')
      : 'n/a';

    return [
      {
        key: 'name',
        header: 'Name',
        width: 'minmax(220px, 1.3fr)',
        render: (resource) => <strong>{resource.metadata.name}</strong>,
      },
      {
        key: 'namespace',
        header: 'Namespace',
        width: 'minmax(120px, 0.8fr)',
        render: (resource) => resource.metadata.namespace ?? 'cluster',
      },
      {
        key: 'age',
        header: 'Created',
        width: 'minmax(160px, 0.9fr)',
        render: (resource) => resource.metadata.creationTimestamp ?? 'n/a',
      },
      {
        key: 'capabilities',
        header: 'Capabilities',
        width: 'minmax(220px, 1.2fr)',
        render: () => capabilitySummary || 'n/a',
      },
    ];
  }, [selectedDescriptor]);

  const header = (
    <>
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Context</span>
        <select
          value={currentContext ?? ''}
          onChange={(event) => {
            setCurrentContext(event.target.value || undefined);
            setSelected(undefined);
            setSelectedName(undefined);
          }}
          style={{
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#020617',
            color: 'inherit',
            padding: '0.55rem 0.65rem',
            minWidth: 220,
          }}
        >
          <option value="">Select context</option>
          {(contextsQuery.data ?? []).map((context) => (
            <option key={context.name} value={context.name}>
              {context.name}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Namespace</span>
        <input
          value={currentNamespace ?? ''}
          onChange={(event) => setCurrentNamespace(event.target.value || undefined)}
          placeholder="default"
          style={{
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#020617',
            color: 'inherit',
            padding: '0.55rem 0.65rem',
            minWidth: 160,
          }}
        />
      </label>
      <div style={{ padding: '0.55rem 0.7rem', borderRadius: 8, background: '#0f172a', color: '#94a3b8' }}>
        Backend: {backendStatus}
      </div>
    </>
  );

  const selectedSidebarKey = selectedDescriptor ? descriptorKey(selectedDescriptor) : undefined;
  const selectedRowKey =
    currentContext && selectedDescriptor && selectedResource
      ? refKey({
          context: currentContext,
          group: selectedDescriptor.group,
          version: selectedDescriptor.version,
          resource: selectedDescriptor.resource,
          namespace: selectedResource.metadata.namespace,
          name: selectedResource.metadata.name,
        })
      : undefined;

  return (
    <AppLayout
      title={title}
      platform={platform}
      header={header}
      sidebar={
        <ResourceSidebar
          resources={filteredResources}
          selectedKey={selectedSidebarKey}
          search={resourceSearch}
          onSearchChange={setResourceSearch}
          onSelect={(descriptor) => {
            setSelected({
              group: descriptor.group,
              version: descriptor.version,
              resource: descriptor.resource,
              kind: descriptor.kind,
              scope: descriptor.scope,
            });
          }}
        />
      }
      details={
        <ResourceDetailsPanel
          descriptor={selectedDescriptor}
          resource={selectedResource}
          onApply={async (yaml) => {
            await applyMutation.mutateAsync(yaml);
          }}
          applyLabel={applyMutation.isPending ? 'Applying...' : 'Apply YAML'}
        />
      }
    >
      {!currentContext ? (
        <EmptyState
          title="Pick a context to begin"
          description="The shared frontend discovers cluster resources dynamically and drives the same CRUD surface for desktop, web, and mobile."
        />
      ) : !selectedDescriptor ? (
        <EmptyState
          title="Loading discovery"
          description="The Go backend is warming the discovery cache and mapping API resources into capability-aware frontend descriptors."
        />
      ) : resourcesQuery.isLoading ? (
        <EmptyState
          title={`Loading ${selectedDescriptor.kind}`}
          description="Resource lists are fetched through the shared HTTP client and prepared for watch-driven updates."
        />
      ) : resourcesQuery.data ? (
        <ResourceTable
          title={`${selectedDescriptor.kind} explorer`}
          rows={resourcesQuery.data.items}
          columns={columns}
          compact={compactTables}
          selectedRowKey={selectedRowKey}
          getRowKey={(resource) =>
            refKey({
              context: currentContext,
              group: selectedDescriptor.group,
              version: selectedDescriptor.version,
              resource: selectedDescriptor.resource,
              namespace: resource.metadata.namespace,
              name: resource.metadata.name,
            })
          }
          onSelectRow={(resource) => setSelectedName(resource.metadata.name)}
        />
      ) : (
        <EmptyState
          title="No resources returned"
          description="Switch resource types, change the namespace filter, or connect to a cluster with matching permissions."
        />
      )}
    </AppLayout>
  );
}
