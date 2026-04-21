/**
 * @ai-video/app-server — public surface for the backend workspace.
 *
 * `apps/server/src/main.ts` is the active backend entry point.
 * The former repo-root `src/server.ts` shim was removed in PR-7.
 *
 * This barrel re-exports the stable runtime/bootstrap/route surface so
 * workspaces can import the backend shell through `@ai-video/app-server`.
 */

export const PACKAGE_VERSION = '0.0.0';

export {
  PACKAGE_VERSION as PIPELINE_CORE_VERSION,
} from '../../../packages/pipeline-core/src/index.js';

export * from './bootstrap.js';
export * from './wiring.js';
export * from './runtime.js';
export * from './main.js';
export * from './workbench.js';
export * from './routes/helpers.js';
export * from './routes/setup.js';
export * from './routes/workbench.js';
export * from './routes/bgmLibrary.js';
export * from './routes/pipeline.js';
