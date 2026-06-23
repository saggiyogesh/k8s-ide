# k8s-ide

Cross-platform Kubernetes IDE monorepo scaffold built around one shared Go backend and one shared React application.

## Workspace layout

```text
apps/
  backend/   Go Kubernetes engine + HTTP/WebSocket API
  desktop/   Tauri desktop shell that hosts the shared app
  web/       Vite web wrapper around the shared app
packages/
  app/       Shared React app composition and routes
  api-client Shared HTTP/WebSocket API client
  core/      Shared Kubernetes domain types and helpers
  store/     TanStack Query + Zustand state
  ui/        Shared explorer and editor components
```

## Commands

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm --filter @k8s-ide/web dev
pnpm --filter @k8s-ide/desktop desktop:dev
pnpm --filter @k8s-ide/backend dev
```

## Current scaffold status

- Turborepo + pnpm workspaces configured
- Shared TypeScript packages scaffolded
- Web and desktop wrappers point at the same shared React app
- Go backend exposes context, discovery, resource, apply, and action route foundations
- WebSocket surfaces for watch, logs, and exec are wired for later feature expansion
