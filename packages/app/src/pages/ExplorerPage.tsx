import { useDiscoveryQuery, useSessionStore } from "@k8s-ide/store";

export function ExplorerPage() {
  const { activeContext } = useSessionStore();
  const discoveryQuery = useDiscoveryQuery();

  if (!activeContext) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-xl font-semibold">Welcome to k8s-ide</h2>
        <p className="text-sm text-muted-foreground">
          Select a cluster context from the toolbar to get started.
        </p>
      </div>
    );
  }

  if (discoveryQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Discovering API resources…
      </div>
    );
  }

  const resourceCount = discoveryQuery.data?.length ?? 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-semibold">Cluster Explorer</h2>
      <p className="text-sm text-muted-foreground">
        Context: <strong>{activeContext}</strong>
        {" · "}
        {resourceCount} resource types discovered
      </p>
      <p className="text-xs text-muted-foreground">
        Select a resource type from the sidebar to begin browsing.
      </p>
    </div>
  );
}
