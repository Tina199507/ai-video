# @ai-video/lib

Shared utility library for the AI Video monorepo. This package has no internal dependencies — it is the foundation that all other packages build on.

---

## Overview

`@ai-video/lib` provides the following primitives:

| Module | Description |
|--------|-------------|
| `logger` | Structured JSON logging factory |
| `retry` | Unified `withRetry` with quota-error detection and back-off |
| `abortable` | `AbortSignal`-aware wait helpers and abort error class |
| `pathSafety` | Path traversal guards |
| `atomicJsonStore` | Atomic JSON read/write backed by `fs.writeFile` + rename |
| `globalKvStore` | SQLite-backed key-value store for global configuration |
| `kvStore` | Abstract KV store interface |
| `sanitize` | Input sanitization helpers |
| `tempFiles` | Temporary file lifecycle tracking |
| `promMetrics` | Prometheus-compatible counter/gauge/histogram primitives |
| `autoMigrateGlobal` | SQLite migration helpers for the global store |

---

## Installation

This package is part of the monorepo workspace. It is consumed via workspace symlink — no separate install is needed.

```typescript
// Preferred: subpath import (tree-shakeable)
import { withRetry } from '@ai-video/lib/retry.js';
import { createLogger } from '@ai-video/lib/logger.js';

// Barrel import (convenience, imports everything)
import { withRetry, createLogger } from '@ai-video/lib';
```

---

## Key APIs

### `createLogger(module: string): Logger`

Returns a structured logger scoped to a module name. All output is JSON written to stdout.

```typescript
const log = createLogger('MyModule');
log.info('stage_completed', { stage: 'VIDEO_GEN', durationMs: 3200 });
// → {"ts":"…","level":"info","module":"MyModule","action":"stage_completed","stage":"VIDEO_GEN","durationMs":3200}
```

Log levels: `debug`, `info`, `warn`, `error`.

---

### `withRetry<T>(fn, options?): Promise<T>`

Executes `fn`, retrying on transient errors (5xx, 429, network timeouts) with exponential backoff. Quota errors are tagged and re-thrown immediately without retrying.

```typescript
import { withRetry } from '@ai-video/lib/retry.js';

const result = await withRetry(
  async () => {
    const res = await fetch('https://api.example.com/generate');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  {
    label: 'Example API request',
    maxRetries: 3,
    signal: abortSignal,
  },
);
```

Options (`WithRetryOptions`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `label` | `string` | `'operation'` | Label used in log output and observability counters |
| `maxRetries` | `number` | `API_MAX_RETRIES` env var (default 3) | Maximum retry attempts |
| `signal` | `AbortSignal` | — | Abort signal to cancel mid-retry |
| `onRetry` | `(obs) => void` | — | Per-retry callback for custom instrumentation |

---

### `isQuotaError(err): boolean`

Returns `true` if the error represents a provider quota exhaustion (HTTP 429 + quota-specific message). Used by `FallbackAdapter` to switch providers.

---

### `throwIfAborted(signal?): void`

Throws `AIRequestAbortedError` if the given `AbortSignal` has been aborted. Call this at the top of long-running async functions.

---

### `pathSafety`

Guards against path traversal attacks. Use `assertSafePath(base, userPath)` to validate that `userPath` stays within `base`.

```typescript
import { assertSafePath } from '@ai-video/lib/pathSafety.js';

// Throws if the resolved path escapes DATA_DIR
assertSafePath(DATA_DIR, join(DATA_DIR, userSuppliedFilename));
```

---

## Testing

```bash
# From the repo root
npx vitest run packages/lib/src
```

Coverage thresholds: 85% lines / 90% functions / 80% branches.
