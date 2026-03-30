import { useCallback, useState, useMemo } from 'react';
import { Scene } from '../types';
import { generateSpeech } from '../services/tts'; 
import { refineVisualsWithAI } from '../services/refinement';
import { WorkflowOrchestrator } from '../services/workflow';
import { useStudioState } from './useStudioState';
import { useApiManager } from './useApiManager';
import { usePipelineController } from './usePipelineController';

// Simple concurrency limiter
async function promisePool<T>(tasks: (() => Promise<T>)[], concurrency = 3): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];
  for (const task of tasks) {
    const p = task().then(r => { results.push(r); });
    executing.push(p);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      const index = await Promise.race(executing.map((p, i) => p.then(() => i)));
      executing.splice(index, 1);
    }
  }
  await Promise.all(executing);
  return results;
}

export const useProductionEngine = (
    stateLayer: ReturnType<typeof useStudioState>,
    apiManager: ReturnType<typeof useApiManager>,
    pipeline: ReturnType<typeof usePipelineController>,
    language: string,
    orchestrator: WorkflowOrchestrator
) => {
  const { stateRef, isMountedRef, setState, updateStateAndSave, addLog } = stateLayer;
  const { ensureApiKey, handleError } = apiManager;
  const { setCurrentPipelineStage } = pipeline;
  const [generatingAssets, setGeneratingAssets] = useState<Set<string>>(new Set());

  const handleBatchGenerateAssets = useCallback(async (scenes: Scene[], referenceUrl: string | null) => {
    addLog(`Generating Assets...`, 'info');
    setState(s => ({ ...s, isProcessing: true, scenes: s.scenes.map(sc => (sc.status === 'done' && sc.assetUrl) ? sc : { ...sc, status: 'generating', progressMessage: 'Queued...' }) }));
    
    // Filter scenes that need generation
    const scenesToProcess = scenes.filter(s => s.status !== 'done');

    // Define the task for each scene
    const tasks = scenesToProcess.map(scene => async () => {
        if (!isMountedRef.current) return;
        const sceneId = scene.id;
        
        // Update status to generating
        setState(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, status: 'generating', progressMessage: 'Generating...' } : sc) }));
        setGeneratingAssets(prev => { const next = new Set(prev); next.add(sceneId); return next; });

        try {
            // Use Orchestrator
            const result = await orchestrator.produceSceneAsset(
                scene,
                stateRef.current.targetTopic,
                stateRef.current.styleProfile!,
                referenceUrl || '',
                'image', // Default to image for batch if not specified, or could be based on quality
                (msg) => {
                    if (isMountedRef.current) setState(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, progressMessage: msg } : sc) }));
                }
            );
            
            addLog(`Scene ${scene.number} ready.`, 'success');
            updateStateAndSave(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, assetUrl: result.assetUrl, keyframeUrl: result.keyframeUrl, assetType: result.assetType, status: 'done', progressMessage: undefined } : sc) }));
        } catch (e: any) {
             console.error(e);
             setState(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, status: 'error', progressMessage: 'Failed' } : sc) }));
             handleError(e); 
        } finally {
            setGeneratingAssets(prev => { const next = new Set(prev); next.delete(sceneId); return next; });
        }
    });

    // Run with concurrency limit (e.g., 3 parallel requests)
    await promisePool(tasks, 3);

    if (isMountedRef.current) setState(s => ({ ...s, isProcessing: false }));
  }, [addLog, handleError, updateStateAndSave, isMountedRef, setState, stateRef, orchestrator]);

  const handleGenerateAllAssets = useCallback(async () => { 
      if (isMountedRef.current) setCurrentPipelineStage('PRODUCTION'); 
      await handleBatchGenerateAssets(stateRef.current.scenes, stateRef.current.referenceSheetUrl); 
  }, [handleBatchGenerateAssets, isMountedRef, setCurrentPipelineStage, stateRef]);

  const handleGenerateSpeech = useCallback(async (sceneId: string) => {
      if (!(await ensureApiKey())) return;
      setGeneratingAssets(prev => { const next = new Set(prev); next.add(sceneId); return next; });
      setState(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, progressMessage: 'Synthesizing...' } : sc) }));
      try {
          // Speech generation is not yet in Orchestrator, keep using service directly or add to Orchestrator
          const { audioUrl, duration } = await generateSpeech(stateRef.current.scenes.find(s => s.id === sceneId)?.narrative || "");
          updateStateAndSave(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, audioUrl, audioDuration: duration, estimatedDuration: Math.ceil(duration), progressMessage: undefined } : sc) }));
      } catch (e: any) { 
          if (e.message?.includes("API_KEY_MISSING")) {
              setState(s => ({ ...s, apiKeySet: false })); // Force re-check
              await ensureApiKey();
          }
          handleError(e); 
      } finally { setGeneratingAssets(prev => { const next = new Set(prev); next.delete(sceneId); return next; }); }
  }, [ensureApiKey, addLog, handleError, updateStateAndSave, setState, stateRef]);

  const handleRefineVisuals = useCallback(async (instr: string) => { setState(s => ({ ...s, isProcessing: true })); try { const newScenes = await refineVisualsWithAI(stateRef.current.scenes, instr, stateRef.current.styleProfile!, stateRef.current.modelConfig.scriptingModel); updateStateAndSave(s => ({ ...s, scenes: newScenes, isProcessing: false })); } catch (e) { handleError(e); } }, [handleError, updateStateAndSave, setState, stateRef]);
  
  const handleGenerateAsset = useCallback(async (sceneId: string, type: 'image' | 'video') => {
    if (!(await ensureApiKey())) return;
    const scene = stateRef.current.scenes.find(s => s.id === sceneId); if(!scene) return;
    
    setGeneratingAssets(prev => { const next = new Set(prev); next.add(sceneId); return next; });
    setState(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, status: 'generating', progressMessage: type === 'video' ? 'Animating (Veo)...' : 'Rendering...' } : sc) }));
    
    try {
      const result = await orchestrator.produceSceneAsset(
          scene,
          stateRef.current.targetTopic,
          stateRef.current.styleProfile!,
          stateRef.current.referenceSheetUrl || '',
          type,
          (msg) => {
              if (isMountedRef.current) setState(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, progressMessage: msg } : sc) }));
          }
      );

      updateStateAndSave(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, assetUrl: result.assetUrl, keyframeUrl: result.keyframeUrl, assetType: result.assetType, status: 'done', progressMessage: undefined } : sc) }));
    } catch (error: any) { handleError(error); } finally { setGeneratingAssets(prev => { const next = new Set(prev); next.delete(sceneId); return next; }); }
  }, [ensureApiKey, handleError, updateStateAndSave, isMountedRef, setState, stateRef, orchestrator]); 

  const handleUpdateScene = useCallback((id: string, updates: Partial<Scene>) => updateStateAndSave(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === id ? { ...sc, ...updates, audioUrl: (updates.narrative && updates.narrative !== sc.narrative) ? undefined : sc.audioUrl } : sc) })), [updateStateAndSave]);
  const handleUploadAsset = useCallback(async (sceneId: string, file: File) => { const url = URL.createObjectURL(file); updateStateAndSave(s => ({ ...s, scenes: s.scenes.map(sc => sc.id === sceneId ? { ...sc, assetUrl: url, keyframeUrl: url, assetType: file.type.startsWith('video') ? 'video' : 'image', status: 'done' } : sc) })); }, [updateStateAndSave]);

  const handleGenerateAllMissingAssets = useCallback(async (targetType: 'image' | 'video' = 'video') => {
    if (!(await ensureApiKey())) return;
    
    addLog(`Starting batch generation for missing assets (${targetType})...`, 'info');
    setState(s => ({ ...s, isProcessing: true }));

    const tasks: (() => Promise<void>)[] = [];
    const scenes = stateRef.current.scenes;

    for (const scene of scenes) {
        const needsVisual = targetType === 'video' 
            ? (!scene.assetUrl || scene.assetType !== 'video')
            : (!scene.assetUrl); 

        if (needsVisual) {
            tasks.push(async () => {
                if (!isMountedRef.current) return;
                await handleGenerateAsset(scene.id, targetType);
            });
        }

        if (!scene.audioUrl) {
            tasks.push(async () => {
                if (!isMountedRef.current) return;
                await handleGenerateSpeech(scene.id);
            });
        }
    }

    if (tasks.length === 0) {
        addLog('No missing assets found.', 'info');
        setState(s => ({ ...s, isProcessing: false }));
        return;
    }

    try {
        await promisePool(tasks, 2);
        addLog('Batch generation complete.', 'success');
    } catch (e) {
        handleError(e);
    } finally {
        if (isMountedRef.current) setState(s => ({ ...s, isProcessing: false }));
    }
  }, [ensureApiKey, addLog, setState, stateRef, isMountedRef, handleGenerateAsset, handleGenerateSpeech, handleError]);

  return {
    generatingAssets,
    actions: {
        handleBatchGenerateAssets,
        handleGenerateAllAssets,
        handleGenerateAllMissingAssets,
        handleGenerateSpeech,
        handleRefineVisuals,
        handleGenerateAsset,
        handleUpdateScene,
        handleUpdateScenePrompt: (id: string, p: string) => handleUpdateScene(id, { visualPrompt: p }),
        handleUploadAsset
    }
  };
};
