import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@k8s-ide/store";
import type { K8sApiClient } from "@k8s-ide/api-client";
import { createQueryClient } from "@k8s-ide/store";
import { useMemo } from "react";
import type { AppRouter } from "../router.js";
import { ConnectionBanner } from "./ConnectionBanner.js";
import { TopBar } from "./TopBar.js";

interface AppShellProps {
  router: AppRouter;
  client: K8sApiClient;
}

export function AppShell({ router, client }: AppShellProps) {
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen flex-col">
        <TopBar client={client} />
        <ConnectionBanner client={client} />
        <div className="flex-1 overflow-hidden">
          <RouterProvider router={router} context={{ client }} />
        </div>
      </div>
    </QueryClientProvider>
  );
}
