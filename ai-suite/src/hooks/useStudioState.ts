import { useState, useRef, useEffect, useCallback } from 'react';
import { AppState, LogEntry, AIProvider, SavedTemplate, ModelConfig } from '../types';
import { getApiKey } from '../services/core';
import { loadProjectCheckpoint, saveProjectCheckpoint, clearProjectCheckpoint, getSavedProfiles, saveProfileToLibrary, deleteSavedProfile, renameSavedProfile } from '../services/storage';
import { MODEL_PRESETS } from '../config/constants';
import { Logger } from '../lib/logger';

export const useStudioState = () => {
  const [state, setState] = useState<AppState>({
    projectId: undefined,
    referenceVideoUrl: null,
    referenceTitle: undefined,
    referenceThumbnailUrl: undefined,
    projectTitle: undefined, 
    targetTopic: '',
    targetAspectRatio: "16:9",
    modelConfig: MODEL_PRESETS.PLUS,
    apiKeys: {},
    styleProfile: null,
    researchData: null,
    narrativeMap: null,
    draftScript: null,
    scriptVersions: [],
    scriptHistory: [],
    referenceSheetUrl: null,
    scenes: [],
    savedTemplates: [], 
    isProcessing: false,
    verificationReport: null,
    error: null,
    apiKeySet: false,
    lowQualityMode: false,
    costBudget: { maxCostPerCall: 0.05, maxCostPerProject: 5.0 },
    latencySLA: { maxLatencyMs: 15000 }
  });

  const stateRef = useRef(state);
  const isMountedRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<AppState | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { return () => { isMountedRef.current = false; }; }, []);

  // --- AUTO LOAD CHECKPOINT & TEMPLATES & KEYS ---
  useEffect(() => {
    const keys: Partial<Record<AIProvider, string>> = {};
    [AIProvider.GEMINI].forEach(p => {
        const key = getApiKey(p);
        if (key) keys[p] = key;
    });

    if (isMountedRef.current) {
        setState(s => ({ ...s, apiKeys: keys, apiKeySet: !!keys[AIProvider.GEMINI] }));
    }

    const templates = getSavedProfiles();
    if (isMountedRef.current) {
        setState(s => ({ ...s, savedTemplates: templates }));
    }

    // const initLoad = async () => {
    //    const savedState = await loadProjectCheckpoint();
    //    if (savedState && isMountedRef.current) {
    //       Logger.info("Found autosave, restoring session...");
    //       setState(s => ({
    //           ...savedState,
    //           apiKeys: keys, 
    //           savedTemplates: templates,
    //           modelConfig: savedState.modelConfig || s.modelConfig,
    //           isProcessing: false, 
    //           scriptHistory: Array.isArray(savedState.scriptHistory) ? savedState.scriptHistory : []
    //       }));
    //    }
    // };
    // initLoad();
  }, []);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', data?: any) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const logMsg = `[${type.toUpperCase()}] ${message}`;
    
    if (type === 'error') {
      Logger.error(logMsg, data || '');
    } else if (type === 'warning') {
      Logger.warn(logMsg, data || '');
    } else {
      Logger.info(logMsg, data || '');
    }
  }, []);

  const scheduleSave = useCallback((stateToSave: AppState, delay = 1500) => {
      pendingSaveRef.current = stateToSave;
      if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
          if (!pendingSaveRef.current) return;
          const st = pendingSaveRef.current;
          saveTimerRef.current = null;
          pendingSaveRef.current = null;
          saveProjectCheckpoint(st).catch(err => Logger.error('autosave failed', err));
      }, delay);
  }, []);

  const updateStateAndSave = useCallback((updateFn: (s: AppState) => AppState) => {
      if (!isMountedRef.current) return;
      setState(prev => {
          const newState = updateFn(prev);
          scheduleSave(newState); 
          return newState;
      });
  }, [scheduleSave]);

  // Basic State Actions
  const handleSetProjectTitle = useCallback((title: string) => updateStateAndSave(s => ({ ...s, projectTitle: title })), [updateStateAndSave]);
  const handleUpdateModelConfig = useCallback((newConfig: Partial<ModelConfig>) => updateStateAndSave(s => ({ ...s, modelConfig: { ...s.modelConfig, ...newConfig } })), [updateStateAndSave]);
  const toggleLowQualityMode = useCallback(() => setState(s => ({ ...s, lowQualityMode: !s.lowQualityMode })), []);
  
  const handleStartProject = useCallback((title: string) => {
    clearProjectCheckpoint();
    setState(s => ({
        ...s, projectId: `proj-${Date.now()}`, projectTitle: title || "Untitled", targetTopic: '', styleProfile: null, researchData: null, narrativeMap: null, draftScript: null, scriptVersions: [], referenceVideoUrl: null, referenceTitle: undefined, referenceThumbnailUrl: undefined, referenceSheetUrl: null, scenes: [], isProcessing: false, verificationReport: null, error: null, finalVideoUrl: undefined
    }));
    addLog(`Project Started: ${title}`, 'info');
  }, [addLog]);

  const handleResetProfile = useCallback(() => { clearProjectCheckpoint(); setState(s => ({ ...s, projectTitle: undefined, styleProfile: null, referenceVideoUrl: null, referenceTitle: undefined, referenceThumbnailUrl: undefined, targetAspectRatio: "16:9", scriptVersions: [], scenes: [], researchData: null, draftScript: null, narrativeMap: null })); }, []);
  const handleSaveStyleToLibrary = useCallback((name?: string) => { if (stateRef.current.styleProfile) { const lib = saveProfileToLibrary(stateRef.current.styleProfile, name); setState(s => ({ ...s, savedTemplates: lib })); addLog('Saved to Library', 'success'); } }, [addLog]);
  const handleCreateLocalHistory = useCallback((content: string) => { setState(s => ({ ...s, scriptHistory: [content, ...(s.scriptHistory || [])].slice(0, 20) })); }, []);
  const handleDeleteTemplate = useCallback((id: string) => { const lib = deleteSavedProfile(id); setState(s => ({ ...s, savedTemplates: lib })); addLog('Template deleted', 'info'); }, [addLog]);
  const handleRenameTemplate = useCallback((id: string, newName: string) => { const lib = renameSavedProfile(id, newName); setState(s => ({ ...s, savedTemplates: lib })); addLog('Template renamed', 'success'); }, [addLog]);
  const handleClearLogs = useCallback(() => { setState(s => ({ ...s, logs: [] })); }, []);
  const handleDeleteActiveProject = useCallback(() => {
    clearProjectCheckpoint();
    setState(s => ({
        ...s,
        projectId: undefined,
        referenceVideoUrl: null,
        referenceTitle: undefined,
        referenceThumbnailUrl: undefined,
        projectTitle: undefined,
        targetTopic: '',
        styleProfile: null,
        researchData: null,
        narrativeMap: null,
        draftScript: null,
        scriptVersions: [],
        scriptHistory: [],
        referenceSheetUrl: null,
        scenes: [],
        verificationReport: null,
        error: null,
        finalVideoUrl: undefined,
        // Logs are preserved
    }));
    addLog('Project archive deleted. Logs preserved.', 'warning');
  }, [addLog]);
  const handleUpdateStyleProfile = useCallback((updates: Partial<any>) => {
      updateStateAndSave(s => ({
          ...s,
          styleProfile: s.styleProfile ? { ...s.styleProfile, ...updates } : null
      }));
  }, [updateStateAndSave]);
  const handleLoadTemplate = useCallback((template: SavedTemplate) => {
      setState(s => ({
          ...s,
          styleProfile: template.profile,
          referenceTitle: template.profile._meta?.sourceTitle,
          referenceThumbnailUrl: template.profile._meta?.sourceThumbnail,
          referenceVideoUrl: null // Clear video as we are loading a static profile
      }));
      addLog(`Loaded template: ${template.profile._meta?.sourceTitle}`, 'success');
  }, [addLog]);

  return {
    state,
    stateRef,
    isMountedRef,
    setState,
    updateStateAndSave,
    addLog,
    actions: {
        handleSetProjectTitle,
        handleUpdateModelConfig,
        toggleLowQualityMode,
        handleStartProject,
        handleResetProfile,
        handleSaveStyleToLibrary,
        handleCreateLocalHistory,
        handleDeleteTemplate,
        handleRenameTemplate,
        handleLoadTemplate,
        handleUpdateStyleProfile,
        handleClearLogs,
        handleDeleteActiveProject
    }
  };
};
