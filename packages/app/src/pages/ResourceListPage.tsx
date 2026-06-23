import { useCallback } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useResourceListQuery, useWatchResources } from "@k8s-ide/store";
import type { KubeResource } from "@k8s-ide/core";
import { ResourceTable } from "@k8s-ide/ui";
import type { ListOpts, WatchOpts } from "@k8s-ide/api-client";

export function ResourceListPage() {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    group: string;
    version: string;
    resource: string;
    namespace?: string;
  };

  const group = params.group === "core" ? "" : (params.group ?? "");
  const version = params.version ?? "";
  const resource = params.resource ?? "";
  const namespace = params.namespace;

  const listOpts: ListOpts = { group, version, resource };
  if (namespace !== undefined) listOpts.namespace = namespace;

  const watchOpts: WatchOpts = { group, version, resource };
  if (namespace !== undefined) watchOpts.namespace = namespace;

  const listQuery = useResourceListQuery(listOpts);
  useWatchResources(watchOpts, !!listQuery.data);

  const handleSelect = useCallback(
    (res: KubeResource) => {
      const ns = res.metadata.namespace;
      if (ns) {
        void navigate({
          to: "/resources/$group/$version/$resource/n/$namespace/$name",
          params: {
            group: params.group ?? "core",
            version,
            resource,
            namespace: ns,
            name: res.metadata.name,
          },
        });
      } else {
        void navigate({
          to: "/resources/$group/$version/$resource/$name",
          params: {
            group: params.group ?? "core",
            version,
            resource,
            name: res.metadata.name,
          },
        });
      }
    },
    [navigate, params.group, version, resource],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <h1 className="text-sm font-semibold">{resource}</h1>
          <p className="text-xs text-muted-foreground">
            {group || "core"}/{version}
            {namespace && ` · ${namespace}`}
            {listQuery.data && ` · ${listQuery.data.total} items`}
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ResourceTable
          items={listQuery.data?.items ?? []}
          onSelect={handleSelect}
          isLoading={listQuery.isLoading}
        />
      </div>
    </div>
  );
}
