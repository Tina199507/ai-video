
import { StyleProfile, ResearchData, NarrativeMap, Scene, ModelConfig, SavedTemplate, FactUsage, StyleConsistency } from './models';
import { AIProvider } from './enums';

export interface GenerationPlan {
  factsCount: number;
  sequenceCount: number;
  estimatedSceneCount: number;
  targetSceneDuration: number;
  targetWPM: number;
  audienceFactor: number;
  reasoning: string[];
}

export interface VerificationReport {
  safetyCheck: boolean;
  medicalFlag: boolean;
  styleConsistencyScore: number;
  styleStatus: 'pass' | 'warn' | 'fail';
  factCheckPassed: boolean;
  factCoverageScore: number;
  durationStatus: 'pass' | 'warn' | 'fail';
  durationDeviation: number;
  safetyReason?: string; 
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'data';
  data?: any;
}

export interface ScriptVersion {
  id: string;
  label: string;
  content: string;
  timestamp: string;
  usedFactIDs?: string[];
  factUsage?: FactUsage[];
  requiresManualCorrection?: boolean;
  sourceMetadata?: Record<string, { source: string; url?: string }>;
  safetyMetadata?: {
    isHighRisk: boolean;
    riskCategories: string[];
    triggerWarning?: string;
    softenedWordingApplied: boolean;
  };
  styleConsistency?: StyleConsistency;
}

export interface AppState {
  projectId?: string;
  // Navigation/Layout state
  referenceVideoUrl: string | null;
  referenceTitle?: string;
  referenceThumbnailUrl?: string;

  // Global Project
  projectTitle?: string;
  targetTopic: string;
  targetAspectRatio: "16:9" | "9:16";

  // Configuration
  modelConfig: ModelConfig;
  apiKeys: Partial<Record<AIProvider, string>>;

  // Data
  styleProfile: StyleProfile | null;
  generationPlan?: GenerationPlan; // New: Plan for generation scale
  researchData: ResearchData | null;
  narrativeMap: NarrativeMap | null; 
  draftScript: string | null; 
  scriptVersions: ScriptVersion[]; 
  scriptHistory: string[]; // Local undo history
  referenceSheetUrl: string | null; 
  scenes: Scene[];
  
  // Library
  savedTemplates: SavedTemplate[]; // New State for Sidebar Library

  // UI State
  logs: LogEntry[];
  isProcessing: boolean;
  verificationReport: VerificationReport | null;
  
  // Scripting Progress State
  generationProgress?: { stage: string; currentBeat: number; totalBeats: number };
  draftScriptPartial?: string | null;
  pendingDiffs?: any[];
  partialScenes?: any[];

  // Global
  error: string | null;
  apiKeySet: boolean;
  
  // Final Output
  finalVideoUrl?: string;

  // Settings
  lowQualityMode: boolean;
  costBudget?: { maxCostPerCall?: number; maxCostPerProject?: number };
  latencySLA?: { maxLatencyMs?: number };

  // Music
  matchedMusic?: any; // Will type properly later
}
