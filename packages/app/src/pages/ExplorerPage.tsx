import type { ApiResourceDescriptor } from "@k8s-ide/core";
import { deriveCapabilities } from "@k8s-ide/core";
import {
  createResourceQueries,
  useApiClient,
  useExplorerStore,
  useSessionStore,
} from "@k8s-ide/store";
import {
  ActionBar,
  BackendStatusBadge,
  ContextSwitcher,
  ExplorerLayout,
  ResourceDetail,
  ResourceExplorer,
  ResourceTable,
  YamlEditor,
} from "@k8s-ide/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import YAML from "yaml";

export function ExplorerPage() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const context = useSessionStore((s) => s.context);
  const namespace = useSessionStore((s) => s.namespace);
  const backendStatus = useSessionStore((s) => s.backendStatus);
  const setContext = useSessionStore((s) => s.setContext);
  const setNamespace = useSessionStore((s) => s.setNamespace);
  const setBackendStatus = useSessionStore((s) => s.setBackendStatus);

  const selectedResource = useExplorerStore((s) => s.selectedResource);
  const setSelectedResource = useExplorerStore((s) => s.setSelectedResource);
  const searchQuery = useExplorerStore((s) => s.searchQuery);
  const setSearchQuery = useExplorerStore((s) => s.setSearchQuery);
  const activePane = useExplorerStore((s) => s.activePane);
  const setActivePane = useExplorerStore((s) => s.setActivePane);

  const [activeDescriptor, setActiveDescriptor] = useState<ApiResourceDescriptor | null>(null);
  const [yamlDraft, setYamlDraft] = useState("");

  const queries = useMemo(() => createResourceQueries(client, context), [client, context]);

  const healthQuery = useQuery(queries.health());
  const contextsQuery = useQuery(queries.listContexts());
  const discoveryQuery = useQuery(queries.discovery());

  useEffect(() => {
    if (healthQuery.isSuccess) {
      setBackendStatus("connected");
    } else if (healthQuery.isError) {
      setBackendStatus("error", "Backend unreachable");
    } else if (healthQuery.isLoading) {
      setBackendStatus("connecting");
    }
  }, [healthQuery.isSuccess, healthQuery.isError, healthQuery.isLoading, setBackendStatus]);

  const listQuery = useQuery({
    ...queries.listResources({
      group: activeDescriptor?.group ?? "",
      version: activeDescriptor?.version ?? "v1",
      resource: activeDescriptor?.resource ?? "pods",
      namespace: activeDescriptor?.namespaced ? namespace : undefined,
      fieldSelector: searchQuery ? undefined : undefined,
    }),
    enabled: !!context && !!activeDescriptor,
  });

  const detailQuery = useQuery({
    ...queries.getResource({
      group: selectedResource?.group ?? "",
      version: selectedResource?.version ?? "v1",
      resource: selectedResource?.resource ?? "pods",
      namespace: selectedResource?.namespace,
      name: selectedResource?.name ?? "",
    }),
    enabled: !!context && !!selectedResource,
  });

  useEffect(() => {
    if (detailQuery.data) {
      setYamlDraft(YAML.stringify(detailQuery.data));
    }
  }, [detailQuery.data]);

  const openSessionMutation = useMutation({
    mutationFn: (name: string) => client.openSession(name),
    onSuccess: (session) => {
      setContext(session.context);
      setNamespace(session.namespace);
      void queryClient.invalidateQueries();
    },
  });

  const applyMutation = useMutation({
    mutationFn: (yaml: string) => client.applyYaml(yaml),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!selectedResource) throw new Error("No resource selected");
      return client.deleteResource({
        group: selectedResource.group,
        version: selectedResource.version,
        resource: selectedResource.resource,
        namespace: selectedResource.namespace,
        name: selectedResource.name,
      });
    },
    onSuccess: () => {
      setSelectedResource(null);
      void queryClient.invalidateQueries();
    },
  });

  const filteredItems = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => item.metadata.name.toLowerCase().includes(q));
  }, [listQuery.data?.items, searchQuery]);

  const capabilities = activeDescriptor ? deriveCapabilities(activeDescriptor) : undefined;

  return (
    <ExplorerLayout
      title="Kubernetes IDE"
      subtitle="Browse any discovered API resource through the shared engine"
      status={<BackendStatusBadge status={backendStatus} />}
      toolbar={
        <ContextSwitcher
          contexts={contextsQuery.data ?? []}
          value={context}
          loading={contextsQuery.isLoading}
          onChange={(name) => openSessionMutation.mutate(name)}
        />
      }
      sidebar={
        <ResourceExplorer
          resources={discoveryQuery.data ?? []}
          activeResource={activeDescriptor}
          onSelect={(descriptor) => {
            setActiveDescriptor(descriptor);
            setSelectedResource(null);
            setActivePane("list");
          }}
        />
      }
      main={
        <>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <input
              className="k8s-input"
              placeholder="Filter by name"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              style={{ maxWidth: 280 }}
            />
            {activeDescriptor?.namespaced && (
              <input
                className="k8s-input"
                placeholder="Namespace"
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
                style={{ maxWidth: 180 }}
              />
            )}
            <span className="k8s-muted" style={{ marginLeft: "auto", fontSize: "0.85rem" }}>
              {activeDescriptor ? `${activeDescriptor.kind} (${activeDescriptor.resource})` : "Select a resource type"}
            </span>
          </div>

          <ResourceTable
            items={filteredItems}
            descriptor={activeDescriptor}
            selected={selectedResource}
            loading={listQuery.isLoading}
            onSelect={(resource) => {
              setSelectedResource(resource);
              setActivePane("detail");
            }}
          />
        </>
      }
      detail={
        selectedResource && detailQuery.data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: 0 }}>
            <ActionBar
              resource={detailQuery.data}
              capabilities={capabilities}
              onViewYaml={() => setActivePane("yaml")}
              onDelete={() => deleteMutation.mutate()}
              onScale={() => undefined}
              onRestart={() => undefined}
            />
            {activePane === "yaml" ? (
              <YamlEditor
                value={yamlDraft}
                onChange={setYamlDraft}
                applying={applyMutation.isPending}
                onApply={() => applyMutation.mutate(yamlDraft)}
              />
            ) : (
              <ResourceDetail resource={detailQuery.data} />
            )}
          </div>
        ) : undefined
      }
    />
  );
}
