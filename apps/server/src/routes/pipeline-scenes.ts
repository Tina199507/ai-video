import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';
import type { Route } from './helpers.js';
import { pipelineEditorRoutes } from './pipeline-editor.js';

/**
 * Naming-aligned scenes route group.
 * Keep behavior unchanged by delegating to the existing editor route set.
 */
export function pipelineScenesRoutes(svc: PipelineService): Route[] {
  return pipelineEditorRoutes(svc);
}
