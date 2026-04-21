import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';
import type { Route } from './helpers.js';
import { pipelineArtifactRoutes } from './pipeline-artifacts.js';

/**
 * Naming-aligned stream/artifact route group.
 * Keep behavior unchanged by delegating to existing artifact routes.
 */
export function pipelineStreamRoutes(svc: PipelineService): Route[] {
  return pipelineArtifactRoutes(svc);
}
