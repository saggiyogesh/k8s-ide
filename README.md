# k8s-ide

Kubernetes IDE monorepo scaffold for a single-user, cross-platform workflow:
one shared Go Kubernetes engine, one shared React application, a Tauri desktop
shell, and a self-hostable web client.

## Workspace layout

```text
apps/
  backend/   Go Kubernetes engine and HTTP/WS API
  desktop/   Tauri shell and thin React entrypoint
  web/       Vite web wrapper around the shared app package
packages/
  api-client Shared HTTP and WebSocket client contract
  app/       Shared route tree and application composition
  core/      Resource types, discovery models, and helpers
  store/     TanStack Query and Zustand state wiring
  ui/        Shared explorer and detail components
```

## Getting started

```bash
pnpm install
pnpm --filter @k8s-ide/backend dev
pnpm --filter @k8s-ide/web dev
pnpm --filter @k8s-ide/desktop dev
```

The backend listens on `http://127.0.0.1:3010` by default. Frontends can override
the backend URL with `VITE_BACKEND_URL`, while the desktop shell also exposes a
`get_backend_url` command from Tauri for local sidecar integration.
