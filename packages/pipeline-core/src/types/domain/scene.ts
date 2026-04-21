import type {
  PipelineScene as SharedPipelineScene,
  PipelineProject as SharedPipelineProject,
} from '@ai-video/shared/types.js';

export type CorePipelineScene = SharedPipelineScene;
export type CorePipelineProject = SharedPipelineProject;

export type PipelineScene = CorePipelineScene;
export type PipelineProject = CorePipelineProject;

export function toCorePipelineScene(x: SharedPipelineScene): CorePipelineScene {
  return x;
}

export function toSharedPipelineScene(x: CorePipelineScene): SharedPipelineScene {
  return x;
}

export function toCorePipelineProject(x: SharedPipelineProject): CorePipelineProject {
  return x;
}

export function toSharedPipelineProject(x: CorePipelineProject): SharedPipelineProject {
  return x;
}
