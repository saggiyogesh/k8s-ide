import type { ListOpts, GetOpts } from "@k8s-ide/api-client";

export const queryKeys = {
  contexts: () => ["contexts"] as const,
  session: (context: string) => ["session", context] as const,
  discovery: (context: string) => ["discovery", context] as const,

  resources: (context: string, opts: ListOpts) =>
    [
      "resources",
      context,
      opts.group,
      opts.version,
      opts.resource,
      opts.namespace ?? "_",
      opts.labelSelector ?? "",
      opts.fieldSelector ?? "",
    ] as const,

  resource: (context: string, opts: GetOpts) =>
    [
      "resource",
      context,
      opts.group,
      opts.version,
      opts.resource,
      opts.namespace ?? "_",
      opts.name,
    ] as const,

  namespaces: (context: string) => ["namespaces", context] as const,
  nodes: (context: string) => ["nodes", context] as const,
} as const;
