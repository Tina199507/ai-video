/* ------------------------------------------------------------------ */
/*  StageRunner — thin execution engine for a single pipeline stage    */
/* ------------------------------------------------------------------ */

import type { PipelineEvent, PipelineProject, PipelineStage } from './pipelineTypes.js';
import { SSE_EVENT } from './pipelineTypes.js';
import type { ObservabilityService } from './observability.js';
import type { SessionManager } from './sessionManager.js';
import { transitionStage } from './stateMachine.js';
import {
  classifyError,
  createChildContext,
  makeTraceEvent,
  type TraceContext,
  type TraceWriter,
  type TraceWriterMeta,
} from './traceStore.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import { CIRValidationError, AIParseError } from './cir/errors.js';
import { AIRequestAbortedError } from './aiControl.js';

const log = createLogger('StageRunner');

export type TraceState = {
  writer: TraceWriter;
  ctx: TraceContext;
  meta: TraceWriterMeta;
  startMs: number;
};

export interface StageRunnerDeps {
  saveProject: (project: PipelineProject) => void;
  emit: (event: PipelineEvent) => void;
  observability: ObservabilityService;
  sessionManager: SessionManager;
  getProjectDir: (projectId: string) => string;
  getTraceState: (projectId: string) => TraceState | undefined;
  runInTx?: (projectId: string, fn: () => void) => void;
}

export class StageRunner {
  constructor(private readonly deps: StageRunnerDeps) {}

  async run<T>(
    project: PipelineProject,
    stage: PipelineStage,
    fn: () => Promise<T>,
  ): Promise<PipelineProject> {
    const { saveProject, emit, observability, sessionManager, getProjectDir, getTraceState, runInTx } = this.deps;
    const commit = (fn2: () => void) => (runInTx ? runInTx(project.id, fn2) : fn2());
    log.info('stage_start', { stage, projectId: project.id });
    project.currentStage = stage;
    transitionStage(project.stageStatus, stage, 'processing');
    saveProject(project);
    emit({ type: SSE_EVENT.STAGE, payload: { projectId: project.id, stage, status: 'processing' } });
    observability.startStage(project.id, stage);

    const traceState = getTraceState(project.id);
    const stageSpan = traceState ? createChildContext(traceState.ctx) : undefined;
    const stageStartMs = Date.now();
    if (traceState && stageSpan) {
      traceState.writer.append(makeTraceEvent('stage.start', stageSpan, project.id, { stage }));
    }

    try {
      await fn();
      commit(() => {
        transitionStage(project.stageStatus, stage, 'completed');
        project.updatedAt = new Date().toISOString();
        saveProject(project);
        sessionManager.saveTo(getProjectDir(project.id));
        observability.completeStage(project.id, stage);
        observability.saveTo(getProjectDir(project.id), project.id);
      });
      log.info('stage_completed', { stage });
      emit({ type: SSE_EVENT.STAGE, payload: { projectId: project.id, stage, status: 'completed' } });
      emit({ type: SSE_EVENT.ARTIFACT, payload: { projectId: project.id, stage, artifactType: stage.toLowerCase() } });

      if (traceState && stageSpan) {
        traceState.writer.append(makeTraceEvent('stage.complete', stageSpan, project.id, {
          stage,
          durationMs: Date.now() - stageStartMs,
        }));
      }
      return project;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof CIRValidationError || err instanceof AIParseError) {
        log.error('cir_error', err, { stage, errorType: err.name });
      }

      if (err instanceof AIRequestAbortedError) {
        log.warn('stage_aborted', { stage, reason: message });
        transitionStage(project.stageStatus, stage, 'error');
        project.error = message;
        saveProject(project);
        emit({
          type: SSE_EVENT.LOG,
          payload: {
            projectId: project.id,
            entry: {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString(),
              message: `Stage aborted: ${stage} — ${message}`,
              type: 'warning',
              stage,
            },
          },
        });
        throw err;
      }

      log.error('stage_failed', err, { stage, message });
      transitionStage(project.stageStatus, stage, 'error');
      project.error = message;
      saveProject(project);
      observability.errorStage(project.id, stage, message);
      emit({ type: SSE_EVENT.ERROR, payload: { projectId: project.id, stage, error: message } });

      if (traceState && stageSpan) {
        traceState.writer.append(makeTraceEvent('stage.error', stageSpan, project.id, {
          stage,
          failure: classifyError(err),
          attempt: 1,
        }));
      }
      throw err;
    }
  }
}
