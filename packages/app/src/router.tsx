import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { ExplorerPage } from "./pages/ExplorerPage.js";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ExplorerPage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const appRouter = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof appRouter;
  }
}

export function AppRouterProvider() {
  return <RouterProvider router={appRouter} />;
}
