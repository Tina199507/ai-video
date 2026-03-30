import { 
  StyleProfile, 
  ScriptOutput, 
  Scene, 
  GenerationResult 
} from "../types";
import { planGeneration } from "./planning";
import { generateReferenceSheet, generateSceneImage, generateSceneVideoWithKeyframe } from "./production";
import { ModelStrategy, QualityLevel, StrategyConstraints } from "./modelStrategy";
import { Observability } from "./observability";
import { Logger } from "../lib/logger";
import { runSafetyMiddleware } from "./safety";
import { createReviewTicket, saveWorkflowState, loadWorkflowState, WorkflowState } from "./storage";
import { matchMusic, MUSIC_LIBRARY, MusicTrack } from "./musicMatcher";
import { PromisePool } from "../lib/utils";
import { validateStyleProfile, applyFallbacks, createVerificationTasks } from "./utils/styleProfileQuality";

export interface WorkflowInput {
  topic: string;
  projectId: string;
  referenceVideoUrl?: string; // or file path
  referenceText?: string;
  userInstructions?: string;
  quality?: QualityLevel | StrategyConstraints;
  language?: string;
  dryRun?: boolean;
  resumeRunId?: string;
}

export interface WorkflowOutput {
  styleProfile: StyleProfile;
  script?: ScriptOutput;
  scenes?: Scene[];
  referenceSheetUrl?: string;
  estimatedCost?: number;
  estimatedDuration?: number;
  isDryRun?: boolean;
  matchedMusic?: MusicTrack | null;
}

export type WorkflowStep = 
  | 'INIT'
  // ANALYSIS
  | 'CV' | 'STYLE_EXTRACTION' | 'RISK_PRE_SCAN' | 'CACHE_WRITE'
  // SCRIPTING
  | 'STRUCTURE_DRAFT' | 'SAFETY_SCAN' | 'RISK_AGGREGATION'
  // STORYBOARD
  | 'VISUAL_PROMPT_GEN' | 'SUBJECT_ISOLATION_CHECK' | 'ASSET_PLAN'
  // PRODUCTION
  | 'ASSET_GENERATION' | 'ASSET_VALIDATION' | 'FINAL_RISK_GATE'
  | 'WORKFLOW_COMPLETE';

export class SafetyBlockError extends Error {
  ticketId: string;
  constructor(message: string, ticketId: string) {
    super(message);
    this.name = 'SafetyBlockError';
    this.ticketId = ticketId;
  }
}

/**
 * Orchestrates the end-to-end video generation pipeline.
 * Manages state, error handling, and observability across services.
 */
export class WorkflowOrchestrator {
  private quality: QualityLevel | StrategyConstraints;
  private language: string;
  private onProgress?: (step: WorkflowStep, progress: number, message: string) => void;
  private onData?: (step: WorkflowStep, data: any) => void;
  private state: WorkflowState | null = null;

  constructor(options: { 
    quality?: QualityLevel | StrategyConstraints; 
    language?: string; 
    onProgress?: (step: WorkflowStep, progress: number, message: string) => void;
    onData?: (step: WorkflowStep, data: any) => void;
  } = {}) {
    this.quality = options.quality || 'production';
    this.language = options.language || 'en';
    this.onProgress = options.onProgress;
    this.onData = options.onData;
  }

  private notify(step: WorkflowStep, progress: number, message: string) {
    if (this.onProgress) this.onProgress(step, progress, message);
    Logger.info(`[WORKFLOW][${step}] ${message}`);
  }

  private logData(step: WorkflowStep, data: any) {
    if (this.onData) this.onData(step, data);
  }

  private createDefaultProfile(): StyleProfile {
      return {
          visualStyle: "cinematic",
          tone: "informative",
          pacing: "medium",
          colorPalette: ['#000000', '#FFFFFF', '#333333', '#666666', '#999999'],
          narrativeStructure: ['Hook', 'Body', 'Conclusion'],
          keyElements: [],
          wordsPerMinute: 150,
          sourceDuration: 60,
          styleFingerprint: "default-style-v1",
          profileVersion: "v1.0",
          nodeConfidence: {},
          suspiciousNumericClaims: [],
          keyMoments: []
      } as unknown as StyleProfile;
  }

  private async executeStep<T>(
    stepName: string, 
    fn: () => Promise<T>, 
    context: any,
    retries: number = 3,
    compensate?: () => Promise<void>
  ): Promise<T> {
    if (!this.state) throw new Error("Workflow state not initialized");

    // Check if step already completed (for resume)
    if (this.state.stepStates[stepName]?.status === 'completed') {
      Logger.info(`[WORKFLOW] Skipping completed step: ${stepName}`);
      return this.state.stepStates[stepName].result as T;
    }

    this.state.currentStep = stepName;
    this.state.stepStates[stepName] = {
      status: 'running',
      attempts: 0,
      startTime: Date.now()
    };
    await saveWorkflowState(this.state);

    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        this.state.stepStates[stepName].attempts = i + 1;
        const result = await fn();
        Logger.info(`[WORKFLOW] Step ${stepName} result:`, result);
        
        this.state.stepStates[stepName].status = 'completed';
        this.state.stepStates[stepName].result = result;
        this.state.stepStates[stepName].endTime = Date.now();
        this.state.context = { ...this.state.context, ...context }; // Merge context
        this.state.updatedAt = Date.now();
        
        await saveWorkflowState(this.state);
        return result;
      } catch (e) {
        Logger.warn(`[WORKFLOW] Step ${stepName} failed attempt ${i + 1}`, e);
        lastError = e;
        if (e instanceof SafetyBlockError) throw e; // Don't retry safety blocks
      }
    }

    this.state.stepStates[stepName].status = 'failed';
    this.state.stepStates[stepName].error = lastError;
    this.state.status = 'failed';
    await saveWorkflowState(this.state);

    if (compensate) {
        Logger.info(`[WORKFLOW] Executing compensation for ${stepName}`);
        try {
            await compensate();
        } catch (compError) {
            Logger.error(`[WORKFLOW] Compensation failed for ${stepName}`, compError);
        }
    }

    throw lastError;
  }

  // --- ANALYSIS PHASE ---
  private async executeRiskPreScan(topic: string): Promise<{ isMedical: boolean; reason: string }> {
    this.notify('RISK_PRE_SCAN', 5, "Performing safety pre-check...");
    const { performSafetyCheck } = await import('./analysis');
    return await performSafetyCheck(topic);
  }

  private async executeCV(videoFile?: File): Promise<{ cvPalette: string[], faceRatio: number }> {
    this.notify('CV', 15, "Extracting visual features...");
    if (!videoFile) return { cvPalette: [], faceRatio: 0 };
    const { extractDominantColors, estimateFaceCloseupRatio } = await import('./cv');
    const cvPalette = await extractDominantColors(videoFile, 5);
    const faceRatio = await estimateFaceCloseupRatio(videoFile);
    return { cvPalette, faceRatio };
  }

  private async executeStyleExtraction(videoFile: File | undefined, cvResult: any): Promise<StyleProfile> {
    this.notify('STYLE_EXTRACTION', 20, "Extracting style DNA...");
    const { extractStyleWithLLM } = await import('./analysis');
    const analysisModel = ModelStrategy.getModelForStage('analysis', this.quality);
    return await extractStyleWithLLM(videoFile, cvResult, this.language, analysisModel.model, (msg) => this.notify('STYLE_EXTRACTION', 20, msg));
  }

  private async executeCacheWrite(videoFile: File | undefined, styleProfile: StyleProfile): Promise<void> {
    this.notify('CACHE_WRITE', 25, "Caching style profile...");
    if (!videoFile) return;
    const { getFileSignature, writeCachedProfile } = await import('./analysis');
    const analysisModel = ModelStrategy.getModelForStage('analysis', this.quality);
    const cacheKey = getFileSignature(videoFile, analysisModel.model);
    writeCachedProfile(cacheKey, styleProfile, analysisModel.model);
  }

  // --- PLANNING & RESEARCH PHASE ---
  // --- SCRIPTING PHASE ---
  private async executeScriptGeneration(topic: string, styleProfile: StyleProfile): Promise<ScriptOutput> {
    this.notify('STRUCTURE_DRAFT', 45, "Generating script (3-step workflow)...");
    // planGeneration sets wordsPerMinute and sourceDuration on styleProfile
    const plan = planGeneration(styleProfile);
    styleProfile.wordsPerMinute = plan.targetWPM;
    styleProfile.sourceDuration = plan.estimatedSceneCount * plan.targetSceneDuration;
    const scriptingModel = ModelStrategy.getModelForStage('scripting', this.quality);
    const { generateScriptThreeStep } = await import('./scripting');
    return await generateScriptThreeStep(topic, styleProfile, this.language, scriptingModel.model);
  }

  /* Deprecated steps
  private async executeStructureDraft(topic: string, styleProfile: StyleProfile, researchData: ResearchData, narrativeMap: NarrativeMap): Promise<any> {
    this.notify('STRUCTURE_DRAFT', 50, "Drafting script structure...");
    const scriptingModel = ModelStrategy.getModelForStage('scripting', this.quality);
    const { generateStructureDraft } = await import('./scripting');
    return await generateStructureDraft(topic, styleProfile, researchData, narrativeMap, this.language, scriptingModel.model);
  }

  private async executeTextExpansion(draft: any, styleProfile: StyleProfile): Promise<any> {
    this.notify('TEXT_EXPANSION', 55, "Expanding text...");
    const scriptingModel = ModelStrategy.getModelForStage('scripting', this.quality);
    const { expandScriptText } = await import('./scripting');
    return await expandScriptText(draft, styleProfile, scriptingModel.model);
  }

  private async executeContaminationScan(expanded: any, styleProfile: StyleProfile): Promise<ScriptOutput> {
    this.notify('CONTAMINATION_SCAN', 60, "Scanning for content contamination...");
    const scriptingModel = ModelStrategy.getModelForStage('scripting', this.quality);
    const { scanScriptContamination } = await import('./scripting');
    return await scanScriptContamination(expanded, styleProfile, scriptingModel.model);
  }
  */

  private async executeSafetyScan(script: ScriptOutput): Promise<any> {
    this.notify('SAFETY_SCAN', 65, "Scanning for safety violations...");
    return runSafetyMiddleware(script.scriptText);
  }

  private async executeRiskAggregation(safetyReport: any, script: ScriptOutput, projectId: string, traceId: string): Promise<ScriptOutput> {
    this.notify('RISK_AGGREGATION', 70, "Aggregating risks...");
    if (safetyReport.requiresManualReview) {
      const ticketId = await createReviewTicket({
        projectId, traceId, categories: safetyReport.categories, content: script.scriptText, excerptSpans: safetyReport.excerptSpans
      });
      Observability.logSafety(safetyReport.categories.join(','), true, `Ticket created: ${ticketId}`, traceId);
      throw new SafetyBlockError("Workflow paused: High-risk content requires manual review.", ticketId);
    }
    if (safetyReport.softened) {
      script.scriptText = safetyReport.finalText;
      script.safetyMetadata = { ...script.safetyMetadata, softenedWordingApplied: true };
    }
    return script;
  }

  // --- STORYBOARD PHASE ---
  private async executeVisualPromptGen(topic: string, styleProfile: StyleProfile, script: ScriptOutput): Promise<Scene[]> {
    this.notify('VISUAL_PROMPT_GEN', 75, "Generating visual prompts...");
    const { generateStoryboard } = await import('./storyboard');
    const scriptingModel = ModelStrategy.getModelForStage('scripting', this.quality);
    return await generateStoryboard(topic, styleProfile, script.scriptText, script, this.language, scriptingModel.model);
  }

  private async executeSubjectIsolationCheck(scenes: Scene[], topic: string, styleProfile: StyleProfile): Promise<Scene[]> {
    this.notify('SUBJECT_ISOLATION_CHECK', 80, "Checking subject isolation...");
    const { subjectIsolationCheck } = await import('./storyboard');
    const scriptingModel = ModelStrategy.getModelForStage('scripting', this.quality);
    return await subjectIsolationCheck(scenes, topic, styleProfile, scriptingModel.model);
  }

  private async executeAssetPlan(scenes: Scene[]): Promise<Scene[]> {
    this.notify('ASSET_PLAN', 85, "Planning assets...");
    const { planAssets } = await import('./storyboard');
    return planAssets(scenes, typeof this.quality === 'string' ? this.quality : 'production');
  }

  // --- PRODUCTION PHASE ---
  private async executeAssetGeneration(topic: string, scenes: Scene[], styleProfile: StyleProfile): Promise<{ scenes: Scene[], referenceSheetUrl: string }> {
    this.notify('ASSET_GENERATION', 90, "Generating assets...");
    const visualModel = ModelStrategy.getModelForStage('visual', this.quality);
    const videoModel = ModelStrategy.getModelForStage('video', this.quality);
    const refUrl = await generateReferenceSheet(topic, styleProfile, "16:9", visualModel.model);
    
    const pool = new PromisePool(3);
    const finalScenes = await Promise.all(scenes.map((scene, index) => {
      return pool.add(async () => {
        this.notify('ASSET_GENERATION', 90 + (index / scenes.length) * 5, `Rendering Scene ${index + 1}...`);
        const imgUrl = await generateSceneImage(scene.visualPrompt, "16:9", false, refUrl, styleProfile, topic, false, visualModel.model);
        let assetUrl = imgUrl;
        let assetType: 'image' | 'video' = 'image';
        if (scene.assetType === 'video') {
          const vRes = await generateSceneVideoWithKeyframe(scene.visualPrompt, imgUrl, refUrl, undefined, styleProfile, topic, false, videoModel.model, visualModel.model);
          assetUrl = vRes.videoUrl;
          assetType = 'video';
        }
        return { ...scene, assetUrl, assetType, keyframeUrl: imgUrl, status: 'done' } as Scene;
      });
    }));
    return { scenes: finalScenes, referenceSheetUrl: refUrl };
  }

  private async executeAssetValidation(scenes: Scene[]): Promise<Scene[]> {
    this.notify('ASSET_VALIDATION', 95, "Validating assets...");
    const { validateAsset } = await import('./validation');
    for (const scene of scenes) {
      if (scene.assetUrl) {
        const isValid = await validateAsset(scene.assetUrl, scene.assetType === 'video' ? 'video' : 'image');
        if (!isValid) Logger.warn(`Asset validation failed for scene ${scene.id}`);
      }
    }
    return scenes;
  }

  private async executeFinalRiskGate(scenes: Scene[]): Promise<Scene[]> {
    this.notify('FINAL_RISK_GATE', 98, "Final risk gate check...");
    const { finalRiskGate } = await import('./validation');
    const { isSafe, issues } = await finalRiskGate(scenes);
    if (!isSafe) {
      Logger.warn("Final risk gate failed", issues);
      // Handle appropriately
    }
    return scenes;
  }

  public async analyze(options: { topic?: string, videoFile?: File }): Promise<StyleProfile> {
    const cvResult = await this.executeCV(options.videoFile);
    let styleProfile = await this.executeStyleExtraction(options.videoFile, cvResult);
    const validation = validateStyleProfile(styleProfile);
    if (!validation.ok) {
        const { profile: fallbackProfile } = applyFallbacks(styleProfile);
        styleProfile = fallbackProfile;
    }
    return styleProfile;
  }

  public async planAndResearch(topic: string, styleProfile: StyleProfile): Promise<{ plan: any }> {
    const plan = planGeneration(styleProfile);
    styleProfile.wordsPerMinute = plan.targetWPM;
    styleProfile.sourceDuration = plan.estimatedSceneCount * plan.targetSceneDuration;
    return { plan };
  }

  public async draftScript(topic: string, styleProfile: StyleProfile, projectId: string, traceId: string): Promise<ScriptOutput> {
    let script = await this.executeScriptGeneration(topic, styleProfile);
    const safetyReport = await this.executeSafetyScan(script);
    return await this.executeRiskAggregation(safetyReport, script, projectId, traceId);
  }

  public async produceStoryboard(topic: string, styleProfile: StyleProfile, scriptOutput: string | ScriptOutput): Promise<Scene[]> {
    const scriptText = typeof scriptOutput === 'string' ? scriptOutput : scriptOutput.scriptText;
    let scenes = await this.executeVisualPromptGen(topic, styleProfile, { scriptText } as ScriptOutput);
    scenes = await this.executeSubjectIsolationCheck(scenes, topic, styleProfile);
    return await this.executeAssetPlan(scenes);
  }

  public async produceReferenceSheet(topic: string, styleProfile: StyleProfile, aspectRatio: string = "16:9"): Promise<string> {
    const visualModel = ModelStrategy.getModelForStage('visual', this.quality);
    return await generateReferenceSheet(topic, styleProfile, aspectRatio, visualModel.model);
  }

  public async produceSceneAsset(scene: Scene, topic: string, styleProfile: StyleProfile, referenceSheetUrl: string, type: 'image' | 'video', onProgress?: (msg: string) => void): Promise<Scene> {
    const visualModel = ModelStrategy.getModelForStage('visual', this.quality);
    const videoModel = ModelStrategy.getModelForStage('video', this.quality);
    
    if (onProgress) onProgress(type === 'video' ? 'Animating (Veo)...' : 'Rendering...');
    const imgUrl = await generateSceneImage(scene.visualPrompt, "16:9", false, referenceSheetUrl, styleProfile, topic, false, visualModel.model);
    let assetUrl = imgUrl;
    let assetType: 'image' | 'video' = 'image';
    if (type === 'video') {
      const vRes = await generateSceneVideoWithKeyframe(scene.visualPrompt, imgUrl, referenceSheetUrl, undefined, styleProfile, topic, false, videoModel.model, visualModel.model);
      assetUrl = vRes.videoUrl;
      assetType = 'video';
    }
    return { ...scene, assetUrl, assetType, keyframeUrl: imgUrl, status: 'done' } as Scene;
  }

  async run(input: WorkflowInput): Promise<WorkflowOutput> {
    const runId = input.resumeRunId || `wf-${Date.now()}`;
    const traceId = runId;
    const startTime = Date.now();
    Logger.info(`Starting Workflow ${runId} (DryRun: ${input.dryRun})`, input);

    if (input.resumeRunId) {
      this.state = await loadWorkflowState(input.resumeRunId);
      if (!this.state) throw new Error(`Could not resume run ${input.resumeRunId}: State not found`);
    } else {
      this.state = {
        runId, projectId: input.projectId, status: 'running', currentStep: 'INIT', stepStates: {}, context: {}, updatedAt: Date.now()
      };
      await saveWorkflowState(this.state);
    }

    try {
      // --- ANALYSIS ---
      const safety = await this.executeStep('RISK_PRE_SCAN', () => this.executeRiskPreScan(input.topic), {});
      
      let videoFile: File | undefined = undefined;
      if (input.referenceVideoUrl) {
         const res = await fetch(input.referenceVideoUrl);
         const blob = await res.blob();
         videoFile = new File([blob], "reference_video.mp4", { type: blob.type });
      }

      const cvResult = await this.executeStep('CV', () => this.executeCV(videoFile), {});
      let styleProfile = await this.executeStep('STYLE_EXTRACTION', () => this.executeStyleExtraction(videoFile, cvResult), {});
      
      const validation = validateStyleProfile(styleProfile);
      if (!validation.ok) {
          const { profile: fallbackProfile } = applyFallbacks(styleProfile);
          styleProfile = fallbackProfile;
      }
      
      await this.executeStep('CACHE_WRITE', () => this.executeCacheWrite(videoFile, styleProfile), {});

      // --- SCRIPTING ---
      let script = await this.executeStep('STRUCTURE_DRAFT', () => this.executeScriptGeneration(input.topic, styleProfile), {});

      if (input.dryRun) {
        this.notify('STRUCTURE_DRAFT', 100, "Simulate complete. Returning preview.");
        return { styleProfile, estimatedCost: 0, estimatedDuration: 0, isDryRun: true };
      }
      // script = await this.executeStep('TEXT_EXPANSION', () => this.executeTextExpansion(script, styleProfile), {});
      // script = await this.executeStep('CONTAMINATION_SCAN', () => this.executeContaminationScan(script, styleProfile), {});
      const safetyReport = await this.executeStep('SAFETY_SCAN', () => this.executeSafetyScan(script), {});
      script = await this.executeStep('RISK_AGGREGATION', () => this.executeRiskAggregation(safetyReport, script, input.projectId, traceId), {});

      // --- STORYBOARD ---
      let scenes = await this.executeStep('VISUAL_PROMPT_GEN', () => this.executeVisualPromptGen(input.topic, styleProfile, script), {});
      scenes = await this.executeStep('SUBJECT_ISOLATION_CHECK', () => this.executeSubjectIsolationCheck(scenes, input.topic, styleProfile), {});
      scenes = await this.executeStep('ASSET_PLAN', () => this.executeAssetPlan(scenes), {});

      // --- PRODUCTION ---
      const { scenes: generatedScenes, referenceSheetUrl } = await this.executeStep('ASSET_GENERATION', () => this.executeAssetGeneration(input.topic, scenes, styleProfile), {});
      let finalScenes = await this.executeStep('ASSET_VALIDATION', () => this.executeAssetValidation(generatedScenes), {});
      finalScenes = await this.executeStep('FINAL_RISK_GATE', () => this.executeFinalRiskGate(finalScenes), {});

      this.notify('FINAL_RISK_GATE', 100, "Workflow complete.");
      this.state.status = 'completed';
      await saveWorkflowState(this.state);

      const stats = Observability.getStats();
      this.logData('WORKFLOW_COMPLETE', { runId, duration: Date.now() - startTime, aiCalls: stats.totalCalls, totalCost: stats.totalCost, success: true });

      return { styleProfile, script, scenes: finalScenes, referenceSheetUrl };

    } catch (error) {
      Logger.error(`Workflow Failed`, error);
      Observability.logLLMCall('WORKFLOW', 'orchestrator', 0, false, { error, traceId: runId });
      if (this.state) {
        this.state.status = 'failed';
        await saveWorkflowState(this.state);
      }
      throw error;
    }
  }
}