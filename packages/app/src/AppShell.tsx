import React, { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { K8sClientProvider, useSessionStore, useContexts } from "@k8s-ide/store";
import type { K8sApiClient } from "@k8s-ide/api-client";
import { ContextSwitcher } from "@k8s-ide/ui";
import { ExplorerPage } from "./ExplorerPage.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

interface AppShellProps {
  client: K8sApiClient;
  /** Optional header slot for platform-specific controls (e.g. window buttons on desktop). */
  headerExtra?: React.ReactNode;
}

export function AppShell({ client, headerExtra }: AppShellProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <K8sClientProvider client={client}>
        <AppShellInner headerExtra={headerExtra} />
      </K8sClientProvider>
    </QueryClientProvider>
  );
}

function AppShellInner({ headerExtra }: { headerExtra?: React.ReactNode }) {
  const session = useSessionStore();
  const { data: contexts = [] } = useContexts();

  // Seed the context list on load.
  useEffect(() => {
    if (contexts.length > 0) {
      session.setAvailableContexts(contexts);
    }
  }, [contexts]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleContextSelect(contextName: string) {
    // Re-use the client from context; the mutation is in the store layer.
    session.setBackendStatus("connecting");
    try {
      session.setActiveContext(contextName);
      session.setBackendStatus("connected");
    } catch (e) {
      session.setBackendStatus("error", String(e));
    }
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center h-10 border-b border-zinc-800 px-2 shrink-0 bg-zinc-900">
        <span className="text-sm font-bold text-sky-400 mr-3">K8s IDE</span>
        <ContextSwitcher
          contexts={contexts}
          activeContext={session.activeContext}
          onSelect={handleContextSelect}
          status={session.backendStatus}
        />
        {headerExtra && <div className="ml-auto">{headerExtra}</div>}
      </header>

      {/* Main area */}
      <main className="flex-1 overflow-hidden">
        {session.activeContext ? (
          <ExplorerPage />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
      <svg className="h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25zm0 3.75h.008v7.5H12v-7.5z"
        />
      </svg>
      <p className="text-sm">Select a Kubernetes context to begin</p>
    </div>
  );
}
