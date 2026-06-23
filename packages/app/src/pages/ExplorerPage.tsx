import { useEffect, useMemo } from "react";
import {
  useSessionStore,
  useExplorerStore,
  filterDiscovery,
  useContextsQuery,
  useDiscoveryQuery,
  useResourcesQuery,
  useResourceQuery,
  useOpenSessionMutation,
  useDeleteResourceMutation,
  useApplyYamlMutation,
} from "@k8s-ide/store";
import {
  AppShell,
  ContextSwitcher,
  ResourceExplorer,
  ResourceTable,
  ResourceDetail,
} from "@k8s-ide/ui";
import { deriveCapabilities } from "@k8s-ide/core";
import { useApiClient } from "../provider.js";

function resourceToYaml(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2);
}

export function ExplorerPage() {
  const client = useApiClient();
  const backendStatus = useSessionStore((s) => s.backendStatus);
  const currentContext = useSessionStore((s) => s.currentContext);
  const currentNamespace = useSessionStore((s) => s.currentNamespace);
  const setCurrentNamespace = useSessionStore((s) => s.setCurrentNamespace);

  const selectedDescriptor = useExplorerStore((s) => s.selectedDescriptor);
  const setSelectedDescriptor = useExplorerStore((s) => s.setSelectedDescriptor);
  const selectedResource = useExplorerStore((s) => s.selectedResource);
  const setSelectedResource = useExplorerStore((s) => s.setSelectedResource);
  const searchQuery = useExplorerStore((s) => s.searchQuery);
  const setSearchQuery = useExplorerStore((s) => s.setSearchQuery);
  const resourceFilter = useExplorerStore((s) => s.resourceFilter);
  const setResourceFilter = useExplorerStore((s) => s.setResourceFilter);

  const contextsQuery = useContextsQuery(client);
  const discoveryQuery = useDiscoveryQuery(client);
  const openSession = useOpenSessionMutation(client);
  const deleteMutation = useDeleteResourceMutation(client);
  const applyMutation = useApplyYamlMutation(client);

  const listOpts = useMemo(() => {
    if (!selectedDescriptor) return null;
    return {
      group: selectedDescriptor.group,
      version: selectedDescriptor.version,
      resource: selectedDescriptor.resource,
      namespace: selectedDescriptor.namespaced ? currentNamespace : undefined,
      labelSelector: resourceFilter || undefined,
    };
  }, [selectedDescriptor, currentNamespace, resourceFilter]);

  const resourcesQuery = useResourcesQuery(client, listOpts ?? {
    group: "", version: "v1", resource: "pods", namespace: currentNamespace,
  });

  const resourceQuery = useResourceQuery(
    client,
    selectedResource
      ? {
          group: selectedResource.group,
          version: selectedResource.version,
          resource: selectedResource.resource,
          namespace: selectedResource.namespace,
          name: selectedResource.name,
        }
      : { group: "", version: "v1", resource: "pods", name: "" },
  );

  const filteredDiscovery = useMemo(
    () => filterDiscovery(discoveryQuery.data ?? [], searchQuery),
    [discoveryQuery.data, searchQuery],
  );

  useEffect(() => {
    if (!currentContext && contextsQuery.data?.length) {
      const current = contextsQuery.data.find((c) => c.isCurrent) ?? contextsQuery.data[0];
      openSession.mutate(current.name);
    }
  }, [contextsQuery.data, currentContext, openSession]);

  const capabilities = selectedDescriptor ? deriveCapabilities(selectedDescriptor) : undefined;

  return (
    <AppShell
      backendStatus={backendStatus}
      headerRight={
        <>
          <ContextSwitcher
            contexts={contextsQuery.data ?? []}
            current={currentContext}
            loading={contextsQuery.isLoading || openSession.isPending}
            onSelect={(ctx) => openSession.mutate(ctx)}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-wide text-zinc-400">Namespace</label>
            <input
              value={currentNamespace}
              onChange={(e) => setCurrentNamespace(e.target.value)}
              className="w-36 rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
        </>
      }
      sidebar={
        <ResourceExplorer
          resources={filteredDiscovery}
          selected={selectedDescriptor}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={setSelectedDescriptor}
        />
      }
      detail={
        <ResourceDetail
          resource={resourceQuery.data ?? null}
          yaml={resourceQuery.data ? resourceToYaml(resourceQuery.data as Record<string, unknown>) : ""}
          capabilities={capabilities}
          loading={resourceQuery.isLoading}
          onApplyYaml={(yaml) => applyMutation.mutate(yaml)}
          onDelete={() => {
            if (!selectedResource) return;
            if (!confirm(`Delete ${selectedResource.name}?`)) return;
            deleteMutation.mutate({
              group: selectedResource.group,
              version: selectedResource.version,
              resource: selectedResource.resource,
              namespace: selectedResource.namespace,
              name: selectedResource.name,
            });
            setSelectedResource(null);
          }}
        />
      }
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 p-3">
          <input
            type="search"
            placeholder="Filter by label selector..."
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="w-full max-w-md rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1">
          <ResourceTable
            items={resourcesQuery.data?.items ?? []}
            selectedName={selectedResource?.name ?? null}
            loading={resourcesQuery.isLoading && !!selectedDescriptor}
            onSelect={(item) => {
              if (!selectedDescriptor) return;
              setSelectedResource({
                group: selectedDescriptor.group,
                version: selectedDescriptor.version,
                resource: selectedDescriptor.resource,
                kind: selectedDescriptor.kind,
                namespace: item.metadata.namespace,
                name: item.metadata.name,
              });
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
