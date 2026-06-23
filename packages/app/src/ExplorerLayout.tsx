import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { K8sApiClient } from "@k8s-ide/api-client";
import { K8sClientProvider, useSessionStore, useExplorerStore, useK8sClient } from "@k8s-ide/store";
import {
  ResourceSidebar,
  ResourceTable,
  ResourceDetail,
  ContextSwitcher,
  NamespaceSwitcher,
} from "@k8s-ide/ui";
import { Settings, Menu, X } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export interface ExplorerProps {
  client: K8sApiClient;
  /** Optional slot rendered in the top-right of the header (e.g. desktop traffic lights) */
  headerRight?: React.ReactNode;
  onOpenSettings?: () => void;
}

export function ExplorerApp({ client, headerRight, onOpenSettings }: ExplorerProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <K8sClientProvider client={client}>
        <ExplorerLayout headerRight={headerRight} onOpenSettings={onOpenSettings ?? undefined} />
      </K8sClientProvider>
    </QueryClientProvider>
  );
}

interface ExplorerLayoutProps {
  headerRight?: React.ReactNode;
  onOpenSettings?: (() => void) | undefined;
}

function ExplorerLayout({ headerRight, onOpenSettings }: ExplorerLayoutProps) {
  const { sidebarCollapsed, setSidebarCollapsed, selectedItem } = useExplorerStore();
  const { setContexts, setBackendStatus, activeContext, setDiscovery, setSessionInfo } =
    useSessionStore();

  // On first mount, try to load contexts and auto-connect to current context.
  const client = useK8sClient();
  useEffect(() => {
    void (async () => {
      try {
        setBackendStatus("connecting");
        const ctxs = await client.listContexts();
        setContexts(ctxs);
        const current = ctxs.find((c) => c.isCurrent);
        if (current && !activeContext) {
          const info = await client.openSession(current.name);
          setSessionInfo(info);
          useSessionStore.getState().setActiveContext(current.name);
          setBackendStatus("connected");
          const disc = await client.getDiscovery();
          setDiscovery(disc);
        } else {
          setBackendStatus(activeContext ? "connected" : "disconnected");
        }
      } catch (err) {
        console.error("init error:", err);
        setBackendStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showDetail = !!selectedItem;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 h-11 border-b border-border shrink-0 bg-background/95 backdrop-blur-sm">
        <button
          className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
        <div className="font-semibold text-sm tracking-tight">k8s-ide</div>
        <div className="flex-1" />
        <ContextSwitcher />
        <NamespaceSwitcher />
        {onOpenSettings && (
          <button
            className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground"
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
        {headerRight}
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <aside className="w-56 shrink-0 border-r border-border overflow-y-auto">
            <ResourceSidebar />
          </aside>
        )}

        {/* Resource list */}
        <main
          className={`flex-1 overflow-hidden ${showDetail ? "border-r border-border" : ""}`}
        >
          <ResourceTable />
        </main>

        {/* Detail pane */}
        {showDetail && (
          <aside className="w-96 shrink-0 overflow-hidden">
            <ResourceDetail />
          </aside>
        )}
      </div>
    </div>
  );
}

