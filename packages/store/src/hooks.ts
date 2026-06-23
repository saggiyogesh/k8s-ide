import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { K8sApiClient } from "@k8s-ide/api-client";
import type { DeleteOpts, GetOpts, ListOpts } from "@k8s-ide/core";
import { useSessionStore } from "./session-store.js";
import { queryKeys } from "./query-keys.js";

export function useContextsQuery(client: K8sApiClient) {
  return useQuery({
    queryKey: queryKeys.contexts,
    queryFn: () => client.listContexts(),
  });
}

export function useDiscoveryQuery(client: K8sApiClient) {
  const context = useSessionStore((s) => s.currentContext);
  return useQuery({
    queryKey: queryKeys.discovery(context ?? ""),
    queryFn: () => client.getDiscovery(),
    enabled: !!context,
  });
}

export function useResourcesQuery(client: K8sApiClient, opts: ListOpts) {
  const context = useSessionStore((s) => s.currentContext);
  return useQuery({
    queryKey: queryKeys.resources({ ...opts, context: context ?? "" }),
    queryFn: () => client.listResources(opts),
    enabled: !!context,
  });
}

export function useResourceQuery(client: K8sApiClient, opts: GetOpts) {
  const context = useSessionStore((s) => s.currentContext);
  return useQuery({
    queryKey: queryKeys.resource({ ...opts, context: context ?? "" }),
    queryFn: () => client.getResource(opts),
    enabled: !!context && !!opts.name,
  });
}

export function useDeleteResourceMutation(client: K8sApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts: DeleteOpts) => client.deleteResource(opts),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useApplyYamlMutation(client: K8sApiClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (yaml: string) => client.applyYaml(yaml),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["resource"] });
    },
  });
}

export function useOpenSessionMutation(client: K8sApiClient) {
  const queryClient = useQueryClient();
  const setCurrentContext = useSessionStore((s) => s.setCurrentContext);
  const setCurrentNamespace = useSessionStore((s) => s.setCurrentNamespace);

  return useMutation({
    mutationFn: (context: string) => client.openSession(context),
    onSuccess: (session) => {
      setCurrentContext(session.context);
      setCurrentNamespace(session.namespace);
      void queryClient.invalidateQueries({ queryKey: ["discovery"] });
    },
  });
}
