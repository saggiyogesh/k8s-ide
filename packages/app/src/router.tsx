import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ExplorerPage } from './explorer-page';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ExplorerPage,
});

const resourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/$group/$version/$resource',
  component: ExplorerPage,
});

const routeTree = rootRoute.addChildren([indexRoute, resourcesRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
