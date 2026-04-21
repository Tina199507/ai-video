import type { PipelineEvent as SharedPipelineEvent, WorkbenchEvent as SharedWorkbenchEvent } from '@ai-video/shared/types.js';

export type CorePipelineEvent = SharedPipelineEvent;
export type CoreWorkbenchEvent = SharedWorkbenchEvent;

export type PipelineEvent = CorePipelineEvent;
export type WorkbenchEvent = CoreWorkbenchEvent;

export { SSE_EVENT, WB_EVENT } from '@ai-video/shared/types.js';

export function toCorePipelineEvent(x: SharedPipelineEvent): CorePipelineEvent {
  return x;
}

export function toSharedPipelineEvent(x: CorePipelineEvent): SharedPipelineEvent {
  return x;
}

export function toCoreWorkbenchEvent(x: SharedWorkbenchEvent): CoreWorkbenchEvent {
  return x;
}

export function toSharedWorkbenchEvent(x: CoreWorkbenchEvent): SharedWorkbenchEvent {
  return x;
}
