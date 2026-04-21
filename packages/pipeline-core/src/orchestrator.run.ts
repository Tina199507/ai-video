import type { LogEntry, PipelineProject, PipelineStage, Scene } from './pipelineTypes.js';
import { SSE_EVENT } from './pipelineTypes.js';
import { SafetyBlockError } from './orchestrator.js';
import { makeTraceEvent } from './traceStore.js';

export function shouldPausePipeline(
  self: any,
  project: PipelineProject,
  stage: PipelineStage,
  runState: { preCompletedStages: Set<PipelineStage> },
): boolean {
  if (runState.preCompletedStages.has(stage)) return false;

  const manualPause = self.pauseRequested.has(project.id);
  if (manualPause) {
    self.pauseRequested.delete(project.id);
  }

  const scheduled = project.pauseAfterStages?.includes(stage) && project.stageStatus[stage] === 'completed';

  if (manualPause || scheduled) {
    project.isPaused = true;
    project.pausedAtStage = stage;
    (project as any).pausedAt = new Date().toISOString();
    self.saveProject(project);
    self.emit({ type: SSE_EVENT.PAUSED, payload: { projectId: project.id, stage } });

    const traceState = self.traceWriters.get(project.id);
    if (traceState) {
      traceState.writer.append(makeTraceEvent('checkpoint.pause', traceState.ctx, project.id, { stage }));
      traceState.writer.save(traceState.meta);
      self.traceWriters.delete(project.id);
    }
    return true;
  }
  return false;
}

export function runPostStageHooksForPipeline(
  project: PipelineProject,
  stage: PipelineStage,
  addLog: (entry: LogEntry) => void,
): void {
  if (stage === 'CAPABILITY_ASSESSMENT') {
    if (project.safetyCheck && !project.safetyCheck.safe) {
      const reason = project.safetyCheck.reason ?? 'unsafe topic';
      addLog({ id: `log_${Date.now()}`, timestamp: new Date().toISOString(), message: `Safety block: ${reason}`, type: 'error', stage: 'CAPABILITY_ASSESSMENT' });
      throw new SafetyBlockError(reason);
    }
  }

  if (stage === 'SCRIPT_GENERATION') {
    const meta = project.scriptOutput?.safetyMetadata;
    if (meta?.needsManualReview) {
      const cats = meta.riskCategories?.join(', ') ?? 'unknown';
      addLog({ id: `log_${Date.now()}`, timestamp: new Date().toISOString(), message: `Safety block: script requires manual review (${cats})`, type: 'error', stage: 'SCRIPT_GENERATION' });
      throw new SafetyBlockError(`Script requires manual review before production stages (${cats})`);
    }
  }

  if (stage === 'KEYFRAME_GEN') {
    const scenes: Scene[] = project.scenes ?? [];
    const videoScenes = scenes.filter(s => s.assetType === 'video');
    const freshKeyframes = videoScenes.filter(
      s => s.keyframeUrl && s.keyframeUrl !== s.referenceImageUrl,
    );
    const fallbackOnly = videoScenes.filter(
      s => s.keyframeUrl && s.keyframeUrl === s.referenceImageUrl,
    );
    const missing = videoScenes.filter(s => !s.keyframeUrl);
    const pct = videoScenes.length > 0 ? Math.round((freshKeyframes.length / videoScenes.length) * 100) : 100;
    addLog({
      id: `log_${Date.now()}`,
      stage: 'KEYFRAME_GEN',
      message: `🔍 Quality gate: ${freshKeyframes.length} fresh keyframes, ${fallbackOnly.length} using reference fallback, ${missing.length} missing (${pct}% fresh)`,
      type: pct >= 50 ? 'info' : 'warning',
      timestamp: new Date().toISOString(),
    });
    if (pct < 50 && videoScenes.length > 0) {
      addLog({
        id: `log_${Date.now() + 1}`,
        stage: 'KEYFRAME_GEN',
        message: `⚠️ Low keyframe quality (${pct}%) — video generation may produce lower-quality results`,
        type: 'warning',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
