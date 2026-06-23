# k8s-ide — Kubernetes IDE Monorepo

A single-user, cross-platform Kubernetes IDE built around one shared Go Kubernetes engine and one shared React application.

## Architecture

```
apps/desktop   Tauri 2 shell — starts the local Go sidecar, hosts React app
apps/web       React SPA / PWA — self-hostable, same React app
apps/backend   Go HTTP/WS server — kubeconfig, discovery, dynamic CRUD, watch

packages/core       Resource types, discovery models, capability helpers (TS)
packages/api-client Shared HTTP/WebSocket client contract (TS)
packages/store      TanStack Query + Zustand state (TS/React)
packages/ui         Explorer, table, YAML editor, action bar components (React)
packages/app        Shared route tree and page composition (React)
```

## Prerequisites

| Tool       | Minimum version |
|------------|----------------|
| Node.js    | 20              |
| pnpm       | 9               |
| Go         | 1.23            |
| Rust       | 1.77 (for Tauri desktop) |

## Quick start

```bash
# Install frontend dependencies
pnpm install

# Build all TypeScript packages
pnpm build

# Start the Go backend (requires a valid kubeconfig)
cd apps/backend && go run ./cmd/server

# In another terminal, start the web dev server
cd apps/web && pnpm dev
# → http://localhost:5173 (proxies /api and /ws to the backend on :7080)
```

## Go backend

```bash
cd apps/backend

# Build
go build -o bin/k8s-ide-server ./cmd/server

# Run (default: 127.0.0.1:7080, default kubeconfig)
./bin/k8s-ide-server

# Override address or kubeconfig
./bin/k8s-ide-server -addr 0.0.0.0:7080 -kubeconfig ~/.kube/config

# Run tests
go test ./...
```

### API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/contexts` | List kubeconfig contexts |
| POST | `/api/session/open` | Activate a context |
| GET | `/api/discovery` | All discovered API resources |
| GET | `/api/resources/{group}/{version}/{resource}` | List cluster-scoped resources |
| GET | `/api/resources/{group}/{version}/{resource}/n/{namespace}` | List namespaced resources |
| GET | `/api/resources/{group}/{version}/{resource}/{name}` | Get cluster-scoped resource |
| GET | `/api/resources/{group}/{version}/{resource}/n/{namespace}/{name}` | Get namespaced resource |
| POST | `/api/resources/apply` | Server-side apply YAML |
| DELETE | `/api/resources/...` | Delete resource |
| POST | `/api/actions/scale` | Scale a workload |
| POST | `/api/actions/restart` | Rollout restart |
| POST | `/api/actions/port-forward` | Initiate port-forward |
| WS | `/ws/watch?group=&version=&resource=&namespace=` | Watch events |
| WS | `/ws/logs/{namespace}/{pod}/{container}` | Stream pod logs |
| WS | `/ws/exec/{namespace}/{pod}/{container}` | Exec into pod |

> **Core group resources**: use `_` as the `{group}` path segment (maps to the empty core group).

## Desktop app (Tauri)

```bash
cd apps/desktop

# Development (requires Rust + Tauri CLI)
pnpm tauri dev

# Production build
pnpm tauri build
```

The desktop shell starts and monitors the bundled `k8s-ide-server` binary as a sidecar.  The React frontend always points to `http://127.0.0.1:7080`.

## Monorepo commands

```bash
pnpm build        # Build all packages in dependency order
pnpm dev          # Start all dev servers concurrently
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages
pnpm format       # Format all files with Prettier
pnpm test         # Run all tests
```

## Package details

### `@k8s-ide/core`
Shared TypeScript types and pure helpers:
- `ClusterContext`, `ApiResourceDescriptor`, `ResourceRef`, `KubeResource`, `WatchEvent`
- `buildCapabilities()` — derives `ResourceCapabilities` from discovery verbs
- `refKey()`, `resourceRoute()`, `gvString()`, `supportsLogs()`, etc.

### `@k8s-ide/api-client`
One client contract (`K8sApiClient`) with a single HTTP/WebSocket implementation (`HttpK8sApiClient`).  WebSocket streams are exposed as `AsyncGenerator`.

### `@k8s-ide/store`
- `useSessionStore` — active context, namespace, backend status (persisted)
- `useExplorerStore` — selected resource, active GVR, pane layout
- `usePreferencesStore` — theme, refresh policy, font size (persisted)
- TanStack Query hooks: `useContexts`, `useDiscovery`, `useResourceList`, `useResource`, `useApplyYaml`, `useDeleteResource`

### `@k8s-ide/ui`
- `ResourceSidebar` — grouped API resource navigation
- `ResourceTable` — virtualised resource list (TanStack Virtual)
- `ResourceDetail` — tabbed detail pane (Overview, YAML, Events, Logs, Terminal)
- `ActionBar` — capability-driven action buttons
- `ContextSwitcher` — context selector with backend status indicator

### `@k8s-ide/app`
- `AppShell` — root component with QueryClient and API client providers
- `ExplorerLayout` — wires sidebar + table + detail pane together
- `ClientProvider` / `useClient` — React context for the API client

## Technology choices

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 + Rust (sidecar lifecycle only) |
| Frontend | React 19, TypeScript, Vite |
| Styling | TailwindCSS (CSS variables for theming) |
| Navigation | TanStack Router |
| Data fetching | TanStack Query v5 |
| Virtualisation | TanStack Virtual v3 |
| State | Zustand v5 |
| Backend | Go, chi router, client-go, gorilla/websocket |
| Monorepo | Turborepo + pnpm workspaces |

## Build phases

| Phase | Status |
|-------|--------|
| 1 — Foundation (monorepo, backend, explorer shell) | ✅ Scaffolded |
| 2 — Stability (discovery cache, watch multiplexing, virtual tables) | Pending |
| 3 — Workload actions (logs, exec, port-forward, scale, restart) | Pending |
| 4 — Web self-hosted mode | Pending |
| 5 — Mobile/PWA companion | Pending |
