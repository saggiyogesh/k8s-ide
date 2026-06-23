import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ListOpts, GetOpts, DeleteOpts } from "@k8s-ide/core";
import { useK8sClient } from "./client-context.js";
import { useSessionStore } from "./session-store.js";
import { queryKeys } from "./query-keys.js";

export function useContexts() {
  const client = useK8sClient();
  return useQuery({
    queryKey: queryKeys.contexts(),
    queryFn: () => client.listContexts(),
  });
}

export function useDiscovery() {
  const client = useK8sClient();
  const context = useSessionStore((s) => s.activeContext);
  return useQuery({
    queryKey: queryKeys.discovery(context ?? ""),
    queryFn: () => client.getDiscovery(),
    enabled: !!context,
    staleTime: 60_000,
  });
}

export function useResources(opts: Omit<ListOpts, "limit" | "continueToken">) {
  const client = useK8sClient();
  const context = useSessionStore((s) => s.activeContext) ?? "";
  return useQuery({
    queryKey: queryKeys.resources(context, opts),
    queryFn: () =>
      client.listResources({ ...opts, limit: 500 }),
    enabled: !!context && !!opts.resource,
    staleTime: 10_000,
  });
}

export function useResource(opts: GetOpts) {
  const client = useK8sClient();
  const context = useSessionStore((s) => s.activeContext) ?? "";
  return useQuery({
    queryKey: queryKeys.resource(context, opts),
    queryFn: () => client.getResource(opts),
    enabled: !!context && !!opts.name,
    staleTime: 5_000,
  });
}

export function useDeleteResource() {
  const client = useK8sClient();
  const queryClient = useQueryClient();
  const context = useSessionStore((s) => s.activeContext) ?? "";

  return useMutation({
    mutationFn: (opts: DeleteOpts) => client.deleteResource(opts),
    onSuccess: (_data, opts) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.resources(context, opts),
      });
    },
  });
}

export function useApplyYaml() {
  const client = useK8sClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (yaml: string) => client.applyYaml(yaml),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}
