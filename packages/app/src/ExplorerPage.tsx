import React from "react";
import {
  useDiscovery,
  useResources,
  useSessionStore,
  useExplorerStore,
  useDeleteResource,
} from "@k8s-ide/store";
import { ResourceTable, Sidebar, ResourceDetail } from "@k8s-ide/ui";
import type { KubeResource, ListOpts, DeleteOpts } from "@k8s-ide/core";

export function ExplorerPage() {
  const explorer = useExplorerStore();
  const session = useSessionStore();
  const deleteResource = useDeleteResource();

  const { data: descriptors = [] } = useDiscovery();

  const listOpts: Omit<ListOpts, "limit" | "continueToken"> = {
    group: explorer.selectedGroup,
    version: explorer.selectedVersion,
    resource: explorer.selectedResource,
    ...(explorer.selectedNamespace ? { namespace: explorer.selectedNamespace } : {}),
    ...(explorer.labelSelector ? { labelSelector: explorer.labelSelector } : {}),
  };

  const { data: listResult, isLoading, error } = useResources(listOpts);

  const items = listResult?.items ?? [];

  const activeDescriptor = descriptors.find(
    (d) =>
      d.resource === explorer.selectedResource &&
      d.group === explorer.selectedGroup,
  );

  const selectedItem = explorer.selectedName
    ? items.find((i) => i.metadata.name === explorer.selectedName)
    : undefined;

  function handleSelect(item: KubeResource) {
    explorer.selectResource({
      group: explorer.selectedGroup,
      version: explorer.selectedVersion,
      resource: explorer.selectedResource,
      ...(item.metadata.namespace ? { namespace: item.metadata.namespace } : {}),
      name: item.metadata.name,
    });
  }

  function handleDelete(resource: KubeResource) {
    const opts: DeleteOpts = {
      group: explorer.selectedGroup,
      version: explorer.selectedVersion,
      resource: explorer.selectedResource,
      name: resource.metadata.name,
      ...(resource.metadata.namespace ? { namespace: resource.metadata.namespace } : {}),
    };
    deleteResource.mutate(opts);
    explorer.closeDetail();
  }

  const _ = session; // consumed for future use

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        descriptors={descriptors}
        selectedResource={explorer.selectedResource}
        selectedGroup={explorer.selectedGroup}
        onSelect={(group, version, resource) =>
          explorer.selectResource({ group, version, resource })
        }
        isOpen={explorer.sidebarOpen}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-200 capitalize">
            {explorer.selectedResource}
          </h2>
          {activeDescriptor?.namespaced && (
            <NamespaceFilter
              value={explorer.selectedNamespace}
              onChange={explorer.setSelectedNamespace}
            />
          )}
          <div className="ml-auto">
            <input
              type="search"
              placeholder="Filter by name…"
              value={explorer.filterText}
              onChange={(e) => explorer.setFilterText(e.target.value)}
              className="bg-zinc-800 text-zinc-200 text-xs px-2 py-1.5 rounded border border-zinc-700 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500 w-48"
            />
          </div>
        </div>

        {/* Table + detail split */}
        <div className="flex flex-1 overflow-hidden">
          <div className={`flex flex-col overflow-hidden ${selectedItem ? "flex-1" : "w-full"}`}>
            <ResourceTable
              items={items}
              onSelect={handleSelect}
              {...(explorer.selectedName ? { selectedName: explorer.selectedName } : {})}
              filterText={explorer.filterText}
              isLoading={isLoading}
              {...(error ? { error: error.message } : {})}
            />
          </div>
          {selectedItem && (
            <div className="w-96 shrink-0 overflow-hidden">
              <ResourceDetail
                resource={selectedItem}
                {...(activeDescriptor ? { descriptor: activeDescriptor } : {})}
                onClose={explorer.closeDetail}
                onDelete={handleDelete}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NamespaceFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (ns: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="ml-2 bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded border border-zinc-700 focus:outline-none focus:border-sky-500"
    >
      <option value="">All namespaces</option>
      <option value="default">default</option>
      <option value="kube-system">kube-system</option>
    </select>
  );
}
