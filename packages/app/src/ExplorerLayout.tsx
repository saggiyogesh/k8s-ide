import { useState, useCallback } from "react"
import { buildCapabilities, type ResourceRef } from "@k8s-ide/core"
import {
  useContexts,
  useDiscovery,
  useResourceList,
  useExplorerStore,
  useSessionStore,
} from "@k8s-ide/store"
import {
  ResourceSidebar,
  ResourceTable,
  ResourceDetail,
  ActionBar,
  ContextSwitcher,
} from "@k8s-ide/ui"
import { useClient } from "./client-context.js"
import type { KubeResource } from "@k8s-ide/core"

export function ExplorerLayout() {
  const client = useClient()
  const { activeContext, activeNamespace, setActiveContext, setSession } = useSessionStore()
  const { activeGVR, selectedResource, setSelectedResource } = useExplorerStore()

  const contextsQuery = useContexts(client)
  const discoveryQuery = useDiscovery(client, activeContext ?? "")

  const resourcesQuery = useResourceList(
    client,
    {
      group: activeGVR?.group ?? "",
      version: activeGVR?.version ?? "",
      resource: activeGVR?.resource ?? "",
      ...(activeNamespace ? { namespace: activeNamespace } : {}),
    },
    { enabled: !!activeGVR },
  )

  const handleContextSelect = useCallback(
    async (ctx: string) => {
      setActiveContext(ctx)
      try {
        const sess = await client.openSession(ctx)
        setSession(sess)
      } catch {
        // session error shown elsewhere
      }
    },
    [client, setActiveContext, setSession],
  )

  const handleResourceSelect = useCallback(
    (resource: KubeResource) => {
      const descriptor = discoveryQuery.data?.find(
        (d) =>
          d.group === (activeGVR?.group ?? "") &&
          d.version === (activeGVR?.version ?? "") &&
          d.resource === (activeGVR?.resource ?? ""),
      )
      if (!descriptor) return
      const ref: ResourceRef = {
        group: descriptor.group,
        version: descriptor.version,
        resource: descriptor.resource,
        kind: descriptor.kind,
        name: resource.metadata.name,
        ...(resource.metadata.namespace ? { namespace: resource.metadata.namespace } : {}),
      }
      setSelectedResource(ref)
    },
    [activeGVR, discoveryQuery.data, setSelectedResource],
  )

  const detailResource = resourcesQuery.data?.items.find(
    (r) => r.metadata.name === selectedResource?.name,
  )

  const capabilities =
    activeGVR && discoveryQuery.data
      ? buildCapabilities(
          discoveryQuery.data.find(
            (d) =>
              d.group === activeGVR.group &&
              d.version === activeGVR.version &&
              d.resource === activeGVR.resource,
          ) ?? {
            group: "",
            version: "",
            resource: "",
            singular: "",
            kind: "",
            namespaced: false,
            shortNames: [],
            verbs: [],
            categories: [],
          },
        )
      : undefined

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r flex flex-col shrink-0">
        <div className="p-3 border-b">
          <h1 className="text-base font-bold mb-2">k8s-ide</h1>
          <ContextSwitcher
            contexts={contextsQuery.data ?? []}
            onSelect={handleContextSelect}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          {discoveryQuery.isLoading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading resources…</p>
          )}
          {discoveryQuery.data && (
            <ResourceSidebar descriptors={discoveryQuery.data} className="p-2" />
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Resource list pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {resourcesQuery.isLoading && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading…
            </div>
          )}
          {resourcesQuery.isError && (
            <div className="flex items-center justify-center h-full text-destructive text-sm">
              Error: {resourcesQuery.error.message}
            </div>
          )}
          {!activeGVR && !resourcesQuery.isLoading && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a resource type from the sidebar.
            </div>
          )}
          {resourcesQuery.data && (
            <ResourceTable
              resources={resourcesQuery.data.items}
              {...(selectedResource?.name ? { selectedName: selectedResource.name } : {})}
              onSelect={handleResourceSelect}
              className="flex-1"
            />
          )}
        </div>

        {/* Detail pane */}
        {detailResource && (
          <div className="h-1/2 border-t flex flex-col">
            {capabilities && (
              <ActionBar
                resource={detailResource}
                capabilities={capabilities}
                onDelete={() => {
                  /* wired via useMutation in parent */
                }}
              />
            )}
            <ResourceDetail
              resource={detailResource}
              {...(capabilities ? { capabilities } : {})}
              className="flex-1"
            />
          </div>
        )}
      </main>
    </div>
  )
}
