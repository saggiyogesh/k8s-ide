# k8s-ide

A single-user, cross-platform Kubernetes IDE built around one shared Go Kubernetes engine and one shared React app.

## Architecture

```
k8s-ide/
├── apps/
│   ├── desktop/        # Tauri 2 shell + sidecar lifecycle
│   ├── web/            # React SPA / PWA
│   └── backend/        # Go K8s engine + HTTP/WS server
├── packages/
│   ├── core/           # Resource types, discovery models, capability helpers
│   ├── api-client/     # Shared HTTP/WS K8sApiClient contract + implementation
│   ├── store/          # TanStack Query + Zustand state
│   ├── ui/             # Shared React components (sidebar, table, detail, YAML)
│   └── app/            # Shared route tree and layout
├── turbo.json
└── pnpm-workspace.yaml
```

## Technology Stack

| Layer | Technologies |
|---|---|
| Desktop shell | Tauri 2 (Rust), sidecar process management |
| Web frontend | React 19, TypeScript, Vite, TailwindCSS |
| State & data | TanStack Query v5, Zustand v5 |
| Virtualization | TanStack Virtual v3 |
| Go backend | chi, client-go (discovery + dynamic), gorilla/websocket |

## Prerequisites

- **Node.js** ≥ 20, **pnpm** ≥ 9
- **Go** ≥ 1.22
- **Rust + Tauri CLI** (desktop only): `cargo install tauri-cli`
- A running Kubernetes cluster with a valid `~/.kube/config`

## Quick Start

### 1. Install JavaScript dependencies

```bash
pnpm install
```

### 2. Run the Go backend

```bash
cd apps/backend
go run ./cmd/server          # defaults to :8080
# or
make run
```

### 3. Run the web app

```bash
pnpm --filter @k8s-ide/web dev   # http://localhost:3000
```

The web dev server proxies `/api` and `/ws` to `localhost:8080`.

### 4. Run the desktop app (requires Tauri/Rust toolchain)

```bash
cd apps/desktop
pnpm dev:tauri
```

## Go Backend API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Health check |
| `GET` | `/api/contexts` | List kubeconfig contexts |
| `POST` | `/api/session/open` | Open a context session |
| `GET` | `/api/discovery` | Server-side API discovery |
| `GET` | `/api/resources/{group}/{version}/{resource}` | List cluster-scoped resources |
| `GET` | `/api/resources/{group}/{version}/{resource}/{name}` | Get cluster-scoped resource |
| `GET` | `/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}` | Get namespaced resource |
| `POST` | `/api/resources/apply` | Server-side apply YAML |
| `DELETE` | `/api/resources/{group}/{version}/{resource}/{name}` | Delete cluster-scoped resource |
| `DELETE` | `/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}` | Delete namespaced resource |
| `POST` | `/api/actions/scale` | Scale a workload |
| `POST` | `/api/actions/restart` | Rollout-restart a workload |
| `WS` | `/ws/watch?group=&version=&resource=&namespace=` | Watch resource events |
| `WS` | `/ws/logs/{namespace}/{pod}/{container}` | Stream pod logs |

> Use `core` as the group placeholder for core API resources (e.g. Pods, Services).

## Development

```bash
# Typecheck all packages
pnpm typecheck

# Build everything
pnpm build

# Go backend tests
cd apps/backend && go test ./...

# Go backend lint
cd apps/backend && go vet ./...
```

## Monorepo Tooling

- **Turborepo** orchestrates build/typecheck/lint across packages.
- **pnpm workspaces** manages JavaScript dependencies.
- All shared TypeScript config extends `tsconfig.base.json` at the root.
- ESLint config is at the root `eslint.config.js`; Prettier at `.prettierrc.json`.

## Design Principles

- **One backend** — all Kubernetes logic lives in the Go engine; the Tauri shell only manages the sidecar process.
- **Discovery-first** — unknown CRDs and resources work without frontend changes via `client-go` dynamic client + server-side discovery.
- **Watch multiplexing** — one shared watch connection per `{group/version/resource/namespace}` fans out to all subscribers.
- **Single-user by default** — backend binds loopback only; remote exposure is a deliberate later step.
