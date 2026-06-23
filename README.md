# Kubernetes IDE

A single-user, cross-platform Kubernetes IDE built around one shared Go Kubernetes engine and one shared React app.

## Monorepo layout

- `apps/backend` — Go K8s engine + HTTP/WebSocket API
- `apps/web` — Self-hostable React SPA / PWA
- `apps/desktop` — Tauri shell that hosts the shared React app
- `packages/core` — Shared resource types and capability helpers
- `packages/api-client` — Shared `HttpK8sApiClient`
- `packages/store` — TanStack Query + Zustand state
- `packages/ui` — Explorer, tables, YAML editor, detail panes
- `packages/app` — Shared routes and page composition

## Prerequisites

- Node.js 22+
- pnpm 10+
- Go 1.22+
- Rust toolchain (desktop only)
- A valid kubeconfig at `~/.kube/config` (or set `KUBECONFIG`)

## Quick start

```bash
pnpm install
pnpm --filter @k8s-ide/backend build

# Terminal 1: backend
pnpm --filter @k8s-ide/backend dev

# Terminal 2: web UI
pnpm --filter @k8s-ide/web dev
```

Open http://localhost:5173, pick a cluster context, and browse discovered API resources.

## Desktop dev

```bash
export K8S_IDE_BACKEND_BIN="$(pwd)/apps/backend/bin/k8s-ide-backend"
pnpm --filter @k8s-ide/backend build
pnpm --filter @k8s-ide/desktop tauri:dev
```

## API surface (MVP)

- `GET /api/health`
- `GET /api/contexts`
- `POST /api/session/open`
- `GET /api/discovery`
- `GET /api/resources/:group/:version/:resource`
- `GET /api/resources/:group/:version/:resource/n/:namespace/:name`
- `POST /api/resources/apply`
- `DELETE /api/resources/...`
- `POST /api/actions/scale`
- `POST /api/actions/restart`
- `WS /ws/watch`

## Status

Phase 1 foundation is scaffolded: monorepo tooling, shared packages, Go backend with discovery and dynamic CRUD, shared explorer UI, web app, and a Tauri desktop shell that can spawn the backend sidecar.

Next phases add watch recovery hardening, logs/exec/port-forward streams, richer workload actions, and mobile-responsive polish.
