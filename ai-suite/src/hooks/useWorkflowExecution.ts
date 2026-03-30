import { useMemo, useState, useCallback } from 'react';
import { WorkflowOrchestrator, WorkflowStep } from '../services/workflow';
import { QualityLevel, StrategyConstraints } from '../services/modelStrategy';
import { Logger } from '../lib/logger';

export const useWorkflowExecution = (language: string, quality: QualityLevel | StrategyConstraints = 'production', addLog?: (msg: string, type: any, data?: any) => void) => {
  const [workflowProgress, setWorkflowProgress] = useState<{ step: WorkflowStep | null, progress: number, message: string }>({
    step: null,
    progress: 0,
    message: ''
  });

  const handleProgress = useCallback((step: WorkflowStep, progress: number, message: string) => {
    setWorkflowProgress({ step, progress, message });
  }, []);

  const handleData = useCallback((step: WorkflowStep, data: any) => {
    if (addLog) {
        addLog(`Output Data: ${step}`, 'data', data);
    }
  }, [addLog]);

  const orchestrator = useMemo(() => {
    return new WorkflowOrchestrator({
      language,
      quality,
      onProgress: handleProgress,
      onData: handleData
    });
  }, [language, quality, handleProgress, handleData]);

  return {
    orchestrator,
    workflowProgress,
    setWorkflowProgress
  };
};
