# Kubernetes IDE Monorepo

Cross-platform Kubernetes IDE scaffold built around one shared Go backend engine and one shared React application.

## Workspace layout

```text
apps/
  backend/   Go Kubernetes engine + HTTP/WS API
  desktop/   Tauri desktop shell hosting the shared React app
  web/       Vite-powered web wrapper around the shared React app
packages/
  app/               Shared routed React application
  api-client/        Shared HTTP / WebSocket Kubernetes API client
  core/              Shared types, resource models, and capability helpers
  store/             TanStack Query and Zustand state wiring
  ui/                Reusable explorer, detail, and editor components
  config-eslint/     Shared ESLint flat config
  config-typescript/ Shared TS config presets
```

## Key commands

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm test
go test ./apps/backend/...
```

## Development entrypoints

- Web app: `pnpm --filter @k8s-ide/web dev`
- Desktop shell UI: `pnpm --filter @k8s-ide/desktop dev`
- Desktop Tauri app: `pnpm --filter @k8s-ide/desktop tauri:dev`
- Go backend: `pnpm backend:dev`

## Current scaffold coverage

- Shared TypeScript workspace with Turbo + pnpm
- Shared React explorer app and UI primitives
- Shared core resource models and HTTP/WS API client
- Go backend session, discovery, generic CRUD/apply, watch, and logs routes
- Tauri shell with backend lifecycle command scaffolding

## Known environment requirement

The Tauri Rust shell requires GTK3 development libraries on Linux (`gdk-3.0` and related packages). The repo compiles through JS/TS and Go verification already, but full desktop Rust builds need those system packages installed in the agent image.
