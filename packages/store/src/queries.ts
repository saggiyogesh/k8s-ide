import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import type { ClusterContext, ApiResourceDescriptor, SessionInfo, KubeResource, ResourceListResult, ApplyResult, ActionResult } from "@k8s-ide/core";
import type { ListOpts, GetOpts, DeleteOpts, ScaleOpts, RestartOpts } from "@k8s-ide/api-client";
import { useK8sClient } from "./client-context.js";
import { queryKeys } from "./query-keys.js";
import { useSessionStore } from "./session-store.js";

export function useContextsQuery(
  options?: Omit<UseQueryOptions<ClusterContext[]>, "queryKey" | "queryFn">,
) {
  const client = useK8sClient();
  return useQuery({
    queryKey: queryKeys.contexts(),
    queryFn: () => client.listContexts(),
    staleTime: 30_000,
    ...options,
  });
}

export function useSessionQuery(
  context?: string,
  options?: Omit<UseQueryOptions<SessionInfo>, "queryKey" | "queryFn">,
) {
  const client = useK8sClient();
  const ctx = context ?? "";
  return useQuery({
    queryKey: queryKeys.session(ctx),
    queryFn: () => client.openSession(ctx),
    enabled: !!ctx,
    staleTime: 60_000,
    ...options,
  });
}

export function useDiscoveryQuery(
  options?: Omit<UseQueryOptions<ApiResourceDescriptor[]>, "queryKey" | "queryFn">,
) {
  const client = useK8sClient();
  const { activeContext } = useSessionStore();
  return useQuery({
    queryKey: queryKeys.discovery(activeContext ?? ""),
    queryFn: () => client.getDiscovery(),
    enabled: !!activeContext,
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useResourceListQuery(
  opts: ListOpts,
  options?: Omit<UseQueryOptions<ResourceListResult>, "queryKey" | "queryFn">,
) {
  const client = useK8sClient();
  const { activeContext } = useSessionStore();
  return useQuery({
    queryKey: queryKeys.resourceList(activeContext ?? "", opts),
    queryFn: () => client.listResources(opts),
    enabled: !!activeContext && !!opts.group !== undefined && !!opts.resource,
    staleTime: 10_000,
    ...options,
  });
}

export function useResourceQuery(
  opts: GetOpts,
  options?: Omit<UseQueryOptions<KubeResource>, "queryKey" | "queryFn">,
) {
  const client = useK8sClient();
  const { activeContext } = useSessionStore();
  return useQuery({
    queryKey: queryKeys.resource(activeContext ?? "", opts),
    queryFn: () => client.getResource(opts),
    enabled: !!activeContext && !!opts.name,
    staleTime: 10_000,
    ...options,
  });
}

export function useApplyYamlMutation() {
  const client = useK8sClient();
  const queryClient = useQueryClient();
  return useMutation<ApplyResult[], Error, string>({
    mutationFn: (yaml) => client.applyYaml(yaml),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useDeleteResourceMutation() {
  const client = useK8sClient();
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteOpts>({
    mutationFn: (opts) => client.deleteResource(opts),
    onSuccess: (_data, opts) => {
      void queryClient.invalidateQueries({
        queryKey: ["resources"],
      });
      void queryClient.removeQueries({
        queryKey: ["resource", opts.group, opts.version, opts.resource, opts.namespace ?? "", opts.name],
      });
    },
  });
}

export function useScaleMutation() {
  const client = useK8sClient();
  const queryClient = useQueryClient();
  return useMutation<ActionResult, Error, ScaleOpts>({
    mutationFn: (opts) => client.scaleResource(opts),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useRestartMutation() {
  const client = useK8sClient();
  const queryClient = useQueryClient();
  return useMutation<ActionResult, Error, RestartOpts>({
    mutationFn: (opts) => client.restartResource(opts),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}
