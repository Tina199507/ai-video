/* ------------------------------------------------------------------ */
/*  Final Risk Gate – output validation before compilation completes  */
/*  4-point safety + integrity check on the compiled output.         */
/* ------------------------------------------------------------------ */

import type { LogEntry } from '../pipelineTypes.js';
import type { PipelineScene } from '../sharedTypes.js';
import { runSafetyMiddleware } from '../safety.js';
import { SafetyBlockError } from '../orchestrator.js';
import { createStageLog } from './stageLog.js';

export interface FinalRiskGateInput {
  scenes: PipelineScene[];
  scriptText: string;
  safetyPreCleared?: boolean;
}

export interface FinalRiskGateOutput {
  passed: boolean;
  checks: {
    sceneCompleteness: boolean;
    placeholderDetection: boolean;
    narrativeSafety: boolean;
    missingAssets: string[];
    safetyIssues: string[];
  };
}

const log = createStageLog('REFINEMENT');

export function runFinalRiskGate(
  input: FinalRiskGateInput,
  onLog?: (entry: LogEntry) => void,
): FinalRiskGateOutput {
  const emit = onLog ?? (() => {});
  const { scenes, scriptText } = input;

  emit(log('Running final risk gate...'));

  const missingAssets: string[] = [];
  for (const scene of scenes) {
    if (!scene.assetUrl || scene.assetType === 'placeholder') {
      missingAssets.push(scene.id);
    }
    if (!scene.audioUrl) {
      missingAssets.push(`${scene.id}:audio`);
    }
  }
  const sceneCompleteness = missingAssets.length === 0;

  const placeholderPatterns = /\[TODO\]|\[INSERT\]|\[PLACEHOLDER\]|PLACEHOLDER|lorem ipsum|TBD/i;
  const hasPlaceholders = scenes.some(s =>
    placeholderPatterns.test(s.narrative) || placeholderPatterns.test(s.visualPrompt)
  );
  const placeholderDetection = !hasPlaceholders;

  const safetyIssues: string[] = [];
  if (!input.safetyPreCleared) {
    const safetyReport = runSafetyMiddleware(scriptText);
    if (safetyReport.suicideDetected) safetyIssues.push('suicide_risk');
    if (safetyReport.medicalClaimDetected) safetyIssues.push('medical_claim');
  }
  const narrativeSafety = safetyIssues.length === 0;

  const passed = sceneCompleteness && placeholderDetection && narrativeSafety;
  if (passed) {
    emit(log('Final risk gate: all checks passed', 'success'));
  } else {
    const failReasons: string[] = [];
    if (!sceneCompleteness) failReasons.push(`${missingAssets.length} missing assets`);
    if (!placeholderDetection) failReasons.push('placeholder content detected');
    if (!narrativeSafety) failReasons.push(`safety issues: ${safetyIssues.join(', ')}`);
    emit(log(`Final risk gate: FAILED — ${failReasons.join('; ')}`, 'warning'));
  }

  if (!narrativeSafety) {
    throw new SafetyBlockError(`Final risk gate: narrative safety failed (${safetyIssues.join(', ')})`);
  }

  return {
    passed,
    checks: {
      sceneCompleteness,
      placeholderDetection,
      narrativeSafety,
      missingAssets,
      safetyIssues,
    },
  };
}
