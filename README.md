# k8s-ide

Cross-platform Kubernetes IDE monorepo built around a shared Go Kubernetes engine and a shared React application. The same API surface is consumed by a web SPA, a Tauri desktop shell, and a responsive mobile/PWA companion.

## Workspace layout

- `apps/backend` - Go HTTP/WebSocket API and shared Kubernetes engine
- `apps/web` - Vite React wrapper for the shared app package
- `apps/desktop` - Tauri shell plus thin React wrapper for the shared app package
- `packages/core` - shared Kubernetes models and capability helpers
- `packages/api-client` - shared HTTP/WebSocket client
- `packages/store` - TanStack Query and Zustand state
- `packages/ui` - reusable explorer and detail pane components
- `packages/app` - shared application shell used by web and desktop

## Getting started

```bash
pnpm install
pnpm build
pnpm --filter @k8s-ide/web dev
pnpm --filter @k8s-ide/desktop dev
pnpm --filter @k8s-ide/backend build
./apps/backend/bin/server
```

The backend binds to `127.0.0.1:7447` by default and reads the default kubeconfig unless one is provided via `--kubeconfig`.
