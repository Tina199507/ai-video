// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
/* ------------------------------------------------------------------ */
/*  ResourcePlanner – pre-compilation resource budget planner         */
/* ------------------------------------------------------------------ */

import type { PipelineStage, ModelOverrides } from './pipelineTypes.js';
import type { ProviderCapabilityRegistry } from './providerRegistry.js';
import type { SessionGroup, SessionManager } from './sessionManager.js';
import { resolveProvider } from './qualityRouter.js';
import { getStageOrder } from './stageRegistry.js';
import './stages/defs/index.js';

export interface StageResourcePlan {
  stage: PipelineStage;
  taskType: string;
  provider: string;
  adapter: 'chat' | 'api';
  sessionGroup: SessionGroup;
  reusesChatContext: boolean;
  requirements: StageRequirement;
  feasible: boolean;
  reason: string;
  costCategory: 'free' | 'low' | 'medium' | 'high';
}

export interface StageRequirement {
  text?: boolean;
  imageGeneration?: boolean;
  videoGeneration?: boolean;
  fileUpload?: boolean;
  webSearch?: boolean;
}

export interface ResourcePlan {
  stages: StageResourcePlan[];
  feasibleCount: number;
  totalCount: number;
  allFeasible: boolean;
  blockers: string[];
  sessionSummary: Record<SessionGroup, { provider: string; stageCount: number; reuseChat: boolean }>;
  overallCost: 'free' | 'low' | 'medium' | 'high';
  summary: string;
  createdAt: string;
}

const STAGE_TASK_MAP: Record<PipelineStage, string> = {
  CAPABILITY_ASSESSMENT: 'safety_check',
  STYLE_EXTRACTION: 'video_analysis',
  RESEARCH: 'fact_research',
  NARRATIVE_MAP: 'narrative_map',
  SCRIPT_GENERATION: 'script_generation',
  QA_REVIEW: 'quality_review',
  TEMPORAL_PLANNING: 'temporal_planning',
  STORYBOARD: 'visual_prompts',
  VIDEO_IR_COMPILE: 'video_ir_compile',
  REFERENCE_IMAGE: 'image_generation',
  KEYFRAME_GEN: 'image_generation',
  VIDEO_GEN: 'video_generation',
  TTS: 'tts',
  ASSEMBLY: 'assembly',
  REFINEMENT: 'assembly',
};

const STAGE_REQUIREMENTS: Record<PipelineStage, StageRequirement> = {
  CAPABILITY_ASSESSMENT: { text: true },
  STYLE_EXTRACTION: { text: true, fileUpload: true },
  RESEARCH: { text: true, webSearch: true },
  NARRATIVE_MAP: { text: true },
  SCRIPT_GENERATION: { text: true },
  QA_REVIEW: { text: true },
  TEMPORAL_PLANNING: {},
  STORYBOARD: { text: true },
  VIDEO_IR_COMPILE: {},
  REFERENCE_IMAGE: { imageGeneration: true },
  KEYFRAME_GEN: { imageGeneration: true },
  VIDEO_GEN: { videoGeneration: true },
  TTS: {},
  ASSEMBLY: {},
  REFINEMENT: { text: true },
};

const COST_MAP: Record<string, 'free' | 'low' | 'medium' | 'high'> = {
  'chat:safety_check': 'free',
  'chat:video_analysis': 'free',
  'chat:fact_research': 'free',
  'chat:narrative_map': 'free',
  'chat:calibration': 'free',
  'chat:script_generation': 'free',
  'chat:quality_review': 'free',
  'chat:visual_prompts': 'free',
  'chat:image_generation': 'free',
  'chat:video_generation': 'low',
  'chat:tts': 'free',
  'chat:assembly': 'free',
  'api:safety_check': 'low',
  'api:video_analysis': 'low',
  'api:fact_research': 'low',
  'api:narrative_map': 'low',
  'api:script_generation': 'medium',
  'api:quality_review': 'low',
  'api:visual_prompts': 'low',
  'api:image_generation': 'medium',
  'api:video_generation': 'high',
  'api:tts': 'low',
  'api:assembly': 'free',
};

export function generateResourcePlan(
  registry: ProviderCapabilityRegistry,
  sessionManager: SessionManager,
  projectId: string,
  overrides?: ModelOverrides,
): ResourcePlan {
  const stages: StageResourcePlan[] = [];
  const blockers: string[] = [];
  const sessionProviders: Partial<Record<SessionGroup, string>> = {};
  const ALL_STAGES = getStageOrder();

  for (const stage of ALL_STAGES) {
    const taskType = STAGE_TASK_MAP[stage];
    const requirements = STAGE_REQUIREMENTS[stage];
    const session = sessionManager.getSession(projectId, stage);
    const group = session.group;
    const decision = resolveProvider(stage, taskType, registry, overrides);

    let provider = decision.provider ?? 'any';
    let feasible = true;
    let reason = decision.reason;

    const noAiNeeded =
      stage === 'TEMPORAL_PLANNING' ||
      stage === 'VIDEO_IR_COMPILE' ||
      stage === 'TTS' ||
      stage === 'ASSEMBLY';

    if (!noAiNeeded && decision.adapter === 'chat') {
      const candidates = registry.findProviders(requirements);
      if (decision.provider) {
        const specific = candidates.find(c => c.providerId === decision.provider);
        if (specific && !specific.quotaExhausted) {
          provider = specific.providerId;
        } else if (candidates.length > 0) {
          provider = candidates[0].providerId;
          reason = `${decision.provider} 不可用，回退到 ${provider}`;
        } else {
          feasible = false;
          reason = `没有可用的服务商满足 ${stage} 的需求`;
          blockers.push(stage);
        }
      } else {
        if (candidates.length > 0) {
          const groupProvider = sessionProviders[group];
          const sameGroupCandidate = groupProvider
            ? candidates.find(c => c.providerId === groupProvider)
            : null;
          provider = sameGroupCandidate?.providerId ?? candidates[0].providerId;
        } else if (Object.keys(requirements).length > 0) {
          feasible = false;
          reason = `没有可用的服务商满足 ${stage} 的需求`;
          blockers.push(stage);
        }
      }
    }

    if (feasible && !noAiNeeded) {
      sessionProviders[group] ??= provider;
    }

    const reusesChatContext = session.messageCount > 0 || (
      sessionProviders[group] !== undefined &&
      stages.some(s => s.sessionGroup === group && s.provider === provider)
    );

    const costKey = `${decision.adapter}:${taskType}`;
    const costCategory = noAiNeeded ? 'free' : (COST_MAP[costKey] ?? 'low');

    stages.push({
      stage,
      taskType,
      provider: noAiNeeded ? 'local' : provider,
      adapter: decision.adapter,
      sessionGroup: group,
      reusesChatContext,
      requirements,
      feasible,
      reason,
      costCategory,
    });
  }

  const sessionSummary = {} as Record<SessionGroup, { provider: string; stageCount: number; reuseChat: boolean }>;
  for (const group of ['analysis', 'creation', 'visual', 'production'] as SessionGroup[]) {
    const groupStages = stages.filter(s => s.sessionGroup === group);
    sessionSummary[group] = {
      provider: sessionProviders[group] ?? 'local',
      stageCount: groupStages.length,
      reuseChat: groupStages.some(s => s.reusesChatContext),
    };
  }

  const costOrder = ['free', 'low', 'medium', 'high'] as const;
  const maxCostIdx = Math.max(...stages.map(s => costOrder.indexOf(s.costCategory)));
  const overallCost = costOrder[maxCostIdx] ?? 'free';
  const feasibleCount = stages.filter(s => s.feasible).length;
  const allFeasible = feasibleCount === stages.length;

  const chatStages = stages.filter(s => s.adapter === 'chat' && s.provider !== 'local').length;
  const apiStages = stages.filter(s => s.adapter === 'api').length;
  const localStages = stages.filter(s => s.provider === 'local').length;
  const summary = allFeasible
    ? `资源规划就绪：${chatStages} 步使用免费聊天，${apiStages} 步使用付费 API，${localStages} 步本地处理`
    : `资源规划有 ${blockers.length} 个阻塞项：${blockers.join(', ')}`;

  return {
    stages,
    feasibleCount,
    totalCount: stages.length,
    allFeasible,
    blockers,
    sessionSummary,
    overallCost,
    summary,
    createdAt: new Date().toISOString(),
  };
}
