import { useEffect } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import {
  useContextsQuery,
  useDiscoveryQuery,
  useSessionStore,
  usePreferencesStore,
} from "@k8s-ide/store";
import { ContextSwitcher, ResourceExplorer, StatusBar } from "@k8s-ide/ui";
import type { ApiResourceDescriptor } from "@k8s-ide/core";

export function AppShell() {
  const navigate = useNavigate();
  const { activeContext, setActiveContext, backendStatus, backendError } =
    useSessionStore();
  const { theme } = usePreferencesStore();

  const contextsQuery = useContextsQuery();
  const discoveryQuery = useDiscoveryQuery();

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    }
  }, [theme]);

  function handleContextSwitch(context: string) {
    setActiveContext(context);
  }

  function handleResourceSelect(descriptor: ApiResourceDescriptor) {
    void navigate({
      to: "/resources/$group/$version/$resource",
      params: {
        group: descriptor.group || "core",
        version: descriptor.version,
        resource: descriptor.resource,
      },
    });
  }

  const discovery = discoveryQuery.data ?? [];

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="text-sm font-semibold tracking-tight">k8s-ide</span>
        <div className="ml-auto">
          <ContextSwitcher
            contexts={contextsQuery.data ?? []}
            activeContext={activeContext}
            onSwitch={handleContextSwitch}
            isLoading={contextsQuery.isLoading}
          />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 overflow-hidden">
          <ResourceExplorer
            resources={discovery}
            onSelect={handleResourceSelect}
          />
        </aside>

        {/* Main content */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* Status bar */}
      <StatusBar
        status={backendStatus}
        context={activeContext}
        error={backendError}
      />
    </div>
  );
}
