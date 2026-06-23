import { useEffect, useMemo, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { rootRoute } from "../router-context.js";
import type { ApiResourceDescriptor, KubeResource } from "@k8s-ide/core";
import { deriveCapabilities } from "@k8s-ide/core";
import {
  useApplyYaml,
  useDeleteResource,
  useDiscovery,
  useExplorerStore,
  useResource,
  useResourceList,
  useSessionStore,
} from "@k8s-ide/store";
import {
  ActionBar,
  ResourceDetail,
  ResourceExplorer,
  ResourceTable,
  resourceToYaml,
} from "@k8s-ide/ui";
import { sortDiscovery } from "@k8s-ide/store";

export function ExplorerPage() {
  const { client } = useRouteContext({ from: rootRoute.id });
  const { selectedNamespace } = useSessionStore();
  const {
    selectedGvr,
    setSelectedGvr,
    selectedRef,
    setSelectedRef,
    searchQuery,
    setSearchQuery,
  } = useExplorerStore();

  const sessionReady = Boolean(useSessionStore((s) => s.currentContext));
  const { data: discovery = [] } = useDiscovery(client, sessionReady);
  const sortedDiscovery = useMemo(() => sortDiscovery(discovery), [discovery]);

  useEffect(() => {
    if (!selectedGvr && sortedDiscovery.length > 0) {
      const pods = sortedDiscovery.find((r) => r.kind === "Pod" && r.group === "");
      setSelectedGvr(pods ?? sortedDiscovery[0]);
    }
  }, [sortedDiscovery, selectedGvr, setSelectedGvr]);

  const listOpts = selectedGvr
    ? {
        group: selectedGvr.group,
        version: selectedGvr.version,
        resource: selectedGvr.resource,
        namespace: selectedGvr.group === "" && selectedGvr.resource === "namespaces"
          ? undefined
          : selectedNamespace || undefined,
      }
    : null;

  const { data: listData, isLoading: listLoading } = useResourceList(
    client,
    listOpts!,
    Boolean(listOpts && sessionReady),
  );

  const getOpts =
    selectedRef && selectedGvr
      ? {
          group: selectedGvr.group,
          version: selectedGvr.version,
          resource: selectedGvr.resource,
          namespace: selectedRef.namespace,
          name: selectedRef.name,
        }
      : null;

  const { data: resourceData } = useResource(client, getOpts!, Boolean(getOpts));
  const [yaml, setYaml] = useState("");
  const apply = useApplyYaml(client);
  const del = useDeleteResource(client);

  useEffect(() => {
    if (resourceData) setYaml(resourceToYaml(resourceData as KubeResource));
  }, [resourceData]);

  const capabilities = useMemo(() => {
    if (!selectedGvr) return undefined;
    return deriveCapabilities(selectedGvr as ApiResourceDescriptor, selectedGvr.kind);
  }, [selectedGvr]);

  const handleSelectResource = (descriptor: ApiResourceDescriptor) => {
    setSelectedGvr({
      group: descriptor.group,
      version: descriptor.version,
      resource: descriptor.resource,
      kind: descriptor.kind,
    });
    setSelectedRef(undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <ActionBar title={selectedGvr ? selectedGvr.kind : "Explorer"} />
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_1fr]">
        <aside className="border-r border-white/10">
          <ResourceExplorer
            resources={sortedDiscovery}
            selected={selectedGvr}
            search={searchQuery}
            onSearchChange={setSearchQuery}
            onSelect={handleSelectResource}
          />
        </aside>
        <section className="border-r border-white/10 overflow-hidden">
          <ResourceTable
            items={listData?.items ?? []}
            selectedName={selectedRef?.name}
            loading={listLoading}
            onSelect={(item) =>
              setSelectedRef({
                group: item.ref.group,
                version: item.ref.version,
                resource: item.ref.resource,
                kind: item.ref.kind,
                namespace: item.ref.namespace,
                name: item.ref.name,
              })
            }
          />
        </section>
        <section className="overflow-hidden">
          <ResourceDetail
            resource={resourceData as KubeResource | undefined}
            yaml={yaml}
            capabilities={capabilities}
            onYamlChange={setYaml}
            applying={apply.isPending}
            onApply={() => apply.mutate(yaml)}
            onDelete={() => {
              if (!getOpts) return;
              if (confirm(`Delete ${getOpts.name}?`)) del.mutate(getOpts);
            }}
            onScale={(replicas) => {
              if (!selectedRef) return;
              client.invokeAction({
                action: "scale",
                ref: selectedRef,
                params: { replicas },
              });
            }}
            onRestart={() => {
              if (!selectedRef) return;
              client.invokeAction({ action: "restart", ref: selectedRef });
            }}
          />
        </section>
      </div>
    </div>
  );
}
