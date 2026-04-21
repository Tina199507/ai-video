import { quotaBus } from './quotaBus.js';
import { transitionStage } from './stateMachine.js';
import type { PipelineStage } from './pipelineTypes.js';

type LoggerLike = {
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
};

export function scheduleQuotaResetForOrchestrator(self: any, log: LoggerLike): void {
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0,
  ));
  const msUntilReset = nextMidnight.getTime() - now.getTime();

  self.quotaResetTimer = setTimeout(() => {
    log.info('daily_quota_reset');
    quotaBus.resetAll();
    self.providerRegistry.resetAllQuotas();
    scheduleQuotaResetForOrchestrator(self, log);
  }, msUntilReset);

  self.quotaResetTimer.unref();
}

export function recoverStaleProjectsForOrchestrator(self: any, log: LoggerLike): void {
  try {
    const projects = self.store.list();
    for (const project of projects) {
      let recovered = false;
      for (const [stage, status] of Object.entries(project.stageStatus)) {
        if (status === 'processing') {
          transitionStage(project.stageStatus, stage as PipelineStage, 'error');
          transitionStage(project.stageStatus, stage as PipelineStage, 'pending');
          recovered = true;
        }
      }
      if (recovered) {
        project.error = undefined;
        project.updatedAt = new Date().toISOString();
        self.store.save(project);
        log.info('recovered_stale_project', { projectId: project.id });
      }
    }
  } catch (err) {
    log.warn('stale_scan_failed', { error: String(err) });
  }
}
