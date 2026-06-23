import { useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import {
  useResourceQuery,
  useDiscoveryQuery,
  useApplyYamlMutation,
  useDeleteResourceMutation,
  useScaleMutation,
  useRestartMutation,
} from "@k8s-ide/store";
import { resolveCapabilitiesMap } from "@k8s-ide/core";
import { ResourceDetail } from "@k8s-ide/ui";
import yaml from "js-yaml";
import type { GetOpts, DeleteOpts, ScaleOpts, RestartOpts } from "@k8s-ide/api-client";

export function ResourceDetailPage() {
  const params = useParams({ strict: false }) as {
    group: string;
    version: string;
    resource: string;
    namespace?: string;
    name: string;
  };

  const group = params.group === "core" ? "" : (params.group ?? "");
  const version = params.version ?? "";
  const resource = params.resource ?? "";
  const namespace = params.namespace;
  const name = params.name ?? "";

  const getOpts: GetOpts = { group, version, resource, name };
  if (namespace !== undefined) getOpts.namespace = namespace;

  const resourceQuery = useResourceQuery(getOpts);
  const discoveryQuery = useDiscoveryQuery();
  const applyMutation = useApplyYamlMutation();
  const deleteMutation = useDeleteResourceMutation();
  const scaleMutation = useScaleMutation();
  const restartMutation = useRestartMutation();

  const capMap = resolveCapabilitiesMap(discoveryQuery.data ?? []);
  const capabilities = capMap.get(`${group}/${version}/${resource}`);

  const yamlText = resourceQuery.data ? yaml.dump(resourceQuery.data as unknown as object) : undefined;

  const handleApplyYaml = useCallback(
    (yamlText: string) => {
      applyMutation.mutate(yamlText);
    },
    [applyMutation],
  );

  const handleDelete = useCallback(() => {
    if (window.confirm(`Delete ${resource}/${name}? This action cannot be undone.`)) {
      const deleteOpts: DeleteOpts = { group, version, resource, name };
      if (namespace !== undefined) deleteOpts.namespace = namespace;
      deleteMutation.mutate(deleteOpts);
    }
  }, [deleteMutation, group, version, resource, namespace, name]);

  const handleScale = useCallback(
    (replicas: number) => {
      const scaleOpts: ScaleOpts = {
        group,
        version,
        resource,
        namespace: namespace ?? "",
        name,
        replicas,
      };
      scaleMutation.mutate(scaleOpts);
    },
    [scaleMutation, group, version, resource, namespace, name],
  );

  const handleRestart = useCallback(() => {
    const restartOpts: RestartOpts = {
      group,
      version,
      resource,
      namespace: namespace ?? "",
      name,
    };
    restartMutation.mutate(restartOpts);
  }, [restartMutation, group, version, resource, namespace, name]);

  if (resourceQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading {name}…
      </div>
    );
  }

  if (!resourceQuery.data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        Resource not found
      </div>
    );
  }

  return (
    <ResourceDetail
      resource={resourceQuery.data}
      {...(capabilities !== undefined ? { capabilities } : {})}
      {...(yamlText !== undefined ? { yaml: yamlText } : {})}
      onApplyYaml={handleApplyYaml}
      {...(capabilities?.canDelete ? { onDelete: handleDelete } : {})}
      {...(capabilities?.supportsScale ? { onScale: handleScale } : {})}
      {...(capabilities?.supportsRollout ? { onRestart: handleRestart } : {})}
      isApplying={applyMutation.isPending}
      className="h-full"
    />
  );
}
