import { useEffect, useMemo, useState } from "react";
import {
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { stringify } from "yaml";

import type { K8sApiClient } from "@k8s-ide/api-client";
import { getResourceCapabilities, refKey, type ApiResourceDescriptor, type KubeResource } from "@k8s-ide/core";
import {
  createAppQueryClient,
  queryKeys,
  useExplorerStore,
  usePreferencesStore,
  useSessionStore
} from "@k8s-ide/store";
import {
  AppShell,
  BackendStatusBadge,
  ContextSwitcher,
  EmptyState,
  ResourceCapabilityBar,
  ResourceExplorerNav,
  ResourceTable,
  YamlEditorPanel
} from "@k8s-ide/ui";

export type AppPlatform = "desktop" | "web" | "mobile";

function resourceToRef(descriptor: ApiResourceDescriptor, resource: KubeResource) {
  const metadata = resource.metadata as Record<string, unknown> | undefined;

  return {
    group: descriptor.group,
    version: descriptor.version,
    resource: descriptor.resource,
    kind: descriptor.kind,
    namespace: typeof metadata?.namespace === "string" ? metadata.namespace : undefined,
    name: typeof metadata?.name === "string" ? metadata.name : "unknown"
  };
}

function EditableYamlResourcePanel(props: {
  initialValue: string;
  applying: boolean;
  onApply: (yamlText: string) => void;
}) {
  const [value, setValue] = useState(props.initialValue);

  return (
    <YamlEditorPanel
      value={value}
      onChange={setValue}
      onApply={() => props.onApply(value)}
      applyDisabled={props.applying || value.length === 0}
    />
  );
}

function ExplorerPage(props: { client: K8sApiClient; platform: AppPlatform }) {
  const queryClient = useQueryClient();
  const {
    activeContext,
    backendStatus,
    session,
    setActiveContext,
    setBackendStatus,
    setClient,
    setPlatform,
    setSession
  } = useSessionStore();
  const {
    fieldSelector,
    labelSelector,
    namespace,
    selectedDescriptor,
    selectedResource,
    setSelectedDescriptor,
    setSelectedResource
  } = useExplorerStore();
  const refreshPolicy = usePreferencesStore((state) => state.refreshPolicy);

  useEffect(() => {
    setClient(props.client);
    setPlatform(props.platform);
  }, [props.client, props.platform, setClient, setPlatform]);

  const contextsQuery = useQuery({
    queryKey: queryKeys.contexts(),
    queryFn: () => props.client.listContexts()
  });

  const openSessionMutation = useMutation({
    mutationFn: (context: string) => props.client.openSession(context),
    onMutate: () => setBackendStatus("connecting"),
    onSuccess: (nextSession) => {
      setSession(nextSession);
      setActiveContext(nextSession.activeContext);
      setBackendStatus("ready");
      void queryClient.invalidateQueries({ queryKey: queryKeys.discovery(nextSession.activeContext) });
    },
    onError: () => setBackendStatus("error")
  });

  useEffect(() => {
    if (contextsQuery.data && !activeContext) {
      const initialContext = contextsQuery.data.find((context) => context.current) ?? contextsQuery.data[0];

      if (initialContext) {
        openSessionMutation.mutate(initialContext.name);
      }
    }
  }, [activeContext, contextsQuery.data, openSessionMutation]);

  const discoveryQuery = useQuery({
    queryKey: queryKeys.discovery(activeContext),
    queryFn: () => props.client.getDiscovery(),
    enabled: Boolean(activeContext)
  });

  useEffect(() => {
    if (discoveryQuery.data && !selectedDescriptor) {
      const preferred =
        discoveryQuery.data.find((descriptor) => descriptor.resource === "pods") ?? discoveryQuery.data[0];

      if (preferred) {
        setSelectedDescriptor(preferred);
      }
    }
  }, [discoveryQuery.data, selectedDescriptor, setSelectedDescriptor]);

  const resourcesQuery = useQuery({
    queryKey:
      selectedDescriptor === undefined
        ? ["resources", "unselected"]
        : queryKeys.resources({
            context: activeContext,
            group: selectedDescriptor.group,
            version: selectedDescriptor.version,
            resource: selectedDescriptor.resource,
            namespace: selectedDescriptor.namespaced ? namespace : undefined,
            labelSelector,
            fieldSelector
          }),
    queryFn: () =>
      props.client.listResources({
        group: selectedDescriptor?.group ?? "",
        version: selectedDescriptor?.version ?? "v1",
        resource: selectedDescriptor?.resource ?? "pods",
        namespace: selectedDescriptor?.namespaced ? namespace : undefined,
        labelSelector,
        fieldSelector
      }),
    enabled: Boolean(activeContext && selectedDescriptor)
  });

  const selectedResourceQuery = useQuery({
    queryKey:
      selectedDescriptor && selectedResource
        ? queryKeys.resource({
            context: activeContext,
            ref: selectedResource
          })
        : ["resource", "unselected"],
    queryFn: () => {
      if (!selectedDescriptor || !selectedResource) {
        throw new Error("Missing selected resource");
      }

      return props.client.getResource({
        group: selectedDescriptor.group,
        version: selectedDescriptor.version,
        resource: selectedDescriptor.resource,
        namespace: selectedResource.namespace,
        name: selectedResource.name
      });
    },
    enabled: Boolean(selectedDescriptor && selectedResource)
  });

  const selectedYaml = useMemo(
    () => (selectedResourceQuery.data ? stringify(selectedResourceQuery.data) : ""),
    [selectedResourceQuery.data]
  );

  const applyMutation = useMutation({
    mutationFn: (yamlText: string) => props.client.applyYaml(yamlText),
    onSuccess: async () => {
      if (selectedDescriptor) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.resources({
            context: activeContext,
            group: selectedDescriptor.group,
            version: selectedDescriptor.version,
            resource: selectedDescriptor.resource,
            namespace: selectedDescriptor.namespaced ? namespace : undefined,
            labelSelector,
            fieldSelector
          })
        });
      }

      if (selectedResource) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.resource({
            context: activeContext,
            ref: selectedResource
          })
        });
      }
    }
  });

  const actionMutation = useMutation({
    mutationFn: (action: { action: "delete" | "restart"; resource: KubeResource }) => {
      if (!selectedDescriptor) {
        throw new Error("No selected descriptor");
      }

      const target = resourceToRef(selectedDescriptor, action.resource);

      if (action.action === "delete") {
        return props.client
          .deleteResource({
            group: target.group,
            version: target.version,
            resource: target.resource,
            namespace: target.namespace,
            name: target.name
          })
          .then(() => ({ ok: true, message: "Deleted" }));
      }

      return props.client.invokeAction({
        action: "restart",
        target
      });
    },
    onSuccess: async () => {
      if (selectedDescriptor) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.resources({
            context: activeContext,
            group: selectedDescriptor.group,
            version: selectedDescriptor.version,
            resource: selectedDescriptor.resource,
            namespace: selectedDescriptor.namespaced ? namespace : undefined,
            labelSelector,
            fieldSelector
          })
        });
      }
    }
  });

  const detail = !selectedDescriptor ? (
    <EmptyState
      title="Select a resource type"
      message="Discovery is wired through the shared Go backend, and the same explorer shell is reused by desktop, web, and mobile wrappers."
    />
  ) : (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)"
        }}
      >
        <ResourceTable
          items={resourcesQuery.data?.items ?? []}
          selectedName={selectedResource?.name}
          onSelect={(resource) => {
            setSelectedResource(resourceToRef(selectedDescriptor, resource));
          }}
        />
        <div style={{ display: "grid", gap: 12 }}>
          {selectedResource && selectedDescriptor ? (
            <>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedResource.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 14 }}>
                  {selectedResource.namespace ? `${selectedResource.namespace} namespace` : "cluster scoped"} ·{" "}
                  {selectedDescriptor.kind}
                </div>
                <ResourceCapabilityBar capabilities={getResourceCapabilities(selectedDescriptor)} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() =>
                      selectedResourceQuery.data
                        ? actionMutation.mutate({ action: "delete", resource: selectedResourceQuery.data })
                        : undefined
                    }
                    style={{
                      background: "#b91c1c",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 14px"
                    }}
                  >
                    Delete
                  </button>
                  {getResourceCapabilities(selectedDescriptor).canRestart ? (
                    <button
                      type="button"
                      onClick={() =>
                        selectedResourceQuery.data
                          ? actionMutation.mutate({ action: "restart", resource: selectedResourceQuery.data })
                          : undefined
                      }
                      style={{
                        background: "#1d4ed8",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 8,
                        padding: "10px 14px"
                      }}
                    >
                      Rollout restart
                    </button>
                  ) : null}
                </div>
              </div>
              <EditableYamlResourcePanel
                key={selectedResource ? refKey(selectedResource) : "none"}
                initialValue={selectedYaml}
                applying={applyMutation.isPending}
                onApply={(yamlText) => applyMutation.mutate(yamlText)}
              />
            </>
          ) : (
            <EmptyState
              title="Choose a resource instance"
              message="The shared explorer keeps selection, filters, and YAML editing state in the reusable store package."
            />
          )}
        </div>
      </div>
      <div style={{ color: "#64748b", fontSize: 13 }}>
        Refresh policy: {refreshPolicy} · Discovery entries: {discoveryQuery.data?.length ?? 0} · Cached resource
        key: {selectedResource ? refKey(selectedResource) : "none"}
      </div>
    </div>
  );

  return (
    <AppShell
      title="Kubernetes IDE"
      subtitle={`${props.platform} shell · shared React explorer`}
      sidebar={
        <div style={{ display: "grid", gap: 16 }}>
          <ContextSwitcher
            contexts={contextsQuery.data ?? []}
            value={activeContext}
            onChange={(context) => openSessionMutation.mutate(context)}
          />
          <ResourceExplorerNav
            descriptors={discoveryQuery.data ?? []}
            selected={selectedDescriptor}
            onSelect={setSelectedDescriptor}
          />
        </div>
      }
      toolbar={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap"
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Shared client + shared engine</div>
            <div style={{ color: "#94a3b8", fontSize: 14 }}>
              {session ? `${session.activeContext} · ${session.mode}` : "Open a session to load discovery"}
            </div>
          </div>
          <BackendStatusBadge status={backendStatus} />
        </div>
      }
      detail={detail}
    />
  );
}

function AppRoutes(props: { client: K8sApiClient; platform: AppPlatform }) {
  const rootRoute = useMemo(
    () =>
      createRootRoute({
        component: () => <Outlet />
      }),
    []
  );

  const explorerRoute = useMemo(
    () =>
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => <ExplorerPage client={props.client} platform={props.platform} />
      }),
    [props.client, props.platform, rootRoute]
  );

  const routeTree = useMemo(() => rootRoute.addChildren([explorerRoute]), [explorerRoute, rootRoute]);

  const router = useMemo(
    () =>
      createRouter({
        routeTree
      }),
    [routeTree]
  );

  return <RouterProvider router={router} />;
}

export function K8sIdeApp(props: { client: K8sApiClient; platform: AppPlatform }) {
  const queryClient = useMemo(() => createAppQueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes client={props.client} platform={props.platform} />
    </QueryClientProvider>
  );
}
