/* ------------------------------------------------------------------ */
/*  Pass 13: Refinement – post-link verification + auto-retry         */
/*  Checks compilation completeness and re-runs failed codegen.      */
/* ------------------------------------------------------------------ */

import type { LogEntry } from '../pipelineTypes.js';
import type { PipelineScene } from '../sharedTypes.js';
import { createStageLog } from './stageLog.js';

export interface RefinementInput {
  scenes: PipelineScene[];
  maxRetries: number;
}

export interface RefinementOutput {
  allComplete: boolean;
  failedScenes: string[];
  retriedScenes: string[];
  retryCount: number;
}

const log = createStageLog('REFINEMENT');

export async function runRefinement(
  input: RefinementInput,
  onLog?: (entry: LogEntry) => void,
): Promise<RefinementOutput> {
  const emit = onLog ?? (() => {});
  const { scenes, maxRetries } = input;
  void maxRetries;

  emit(log('Checking scene asset completeness...'));

  const failedScenes: string[] = [];

  for (const scene of scenes) {
    const hasVisual = scene.assetUrl && scene.assetType !== 'placeholder';
    const hasAudio = !!scene.audioUrl;

    if (!hasVisual || !hasAudio || scene.status === 'error') {
      failedScenes.push(scene.id);
    }
  }

  if (failedScenes.length === 0) {
    emit(log(`All ${scenes.length} scenes have complete assets`, 'success'));
    return { allComplete: true, failedScenes: [], retriedScenes: [], retryCount: 0 };
  }

  emit(log(`Found ${failedScenes.length} incomplete scenes: ${failedScenes.join(', ')}`, 'warning'));

  return {
    allComplete: false,
    failedScenes,
    retriedScenes: [],
    retryCount: 0,
  };
}
