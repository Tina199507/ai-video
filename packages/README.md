# packages/

Shared workspace packages for the AI Video monorepo. Each package is published as an `@ai-video/*` workspace and is symlinked into `node_modules/` by `npm install` — no separate build step is required.

---

## Package Overview

| Package | Import path | Description |
|---------|-------------|-------------|
| `lib` | `@ai-video/lib` | Shared utilities: logger, retry, path-safety, atomic JSON store, temp-file tracker. No internal deps. |
| `shared` | `@ai-video/shared` | Cross-package TypeScript types used by server, UI, and desktop. No runtime deps. |
| `pipeline-core` | `@ai-video/pipeline-core` | 15-pass compilation engine: orchestrator, stage registry, ports, project store, plugin loader. |
| `pipeline-video` | `@ai-video/pipeline-video` | Built-in video stage definitions (registered as a side-effect) + CIR types. |
| `adapter-common` | `@ai-video/adapter-common` | AI provider adapters: Gemini, ChatAdapter (Playwright), AIVideoMaker, FallbackAdapter. |
| `site-strategies` | `@ai-video/site-strategies` | Playwright site-automation strategies for video-generation websites (Jimeng, Kling). |

Each package has its own `README.md` with API details and extension guidance.

---

## Dependency Graph

```
@ai-video/app-server
  ├── pipeline-core
  ├── pipeline-video
  ├── adapter-common
  ├── site-strategies
  └── lib

pipeline-core
  ├── lib
  └── shared

pipeline-video
  ├── pipeline-core
  └── shared

adapter-common
  ├── pipeline-core
  └── lib

site-strategies
  ├── pipeline-core
  ├── adapter-common
  └── shared

lib     → (no internal deps)
shared  → (no internal deps)
```

Dependency compliance is enforced by `npm run lint:deps`. Never introduce a cycle.

---

## Testing

`vitest.config.ts` at the repo root declares a `packages` project that picks up all `packages/*/src/**/*.test.ts` files automatically. Run from the repo root:

```bash
npm test                              # all packages
npx vitest run packages/lib/src       # single package
npx vitest run --coverage             # with coverage thresholds
```
