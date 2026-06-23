# K8s IDE — Cross-Platform Kubernetes IDE

A single-user, cross-platform Kubernetes IDE built around one shared Go Kubernetes engine and one shared React application. Tauri packages the desktop shell, web connects to the same backend, and mobile uses the same responsive React app as a PWA companion.

## Architecture

```
k8s-ide/
├── apps/
│   ├── desktop/          # Tauri 2 shell — starts the Go sidecar, hosts the React app
│   ├── web/              # Vite SPA — connects to a locally-running or self-hosted backend
│   └── backend/          # Go K8s engine — discovery, dynamic CRUD, watch, logs, exec
├── packages/
│   ├── core/             # Shared TypeScript types: ClusterContext, KubeResource, WatchEvent, …
│   ├── api-client/       # Single K8sApiClient contract + HttpK8sApiClient implementation
│   ├── store/            # TanStack Query cache keys/hooks + Zustand session/UI state
│   ├── ui/               # Shared React components: ResourceTable, YamlEditor, Sidebar, …
│   └── app/              # Shared route tree, AppShell, ExplorerPage
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 (Rust thin wrapper) |
| Frontend | React 19, TypeScript, Vite |
| Styling | TailwindCSS + Radix UI primitives |
| Data fetching | TanStack Query v5 |
| UI state | Zustand |
| Virtualisation | TanStack Virtual |
| YAML editing | CodeMirror 6 |
| Monorepo | Turborepo + pnpm workspaces |
| Backend | Go + chi + client-go |
| Watch streaming | gorilla/websocket |

## Getting Started

### Prerequisites

- Node 20+, pnpm 9+
- Go 1.22+
- A valid kubeconfig at `~/.kube/config` (or set `$KUBECONFIG`)
- (Desktop only) Rust + Tauri CLI v2

### Install dependencies

```sh
pnpm install
```

### Start the backend

```sh
cd apps/backend
go run ./cmd/server
# Listening on http://127.0.0.1:8080
```

### Start the web app

```sh
pnpm --filter @k8s-ide/web dev
# http://localhost:3000  (proxies /api and /ws to :8080)
```

### Start the desktop app (Tauri dev mode)

```sh
pnpm --filter @k8s-ide/desktop tauri:dev
```

### Build all packages

```sh
pnpm build
```

### Run backend tests

```sh
cd apps/backend && go test ./...
```

## Backend API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/contexts` | List kubeconfig contexts |
| POST | `/api/session/open` | Activate a context |
| GET | `/api/discovery` | All discovered API resources |
| GET | `/api/resources/:group/:version/:resource` | List resources |
| GET | `/api/resources/:group/:version/:resource/:name` | Get cluster-scoped resource |
| GET | `/api/resources/:group/:version/:resource/n/:namespace/:name` | Get namespaced resource |
| POST | `/api/resources/apply` | Apply YAML (server-side apply) |
| DELETE | `/api/resources/:group/:version/:resource/:name` | Delete resource |
| POST | `/api/actions/scale` | Scale a workload |
| POST | `/api/actions/restart` | Rollout restart a workload |
| WS | `/ws/watch?group=&version=&resource=&namespace=` | Watch resource events |
| WS | `/ws/logs/:namespace/:pod` | Stream pod logs |

## Shared Packages

### `@k8s-ide/core`
Pure TypeScript types shared by every layer. No runtime dependencies.

### `@k8s-ide/api-client`
The `K8sApiClient` interface plus `HttpK8sApiClient`. One implementation used by desktop, web, and mobile.

### `@k8s-ide/store`
TanStack Query hooks with shared cache keys plus three Zustand stores:
- `useSessionStore` — active context, connection status
- `useExplorerStore` — selected resource, namespace, filters
- `usePreferencesStore` — theme, refresh policy, last namespace

### `@k8s-ide/ui`
Shared React components: `ResourceTable` (virtualised), `YamlEditor` (CodeMirror 6), `ResourceDetail`, `Sidebar`, `ContextSwitcher`, `Badge`, `Button`.

### `@k8s-ide/app`
`AppShell` + `ExplorerPage` — the complete product UI. Desktop, web, and mobile are thin entrypoints that wrap this.

## Build Phases

| Phase | Scope |
|-------|-------|
| 1 — Foundation | ✅ Monorepo, Go backend, shared packages, explorer shell |
| 2 — Stability | Discovery cache, watch multiplexing, relist recovery, events |
| 3 — Actions | Logs, exec, port-forward, scale, rollout restart |
| 4 — Web | Self-hosted backend hardening, web-app settings |
| 5 — Mobile | Responsive/PWA companion |
