
import { useMemo, useEffect } from 'react';
import { useStudioState } from './useStudioState';
import { usePipelineController } from './usePipelineController';
import { useApiManager } from './useApiManager';
import { useStrategyEngine } from './useStrategyEngine';
import { useProductionEngine } from './useProductionEngine';
import { useWorkflowExecution } from './useWorkflowExecution';

export const useStudioEngine = (language: string = 'en') => {
  // 1. State Layer (Data & Persistence)
  const stateLayer = useStudioState();
  
  // 2. Pipeline Controller (Stage Management)
  const pipeline = usePipelineController();

  // 3. API Manager (Keys & Errors)
  const apiManager = useApiManager(stateLayer);

  // 4. Workflow Execution (Orchestrator)
  const strategyConstraints = useMemo(() => ({
    quality: { level: stateLayer.state.lowQualityMode ? 'draft' : 'production' as any },
    budget: stateLayer.state.costBudget,
    sla: stateLayer.state.latencySLA
  }), [stateLayer.state.lowQualityMode, stateLayer.state.costBudget, stateLayer.state.latencySLA]);

  const workflow = useWorkflowExecution(language, strategyConstraints, stateLayer.addLog);

  // Sync workflow progress to logs
  useEffect(() => {
    if (workflow.workflowProgress.message) {
      stateLayer.addLog(`[${workflow.workflowProgress.step}] ${workflow.workflowProgress.message}`, 'info');
    }
  }, [workflow.workflowProgress.message, workflow.workflowProgress.step, stateLayer.addLog]);

  // 5. Strategy Engine (Research & Scripting)
  const strategy = useStrategyEngine(stateLayer, apiManager, pipeline, language, workflow.orchestrator);

  // 6. Production Engine (Assets & Rendering)
  const production = useProductionEngine(stateLayer, apiManager, pipeline, language, workflow.orchestrator);

  // Compose Actions
  const actions = useMemo(() => ({
      addLog: stateLayer.addLog,
      ...stateLayer.actions,
      ...pipeline.actions,
      ...apiManager.actions,
      ...strategy.actions,
      ...production.actions
  }), [stateLayer.addLog, stateLayer.actions, pipeline.actions, apiManager.actions, strategy.actions, production.actions]);

  return {
    state: stateLayer.state,
    currentPipelineStage: pipeline.currentPipelineStage,
    generatingAssets: production.generatingAssets,
    showSafetyModal: strategy.showSafetyModal,
    setShowSafetyModal: strategy.setShowSafetyModal,
    workflowProgress: workflow.workflowProgress,
    actions
  };
};
