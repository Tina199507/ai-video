import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PipelineEvent, AIAdapter } from './pipelineTypes.js';
import { PipelineOrchestrator } from './orchestrator.js';

export function buildOrchestratorRuntime(self: any): PipelineOrchestrator {
  const saved = self.configStore.get();
  const orch = new PipelineOrchestrator(self.chatAdapter as unknown as AIAdapter, {
    dataDir: self.dataDir,
    aivideomakerAdapters: self.aivideomakerAdapters,
    productionConcurrency: saved.productionConcurrency,
    ttsConfig: saved.ttsConfig,
    accounts: self.getAccounts ? self.getAccounts() : self.accounts,
    pluginRegistry: self.pluginRegistry,
    pluginDeps: self.pluginRegistry ? {
      chatAdapter: self.chatAdapter as unknown as AIAdapter,
      aivideomakerAdapters: self.aivideomakerAdapters,
    } : undefined,
  });
  orch.onEvent((event: PipelineEvent) => {
    self.broadcastEvent(event);
    if (event.type === 'pipeline_complete' || event.type === 'pipeline_error') {
      const pid = (event.payload as { projectId: string }).projectId;
      self.projectQueue.markDone(pid);
    }
  });
  orch.onEvent((event: PipelineEvent) => {
    const pid = (event.payload as { projectId?: string })?.projectId;
    if (!pid) return;
    try {
      const dir = join(self.dataDir, 'projects', pid);
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, 'events.jsonl'), JSON.stringify({ ...event, _ts: Date.now() }) + '\n');
    } catch {
      // best-effort
    }
  });
  return orch;
}

export function getExecutionDepsRuntime(self: any, log: any) {
  return {
    orchestrator: self.orchestrator,
    projectQueue: self.projectQueue,
    getAccounts: self.getAccounts,
    accounts: self.accounts,
    log,
    recordIteration: (id: string, data: Record<string, unknown>) => self.recordIteration(id, data),
  };
}

export function getConfigRuntimeDepsRuntime(self: any) {
  return {
    configStore: self.configStore,
    aivideomakerAdapters: self.aivideomakerAdapters,
    onApiKeysChanged: self.onApiKeysChanged,
    rebuildOrchestrator: () => { self.orchestrator = buildOrchestratorRuntime(self); },
  };
}
