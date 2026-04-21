import type {
  ProviderId as SharedProviderId,
  StageProviderMap as SharedStageProviderMap,
  StageProviderOption as SharedStageProviderOption,
  StageProviderOverrides as SharedStageProviderOverrides,
  ProviderSelectors as SharedProviderSelectors,
} from '@ai-video/shared/types.js';

export type CoreProviderId = SharedProviderId;
export type CoreStageProviderMap = SharedStageProviderMap;
export type CoreStageProviderOption = SharedStageProviderOption;
export type CoreStageProviderOverrides = SharedStageProviderOverrides;
export type CoreProviderSelectors = SharedProviderSelectors;

export type ProviderId = CoreProviderId;
export type StageProviderMap = CoreStageProviderMap;
export type StageProviderOption = CoreStageProviderOption;
export type StageProviderOverrides = CoreStageProviderOverrides;
export type ProviderSelectors = CoreProviderSelectors;

export function toCoreProviderId(x: SharedProviderId): CoreProviderId {
  return x;
}

export function toSharedProviderId(x: CoreProviderId): SharedProviderId {
  return x;
}

export function toCoreStageProviderMap(x: SharedStageProviderMap): CoreStageProviderMap {
  return x;
}

export function toSharedStageProviderMap(x: CoreStageProviderMap): SharedStageProviderMap {
  return x;
}

export function toCoreStageProviderOption(x: SharedStageProviderOption): CoreStageProviderOption {
  return x;
}

export function toSharedStageProviderOption(x: CoreStageProviderOption): SharedStageProviderOption {
  return x;
}

export function toCoreStageProviderOverrides(x: SharedStageProviderOverrides): CoreStageProviderOverrides {
  return x;
}

export function toSharedStageProviderOverrides(x: CoreStageProviderOverrides): SharedStageProviderOverrides {
  return x;
}

export function toCoreProviderSelectors(x: SharedProviderSelectors): CoreProviderSelectors {
  return x;
}

export function toSharedProviderSelectors(x: CoreProviderSelectors): SharedProviderSelectors {
  return x;
}
