import type {
  ModelOverride as SharedModelOverride,
  ModelOverrides as SharedModelOverrides,
  ModelOption as SharedModelOption,
} from '@ai-video/shared/types.js';

export type CoreModelOverride = SharedModelOverride;
export type CoreModelOverrides = SharedModelOverrides;
export type CoreModelOption = SharedModelOption;

export type ModelOverride = CoreModelOverride;
export type ModelOverrides = CoreModelOverrides;
export type ModelOption = CoreModelOption;

export function toCoreModelOverride(x: SharedModelOverride): CoreModelOverride {
  return x;
}

export function toSharedModelOverride(x: CoreModelOverride): SharedModelOverride {
  return x;
}

export function toCoreModelOverrides(x: SharedModelOverrides): CoreModelOverrides {
  return x;
}

export function toSharedModelOverrides(x: CoreModelOverrides): SharedModelOverrides {
  return x;
}

export function toCoreModelOption(x: SharedModelOption): CoreModelOption {
  return x;
}

export function toSharedModelOption(x: CoreModelOption): SharedModelOption {
  return x;
}
