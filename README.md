# K8s IDE

A single-user, cross-platform Kubernetes IDE built around one shared Go Kubernetes engine and one shared React app.

## Architecture

- **Go backend** (`apps/backend`) — kubeconfig loading, discovery, dynamic CRUD, watches, and workload actions
- **Shared React app** (`packages/app` + `packages/ui`) — explorer, virtualized tables, YAML editor, detail panes
- **Desktop** (`apps/desktop`) — Tauri 2 shell that manages the local Go backend sidecar
- **Web** (`apps/web`) — self-hostable SPA with API proxy to the same backend

## Packages

| Package | Description |
|---------|-------------|
| `@k8s-ide/core` | Resource types, discovery models, capability helpers |
| `@k8s-ide/api-client` | Shared `HttpK8sApiClient` (HTTP + WebSocket) |
| `@k8s-ide/store` | TanStack Query keys + Zustand session/explorer state |
| `@k8s-ide/ui` | Shared React components (explorer, table, YAML editor) |
| `@k8s-ide/app` | Shared app shell and route composition |

## Prerequisites

- Node.js 22+
- pnpm 10+
- Go 1.22+
- Rust (for Tauri desktop builds)
- A valid kubeconfig at `~/.kube/config` (or set `KUBECONFIG`)

## Quick Start

```bash
# Install dependencies
pnpm install

# Build shared packages
pnpm build

# Terminal 1: start the Go backend (listens on 127.0.0.1:9470)
pnpm --filter @k8s-ide/backend dev

# Terminal 2: start the web UI (proxies /api and /ws to backend)
pnpm --filter @k8s-ide/web dev
```

Open http://localhost:5173 and select a kubeconfig context.

### Desktop (Tauri)

```bash
# Build the Go backend binary for sidecar bundling
pnpm --filter @k8s-ide/backend build

# Copy binary into Tauri external bin path (platform-specific name)
mkdir -p apps/desktop/src-tauri/bin
cp apps/backend/bin/server apps/desktop/src-tauri/bin/server-x86_64-unknown-linux-gnu

# Run Tauri dev (requires Rust toolchain)
pnpm --filter @k8s-ide/desktop tauri dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/contexts` | List kubeconfig contexts |
| POST | `/api/session/open` | Activate a context |
| GET | `/api/discovery` | API resource discovery |
| GET | `/api/resources/:group/:version/:resource` | List resources |
| GET | `/api/resources/.../:name` | Get resource |
| POST | `/api/resources/apply` | Apply YAML |
| DELETE | `/api/resources/.../:name` | Delete resource |
| POST | `/api/actions/scale` | Scale deployment/statefulset |
| POST | `/api/actions/restart` | Rollout restart |
| WS | `/ws/watch` | Resource watch stream |

## Development

```bash
pnpm lint        # ESLint across packages
pnpm typecheck   # TypeScript check
pnpm format      # Prettier
```

## License

MIT
