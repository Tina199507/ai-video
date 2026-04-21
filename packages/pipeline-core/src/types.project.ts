import type {
  LogEntry,
  ModelOverrides,
  PipelineStage,
  ProcessStatus,
  StageProviderOverrides,
} from './sharedTypes.js';
import type { TemporalPlanCIR, VideoIR } from './cir/types.js';
import type { RefinementOutput } from './stages/refinement.js';
import type {
  CalibrationData,
  GenerationPlan,
  NarrativeMap,
  ResearchData,
  Scene,
  ScriptOutput,
  StoryboardReplicationSettings,
  StyleProfile,
} from './types.video.js';

export interface PipelineProject {
  id: string;
  title: string;
  topic: string;
  referenceVideoPath?: string;
  createdAt: string;
  updatedAt: string;
  currentStage?: PipelineStage;
  stageStatus: Record<PipelineStage, ProcessStatus>;
  pauseAfterStages?: PipelineStage[];
  isPaused?: boolean;
  pausedAtStage?: PipelineStage;
  modelOverrides?: ModelOverrides;
  stageProviderOverrides?: StageProviderOverrides;
  promptOverrides?: Record<string, string>;
  retryDirective?: { stage: PipelineStage; directive: string; timestamp: string };
  storyboardReplication?: StoryboardReplicationSettings;
  styleProfile?: StyleProfile;
  generationPlan?: GenerationPlan;
  researchData?: ResearchData;
  narrativeMap?: NarrativeMap;
  calibrationData?: CalibrationData;
  scriptOutput?: ScriptOutput;
  scenes?: Scene[];
  safetyCheck?: { safe: boolean; reason?: string };
  temporalPlan?: TemporalPlanCIR;
  videoIR?: VideoIR;
  qaReviewResult?: { approved: boolean; feedback?: string };
  manualReviewRequired?: boolean;
  qaReport?: { score?: number; issues?: string[] };
  referenceImages?: string[];
  refinementHistory?: RefinementOutput[];
  finalVideoPath?: string;
  logs: LogEntry[];
  error?: string;
}
