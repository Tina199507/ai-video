# Contributing to AI Video

Thank you for your interest in contributing. This guide covers everything you need to get started: development environment, coding standards, testing requirements, and the contribution workflow.

---

## Table of Contents

1. [Development Environment](#development-environment)
2. [Monorepo Layout](#monorepo-layout)
3. [Coding Standards](#coding-standards)
4. [Testing](#testing)
5. [CI Gate](#ci-gate)
6. [Extension Points](#extension-points)
7. [Pull Request Process](#pull-request-process)
8. [Dependency Policy](#dependency-policy)

---

## Development Environment

### Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 20.9.0 | 22 LTS recommended |
| npm | 10.x | bundled with Node 20+ |
| FFmpeg | 5.x | must be on `PATH` |
| Chromium | 120+ | managed by Playwright (`npx playwright install chromium`) |

### First-time setup

```bash
# 1. Install all workspace dependencies
npm install

# 2. Install the Playwright Chromium browser
npx playwright install chromium

# 3. Create your local config
cp .env.example .env
# Edit .env — set GEMINI_API_KEY at minimum

# 4. Start the backend (TypeScript is executed directly via tsx — no build needed)
npm run dev
# → http://localhost:3220

# 5. Start the frontend (separate terminal)
npm run dev:ui
# → http://localhost:5173
```

---

## Monorepo Layout

```
ai-video/
├── apps/
│   ├── server/          Node.js backend (main entry: apps/server/src/main.ts)
│   ├── ui-shell/        React 19 dashboard (Vite)
│   └── desktop/         Electron shell (embeds server + UI)
├── packages/
│   ├── lib/             Shared utilities (logger, retry, path-safety, …)
│   ├── shared/          Cross-package TypeScript types (used by UI, server, desktop)
│   ├── pipeline-core/   15-pass compilation engine, stage registry, ports
│   ├── pipeline-video/  Built-in video stage definitions + CIR types
│   ├── adapter-common/  AI provider adapter implementations
│   └── site-strategies/ Playwright site-automation scripts
├── data/                Prompt templates, plugin bundles, static defaults
├── scripts/             CI verification, acceptance tests, debug tools
└── docs/                Extended documentation
```

Each `packages/*` workspace corresponds to an `@ai-video/<name>` npm package. There is no build step — TypeScript is executed directly via `tsx`, and all workspace packages are symlinked into `node_modules` by npm workspaces.

### Package dependency rules

```
apps/server  →  pipeline-core, pipeline-video, adapter-common, site-strategies, lib
pipeline-core  →  lib, shared
pipeline-video →  pipeline-core, shared
adapter-common →  pipeline-core, lib
site-strategies →  pipeline-core, adapter-common, shared
lib    →  (no internal deps)
shared →  (no internal deps)
```

**Never introduce a cycle.** Run `npm run lint:deps` to verify the dependency graph after any `package.json` change.

---

## Coding Standards

### TypeScript

- All new code must be TypeScript with strict null checks. The codebase is migrating toward `tsconfig.strict.json`; run `npm run check:strict-progress` to track progress.
- Use `import type` for type-only imports.
- Prefer `interface` over `type` for object shapes that will be implemented or extended.
- Use ESM syntax (`import`/`export`). All imports of internal workspace files must use `.js` extensions (TypeScript resolves these to `.ts` at compile time).

### Naming

| Construct | Convention | Example |
|-----------|-----------|---------|
| Files | `camelCase.ts` | `stageRunner.ts` |
| Interfaces | `PascalCase` | `AIAdapter` |
| Types | `PascalCase` | `PipelineStage` |
| Functions | `camelCase` | `registerStage` |
| Constants | `SCREAMING_SNAKE_CASE` | `ARTIFACT` |
| Stage IDs | `SCREAMING_SNAKE_CASE` | `VIDEO_GEN` |

### Comments

Follow the existing pattern — a file-level block comment (`/* --- */`) for module purpose, inline JSDoc (`/** */`) for public functions and interfaces. Avoid comments that merely restate what the code does.

### Error handling

- Surface errors via `throw`; never swallow errors silently.
- Route errors must be sanitized (no internal detail in HTTP 5xx responses) — `npm run check:route-sanitize` enforces this.
- Use the `createLogger` factory from `@ai-video/lib` for structured JSON logging.

---

## Testing

The project uses [Vitest](https://vitest.dev/) with 2600+ unit tests.

### Run tests

```bash
npm test                        # run all tests once
npm run test:watch              # watch mode (re-runs on file change)
npx vitest run --coverage       # tests + coverage thresholds
```

### Coverage thresholds

Coverage is enforced in CI. Key per-package minimums:

| Package/path | Lines | Functions |
|-------------|-------|-----------|
| `packages/lib/src/**` | 85% | 90% |
| `packages/pipeline-video/src/cir/**` | 85% | 95% |
| `packages/pipeline-video/src/stages/**` | 70% | 75% |
| `packages/pipeline-core/src/**` | 58% | 58% |
| `apps/server/src/routes/**` | 65% | 65% |
| `packages/adapter-common/src/**` | 45% | 55% |

### Writing tests

- Unit test files must be co-located with their source: `src/myModule.test.ts` alongside `src/myModule.ts`.
- Use `vi.mock` from Vitest for module mocking. Avoid reaching into private internals.
- Test files in `packages/pipeline-core/src/__tests__/` are integration-style tests for the orchestrator and service layer.

---

## CI Gate

Before opening a pull request, run the full CI gate locally:

```bash
npm run ci:verify
```

This runs the following checks in order:

| Check | Command | Description |
|-------|---------|-------------|
| Dependency lint | `lint:deps:diff` | New deps comply with `TECH_CONSTRAINTS.md` |
| Package boundaries | `check:package-imports` | No direct `packages/*/src/` path imports |
| Route sanitization | `check:route-sanitize` | Error details don't leak through route handlers |
| Shim guards | `check:src-shims` etc. | Migration shim integrity |
| Typecheck backend | `build` | `tsc --noEmit` all backend workspaces |
| Strict-mode progress | `check:strict-progress` | `@ts-nocheck` count must not regress |
| Typecheck UI | workspace typecheck | Frontend TypeScript |
| Typecheck desktop | workspace typecheck | Electron TypeScript |
| Tests | `vitest run` | All 2600+ tests pass |

---

## Extension Points

The system has four primary extension surfaces. Full details are in [`docs/extending.md`](docs/extending.md).

| Surface | How to extend |
|---------|--------------|
| AI adapter | Implement `AIAdapter` in `adapter-common`, export from its `index.ts` |
| Pipeline stage | Create a `StageDefinition` in `pipeline-video/src/stages/defs/`, call `registerStage` |
| Site strategy | Implement `SiteStrategy` in `site-strategies/src/`, register in `videoSites.ts` |
| Out-of-tree plugin | Bundle a `PluginManifest`-exporting module, add to trust file |

---

## Pull Request Process

1. **Branch** off `main` with a descriptive name: `feat/add-dalle-adapter`, `fix/sse-reconnect-leak`.
2. **Scope** your PR to a single concern. Large refactors should be broken into stacked PRs.
3. **Pass CI** — the `ci:verify` gate must be green before review.
4. **Update docs** — if you add an adapter, stage, or site strategy, update the relevant package README and `docs/extending.md`.
5. **Tests** — new behaviour must have accompanying tests. Bug fixes must include a regression test.
6. **Changelog** — add an entry to `CHANGELOG.md` under `[Unreleased]`.

---

## Dependency Policy

New runtime dependencies require approval; follow the rules in `TECH_CONSTRAINTS.md` (if present) or open a discussion issue. Changes to `package.json` in any workspace are validated by `npm run lint:deps:diff` in CI.

Dev dependencies (types, test utilities) follow a lighter process — justify the addition in the PR description.

Never commit secrets or API keys. The `.gitignore` excludes `.env`; the `.env.example` file documents all supported variables.
