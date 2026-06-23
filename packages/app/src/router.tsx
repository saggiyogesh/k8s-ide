import { createRoute, createRouter } from "@tanstack/react-router";
import type { K8sApiClient } from "@k8s-ide/api-client";
import { AppShell } from "./shell/AppShell.js";
import { ExplorerPage } from "./pages/ExplorerPage.js";
import { rootRoute } from "./router-context.js";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ExplorerPage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export function createAppRouter(client: K8sApiClient) {
  return createRouter({
    routeTree,
    context: { client },
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

export function App({ client }: { client: K8sApiClient }) {
  const router = createAppRouter(client);
  return <AppShell router={router} client={client} />;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

export type { AppRouterContext } from "./router-context.js";
