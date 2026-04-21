// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';
import type { Route } from './helpers.js';
import { pipelineControlRoutes } from './pipeline-control.js';
import { pipelineConfigRoutes } from './pipeline-config.js';
import { pipelineTraceRoutes } from './pipeline-trace.js';
import { pipelineRefineRoutes } from './pipeline-refine.js';
import { pipelineScenesRoutes } from './pipeline-scenes.js';
import { pipelineStreamRoutes } from './pipeline-stream.js';

/* ================================================================== */
/*  pipelineRoutesV2 – facade-based routes using PipelineService       */
/*  Routes NEVER access orchestrator internals directly.              */
/* ================================================================== */

export function pipelineRoutesV2(svc: PipelineService): Route[] {
  return [
    ...pipelineControlRoutes(svc),
    ...pipelineScenesRoutes(svc),
    ...pipelineConfigRoutes(svc),
    ...pipelineStreamRoutes(svc),
    ...pipelineTraceRoutes(svc),
    ...pipelineRefineRoutes(svc),
  ];
}
