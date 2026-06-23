# Kubernetes IDE Monorepo

Shared single-user Kubernetes IDE foundation built as a pnpm + Turborepo monorepo.

## Workspace layout

```text
apps/
  backend/   Go Kubernetes engine + HTTP / websocket API
  desktop/   Tauri desktop shell that starts the local backend
  web/       Vite web client and responsive PWA wrapper
packages/
  app/       Shared React application shell and explorer composition
  api-client Shared HTTP / websocket Kubernetes API client
  core/      Shared resource types, refs, and capability helpers
  store/     TanStack Query + Zustand state wiring
  ui/        Shared explorer, table, YAML, and detail components
```

## What is scaffolded

- Turborepo + pnpm workspace orchestration
- Shared TypeScript, ESLint, and Prettier configuration
- Shared React app consumed by both `apps/web` and `apps/desktop`
- Go backend with:
  - kubeconfig context loading
  - session opening
  - discovery
  - dynamic list/get/apply/delete
  - workload scale and restart actions
  - watch multiplexing
  - websocket log streaming
- Tauri desktop shell scaffold with backend sidecar lifecycle commands

## Getting started

### Install dependencies

```bash
pnpm install
```

### Run validation

```bash
pnpm typecheck
pnpm lint
pnpm build
```

### Start the backend

```bash
pnpm --filter @k8s-ide/backend dev
```

The backend listens on `127.0.0.1:43210` by default.

### Start the web client

```bash
pnpm --filter @k8s-ide/web dev
```

### Start the desktop shell

```bash
pnpm --filter @k8s-ide/desktop tauri:dev
```

Set `K8S_IDE_BACKEND_BINARY` if you want the desktop shell to launch a custom backend binary.

## Notes

- The backend intentionally keeps cluster access inside Go so desktop and web share the same engine.
- The desktop and web entrypoints are thin wrappers around `@k8s-ide/app`.
- Exec and port-forward transports are scaffolded at the API boundary and can be filled in next.
