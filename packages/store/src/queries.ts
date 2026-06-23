import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"
import type { K8sApiClient, ListOpts, GetOpts } from "@k8s-ide/api-client"
import type { KubeResource, ApiResourceDescriptor, ClusterContext } from "@k8s-ide/core"
import type { ResourceListResult } from "@k8s-ide/api-client"

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

export const queryKeys = {
  contexts: () => ["contexts"] as const,
  discovery: (context: string) => ["discovery", context] as const,
  resources: (opts: ListOpts) =>
    [
      "resources",
      opts.group,
      opts.version,
      opts.resource,
      opts.namespace ?? "",
      opts.labelSelector ?? "",
      opts.fieldSelector ?? "",
    ] as const,
  resource: (opts: GetOpts) =>
    [
      "resource",
      opts.group,
      opts.version,
      opts.resource,
      opts.namespace ?? "",
      opts.name,
    ] as const,
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useContexts(
  client: K8sApiClient,
): UseQueryResult<ClusterContext[], Error> {
  return useQuery({
    queryKey: queryKeys.contexts(),
    queryFn: () => client.listContexts(),
    staleTime: 30_000,
  })
}

export function useDiscovery(
  client: K8sApiClient,
  context: string,
): UseQueryResult<ApiResourceDescriptor[], Error> {
  return useQuery({
    queryKey: queryKeys.discovery(context),
    queryFn: () => client.getDiscovery(),
    staleTime: 60_000,
    enabled: !!context,
  })
}

export function useResourceList(
  client: K8sApiClient,
  opts: ListOpts,
  options?: { enabled?: boolean; refetchInterval?: number },
): UseQueryResult<ResourceListResult, Error> {
  return useQuery({
    queryKey: queryKeys.resources(opts),
    queryFn: () => client.listResources(opts),
    staleTime: 10_000,
    ...(options?.refetchInterval !== undefined
      ? { refetchInterval: options.refetchInterval }
      : {}),
    enabled: options?.enabled !== false && !!opts.resource,
  })
}

export function useResource(
  client: K8sApiClient,
  opts: GetOpts,
  options?: { enabled?: boolean },
): UseQueryResult<KubeResource, Error> {
  return useQuery({
    queryKey: queryKeys.resource(opts),
    queryFn: () => client.getResource(opts),
    staleTime: 5_000,
    enabled: options?.enabled !== false && !!opts.name,
  })
}

export function useApplyYaml(client: K8sApiClient) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (yaml: string) => client.applyYaml(yaml),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["resources"] })
    },
  })
}

export function useDeleteResource(client: K8sApiClient) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: Parameters<K8sApiClient["deleteResource"]>[0]) =>
      client.deleteResource(opts),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.resources({
          group: variables.group,
          version: variables.version,
          resource: variables.resource,
          ...(variables.namespace !== undefined ? { namespace: variables.namespace } : {}),
        }),
      })
    },
  })
}
