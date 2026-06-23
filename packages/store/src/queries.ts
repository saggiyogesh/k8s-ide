import {
  QueryClient,
  type QueryClientConfig,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { K8sApiClient } from "@k8s-ide/api-client";
import type {
  ApiResourceDescriptor,
  ClusterContext,
  DeleteOpts,
  GetOpts,
  ListOpts,
  SessionInfo,
} from "@k8s-ide/core";
import { gvrKey } from "@k8s-ide/core";

export function createQueryClient(config?: QueryClientConfig): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
    ...config,
  });
}

export const queryKeys = {
  contexts: ["contexts"] as const,
  discovery: ["discovery"] as const,
  session: (context: string) => ["session", context] as const,
  resources: (opts: ListOpts) =>
    [
      "resources",
      opts.group,
      opts.version,
      opts.resource,
      opts.namespace ?? "_all",
      opts.labelSelector ?? "",
      opts.fieldSelector ?? "",
    ] as const,
  resource: (opts: GetOpts) =>
    [
      "resource",
      opts.group,
      opts.version,
      opts.resource,
      opts.namespace ?? "_cluster",
      opts.name,
    ] as const,
};

export function useContexts(client: K8sApiClient) {
  return useQuery<ClusterContext[]>({
    queryKey: queryKeys.contexts,
    queryFn: () => client.listContexts(),
  });
}

export function useDiscovery(client: K8sApiClient, enabled = true) {
  return useQuery<ApiResourceDescriptor[]>({
    queryKey: queryKeys.discovery,
    queryFn: () => client.getDiscovery(),
    enabled,
    staleTime: 60_000,
  });
}

export function useOpenSession(client: K8sApiClient) {
  const qc = useQueryClient();
  return useMutation<SessionInfo, Error, string>({
    mutationFn: (context) => client.openSession(context),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.session(data.context), data);
    },
  });
}

export function useResourceList(client: K8sApiClient, opts: ListOpts, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resources(opts),
    queryFn: () => client.listResources(opts),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useResource(client: K8sApiClient, opts: GetOpts, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resource(opts),
    queryFn: () => client.getResource(opts),
    enabled,
  });
}

export function useApplyYaml(client: K8sApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (yaml: string) => client.applyYaml(yaml),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      qc.invalidateQueries({ queryKey: ["resource"] });
    },
  });
}

export function useDeleteResource(client: K8sApiClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: DeleteOpts) => client.deleteResource(opts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function groupDiscoveryByCategory(resources: ApiResourceDescriptor[]) {
  const byCategory = new Map<string, ApiResourceDescriptor[]>();
  const uncategorized: ApiResourceDescriptor[] = [];

  for (const r of resources) {
    if (!r.categories?.length) {
      uncategorized.push(r);
      continue;
    }
    for (const cat of r.categories) {
      const list = byCategory.get(cat) ?? [];
      list.push(r);
      byCategory.set(cat, list);
    }
  }

  return { byCategory, uncategorized };
}

export function sortDiscovery(resources: ApiResourceDescriptor[]) {
  return [...resources].sort((a, b) => {
    const ga = gvrKey(a.group, a.version, a.resource);
    const gb = gvrKey(b.group, b.version, b.resource);
    return ga.localeCompare(gb);
  });
}

export { QueryClientProvider } from "@tanstack/react-query";
