# Kubernetes IDE Monorepo

Single-user Kubernetes IDE scaffolded as a pnpm + Turborepo monorepo with:

- one shared Go backend in `apps/backend`
- one shared React application in `packages/app`
- thin `apps/web` and `apps/desktop` wrappers
- shared TypeScript contracts, client, store, and UI packages

## Workspace layout

```text
apps/
  backend/   Go kubeconfig/discovery/dynamic API server
  desktop/   Tauri shell + desktop React entrypoint
  web/       Vite React web wrapper
packages/
  api-client Shared HTTP/WS Kubernetes API client
  app/       Shared React explorer composition
  core/      Resource/session/discovery types and helpers
  store/     TanStack Query + Zustand state wiring
  ui/        Shared explorer layout and detail components
```

## Current foundation

### Shared packages

- `@k8s-ide/core`
  - cluster/session types
  - discovery/resource contracts
  - resource capability helpers
- `@k8s-ide/api-client`
  - shared `K8sApiClient` interface
  - `HttpK8sApiClient` implementation for HTTP + WebSocket routes
- `@k8s-ide/store`
  - TanStack Query client factory
  - Zustand stores for session, explorer, and preferences
- `@k8s-ide/ui`
  - explorer layout shell
  - discovered resource sidebar
  - generic resource table and detail panel
- `@k8s-ide/app`
  - reusable explorer screen mounted by both web and desktop

### Backend

`apps/backend` currently provides:

- kubeconfig loading and active-context session state
- context listing and session opening
- discovery via `client-go`
- generic list/get/delete routes via the dynamic client
- multi-document YAML apply via server-side apply
- basic scale and rollout restart actions
- a basic watch WebSocket stream

The logs, exec, and port-forward route shapes are scaffolded but still return `501 Not Implemented`.

## Commands

From the repository root:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
```

Backend only:

```bash
cd apps/backend
go test ./...
go run ./cmd/server --addr 127.0.0.1:7319
```

Web only:

```bash
pnpm --filter @k8s-ide/web dev
```

Desktop shell wrapper:

```bash
pnpm --filter @k8s-ide/desktop dev
pnpm --filter @k8s-ide/desktop tauri:dev
```

## Notes

- The desktop Tauri wrapper is scaffolded and its React side builds, but the Rust/Tauri native check currently depends on a newer Cargo-compatible transitive crate than this environment provides.
- The repository is ready for the next implementation slice: richer backend streams/actions, YAML editor and detail panes, discovery caching, and end-to-end smoke coverage.
