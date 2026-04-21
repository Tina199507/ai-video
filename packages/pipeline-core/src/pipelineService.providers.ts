import { getStageOrder } from './stageRegistry.js';
import { routeTask } from './qualityRouter.js';
import type { PipelineOrchestrator } from './orchestrator.js';
import type { ModelOverrides, PipelineStage, PipelineProject } from './pipelineTypes.js';
import type { AccountSeed } from './providerSeed.js';
import type { ResourcePlan } from './resourcePlanner.js';
import type { StageProviderMap, StageProviderOption, StageProviderOverrides } from './sharedTypes.js';

const TASK_TYPES: Record<string, string> = {
  CAPABILITY_ASSESSMENT: 'safety_check',
  STYLE_EXTRACTION: 'video_analysis',
  RESEARCH: 'fact_research',
  NARRATIVE_MAP: 'narrative_map',
  SCRIPT_GENERATION: 'script_generation',
  QA_REVIEW: 'quality_review',
  STORYBOARD: 'visual_prompts',
  REFERENCE_IMAGE: 'image_generation',
  KEYFRAME_GEN: 'image_generation',
  VIDEO_GEN: 'video_generation',
  TTS: 'tts',
  ASSEMBLY: 'assembly',
  REFINEMENT: 'quality_review',
};

export function getProviderCapabilities(orchestrator: PipelineOrchestrator): unknown {
  return orchestrator.providerRegistry.toJSON();
}

export function updateProviderCapability(
  orchestrator: PipelineOrchestrator,
  providerId: string,
  capability: Record<string, any>,
): unknown {
  orchestrator.providerRegistry.register(providerId, capability);
  return orchestrator.providerRegistry.get(providerId);
}

export function getSessions(orchestrator: PipelineOrchestrator): unknown {
  return orchestrator.sessionManager.getAllSessions();
}

export function getProviderSummary(orchestrator: PipelineOrchestrator): { providers: unknown; sessions: unknown; hasApiKey: boolean } {
  return {
    providers: orchestrator.providerRegistry.toJSON(),
    sessions: orchestrator.sessionManager.getAllSessions(),
    hasApiKey: false,
  };
}

export function getRouteTable(
  overrides?: ModelOverrides,
): Array<{ stage: string; taskType: string; adapter: string; provider?: string; model?: string; reason: string }> {
  return getStageOrder().map((stage) => {
    const taskType = TASK_TYPES[stage] ?? 'text';
    const decision = routeTask(stage as PipelineStage, taskType, overrides);
    return { stage, taskType, ...decision };
  });
}

export function getResourcePlan(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  overrides?: ModelOverrides,
): ResourcePlan {
  return orchestrator.getResourcePlan(projectId, overrides);
}

export function getStageProviders(
  orchestrator: PipelineOrchestrator,
  getAccounts?: () => AccountSeed[],
  aivideomakerCount = 0,
): StageProviderMap {
  const stages = getStageOrder();
  const registry = orchestrator.providerRegistry;
  const allProviders = registry.getAll();
  const result: StageProviderMap = {};

  for (const stage of stages) {
    const taskType = TASK_TYPES[stage] ?? 'text';
    if (taskType === 'assembly') continue;

    const decision = routeTask(stage as PipelineStage, taskType);
    const available: StageProviderOption[] = [];

    for (const cap of allProviders) {
      if (!canProviderHandleTask(cap, taskType)) continue;
      const accounts = getAccounts ? getAccounts().filter(a => a.provider === cap.providerId) : [];
      const totalCount = Math.max(accounts.length, 1);
      const availCount = accounts.filter(a => !a.quotaExhausted).length || (cap.quotaExhausted ? 0 : 1);

      available.push({
        provider: cap.providerId,
        label: cap.providerId.charAt(0).toUpperCase() + cap.providerId.slice(1) + ' 网页端',
        adapter: 'chat',
        resourceCount: totalCount,
        availableCount: availCount,
        hasQuotaIssues: cap.quotaExhausted,
        models: cap.models,
        capabilities: {
          text: cap.text,
          image: cap.imageGeneration,
          video: cap.videoGeneration,
          webSearch: cap.webSearch,
        },
        recommended: decision.adapter === 'chat' && decision.provider === cap.providerId,
      });
    }

    if (taskType === 'video_generation' && aivideomakerCount > 0) {
      available.push({
        provider: 'aivideomaker',
        label: 'AI Video Maker API',
        adapter: 'api',
        resourceCount: aivideomakerCount,
        availableCount: aivideomakerCount,
        hasQuotaIssues: false,
        capabilities: { text: false, image: false, video: true },
        recommended: decision.adapter === 'api' && taskType === 'video_generation',
      });
    }

    const currentProvider = available.find(a => a.recommended) ?? available[0];
    if (!currentProvider) continue;
    result[stage] = {
      taskType,
      current: currentProvider,
      available: available.sort((a, b) => {
        if (a.recommended && !b.recommended) return -1;
        if (!a.recommended && b.recommended) return 1;
        return b.availableCount - a.availableCount;
      }),
    };
  }

  return result;
}

export function updateStageProviderOverrides(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  overrides: StageProviderOverrides,
): PipelineProject {
  return orchestrator.updateStageProviderOverrides(projectId, overrides);
}

export function getEta(
  orchestrator: PipelineOrchestrator,
  projectId: string,
): { etaMs: number; completedMs: number; confidence: 'high' | 'low' } | null {
  const project = orchestrator.loadProject(projectId);
  if (!project) return null;
  return orchestrator.observability.estimateTimeRemaining(
    projectId,
    getStageOrder(),
    project.stageStatus as Record<string, string>,
  );
}

function canProviderHandleTask(
  cap: { text: boolean; imageGeneration: boolean; videoGeneration: boolean; webSearch: boolean; fileUpload: boolean; tts: boolean },
  taskType: string,
): boolean {
  switch (taskType) {
    case 'video_analysis': return cap.text && cap.fileUpload;
    case 'fact_research': return cap.text && cap.webSearch;
    case 'image_generation': return cap.imageGeneration;
    case 'video_generation': return cap.videoGeneration;
    case 'tts': return cap.tts;
    default: return cap.text;
  }
}
