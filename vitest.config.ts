import { defineConfig } from 'vitest/config';

// Root Vitest config — backend + workspace suites (projects API).
// Coverage (PR-2): denominator is packages plus apps/server only; root
// repo shims under top-level src are excluded. Backend tests: see
// scripts __tests__ include below. ui-shell keeps its own coverage via
// apps/ui-shell/vite.config.ts.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'backend',
          include: ['scripts/__tests__/**/*.test.ts'],
          environment: 'node',
        },
      },
      // C-1 onwards: each workspace package keeps its own src/ tree
      // and ships tests under packages/<name>/src/__tests__/. Wiring
      // the vitest project up front means a single npm test run
      // continues to cover them as new files land.
      {
        test: {
          name: 'packages',
          include: [
            'packages/*/src/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'apps',
          include: [
            'apps/*/src/**/*.test.ts',
          ],
          // ui-shell tests are jsdom-based and run via the
          // dedicated apps/ui-shell vite project below; skip them
          // here so we don't double-run them under node env.
          exclude: ['apps/ui-shell/**'],
          environment: 'node',
        },
      },
      './apps/ui-shell/vite.config.ts',
    ],
    coverage: {
      provider: 'v8',
      // C-2: include the new workspace packages so coverage for the
      // canonical lib/shared modules continues to be tracked even
      // after the physical move out of src/lib.
      include: [
        'packages/*/src/**/*.ts',
        'apps/server/src/**/*.ts',
      ],
      exclude: [
        'scripts/testing/**',
        'packages/**/*.test.ts',
        'apps/**/*.test.ts',
        'packages/**/index.ts',
      ],
      /**
       * Global thresholds reflect the current actual aggregate
       * (around 65/58) with a small safety buffer so unrelated
       * churn does not red-CI.
       *
       * Per-directory thresholds ratchet the core folders to the
       * audit plan target (70+/55+) so they cannot regress. Add a
       * new glob here when a directory crosses the 70/55 line.
       */
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 55,
        statements: 60,
        // After the B-codemod the only canonical lib sources live under
        // packages/lib/src — the old src/lib threshold was retired
        // along with its re-export shims.
        'packages/lib/src/**/*.ts': {
          lines: 85,
          functions: 90,
          branches: 80,
          statements: 85,
        },
        'packages/pipeline-video/src/cir/**/*.ts': {
          lines: 85,
          functions: 95,
          branches: 80,
          statements: 85,
        },
        'packages/pipeline-video/src/stages/**/*.ts': {
          lines: 70,
          functions: 75,
          branches: 55,
          statements: 70,
        },
        // Former `src/pipeline/**` — canonical engine under pipeline-core
        // (aggregate includes adapters and stages; floor set below old
        // pure-pipeline target to reflect Playwright-heavy modules).
        'packages/pipeline-core/src/**/*.ts': {
          lines: 58,
          functions: 58,
          branches: 50,
          statements: 58,
        },
        'apps/server/src/routes/**/*.ts': {
          lines: 65,
          functions: 65,
          branches: 55,
          statements: 65,
        },
        // Shared workspace adapter utilities (split from root `src/adapters`).
        'packages/adapter-common/src/**/*.ts': {
          lines: 45,
          functions: 55,
          branches: 30,
          statements: 45,
        },
        // Load-bearing config surface (must stay above generic core floor).
        'packages/pipeline-core/src/configStore.ts': {
          lines: 95,
          functions: 100,
          branches: 95,
          statements: 95,
        },
      },
    },
  },
});
