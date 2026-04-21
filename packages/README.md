# packages/

Workspace packages introduced in **C-1** as the skeleton for the
monorepo split described in the audit report §4.2.  Direction **A**
finished the physical move of `shared/`, `ui/`, and `browser-shell/`
into the workspace tree. **PR-4–6** physically removed the old
`src/pipeline`, `src/routes`, `src/adapters`, `src/cli`, and `src/cir`
trees; canonical sources for the engine, routes, and adapters live under
`packages/*` and `apps/server/src/`. The repo root **`src/`** directory was removed in **PR-7** (see `docs/src-root-migration-map.md`).

| Package | Status | Notes |
|---|---|---|
| `@ai-video/lib` | **physical move complete** (C-2 + B-codemod) | Canonical sources live at `packages/lib/src/`. Every call site under `src/` was rewritten to `import … from '@ai-video/lib/<name>.js'` by `scripts/codemod-import-aliases.mjs`, and the old `src/lib/*.ts` re-export shims were retired. |
| `@ai-video/shared` | **physical move complete** (A-1) | Sources live at `packages/shared/src/`; the legacy top-level `shared/` directory was retired. Every backend/UI/desktop call site imports via `@ai-video/shared/<name>.js`. |
| `@ai-video/pipeline-core` | **canonical engine** | Sources live at `packages/pipeline-core/src/` (orchestrator, stage registry/runner, providers, adapters used by the pipeline, `ProjectStore`, …). |
| `@ai-video/pipeline-video` | **video stages + CIR** | Sources at `packages/pipeline-video/src/` — registers built-in video stages and owns `cir/` IR types; shared assembler helpers re-export from `@ai-video/pipeline-core` where applicable. |
| `@ai-video/adapter-common` | **shared adapter utilities** | Sources at `packages/adapter-common/src/` — retry helpers (`@ai-video/lib`), prompt sanitizers, response parsers. |
| `@ai-video/site-strategies` | **site strategies** | Sources at `packages/site-strategies/src/` — `jimengStrategy`, `klingStrategy`, `resolveSiteStrategy`, chat automation helpers consumed by the engine. |

Apps under `../apps/`:

| App | Status | Notes |
|---|---|---|
| `@ai-video/app-server` | **runtime activated** (Phase 3A) | `apps/server/src/main.ts` is the backend entry. Route modules, bootstrap, wiring, and runtime live under `apps/server/src/`. Repo-root `src/server.ts` was removed (PR-7). |
| `@ai-video/app-ui-shell` | **physical move complete** (A-2) | Vite + React frontend lives at `apps/ui-shell/`. Pulls `@ai-video/shared` via the workspace symlink + a vite alias for dev mode. |
| `@ai-video/app-desktop` | **physical move complete** (A-3) | Electron browser-shell lives at `apps/desktop/`. `scripts/build-sidecar.sh`, `electron-builder.json`, `tsconfig.json`, and CI workflows were updated accordingly. The legacy user-data path is preserved by `app.setName('ai-video-browser-shell')` in `main.ts`. |

## Install layout

The root `package.json` declares `"workspaces": ["packages/*",
"apps/*"]`.  `npm ci` from the repo root installs every workspace
package's deps into the hoisted `node_modules/` and symlinks
`@ai-video/*` to the corresponding source folder.  After direction A
finished, `apps/ui-shell/` and `apps/desktop/` are real workspaces
too, so the previous "two extra `npm ci` steps in CI" disappeared.

## Vitest

`vitest.config.ts` declares dedicated `packages` and `apps` projects
so `npm test` automatically picks up `packages/*/src/**/*.test.ts`
and `apps/*/src/**/*.test.ts`.  The ui-shell tree is excluded from
the `apps` project because its React component tests run through the
dedicated `apps/ui-shell/vite.config.ts` jsdom project.
