/**
 * @ai-video/pipeline-core — public surface.
 *
 * Re-exports the topic-agnostic compilation engine living under
 * `src/pipeline/`.  Following the same C-2 façade pattern as
 * `@ai-video/shared`, the canonical source files stay in place
 * because the legacy `src/` tree owns >70 stage modules and dozens
 * of test files that mock specific module identities.  C-3's intent
 * is to lock down the **public boundary** so consumers (and future
 * pipeline plugins) can `import from '@ai-video/pipeline-core'`
 * instead of fishing inside `src/pipeline/*` paths.
 *
 * A future codemod will physically relocate the canonical files
 * into `packages/pipeline-core/src/` once all internal cross-edges
 * to `src/adapters` and `src/services` are decoupled.
 */

export const PACKAGE_VERSION = '0.0.0';

/* ---- Stage registry & runner ---- */
export type {
  StageDefinition,
  StageRunContext,
  StageRunConfig,
} from './stageRegistry.js';
export {
  registerStage,
  getStageDefinitions,
  getStageOrder,
} from './stageRegistry.js';

/* ---- Orchestrator ---- */
export {
  PipelineOrchestrator,
  SafetyBlockError,
  type PipelineConfig,
  type PipelineEventListener,
} from './orchestrator.js';

/* ---- Stage runner (DI surface for adapter wiring) ---- */
export { StageRunner } from './stageRunner.js';
export type { StageRunnerDeps } from './stageRunner.js';

/* ---- Service contracts (PluginDeps / PipelineServices) ---- */
export type {
  PipelineServices,
  StorageService,
  CacheService,
  CacheEntry,
  FfmpegService,
  TtsService,
} from './pipelineServices.js';
export { createDefaultPipelineServices } from './pipelineServices.js';

/* ---- Plugin trust model (manifest, loader) ---- */
export {
  validatePluginManifest,
  loadPluginManifestFromFile,
  canonicalManifestForSigning,
  type PluginManifest,
  type PluginKind,
  type PluginPermission,
  type PluginSignature,
  type ManifestValidationError,
  type ManifestValidationResult,
} from './pluginManifest.js';
export {
  discoverFsPlugins,
  loadAndRegisterPlugins,
  loadTrustFile,
  verifyManifestTrust,
  type TrustFile,
  type TrustedPluginEntry,
  type DiscoverOptions,
  type DiscoveredPlugin,
  type PluginLoadResult,
  type PluginLoadFailure,
  type VerifyOutcome,
} from './pluginLoader.js';

/* ---- AI adapter contract + abort primitives ---- */
export type {
  JsonSchemaLike,
  ToolDescriptor,
  PromptPart,
  AIAdapter,
  AIRequestOptions,
  TokenUsage,
  GenerationResult,
} from './types/index.js';
export type { PipelineStage } from './sharedTypes.js';
export type { ModelOverrides } from './pipelineTypes.js';
export {
  AIRequestAbortedError,
  throwIfAborted,
  waitWithAbort,
  DEFAULT_AI_TIMEOUT_MS,
  AIRequestTimeoutError,
  runWithAICallControl,
  createControlledAdapter,
  createSessionScopedAdapter,
} from './aiControl.js';

/* ---- Project store ---- */
export { ProjectStore } from './projectStore.js';
export { migrateProjectsToSqlite } from './autoMigrate.js';

/* ---- Pipeline service facade ---- */
export {
  PipelineService,
  type PipelineServiceConfig,
  type EventBroadcaster,
  type StoryboardReplicationUpdate,
} from './pipelineService.js';

/* ---- External capability ports (contracts + default adapters) ---- */
/*
 * Port lifecycle contract:
 * 1) Configure phase (startup only): call configurePipelineCorePorts(...)
 * 2) Freeze phase (once): call freezePipelineCorePorts()
 * 3) Runtime phase: any port mutation APIs are rejected
 */
export {
  configurePipelineCorePorts,
  freezePipelineCorePorts,
  isPipelineCorePortsFrozen,
  resetPipelineCorePorts,
  defaultPipelineCorePorts,
  type PipelineCorePorts,
} from './ports/index.js';
