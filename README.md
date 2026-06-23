# Kubernetes IDE

A cross-platform Kubernetes IDE monorepo with a shared Go backend engine and shared React frontend.

## Architecture

- **apps/backend** — Go Kubernetes engine (discovery, dynamic CRUD, watches, actions)
- **apps/web** — Self-hostable React SPA
- **apps/desktop** — Tauri 2 shell that manages the local Go backend
- **packages/core** — Shared types and capability helpers
- **packages/api-client** — HTTP/WebSocket Kubernetes API client
- **packages/store** — TanStack Query + Zustand state
- **packages/ui** — Shared React components
- **packages/app** — Shared routes and explorer pages

## Prerequisites

- Node.js 20+
- pnpm 10+
- Go 1.22+
- Rust (for desktop builds)
- A valid kubeconfig at `~/.kube/config` (or set `KUBECONFIG`)

## Quick Start

```bash
# Install dependencies
pnpm install

# Terminal 1: start the Go backend
pnpm dev:backend

# Terminal 2: start the web app
pnpm dev:web
```

Open http://localhost:5173 — the Vite dev server proxies `/api` and `/ws` to the backend on port 9475.

## Desktop Development

```bash
# Build the backend binary (recommended for desktop)
pnpm build:backend

# Run Tauri dev shell
cd apps/desktop && pnpm tauri:dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/contexts` | List kubeconfig contexts |
| POST | `/api/session/open` | Open a cluster context |
| GET | `/api/discovery` | Discover API resources |
| GET | `/api/resources/:group/:version/:resource` | List resources |
| GET | `/api/resources/.../ :name` | Get a resource |
| POST | `/api/resources/apply` | Apply YAML |
| DELETE | `/api/resources/.../ :name` | Delete a resource |
| POST | `/api/actions/scale` | Scale a workload |
| POST | `/api/actions/restart` | Rollout restart |
| WS | `/ws/watch` | Resource watch stream |
| WS | `/ws/logs/:ns/:pod` | Pod log stream |

## Project Status

Phase 1 foundation is scaffolded:

- Monorepo with Turborepo + pnpm workspaces
- Shared TypeScript packages (core, api-client, store, ui, app)
- Go backend with kubeconfig loading, discovery, CRUD, apply, scale, restart, watch, and logs
- Web and desktop entrypoints with a generic resource explorer

## License

MIT
