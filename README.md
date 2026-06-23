# K8s IDE

A single-user, cross-platform Kubernetes IDE built around one shared Go Kubernetes engine and one shared React app.

## Architecture

- **Go backend** (`apps/backend`) — kubeconfig loading, discovery, dynamic CRUD, watches, scale/restart actions
- **Shared React app** (`packages/app` + `packages/ui`) — explorer layout, resource tables, YAML editor
- **Web client** (`apps/web`) — self-hostable SPA with Vite dev proxy to the backend
- **Desktop shell** (`apps/desktop`) — Tauri 2 wrapper that spawns the Go backend as a sidecar

## Prerequisites

- Node.js 22+
- pnpm 10+
- Go 1.22+
- Rust toolchain (desktop only)
- A valid kubeconfig at `~/.kube/config` (or set `KUBECONFIG`)

## Quick start

```bash
# Install dependencies
pnpm install

# Build shared packages
pnpm build

# Terminal 1: start the Go backend
cd apps/backend && make run

# Terminal 2: start the web UI
pnpm --filter @k8s-ide/web dev
```

Open http://localhost:5173, pick a context, and browse discovered resources.

## Monorepo layout

```
apps/
  backend/     Go K8s engine + HTTP/WS API
  web/         React SPA / PWA wrapper
  desktop/     Tauri shell + backend sidecar lifecycle
packages/
  core/        Resource types, discovery models, capability helpers
  api-client/  Shared HttpK8sApiClient
  store/       TanStack Query + Zustand state
  ui/          Explorer, tables, YAML editor components
  app/         Shared routes and page composition
```

## Backend API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/contexts` | List kubeconfig contexts |
| POST | `/api/session/open` | Activate a context |
| GET | `/api/discovery` | API resource discovery |
| GET | `/api/resources/:group/:version/:resource` | List resources |
| GET | `/api/resources/.../:name` | Get resource |
| POST | `/api/resources/apply` | Apply YAML |
| DELETE | `/api/resources/.../:name` | Delete resource |
| POST | `/api/actions/scale` | Scale workload |
| POST | `/api/actions/restart` | Rollout restart |
| WS | `/ws/watch` | Resource watch stream |

Default listen address: `127.0.0.1:9475`

## Desktop development

```bash
# Build backend binary for sidecar bundling
cd apps/backend && make build

# Copy/symlink into Tauri external bin path (platform-specific)
# Then from apps/desktop:
pnpm tauri:dev
```

## Status

This repository contains the **Phase 1 foundation**:

- Monorepo scaffolding with Turborepo + pnpm
- Shared TypeScript packages (`core`, `api-client`, `store`, `ui`, `app`)
- Go backend with contexts, discovery, list/get/apply/delete, watch multiplexing, scale/restart
- Web and desktop entrypoints hosting the shared explorer UI

Planned next: virtualized tables, logs/exec/port-forward, discovery cache hardening, kind-based integration tests, and mobile-responsive PWA views.
