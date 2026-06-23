# k8s-ide

Single-user Kubernetes IDE scaffolded as a Turborepo monorepo with:

- one shared Go backend in `apps/backend`
- one shared React application in `packages/app`
- thin platform shells for `apps/web` and `apps/desktop`
- shared frontend packages for core models, API access, state, and UI

## Workspace layout

```text
apps/
  backend/   Go HTTP and WebSocket API scaffold
  desktop/   Tauri desktop wrapper for the shared React app
  web/       Vite web/PWA wrapper for the shared React app
packages/
  api-client/  Shared HTTP/WS client
  app/         Shared application shell and explorer screens
  core/        Shared resource models and capability helpers
  store/       TanStack Query and Zustand state wiring
  ui/          Shared React UI primitives
```

## Commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

The backend listens on `:8787` by default and exposes the planned `/api/*` and `/ws/*`
contracts already used by the shared frontend packages.
