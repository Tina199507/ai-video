import type {
  SelectorStrategy as SharedSelectorStrategy,
  SelectorChain as SharedSelectorChain,
  SelectorHealth as SharedSelectorHealth,
  QueueEtaPattern as SharedQueueEtaPattern,
  QueueDetectionConfig as SharedQueueDetectionConfig,
  SiteAutomationConfig as SharedSiteAutomationConfig,
} from '@ai-video/shared/types.js';

export type CoreSelectorStrategy = SharedSelectorStrategy;
export type CoreSelectorChain = SharedSelectorChain;
export type CoreSelectorHealth = SharedSelectorHealth;
export type CoreQueueEtaPattern = SharedQueueEtaPattern;
export type CoreQueueDetectionConfig = SharedQueueDetectionConfig;
export type CoreSiteAutomationConfig = SharedSiteAutomationConfig;

export type SelectorStrategy = CoreSelectorStrategy;
export type SelectorChain = CoreSelectorChain;
export type SelectorHealth = CoreSelectorHealth;
export type QueueEtaPattern = CoreQueueEtaPattern;
export type QueueDetectionConfig = CoreQueueDetectionConfig;
export type SiteAutomationConfig = CoreSiteAutomationConfig;

export function toCoreSelectorStrategy(x: SharedSelectorStrategy): CoreSelectorStrategy {
  return x;
}

export function toSharedSelectorStrategy(x: CoreSelectorStrategy): SharedSelectorStrategy {
  return x;
}

export function toCoreSelectorChain(x: SharedSelectorChain): CoreSelectorChain {
  return x;
}

export function toSharedSelectorChain(x: CoreSelectorChain): SharedSelectorChain {
  return x;
}

export function toCoreSelectorHealth(x: SharedSelectorHealth): CoreSelectorHealth {
  return x;
}

export function toSharedSelectorHealth(x: CoreSelectorHealth): SharedSelectorHealth {
  return x;
}

export function toCoreQueueEtaPattern(x: SharedQueueEtaPattern): CoreQueueEtaPattern {
  return x;
}

export function toSharedQueueEtaPattern(x: CoreQueueEtaPattern): SharedQueueEtaPattern {
  return x;
}

export function toCoreQueueDetectionConfig(x: SharedQueueDetectionConfig): CoreQueueDetectionConfig {
  return x;
}

export function toSharedQueueDetectionConfig(x: CoreQueueDetectionConfig): SharedQueueDetectionConfig {
  return x;
}

export function toCoreSiteAutomationConfig(x: SharedSiteAutomationConfig): CoreSiteAutomationConfig {
  return x;
}

export function toSharedSiteAutomationConfig(x: CoreSiteAutomationConfig): SharedSiteAutomationConfig {
  return x;
}
