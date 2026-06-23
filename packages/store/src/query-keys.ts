import type { ListOpts, GetOpts } from "@k8s-ide/api-client";

export const queryKeys = {
  contexts: () => ["contexts"] as const,
  session: (context: string) => ["session", context] as const,
  discovery: (context: string) => ["discovery", context] as const,
  resourceList: (context: string, opts: ListOpts) =>
    ["resources", context, opts.group, opts.version, opts.resource, opts.namespace ?? "", opts.labelSelector ?? ""] as const,
  resource: (context: string, opts: GetOpts) =>
    ["resource", context, opts.group, opts.version, opts.resource, opts.namespace ?? "", opts.name] as const,
};
