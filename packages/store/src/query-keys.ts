import type { ListOpts, GetOpts } from "@k8s-ide/core";

/**
 * Centralised TanStack Query key factory so all packages share the same cache shape.
 */
export const queryKeys = {
  contexts: () => ["contexts"] as const,

  session: (context: string) => ["session", context] as const,

  discovery: (context: string) => ["discovery", context] as const,

  resources: (context: string, opts: Omit<ListOpts, "limit" | "continueToken">) =>
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
};
