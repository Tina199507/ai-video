// src/types/models.ts
import { PipelineStage, ProcessStatus, AIProvider } from './enums';

/**
 * Core adapter request options (flexible - responseSchema can be used by model adapters)
 */
export interface AIRequestOptions {
  temperature?: number;
  topK?: number;
  responseMimeType?: string;
  responseSchema?: any;
  tools?: any[]; // Abstract tools config (tool name + params)
  thinkingConfig?: { thinkingBudget?: number; maxTokens?: number };
  systemInstruction?: string;
  // additional adapter-specific overrides
  overrides?: Record<string, any>;
}

/**
 * Generic generation result returned by AI adapter methods.
 * - text: textual output when applicable
 * - data: parsed JSON when responseSchema used
 * - imageUrl/videoUrl: preferred stable URL (S3/asset) if adapter provides
 * - base64: optional inline base64 payload (rare, only for small images)
 * - groundingMetadata: optional structured grounding info (e.g., fact IDs, timestamps)
 */
export interface GenerationResult {
  text?: string;
  data?: any;
  imageUrl?: string;
  videoUrl?: string;
  keyframeUrl?: string;
  audioUrl?: string;
  base64?: string;
  groundingMetadata?: any;
  durationMs?: number;
  model?: string;
  operationId?: string;
}

/**
 * Lightweight adapter interface. Implementations can return full GenerationResult.
 */
export interface AIAdapter {
  provider: AIProvider;

  // Core Text/Multimodal Generation
  generateText(model: string, prompt: string | any[], options?: AIRequestOptions): Promise<GenerationResult>;

  // Image Generation
  // Return GenerationResult with imageUrl or base64
  generateImage(model: string, prompt: string, aspectRatio?: string, negativePrompt?: string, options?: AIRequestOptions): Promise<GenerationResult>;

  // Video Generation (support image->video or text->video)
  // Return GenerationResult with videoUrl and optionally keyframeUrl
  generateVideo(model: string, prompt: string, options?: { aspectRatio?: string; image?: string; duration?: number; fps?: number } & AIRequestOptions): Promise<GenerationResult>;

  // File Handling
  uploadFile?(file: File): Promise<{ uri: string; mimeType: string }>;

  // Audio Generation
  generateSpeech?(text: string, voice?: string, options?: AIRequestOptions): Promise<GenerationResult>;
}

/* ---------------------------
   Model / Pipeline configuration
   --------------------------- */

/**
 * Per-stage model configuration (more explicit)
 */
export interface StageModelConfig {
  provider: AIProvider;
  model: string;
  resolution?: '720p' | '1080p' | '4k' | string;
  aspectRatio?: string;
  thinkingBudget?: number;
  extra?: Record<string, any>;
}

export interface ModelConfig {
  provider?: AIProvider;
  apiKey?: string;

  // Per-Stage Configurations (allow overrides)
  analysis?: StageModelConfig;
  research?: StageModelConfig;
  scripting?: StageModelConfig;
  visual?: StageModelConfig;
  video?: StageModelConfig;

  // Workflow Preference
  preferredWorkflow?: 'video' | 'image';
  // Global default overrides
  defaults?: {
    aspectRatio?: string;
    resolution?: string;
  };
}

/* ---------------------------
   Production / Scene types
   --------------------------- */

export interface ProductionSpecs {
  camera?: string;   // e.g. "closeup, 50mm"
  lighting?: string; // e.g. "soft key light, warm tone"
  sound?: string;    // e.g. "ambient, soft music"
  notes?: string;
}

export interface Scene {
  id: string;
  number: number;
  narrative: string;
  visualPrompt: string;
  productionSpecs: ProductionSpecs;
  estimatedDuration: number;
  assetUrl?: string;      // final generated asset URL (image/video)
  assetType: 'image' | 'video' | 'placeholder';
  keyframeUrl?: string;
  audioUrl?: string;
  voiceId?: string;
  audioDuration?: number;
  status: 'pending' | 'generating' | 'done' | 'error';
  progressMessage?: string;
  logs: string[];
}

/* ---------------------------
   Style / Analysis types
   --------------------------- */

/**
 * A single key moment extracted from source with timestamps and an excerpt.
 */
export interface KeyMoment {
  label: string;
  startSec: number;
  endSec: number;
  excerpt: string;
  confidence: number; // 0..1
}

/**
 * Suspicious numeric/claim structure produced by analysis/safetyClaims.
 * Contains normalizedNumber when available and severity for triage.
 */
export type ClaimType = 'numeric' | 'range' | 'percentage' | 'comparison' | 'probability' | 'semantic';
export type ClaimSeverity = 'low' | 'medium' | 'high';

export interface SuspiciousClaim {
  raw: string;
  normalizedNumber?: number | null;
  unit?: string | null;
  type?: ClaimType;
  start?: number;
  end?: number;
  severity?: ClaimSeverity;
  reason?: string;
}

/**
 * Audio style structure (used by music matcher / production)
 */
export interface AudioStyle {
  genre?: string;
  mood?: string;
  tempo?: 'slow' | 'medium' | 'fast' | string;
  intensity?: number; // 1..5
  instrumentation?: string[];
}

/**
 * The StyleProfile is the central data structure passed across the pipeline.
 * New fields must be backward-compatible and optional where possible.
 */
export interface StyleProfile {
  // Core style signals
  visualStyle: string;
  pacing: string;
  tone: string;
  colorPalette: string[];         // hex colors preferred
  targetAudience?: string;
  keyElements?: string[];         // e.g. ['talking_head','b-roll','data_viz']
  pedagogicalApproach?: string;

  // Narrative / script guidance
  narrativeStructure: string[];   // e.g. ['Hook','Problem','Mechanism','Action']
  scriptStyle?: string;
  fullTranscript?: string;
  wordCount?: number;
  wordsPerMinute?: number;
  recommendedWordsPerMinute?: number;
  sourceDuration?: number;
  targetAspectRatio?: "16:9" | "9:16" | string;
  sourceFactCount?: number;

  // Enhanced Scripting Fields
  hookType?: 'Question' | 'ShockingStat' | 'Story' | 'VisualHook' | 'EmotionalScene' | 'Other' | string;
  callToActionType?: 'Subscribe' | 'LearnMore' | 'Reflect' | 'None' | 'Other' | string;
  vocabularyLevel?: string;
  sentenceStructure?: string;
  narrativeArchetype?: string;
  emotionalIntensity?: number; // 1..5

  // Audio / Music Style
  audioStyle?: AudioStyle;

  // Evidence & Confidence Fields
  keyMoments?: KeyMoment[];
  nodeConfidence?: Record<string, 'confident' | 'inferred' | 'guess'>; // e.g. { visualStyle: 'confident', tone: 'inferred' }
  suspiciousNumericClaims?: SuspiciousClaim[]; // structured suspicious claims
  styleFingerprint?: string;
  profileVersion?: string;

  // Meta
  _meta?: {
    sourceTitle?: string;
    sourceThumbnail?: string;
    createdAt?: string;
    modelVersion?: string;
  };

  // New Style DNA Tracks
  meta?: {
    video_language: string;
    video_duration_sec: number;
    video_type: string;
  };
  track_a_script?: any;
  track_b_visual?: any;
  track_c_audio?: any;
}

/* ---------------------------
   Library / Templates
   --------------------------- */

export interface SavedTemplate {
  id: string;
  savedAt: string;
  profile: StyleProfile;
}

/* ---------------------------
   Research / Fact types
   --------------------------- */

export interface FactSource {
  url: string;
  title?: string;
  snippet?: string;
  reliability?: number; // 0-1
}

export interface Fact {
  id: string;
  content: string;
  sources: FactSource[];
  aggConfidence: number; // 0-1
  type?: 'verified' | 'disputed' | 'unverified';
  originalText?: string; // fallback for older UI
}

export interface ClaimVerification {
  claim: string;
  verdict: 'verified' | 'debunked' | 'unverifiable';
  correction?: string;
  source?: string;
  confidence: number;
}

export interface ResearchData {
  facts: Fact[];
  myths?: string[];
  glossary?: { term: string; definition: string }[];
  claimVerifications?: ClaimVerification[];
  rawGroundingMetadata?: any;
}

/* ---------------------------
   Narrative / Script types
   --------------------------- */

export interface NarrativeBeat {
  sectionTitle: string;
  description: string;
  estimatedDuration: number;
  targetWordCount?: number;
  factReferences?: string[]; // fact IDs like ["Fact-1"]
}

export type NarrativeMap = NarrativeBeat[];

/* ---------------------------
   Pipeline monitoring types
   --------------------------- */

export interface PipelineStepStatus {
  stage: PipelineStage;
  label: string;
  status: ProcessStatus;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
}

/* ---------------------------
   Script output / verification types
   --------------------------- */

export interface FactUsage {
  factId: string;
  usageType: 'verbatim' | 'paraphrase' | 'referenced';
  sectionTitle?: string;
}

export interface StyleConsistency {
  score: number; // 0-1
  isDeviation: boolean;
  feedback: string;
  styleFingerprint?: string;
  status?: 'pass' | 'warn' | 'fail';
}

/**
 * Individual beat output (script + metadata)
 */
export interface ScriptBeatOutput {
  id?: string;
  beatId: string;
  header: string;
  script_text: string;
  word_count_estimate?: number;
  word_count?: number;
  estimated_duration_s?: number;
  assignedFactIDs: string[];
  factUsage: { factId: string; mode: 'verbatim' | 'paraphrase' | 'referenced'; quote?: string; source?: string }[];
  styleMatchScore?: number;
  safetyFlag?: boolean;
  warnings?: string[];
  bullets?: any[]; // Intermediate structure bullets
  // optional structured suspicious claims relevant to this beat
  suspiciousClaims?: SuspiciousClaim[];
}

/**
 * Safety metadata structure
 */
export interface SafetyMetadata {
  isHighRisk?: boolean;
  riskCategories?: string[]; // e.g. ['suicide','medical','political']
  triggerWarning?: string;
  softenedWordingApplied?: boolean;
  numericWarnings?: SuspiciousClaim[]; // structured
  needsManualReview?: boolean;
}


export interface ConstraintCompliance {
  avg_sentence_length: number;
  max_sentence_length: number;
  max_sentence_stage: string;
  sentences_exceeding_normal_limit: number;
  sentences_exceeding_absolute_limit: number;
  metaphor_count: number;
  interaction_cues_count: number;
  total_length: number;
  within_target_range: boolean;
}

export interface ComplianceAudit {
  status: "PASS" | "WARNING" | "BLOCK";
  issues: {
    level: "BLOCK" | "WARNING";
    text: string;
    reason: string;
    suggestion: string;
  }[];
}

export interface ContaminationAudit {
  status: "CLEAN" | "FLAGGED";
  flagged_sentences: {
    generated_text: string;
    original_text: string;
    similarity_type: "same-fact" | "same-metaphor" | "same-phrasing";
    suggestion: string;
  }[];
}

export interface StyleAudit {
  overall_status: "PASS" | "PARTIAL" | "FAIL";
  stage_ratings: {
    stage: string;
    expected_tone: string;
    actual_tone: string;
    rating: "matches" | "partial" | "mismatch";
    note?: string;
  }[];
}

export interface AuditResult {
  audit_1_compliance: ComplianceAudit;
  audit_2_contamination: ContaminationAudit;
  audit_3_style: StyleAudit;
  final_verdict: "APPROVED" | "NEEDS_REVISION";
  revision_instructions?: string;
  approved_script?: string;
}

/**
 * Final script output object returned by scripting stage
 */
export interface ScriptOutput {
  scriptText: string;
  usedFactIDs: string[];
  factUsage: FactUsage[];
  inferredClaims?: string[]; // Add this
  requiresManualCorrection?: boolean;
  pendingDiffs?: any[];
  sourceMetadata?: Record<string, { source?: string; url?: string }>;
  safetyMetadata?: SafetyMetadata;
  styleConsistency?: StyleConsistency;
  script_id?: string;
  totalWordCount?: number;
  totalEstimatedDuration?: number;
  scenes?: ScriptBeatOutput[];
  verificationReport?: {
     durationConsistency: 'pass' | 'warn' | 'fail';
     factCoverage: 'pass' | 'warn' | 'fail' | number;
     styleConsistency: 'pass' | 'warn' | 'fail';
     safety: 'ok' | 'requires_review';
     factCheckPassed?: boolean;
     durationDeviation?: number;
  };
  warnings?: string[];
  versionTag?: string;
  _meta?: {
    sanitizedMap?: Record<string, string>;
  };
  _step2a?: any;
  _step2b?: any;
  constraintCompliance?: ConstraintCompliance;
  auditResult?: AuditResult;
  calibration?: {
    reference_total_words: number;
    reference_duration_sec: number;
    actual_speech_rate: string;
    new_video_target_duration_sec: number;
    target_word_count: number;
    target_word_count_min: string;
    target_word_count_max: string;
  };
}

/* ---------------------------
   Video template / library types
   --------------------------- */

export interface VideoTemplate {
  id: string;
  name: string;
  description?: string;
  category?: 'educational' | 'marketing' | 'vlog' | string;
  defaultStyleDNA?: {
    tone?: string;
    visualStyle?: string;
    pacing?: 'slow' | 'medium' | 'fast' | string;
  };
  narrativeStructure?: string[];
  createdAt?: string;
}

/* ---------------------------
   Export
   --------------------------- */

export { };