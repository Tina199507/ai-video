/**
 * Shared model entry for pipeline-core: aggregates `types/domain/*` (mapping layer) for external callers.
 */
export type {
  PipelineStage,
  ProcessStatus,
  CorePipelineStage,
  CoreProcessStatus,
} from './types/domain/pipeline.js';
export type {
  PipelineScene,
  PipelineProject,
  CorePipelineScene,
  CorePipelineProject,
} from './types/domain/scene.js';
export type {
  PipelineEvent,
  WorkbenchEvent,
  CorePipelineEvent,
  CoreWorkbenchEvent,
} from './types/domain/events.js';

export {
  toCorePipelineStage,
  toSharedPipelineStage,
  toCoreProcessStatus,
  toSharedProcessStatus,
} from './types/domain/pipeline.js';
export {
  toCorePipelineScene,
  toSharedPipelineScene,
  toCorePipelineProject,
  toSharedPipelineProject,
} from './types/domain/scene.js';
export {
  toCorePipelineEvent,
  toSharedPipelineEvent,
  toCoreWorkbenchEvent,
  toSharedWorkbenchEvent,
} from './types/domain/events.js';

export type {
  ModelOverride,
  ModelOverrides,
  ModelOption,
  CoreModelOverride,
  CoreModelOverrides,
  CoreModelOption,
} from './types/domain/models.js';
export {
  toCoreModelOverride,
  toSharedModelOverride,
  toCoreModelOverrides,
  toSharedModelOverrides,
  toCoreModelOption,
  toSharedModelOption,
} from './types/domain/models.js';

export type {
  WorkbenchState,
  TaskItem,
  ChatMode,
  ProviderInfo,
  CoreWorkbenchState,
  CoreTaskItem,
  CoreChatMode,
  CoreProviderInfo,
} from './types/domain/workbench.js';
export {
  toCoreWorkbenchState,
  toSharedWorkbenchState,
  toCoreTaskItem,
  toSharedTaskItem,
  toCoreChatMode,
  toSharedChatMode,
  toCoreProviderInfo,
  toSharedProviderInfo,
} from './types/domain/workbench.js';

export type {
  Account,
  AiResource,
  AiResourceType,
  CoreAccount,
  CoreAiResource,
  CoreAiResourceType,
} from './types/domain/resource.js';
export {
  toCoreAccount,
  toSharedAccount,
  toCoreAiResource,
  toSharedAiResource,
  toCoreAiResourceType,
  toSharedAiResourceType,
} from './types/domain/resource.js';

export type {
  ProviderId,
  StageProviderMap,
  StageProviderOption,
  StageProviderOverrides,
  ProviderSelectors,
  CoreProviderId,
  CoreStageProviderMap,
  CoreStageProviderOption,
  CoreStageProviderOverrides,
  CoreProviderSelectors,
} from './types/domain/providers.js';
export {
  toCoreProviderId,
  toSharedProviderId,
  toCoreStageProviderMap,
  toSharedStageProviderMap,
  toCoreStageProviderOption,
  toSharedStageProviderOption,
  toCoreStageProviderOverrides,
  toSharedStageProviderOverrides,
  toCoreProviderSelectors,
  toSharedProviderSelectors,
} from './types/domain/providers.js';

export type {
  SelectorStrategy,
  SelectorChain,
  SelectorHealth,
  QueueEtaPattern,
  QueueDetectionConfig,
  SiteAutomationConfig,
  CoreSelectorStrategy,
  CoreSelectorChain,
  CoreSelectorHealth,
  CoreQueueEtaPattern,
  CoreQueueDetectionConfig,
  CoreSiteAutomationConfig,
} from './types/domain/selectors.js';
export {
  toCoreSelectorStrategy,
  toSharedSelectorStrategy,
  toCoreSelectorChain,
  toSharedSelectorChain,
  toCoreSelectorHealth,
  toSharedSelectorHealth,
  toCoreQueueEtaPattern,
  toSharedQueueEtaPattern,
  toCoreQueueDetectionConfig,
  toSharedQueueDetectionConfig,
  toCoreSiteAutomationConfig,
  toSharedSiteAutomationConfig,
} from './types/domain/selectors.js';

export type { LogEntry, CoreLogEntry } from './types/domain/log.js';
export { toCoreLogEntry, toSharedLogEntry } from './types/domain/log.js';

export { SSE_EVENT, WB_EVENT } from './types/domain/events.js';

export type { RefineOptions, CoreRefineOptions } from './types/domain/refine.js';
export {
  DEFAULT_REFINE_OPTIONS,
  packagingStyleToRefineOptions,
  toCoreRefineOptions,
  toSharedRefineOptions,
} from './types/domain/refine.js';
