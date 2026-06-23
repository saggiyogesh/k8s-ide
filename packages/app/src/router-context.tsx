import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { K8sApiClient } from "@k8s-ide/api-client";

export interface AppRouterContext {
  client: K8sApiClient;
}

export const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: () => <Outlet />,
});
