import type { PipelineStage as SharedPipelineStage, ProcessStatus as SharedProcessStatus } from '@ai-video/shared/types.js';

/** Domain vocabulary for pipeline stages (aligned with `@ai-video/shared` until evolved independently). */
export type CorePipelineStage = SharedPipelineStage;
export type CoreProcessStatus = SharedProcessStatus;

export type PipelineStage = CorePipelineStage;
export type ProcessStatus = CoreProcessStatus;

export function toCorePipelineStage(x: SharedPipelineStage): CorePipelineStage {
  return x;
}

export function toSharedPipelineStage(x: CorePipelineStage): SharedPipelineStage {
  return x;
}

export function toCoreProcessStatus(x: SharedProcessStatus): CoreProcessStatus {
  return x;
}

export function toSharedProcessStatus(x: CoreProcessStatus): SharedProcessStatus {
  return x;
}
