# Kubernetes IDE Monorepo

Single-user, cross-platform Kubernetes IDE scaffold built around one shared Go backend and one shared React app. The repository is organized as a pnpm + Turborepo workspace so desktop, web, and future mobile surfaces can reuse the same domain model, API client, state layer, and explorer UI.

## Workspace layout

```text
apps/
  backend/   Go Kubernetes engine + HTTP/WS API scaffold
  desktop/   Tauri desktop shell + shared React entrypoint
  web/       Vite web shell + shared React entrypoint
packages/
  app/       Shared application shell and route composition
  api-client Shared HTTP/WS Kubernetes client
  core/      Shared Kubernetes resource models and capability helpers
  store/     TanStack Query + Zustand state wiring
  ui/        Shared explorer, table, and YAML panel components
```

## Getting started

### Frontend workspace

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
```

### Go backend

```bash
cd apps/backend
GOTOOLCHAIN=local go test ./...
go run ./cmd/server
```

The backend binds to `127.0.0.1:9845` by default.

### Desktop shell

The desktop shell is scaffolded with Tauri 2.0 and now resolves against a Rust-1.83-compatible crate set. On Linux it still requires the standard GTK/WebKit system development libraries before `cargo check` or a full Tauri build will succeed, for example:

```bash
sudo apt-get update
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

## Current scaffold coverage

- Shared `packages/core` domain types for contexts, discovery, resource refs, actions, and capabilities
- Shared `packages/api-client` HTTP/WS client contract used by every frontend
- Shared `packages/store` query key factory and Zustand session/UI stores
- Shared `packages/ui` explorer shell, resource list, capability bar, and YAML editor panel
- Shared `packages/app` React explorer shell wired to the backend API
- Web and desktop wrappers that render the shared app
- Go backend routes for contexts, sessions, discovery, list/get/delete/apply, restart, scale, and scaffolded watch/log/exec sockets

## Notes

- The repository currently emphasizes a verified foundation over full feature depth: core CRUD/discovery paths compile and the advanced watch/log/exec/port-forward behavior is scaffolded for follow-up iterations.
- Mobile/PWA-specific flows, multiplexed watches, relist recovery, and workload action expansion are intentionally left for later phases.
