import { HttpK8sApiClient, type K8sApiClient } from '@k8s-ide/api-client';
import { deriveCapabilities, type KubeResource } from '@k8s-ide/core';
import { createQueryClient, queryKeys, useExplorerStore, useSessionStore } from '@k8s-ide/store';
import { LayoutShell, ResourceDetail, ResourceSidebar, ResourceTable } from '@k8s-ide/ui';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, { useEffect, useMemo } from 'react';

export interface K8sIdeAppProps {
  client?: K8sApiClient;
  platform: 'desktop' | 'web' | 'mobile';
}

const defaultQueryClient = createQueryClient();

export function K8sIdeApp(props: K8sIdeAppProps): React.ReactElement {
  const client = useMemo(() => props.client ?? new HttpK8sApiClient(), [props.client]);

  return (
    <QueryClientProvider client={defaultQueryClient}>
      <ExplorerScreen client={client} platform={props.platform} />
    </QueryClientProvider>
  );
}

function ExplorerScreen(props: {
  client: K8sApiClient;
  platform: K8sIdeAppProps['platform'];
}): React.ReactElement {
  const context = useSessionStore((state) => state.context);
  const namespace = useSessionStore((state) => state.namespace);
  const backendStatus = useSessionStore((state) => state.backendStatus);
  const setContext = useSessionStore((state) => state.setContext);
  const setBackendStatus = useSessionStore((state) => state.setBackendStatus);
  const resource = useExplorerStore((state) => state.resource);
  const search = useExplorerStore((state) => state.search);
  const selectedResourceName = useExplorerStore((state) => state.selectedResourceName);
  const setResource = useExplorerStore((state) => state.setResource);
  const setSearch = useExplorerStore((state) => state.setSearch);
  const setSelectedResourceName = useExplorerStore((state) => state.setSelectedResourceName);

  const contextsQuery = useQuery({
    queryKey: queryKeys.contexts,
    queryFn: () => props.client.listContexts()
  });

  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => props.client.getSession()
  });

  useEffect(() => {
    const current =
      sessionQuery.data?.context || contextsQuery.data?.find((item) => item.current)?.name || undefined;
    if (!context && current) {
      setContext(current);
    }
  }, [context, contextsQuery.data, sessionQuery.data, setContext]);

  useEffect(() => {
    if (!context) {
      return;
    }

    let isActive = true;
    setBackendStatus('connecting');
    void props.client
      .openSession(context)
      .then(() => {
        if (isActive) {
          setBackendStatus('ready');
        }
      })
      .catch(() => {
        if (isActive) {
          setBackendStatus('error');
        }
      });

    return () => {
      isActive = false;
    };
  }, [context, props.client, setBackendStatus]);

  const discoveryQuery = useQuery({
    queryKey: queryKeys.discovery,
    queryFn: () => props.client.getDiscovery(),
    enabled: Boolean(context)
  });

  useEffect(() => {
    if (!resource && discoveryQuery.data?.length) {
      setResource(discoveryQuery.data[0]);
    }
  }, [discoveryQuery.data, resource, setResource]);

  const filteredResources = useMemo(() => {
    const all = discoveryQuery.data || [];
    const filter = search.trim().toLowerCase();
    if (!filter) {
      return all;
    }

    return all.filter((item) =>
      [item.kind, item.resource, item.group, ...item.shortNames]
        .join(' ')
        .toLowerCase()
        .includes(filter)
    );
  }, [discoveryQuery.data, search]);

  const resourcesQuery = useQuery({
    queryKey:
      resource && context
        ? queryKeys.resources({
            context,
            group: resource.group,
            version: resource.version,
            resource: resource.resource,
            namespace: resource.namespaced ? namespace : undefined
          })
        : ['resources', 'idle'],
    queryFn: () =>
      props.client.listResources({
        group: resource?.group || '',
        version: resource?.version || '',
        resource: resource?.resource || '',
        namespace: resource?.namespaced ? namespace : undefined
      }),
    enabled: Boolean(resource && context)
  });

  const selectedItem = useMemo<KubeResource | undefined>(() => {
    return resourcesQuery.data?.items.find((item) => item.metadata?.name === selectedResourceName);
  }, [resourcesQuery.data?.items, selectedResourceName]);

  const capabilities = resource ? deriveCapabilities(resource) : undefined;

  return (
    <LayoutShell
      title="Kubernetes IDE"
      subtitle={`Platform: ${props.platform} · Backend: ${backendStatus}`}
      sidebar={
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <ContextSelector
            contexts={contextsQuery.data?.map((item) => item.name) || []}
            value={context}
            onChange={setContext}
          />
          <NamespaceField value={namespace} onChange={useSessionStore.getState().setNamespace} />
          <ResourceSidebar
            resources={filteredResources}
            active={resource}
            search={search}
            onSearchChange={setSearch}
            onSelect={(next) => {
              setResource(next);
              setSelectedResourceName(undefined);
            }}
          />
        </div>
      }
      content={
        <ResourceTable
          resource={resource}
          items={resourcesQuery.data?.items || []}
          selectedName={selectedResourceName}
          onSelect={(item) => setSelectedResourceName(item.metadata?.name)}
        />
      }
      detail={<ResourceDetail resource={resource} item={selectedItem} capabilities={capabilities} />}
    />
  );
}

function ContextSelector(props: {
  contexts: string[];
  value?: string;
  onChange: (value?: string) => void;
}): React.ReactElement {
  return (
    <label style={fieldStyles.wrapper}>
      <span style={fieldStyles.label}>Context</span>
      <select style={fieldStyles.input} value={props.value || ''} onChange={(event) => props.onChange(event.target.value)}>
        <option value="" disabled>
          Select a context
        </option>
        {props.contexts.map((context) => (
          <option key={context} value={context}>
            {context}
          </option>
        ))}
      </select>
    </label>
  );
}

function NamespaceField(props: { value?: string; onChange: (value?: string) => void }): React.ReactElement {
  return (
    <label style={fieldStyles.wrapper}>
      <span style={fieldStyles.label}>Namespace</span>
      <input
        style={fieldStyles.input}
        value={props.value || ''}
        placeholder="default"
        onChange={(event) => props.onChange(event.target.value || undefined)}
      />
    </label>
  );
}

const fieldStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'grid',
    gap: '0.35rem'
  },
  label: {
    fontSize: '0.85rem',
    color: '#94a3b8'
  },
  input: {
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: '0.75rem',
    padding: '0.75rem'
  }
};
