import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { K8sApiClient } from "@k8s-ide/api-client";
import { K8sClientProvider } from "@k8s-ide/store";
import { AppShell } from "./AppShell.js";
import { ExplorerPage } from "./pages/ExplorerPage.js";
import { ResourceListPage } from "./pages/ResourceListPage.js";
import { ResourceDetailPage } from "./pages/ResourceDetailPage.js";

export function createAppRouter(client: K8sApiClient) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 10_000,
      },
    },
  });

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <K8sClientProvider client={client}>
          <Outlet />
        </K8sClientProvider>
      </QueryClientProvider>
    ),
  });

  const shellRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "shell",
    component: AppShell,
  });

  const explorerRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/",
    component: ExplorerPage,
  });

  const resourceListRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/resources/$group/$version/$resource",
    component: ResourceListPage,
  });

  const resourceListNsRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/resources/$group/$version/$resource/n/$namespace",
    component: ResourceListPage,
  });

  const resourceDetailRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/resources/$group/$version/$resource/$name",
    component: ResourceDetailPage,
  });

  const resourceDetailNsRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "/resources/$group/$version/$resource/n/$namespace/$name",
    component: ResourceDetailPage,
  });

  const routeTree = rootRoute.addChildren([
    shellRoute.addChildren([
      explorerRoute,
      resourceListRoute,
      resourceListNsRoute,
      resourceDetailRoute,
      resourceDetailNsRoute,
    ]),
  ]);

  return createRouter({ routeTree });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
