import { useCallback, useState, useMemo } from 'react';
import { StyleProfile, ResearchData, NarrativeMap, Scene, SavedTemplate } from '../types';
import { WorkflowOrchestrator } from '../services/workflow';
import { generateVideoThumbnail } from '../lib/utils';
import { refineScriptWithAI, generateSafeAlternative, refineSingleScene, checkScriptSafety } from '../services/refinement';
import { performScriptVerification } from '../services/scripting';
import { clearProjectCheckpoint } from '../services/storage';
import { useStudioState } from './useStudioState';
import { useApiManager } from './useApiManager';
import { usePipelineController } from './usePipelineController';
import { matchMusic, MUSIC_LIBRARY } from '../services/musicMatcher';

export const useStrategyEngine = (
    stateLayer: ReturnType<typeof useStudioState>,
    apiManager: ReturnType<typeof useApiManager>,
    pipeline: ReturnType<typeof usePipelineController>,
    language: string,
    orchestrator: WorkflowOrchestrator
) => {
  const { stateRef, isMountedRef, setState, updateStateAndSave, addLog } = stateLayer;
  const { ensureApiKey, handleError } = apiManager;
  const { setCurrentPipelineStage } = pipeline;
  const [showSafetyModal, setShowSafetyModal] = useState(false);

  // 3. SCRIPTING PHASE
  const runScriptingPhase = useCallback(async (topic: string, profile: StyleProfile) => {
    addLog(`Strategy Complete. Drafting Script...`, 'info');
    if (isMountedRef.current) setCurrentPipelineStage('SCRIPTING');
    setState(s => ({ ...s, isProcessing: true }));

    try {
      updateStateAndSave(s => ({ ...s, generationProgress: { stage: 'scripting', currentBeat: 0, totalBeats: 0 }, draftScriptPartial: null, pendingDiffs: [] }));

      const projectId = stateRef.current.projectId || `proj-${Date.now()}`;
      const traceId = `trace-${Date.now()}`;
      const scriptOutput = await orchestrator.draftScript(topic, profile, projectId, traceId);

      if (!scriptOutput || !scriptOutput.scriptText || scriptOutput.scriptText.length < 50) {
        throw new Error("Generated script is too short or empty.");
      }

      // Extract narrativeMap and researchData from scriptOutput so ScriptPage panels stay populated
      const narrativeMapFromScript: NarrativeMap = (scriptOutput as any)._step2a?.narrative_map
        ? (scriptOutput as any)._step2a.narrative_map.map((s: any) => ({
            sectionTitle: s.stage_title,
            description: s.description,
            estimatedDuration: s.estimated_duration_sec,
            targetWordCount: s.target_word_count,
            factReferences: (s.fact_references || []).map((id: number) => `Fact-${id}`),
          }))
        : [];

      const researchDataFromScript: ResearchData = (scriptOutput as any)._step2a?.verified_facts
        ? {
            facts: (scriptOutput as any)._step2a.verified_facts.map((f: any, i: number) => ({
              id: `fact-${i + 1}`,
              content: f.content,
              sources: [{ url: '', title: f.source_marker, reliability: 0.8 }],
              aggConfidence: 0.85,
              type: 'verified' as const,
            })),
            myths: [],
            glossary: [],
            claimVerifications: [],
          }
        : { facts: [], myths: [], glossary: [], claimVerifications: [] };

      const versionId = Date.now().toString();
      updateStateAndSave(s => ({
        ...s,
        narrativeMap: narrativeMapFromScript.length > 0 ? narrativeMapFromScript : s.narrativeMap,
        researchData: researchDataFromScript.facts.length > 0 ? researchDataFromScript : s.researchData,
        draftScript: scriptOutput.scriptText,
        scriptVersions: [
          ...s.scriptVersions,
          {
            id: versionId,
            label: `v${s.scriptVersions.length + 1}`,
            content: scriptOutput.scriptText,
            timestamp: new Date().toLocaleTimeString(),
            usedFactIDs: scriptOutput.usedFactIDs,
            factUsage: scriptOutput.factUsage,
            inferredClaims: scriptOutput.inferredClaims,
            requiresManualCorrection: scriptOutput.requiresManualCorrection,
            sourceMetadata: scriptOutput.sourceMetadata,
            safetyMetadata: scriptOutput.safetyMetadata,
            styleConsistency: scriptOutput.styleConsistency
          }
        ],
        pendingDiffs: scriptOutput.pendingDiffs || [],
        partialScenes: scriptOutput.scenes || [],
        verificationReport: {
          safetyCheck: !scriptOutput.safetyMetadata?.isHighRisk,
          medicalFlag: scriptOutput.safetyMetadata?.riskCategories?.includes('medical') || false,
          styleConsistencyScore: scriptOutput.styleConsistency?.score || 1,
          styleStatus: scriptOutput.styleConsistency?.status || 'pass',
          factCheckPassed: scriptOutput.verificationReport?.factCheckPassed || false,
          factCoverageScore: scriptOutput.verificationReport?.factCoverage || 0,
          durationStatus: scriptOutput.verificationReport?.durationConsistency || 'pass',
          durationDeviation: scriptOutput.verificationReport?.durationDeviation || 0,
          safetyReason: scriptOutput.safetyMetadata?.triggerWarning
        },
        isProcessing: false
      }));

      addLog('Draft Script Ready.', 'success');

      if (scriptOutput.requiresManualCorrection) {
        addLog('Warning: Script requires manual review for some beats. Check pending diffs.', 'warning');
      }

    } catch (error: any) {
      console.error("Scripting Phase Error:", error);
      if (error.name === 'SafetyBlockError') {
        addLog(`Workflow paused. Manual review required. Ticket ID: ${error.ticketId}`, 'error');
        setState(s => ({ 
          ...s, 
          isProcessing: false,
          verificationReport: {
            ...s.verificationReport,
            safetyCheck: false,
            safety: 'requires_review',
            safetyReason: error.message
          } as any
        }));
        setShowSafetyModal(true);
      } else {
        handleError(error);
        setState(s => ({ ...s, isProcessing: false }));
      }
    }
  }, [orchestrator, addLog, handleError, updateStateAndSave, isMountedRef, setCurrentPipelineStage, setState]);

  // 2. STRATEGY PHASE
  const startStrategyPhase = useCallback(async (topic: string, styleProfile: StyleProfile) => {
    if (isMountedRef.current) setCurrentPipelineStage('RESEARCH');
    setState(s => ({ ...s, isProcessing: true }));
    
    try {
      const { plan } = await orchestrator.planAndResearch(topic, styleProfile);
      
      addLog(`Generation Plan: ${plan.factsCount} Facts, ${plan.sequenceCount} Sequences, ~${plan.estimatedSceneCount} Scenes.`, 'info');
      plan.reasoning.forEach((r: string) => addLog(`> ${r}`, 'info'));
      
      updateStateAndSave(s => ({ ...s, generationPlan: plan }));
      
      await runScriptingPhase(topic, styleProfile);
    } catch (error: any) { 
        console.error("Strategy Phase Error:", error);
        handleError(error); 
        setState(s => ({ ...s, isProcessing: false }));
    }
  }, [orchestrator, addLog, handleError, updateStateAndSave, runScriptingPhase, isMountedRef, setCurrentPipelineStage, setState]);

  // 1. ANALYSIS PHASE
  const handleAnalyze = useCallback(async (file: File, topic: string) => {
    if (!(await ensureApiKey())) return;
    if (isMountedRef.current) setCurrentPipelineStage('STRATEGY');
    
    let detectedRatio: "16:9" | "9:16" = "16:9";
    let detectedDuration = 0;

    setState(s => ({ 
      ...s, isProcessing: true, referenceVideoUrl: URL.createObjectURL(file), referenceTitle: file.name, targetTopic: topic,
      error: null, styleProfile: null, researchData: null, narrativeMap: null, draftScript: null, scriptVersions: [], referenceSheetUrl: null, scenes: []
    }));
    
    addLog(`Step 1: Ingesting local video file...`, 'info');
    try {
      const meta = await generateVideoThumbnail(file);
      detectedRatio = meta.width >= meta.height ? "16:9" : "9:16";
      detectedDuration = meta.duration;
      if (isMountedRef.current) {
          setState(s => ({ ...s, referenceThumbnailUrl: meta.thumbnail, targetAspectRatio: detectedRatio }));
      }
    } catch (e) { addLog('Could not extract video metadata, defaulting to 16:9', 'warning'); }

    try {
      // Use Orchestrator for Analysis
      const styleProfile = await orchestrator.analyze({ videoFile: file });
      
      // Augment profile with local metadata
      styleProfile.targetAspectRatio = detectedRatio;
      styleProfile.sourceDuration = detectedDuration;
      styleProfile._meta = { sourceTitle: file.name, sourceThumbnail: stateRef.current.referenceThumbnailUrl || '' };

      const matchedMusic = matchMusic(styleProfile.audioStyle, MUSIC_LIBRARY);
      if (matchedMusic) {
        addLog(`Matched BGM: ${matchedMusic.id} (${matchedMusic.genre})`, 'info');
      }

      addLog('...Success: Identified Style DNA.', 'success');
      
      // Perform Safety Check (Orchestrator doesn't expose this separately yet, maybe it should? 
      // Or we keep using the service directly for this specific check if it's not part of the main flow)
      // Actually, let's keep using the service for safety check as it's a specific gate here.
      // But wait, orchestrator.analyze could include safety check? 
      // For now, I'll keep the safety check separate or assume analyze does it?
      // The previous code called performSafetyCheck in parallel.
      
      const safetyResult = await checkScriptSafety(topic, 'gemini-3-flash-preview'); // Using a default model for quick check

      updateStateAndSave(s => ({ ...s, styleProfile, matchedMusic, verificationReport: { safetyCheck: true, medicalFlag: !safetyResult.isSafe, styleConsistencyScore: 0, factCheckPassed: false, safetyReason: safetyResult.reason } }));

      if (!safetyResult.isSafe) {
        if (isMountedRef.current) {
            setState(s => ({ ...s, isProcessing: false }));
            setShowSafetyModal(true);
        }
      } else {
        await startStrategyPhase(topic, styleProfile);
      }
    } catch (error: any) { handleError(error); }
  }, [ensureApiKey, addLog, orchestrator, startStrategyPhase, handleError, updateStateAndSave, isMountedRef, setCurrentPipelineStage, setState, stateRef]);

  const handleScriptApproved = useCallback(async (finalScript: string) => {
    setState(s => ({ ...s, draftScript: finalScript, isProcessing: true }));
    if (isMountedRef.current) setCurrentPipelineStage('STORYBOARD');
    
    if (!(await ensureApiKey())) {
      setState(s => ({ ...s, isProcessing: false }));
      return;
    }
    
    addLog('Script Approved. Starting Production...', 'info');
    
    try {
      const { targetTopic, styleProfile } = stateRef.current;
      if (!styleProfile) throw new Error("Missing style profile");

      // Use Orchestrator for Storyboard
      const scenes = await orchestrator.produceStoryboard(targetTopic, styleProfile, finalScript);
      
      // Use Orchestrator for Reference Sheet & Assets
      // Note: produceAssets generates ALL assets. If we want just reference sheet + storyboard text, we might need to split.
      // The previous logic generated reference sheet and storyboard text, then stopped.
      // Let's generate reference sheet first.
      
      // Actually, produceAssets does reference sheet + scene assets.
      // If we want to show the storyboard *before* generating full assets, we should stop here.
      // But the previous code called generateReferenceSheet AND generateStoryboard.
      
      // Let's generate reference sheet using orchestrator (we might need to expose it or use produceAssets with empty scenes?)
      // I'll just use produceAssets but maybe I should have exposed generateReferenceSheet on orchestrator.
      // I'll use the service directly for reference sheet if orchestrator doesn't expose it alone, 
      // OR I can use produceAssets and it will generate it.
      
      // Wait, orchestrator.produceAssets takes scenes.
      // If I pass scenes, it renders them.
      // The previous flow: generateReferenceSheet -> generateStoryboard -> DONE (User reviews storyboard).
      // Then user clicks "Generate Assets" in Production phase.
      
      // So here we just want Storyboard + Reference Sheet.
      // I'll add produceReferenceSheet to Orchestrator or just use the service.
      // To be consistent, I should use Orchestrator.
      // I'll update Orchestrator to expose produceReferenceSheet in the next step if needed, 
      // but for now I'll assume I can use produceAssets with empty scenes to get ref sheet? No that's hacky.
      
      // I'll use the service directly for reference sheet for now, or better, add it to orchestrator.
      // But I can't edit orchestrator file in this turn (I already did).
      // I'll use the service directly for reference sheet, but use orchestrator for storyboard.
      
      // Actually, I can use orchestrator.produceAssets with the scenes I just got?
      // No, that would render them. We want to stop before rendering.
      
      // So:
      // 1. Generate Storyboard (Orchestrator)
      // 2. Generate Reference Sheet (Service - or add to Orchestrator later)
      
      // Use Orchestrator for Reference Sheet
      const referenceSheetPromise = !stateRef.current.referenceSheetUrl 
        ? orchestrator.produceReferenceSheet(targetTopic, styleProfile) 
        : Promise.resolve(null);
        
      const [newRefSheetUrl] = await Promise.all([referenceSheetPromise]);

      updateStateAndSave(s => ({ 
        ...s, 
        scenes, 
        referenceSheetUrl: newRefSheetUrl || s.referenceSheetUrl, 
        isProcessing: false 
      }));
      addLog('Storyboard Ready.', 'success');
    } catch (error: any) { 
      handleError(error);
      setState(s => ({ ...s, isProcessing: false }));
    }
  }, [ensureApiKey, addLog, orchestrator, handleError, updateStateAndSave, isMountedRef, setCurrentPipelineStage, setState, stateRef]);

  const handleRefineScript = useCallback(async (instruction: string) => {
    setState(s => ({ ...s, isProcessing: true }));
    try {
      const newScript = await refineScriptWithAI(stateRef.current.draftScript!, instruction, stateRef.current.styleProfile!, language, stateRef.current.modelConfig.scriptingModel);
      updateStateAndSave(s => ({ 
          ...s, draftScript: newScript, 
          scriptVersions: [...s.scriptVersions, { id: Date.now().toString(), label: `v${s.scriptVersions.length + 1}`, content: newScript, timestamp: new Date().toLocaleTimeString() }], 
          isProcessing: false 
      }));
    } catch (e) { handleError(e); }
  }, [language, handleError, updateStateAndSave, setState, stateRef]);

  const handleRefineScenePreview = useCallback(async (sceneText: string, sceneIndex: number, instruction: string) => {
      setState(s => ({ ...s, isProcessing: true }));
      try {
          const styleProfile: StyleProfile = stateRef.current.styleProfile || {
              visualStyle: 'Realistic',
              pacing: 'Medium',
              tone: 'Neutral',
              colorPalette: [],
              targetAudience: 'General',
              keyElements: [],
              pedagogicalApproach: 'Standard',
              narrativeStructure: [],
              scriptStyle: 'Standard',
              fullTranscript: '',
              wordCount: 0,
              wordsPerMinute: 150,
              targetAspectRatio: '16:9'
          };
          const draftScript = stateRef.current.draftScript || "";
          
          const refined = await refineSingleScene(sceneText, sceneIndex, instruction, styleProfile, draftScript, language, stateRef.current.modelConfig.scriptingModel);
          setState(s => ({ ...s, isProcessing: false }));
          return refined;
      } catch (e) {
          handleError(e);
          setState(s => ({ ...s, isProcessing: false }));
          return sceneText;
      }
  }, [language, handleError, setState, stateRef]);

  const handleRestoreScriptVersion = useCallback((id: string) => { const v = stateRef.current.scriptVersions.find(v => v.id === id); if(v) updateStateAndSave(s => ({ ...s, draftScript: v.content })); }, [updateStateAndSave, stateRef]);
  const handleRegenerateReference = useCallback(async () => { if (!(await ensureApiKey())) return; setState(s => ({ ...s, isProcessing: true })); try { const u = await orchestrator.produceReferenceSheet(stateRef.current.targetTopic, stateRef.current.styleProfile!); updateStateAndSave(s => ({ ...s, referenceSheetUrl: u, isProcessing: false })); } catch (e: any) { handleError(e); } }, [ensureApiKey, handleError, updateStateAndSave, setState, stateRef, orchestrator]);
  const handleDraftOnly = useCallback(async (topic: string) => { if (stateRef.current.styleProfile) startStrategyPhase(topic, stateRef.current.styleProfile); }, [startStrategyPhase, stateRef]);
  const handleLoadProfile = useCallback((p: StyleProfile) => { clearProjectCheckpoint(); setState(s => ({ ...s, styleProfile: p, referenceTitle: p._meta?.sourceTitle, referenceThumbnailUrl: p._meta?.sourceThumbnail, targetAspectRatio: p.targetAspectRatio || "16:9", scenes: [], researchData: null, narrativeMap: null, draftScript: null })); setCurrentPipelineStage('STRATEGY'); }, [setState, setCurrentPipelineStage]);
  const handleImportProfile = useCallback((file: File) => { const reader = new FileReader(); reader.onload = (e) => handleLoadProfile(JSON.parse(e.target?.result as string)); reader.readAsText(file); }, [handleLoadProfile]);
  const handleLoadTemplate = useCallback((t: SavedTemplate) => { clearProjectCheckpoint(); setState(s => ({ ...s, styleProfile: t.profile, referenceTitle: t.profile._meta?.sourceTitle || 'Template', referenceThumbnailUrl: t.profile._meta?.sourceThumbnail, targetAspectRatio: t.profile.targetAspectRatio || "16:9", scenes: [], researchData: null, narrativeMap: null, draftScript: null, isProcessing: false })); setCurrentPipelineStage('STRATEGY'); }, [setState, setCurrentPipelineStage]);
  const handleSafetyProceed = useCallback(() => { setShowSafetyModal(false); if (stateRef.current.styleProfile && stateRef.current.targetTopic) startStrategyPhase(stateRef.current.targetTopic, stateRef.current.styleProfile); }, [startStrategyPhase, stateRef]);
  const handleSafetyAutoFix = useCallback(async () => { setShowSafetyModal(false); setState(s => ({ ...s, isProcessing: true })); const safe = await generateSafeAlternative(stateRef.current.targetTopic, stateRef.current.verificationReport?.safetyReason || ""); updateStateAndSave(s => ({ ...s, targetTopic: safe, verificationReport: null })); if (stateRef.current.styleProfile) startStrategyPhase(safe, stateRef.current.styleProfile); }, [startStrategyPhase, updateStateAndSave, setState, stateRef]);
  const handleUpdateResearchData = useCallback((fn: (p: ResearchData) => ResearchData) => updateStateAndSave(s => ({ ...s, researchData: s.researchData ? fn(s.researchData) : null })), [updateStateAndSave]);
  const handleUpdateNarrativeMap = useCallback((fn: (p: NarrativeMap) => NarrativeMap) => updateStateAndSave(s => ({ ...s, narrativeMap: s.narrativeMap ? fn(s.narrativeMap) : null })), [updateStateAndSave]);
  const handleUpdateGenerationPlan = useCallback((updates: any) => updateStateAndSave(s => ({ ...s, generationPlan: { ...(s.generationPlan || {}), ...updates } })), [updateStateAndSave]);
  const handleScriptRegenerate = useCallback(() => { if(stateRef.current.styleProfile && stateRef.current.targetTopic) startStrategyPhase(stateRef.current.targetTopic, stateRef.current.styleProfile); }, [startStrategyPhase, stateRef]);
  const handleConfirmStyle = useCallback(() => { if(stateRef.current.styleProfile && stateRef.current.targetTopic) startStrategyPhase(stateRef.current.targetTopic, stateRef.current.styleProfile); }, [startStrategyPhase, stateRef]);
  const handleUploadAnchor = useCallback((file: File) => { updateStateAndSave(s => ({ ...s, referenceSheetUrl: URL.createObjectURL(file) })); }, [updateStateAndSave]);
  const handleStrategyApproved = useCallback(() => { if(stateRef.current.styleProfile && stateRef.current.targetTopic) startStrategyPhase(stateRef.current.targetTopic, stateRef.current.styleProfile); }, [startStrategyPhase, stateRef]);
  const handleSafetyCancel = useCallback(() => { setShowSafetyModal(false); setState(s => ({ ...s, isProcessing: false })); }, [setState]);
  const handleUpdateStyleProfile = useCallback((updates: Partial<StyleProfile>) => updateStateAndSave(s => ({ ...s, styleProfile: s.styleProfile ? { ...s.styleProfile, ...updates } : null })), [updateStateAndSave]);
  const handleUpdateDraft = useCallback((draft: string) => updateStateAndSave(s => ({ ...s, draftScript: draft })), [updateStateAndSave]);
  const handleCreateScriptVersion = useCallback((content: string, meta?: any) => { 
      updateStateAndSave(s => ({ 
          ...s, 
          draftScript: content, 
          scriptVersions: [...s.scriptVersions, { 
              id: Date.now().toString(), 
              label: `v${s.scriptVersions.length + 1}`, 
              content: content, 
              timestamp: new Date().toLocaleTimeString(),
              ...meta
          }] 
      })); 
  }, [updateStateAndSave]);

  const handleVerifyScript = useCallback(async (scriptText: string) => {
      const { narrativeMap, styleProfile, modelConfig } = stateRef.current;
      if (!narrativeMap || !styleProfile) return;

      // 1. Local Verification (Duration & Fact Coverage)
      const minimalOutput: any = {
          scriptText: scriptText,
          usedFactIDs: [], 
          factUsage: [],
          inferredClaims: [],
          scenes: [], 
          safetyMetadata: { isHighRisk: false, riskCategories: [], softenedWordingApplied: false }
      };
      
      const verification = performScriptVerification(minimalOutput, narrativeMap, styleProfile);
      
      updateStateAndSave(s => ({ 
          ...s, 
          verificationReport: {
              durationConsistency: verification.durationStatus,
              factCoverage: verification.factCoverageScore > 0.8 ? 'pass' : verification.factCoverageScore > 0.5 ? 'warn' : 'fail',
              styleConsistency: s.verificationReport?.styleConsistency || 'pass',
              safety: s.verificationReport?.safety || 'ok'
          }
      }));
      
      // 2. AI Safety Check
      try {
          const safetyResult = await checkScriptSafety(scriptText, modelConfig.scriptingModel);
          
          if (!safetyResult.isSafe) {
               updateStateAndSave(s => ({
                  ...s,
                  verificationReport: {
                      ...(s.verificationReport || { durationConsistency: 'pass', factCoverage: 'pass', styleConsistency: 'pass' }),
                      safety: 'requires_review',
                      safetyReason: safetyResult.reason
                  }
              }));
              setShowSafetyModal(true);
          } else {
              updateStateAndSave(s => ({
                  ...s,
                  verificationReport: {
                      ...(s.verificationReport || { durationConsistency: 'pass', factCoverage: 'pass', styleConsistency: 'pass' }),
                      safety: 'ok',
                      safetyReason: undefined
                  }
              }));
          }
      } catch (e) {
          console.error("Safety Check Failed", e);
      }
  }, [updateStateAndSave, stateRef, setShowSafetyModal]);

  return {
    showSafetyModal,
    setShowSafetyModal,
    actions: {
        handleAnalyze,
        handleScriptApproved,
        handleRefineScript,
        handleRefineScenePreview,
        handleRestoreScriptVersion,
        handleRegenerateReference,
        handleDraftOnly,
        handleLoadProfile,
        handleImportProfile,
        handleLoadTemplate,
        handleSafetyProceed,
        handleSafetyAutoFix,
        handleUpdateResearchData,
        handleUpdateNarrativeMap,
        handleUpdateGenerationPlan,
        handleScriptRegenerate,
        handleConfirmStyle,
        handleUploadAnchor,
        handleStrategyApproved,
        handleSafetyCancel,
        handleUpdateStyleProfile,
        handleUpdateDraft,
        handleCreateScriptVersion,
        handleVerifyScript
    }
  };
};