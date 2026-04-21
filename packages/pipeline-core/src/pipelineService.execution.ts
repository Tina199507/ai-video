import type { QueueSnapshot } from './projectQueue.js';
import type { PipelineOrchestrator } from './orchestrator.js';
import type { AccountSeed } from './providerSeed.js';
import type { PipelineStage } from './pipelineTypes.js';
import { getStageOrder } from './stageRegistry.js';
import type { ProjectQueue } from './projectQueue.js';
import type { Logger } from '@ai-video/pipeline-core/libFacade.js';

type IterationRecorder = (projectId: string, data: Record<string, unknown>) => void;

export interface ExecutionDeps {
  orchestrator: PipelineOrchestrator;
  projectQueue: ProjectQueue;
  getAccounts?: () => AccountSeed[];
  accounts: AccountSeed[];
  log: Logger;
  recordIteration: IterationRecorder;
}

function resolveAccounts(deps: ExecutionDeps): AccountSeed[] {
  return deps.getAccounts ? deps.getAccounts() : deps.accounts;
}

export function startPipelineDirect(
  deps: ExecutionDeps,
  projectId: string,
  videoFilePath?: string,
): { ok: true } | { error: string; status: number } {
  const { orchestrator, log } = deps;
  const project = orchestrator.loadProject(projectId);
  if (!project) return { error: 'Project not found', status: 404 };
  if (orchestrator.runLock.isRunning(projectId)) return { error: 'Pipeline already running', status: 409 };

  orchestrator.providerRegistry.seedFromAccounts(resolveAccounts(deps));
  orchestrator.run(projectId, videoFilePath).catch((err) => {
    log.error('run_failed', err, { projectId });
  });
  return { ok: true };
}

export function startPipeline(
  deps: ExecutionDeps,
  projectId: string,
  videoFilePath?: string,
): { ok: true } | { error: string; status: number } {
  return startPipelineDirect(deps, projectId, videoFilePath);
}

export function enqueueProject(
  deps: ExecutionDeps,
  projectId: string,
): { ok: true; position: 'started' | 'queued' } | { error: string; status: number } {
  const project = deps.orchestrator.loadProject(projectId);
  if (!project) return { error: 'Project not found', status: 404 };
  const position = deps.projectQueue.enqueue(projectId);
  return { ok: true, position };
}

export function getQueueSnapshot(projectQueue: ProjectQueue): QueueSnapshot {
  return projectQueue.snapshot();
}

export function stopPipeline(orchestrator: PipelineOrchestrator, projectId: string): void {
  orchestrator.runLock.abort(projectId);
}

export function requestPause(
  orchestrator: PipelineOrchestrator,
  projectId: string,
): { ok: true } | { error: string; status: number } {
  const project = orchestrator.loadProject(projectId);
  if (!project) return { error: 'Project not found', status: 404 };
  orchestrator.requestPause(projectId);
  return { ok: true };
}

export function retryStage(
  deps: ExecutionDeps,
  projectId: string,
  stage: PipelineStage,
  directive?: string,
): { ok: true } | { error: string; status: number } {
  const { orchestrator, log, recordIteration } = deps;
  const validStages = getStageOrder();
  if (!validStages.includes(stage)) return { error: `Invalid stage: ${stage}`, status: 400 };
  const project = orchestrator.loadProject(projectId);
  if (!project) return { error: 'Project not found', status: 404 };
  if (orchestrator.runLock.isRunning(projectId)) return { error: 'Pipeline already running', status: 409 };

  if (directive?.trim()) {
    project.retryDirective = { stage, directive: directive.trim(), timestamp: new Date().toISOString() };
    orchestrator.saveProject(project);
    recordIteration(projectId, { type: 'retry', stage, directive: directive.trim() });
  }

  orchestrator.providerRegistry.seedFromAccounts(resolveAccounts(deps));
  orchestrator.retryStage(projectId, stage).catch((err) => {
    log.error('retry_failed', err, { projectId, stage });
  });
  return { ok: true };
}

export function resumePipeline(
  deps: ExecutionDeps,
  projectId: string,
): { ok: true } | { error: string; status: number } {
  const { orchestrator, log } = deps;
  const project = orchestrator.loadProject(projectId);
  if (!project) return { error: 'Project not found', status: 404 };
  if (!project.isPaused) return { error: 'Pipeline is not paused', status: 409 };
  if (orchestrator.runLock.isRunning(projectId)) return { error: 'Pipeline already running', status: 409 };

  orchestrator.providerRegistry.seedFromAccounts(resolveAccounts(deps));
  orchestrator.resumePipeline(projectId).catch((err) => {
    log.error('resume_failed', err, { projectId });
  });
  return { ok: true };
}
