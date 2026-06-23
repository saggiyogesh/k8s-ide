import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.js";
import { useK8sClient } from "./client-context.js";
import { useSessionStore } from "./session-store.js";
import { usePreferencesStore } from "./preferences-store.js";
import type { ListOpts, GetOpts, DeleteOpts } from "@k8s-ide/api-client";
import type { ResourceActionRequest } from "@k8s-ide/core";

export function useContexts() {
  const client = useK8sClient();
  return useQuery({
    queryKey: queryKeys.contexts(),
    queryFn: () => client.listContexts(),
    staleTime: 30_000,
  });
}

export function useDiscovery() {
  const client = useK8sClient();
  const context = useSessionStore((s) => s.activeContext);
  return useQuery({
    queryKey: queryKeys.discovery(context ?? ""),
    queryFn: () => client.getDiscovery(),
    enabled: !!context,
    staleTime: 5 * 60_000,
  });
}

export function useResources(opts: ListOpts) {
  const client = useK8sClient();
  const context = useSessionStore((s) => s.activeContext);
  const policy = usePreferencesStore((s) => s.refreshPolicy);
  const refetchInterval: number | false =
    policy === "manual" ? false : policy === "10s" ? 10_000 : policy === "30s" ? 30_000 : 60_000;
  return useQuery({
    queryKey: queryKeys.resources(context ?? "", opts),
    queryFn: () => client.listResources(opts),
    enabled: !!context,
    refetchInterval,
    staleTime: 10_000,
  });
}

export function useResource(opts: GetOpts) {
  const client = useK8sClient();
  const context = useSessionStore((s) => s.activeContext);
  return useQuery({
    queryKey: queryKeys.resource(context ?? "", opts),
    queryFn: () => client.getResource(opts),
    enabled: !!context && !!opts.name,
    staleTime: 10_000,
  });
}

export function useNamespaces() {
  const client = useK8sClient();
  const context = useSessionStore((s) => s.activeContext);
  return useQuery({
    queryKey: queryKeys.namespaces(context ?? ""),
    queryFn: () =>
      client.listResources({ group: "", version: "v1", resource: "namespaces" }),
    enabled: !!context,
    staleTime: 30_000,
  });
}

export function useApplyYaml() {
  const client = useK8sClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (yaml: string) => client.applyYaml(yaml),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useDeleteResource() {
  const client = useK8sClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: DeleteOpts) => client.deleteResource(opts),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useInvokeAction() {
  const client = useK8sClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: ResourceActionRequest) => client.invokeAction(action),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}
