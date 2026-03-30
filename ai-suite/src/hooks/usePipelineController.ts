import { useState, useCallback } from 'react';
import { PipelineStage } from '../types';

export const usePipelineController = (initialStage: PipelineStage = 'STRATEGY') => {
  const [currentPipelineStage, setCurrentPipelineStage] = useState<PipelineStage>(initialStage);

  const handleJumpToStage = useCallback((stage: PipelineStage, isProcessing: boolean) => {
      if (!isProcessing) setCurrentPipelineStage(stage);
  }, []);

  return {
    currentPipelineStage,
    setCurrentPipelineStage,
    actions: {
        handleJumpToStage
    }
  };
};
