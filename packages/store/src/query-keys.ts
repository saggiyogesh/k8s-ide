import type { ListOpts, GetOpts, ApiResourceDescriptor } from "@k8s-ide/core";
import { gvrKey } from "@k8s-ide/core";

export const queryKeys = {
  health: ["health"] as const,
  contexts: ["contexts"] as const,
  discovery: (context: string) => ["discovery", context] as const,
  resources: (opts: ListOpts & { context: string }) =>
    [
      "resources",
      opts.context,
      gvrKey(opts.group, opts.version, opts.resource),
      opts.namespace ?? "_all",
      opts.labelSelector ?? "",
      opts.fieldSelector ?? "",
    ] as const,
  resource: (opts: GetOpts & { context: string }) =>
    [
      "resource",
      opts.context,
      gvrKey(opts.group, opts.version, opts.resource),
      opts.namespace ?? "_cluster",
      opts.name,
    ] as const,
};

export function filterDiscovery(
  resources: ApiResourceDescriptor[],
  query: string,
): ApiResourceDescriptor[] {
  const q = query.trim().toLowerCase();
  if (!q) return resources;
  return resources.filter(
    (r) =>
      r.kind.toLowerCase().includes(q) ||
      r.resource.toLowerCase().includes(q) ||
      r.group.toLowerCase().includes(q) ||
      r.shortNames?.some((s) => s.toLowerCase().includes(q)),
  );
}
