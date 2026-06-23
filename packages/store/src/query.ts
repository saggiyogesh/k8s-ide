import type { K8sApiClient } from "@k8s-ide/api-client";
import { listKey } from "@k8s-ide/core";
import type { GetOpts, ListOpts } from "@k8s-ide/core";
import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  contexts: ["contexts"] as const,
  discovery: (context: string | null) => ["discovery", context] as const,
  resources: (context: string | null, opts: ListOpts) =>
    ["resources", context, listKey(opts)] as const,
  resource: (context: string | null, opts: GetOpts) =>
    ["resource", context, opts.group, opts.version, opts.resource, opts.namespace, opts.name] as const,
  health: ["health"] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function createResourceQueries(client: K8sApiClient, context: string | null) {
  return {
    listContexts: () => ({
      queryKey: queryKeys.contexts,
      queryFn: () => client.listContexts(),
    }),
    discovery: () => ({
      queryKey: queryKeys.discovery(context),
      queryFn: () => client.getDiscovery(),
      enabled: !!context,
    }),
    listResources: (opts: ListOpts) => ({
      queryKey: queryKeys.resources(context, opts),
      queryFn: () => client.listResources(opts),
      enabled: !!context,
    }),
    getResource: (opts: GetOpts) => ({
      queryKey: queryKeys.resource(context, opts),
      queryFn: () => client.getResource(opts),
      enabled: !!context && !!opts.name,
    }),
    health: () => ({
      queryKey: queryKeys.health,
      queryFn: () => client.healthCheck(),
      refetchInterval: 5_000,
    }),
  };
}
