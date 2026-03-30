import { useCallback, useRef } from 'react';
import { AIProvider } from '../types';
import { checkApiKey, promptApiKeySelection, getApiKey } from '../services/core';
import { useStudioState } from './useStudioState';

export const useApiManager = (stateLayer: ReturnType<typeof useStudioState>) => {
  const { stateRef, isMountedRef, setState, addLog } = stateLayer;

  const ensureApiKey = useCallback(async () => {
    if (stateRef.current.apiKeySet) return true;
    let hasKey = await checkApiKey();
    if (!hasKey) {
      addLog('Gemini API Key required. Opening selection...', 'warning');
      try { 
        await promptApiKeySelection(); 
        if (isMountedRef.current) {
            setState(s => ({ ...s, apiKeySet: true, error: null })); 
        }
        return true; 
      } catch (e) { 
        addLog('Cancelled.', 'error'); 
        return false; 
      }
    }
    return true;
  }, [addLog, isMountedRef, setState, stateRef]);

  const handleSetApiKey = useCallback((provider: AIProvider, key: string) => {
      if (typeof window !== 'undefined') {
          localStorage.setItem(`VS_API_KEY_${provider}`, key);
      }
      setState(s => ({ ...s, apiKeys: { ...s.apiKeys, [provider]: key }, apiKeySet: (provider === AIProvider.GEMINI ? !!key : s.apiKeySet) }));
  }, [setState]);

  const handleConnect = useCallback(async () => { 
      try { 
          await promptApiKeySelection(); 
          if (isMountedRef.current) setState(s => ({ ...s, apiKeySet: true, error: null })); 
      } catch (e) { 
          console.error(e); 
      } 
  }, [isMountedRef, setState]);

  const handleError = useCallback(async (error: any) => {
    if (!isMountedRef.current) return;
    console.error(error);
    const errorMessage = error.message || "Unknown error";
    if (errorMessage.includes("API_KEY_MISSING")) {
         addLog(`Access Denied: ${errorMessage}`, 'warning');
         setState(s => ({ ...s, isProcessing: false, error: errorMessage }));
         return;
    }
    addLog(`Error: ${errorMessage}`, 'error');
    setState(s => ({ ...s, isProcessing: false, error: errorMessage }));
  }, [addLog, isMountedRef, setState]);

  return {
    ensureApiKey,
    handleError,
    actions: {
        handleSetApiKey,
        handleConnect
    }
  };
};
