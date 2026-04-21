import type { RefineOptions as SharedRefineOptions } from '@ai-video/shared/types.js';

export type { RefineOptions } from '@ai-video/shared/types.js';
export { DEFAULT_REFINE_OPTIONS, packagingStyleToRefineOptions } from '@ai-video/shared/types.js';

/**
 * Pipeline-core domain boundary type for refinement options.
 * Keep the shape aligned first, then evolve independently in later cuts.
 */
export interface CoreRefineOptions extends SharedRefineOptions {}

export function toCoreRefineOptions(input: SharedRefineOptions): CoreRefineOptions {
  return input;
}

export function toSharedRefineOptions(input: CoreRefineOptions): SharedRefineOptions {
  return input;
}
