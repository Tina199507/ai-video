/* ------------------------------------------------------------------ */
/*  Scene quality scoring & retry helpers                             */
/* ------------------------------------------------------------------ */

import type { VisualDNA } from './stages/visualConsistency.js';
import type { CVQualityMetrics } from './stages/cvMetrics.js';
import type { Scene, SceneQualityScore } from './pipelineTypes.js';

export type { SceneQualityScore } from './pipelineTypes.js';

export function computeOverallScore(s: SceneQualityScore): number {
  return Math.round((s.visualConsistency * 0.5 + s.audioCompleteness * 0.2 + s.assetIntegrity * 0.3) * 100) / 100;
}

export function scoreVisualAgainstRef(sceneDna: VisualDNA | undefined, refDna: VisualDNA | undefined): number {
  if (!refDna || !sceneDna) return 100;
  const commonColors = sceneDna.dominantColors.filter(c => refDna.dominantColors.includes(c)).length;
  const colorScore = Math.min(100, (commonColors / Math.max(1, refDna.dominantColors.length)) * 100);
  const brightnessScore = sceneDna.brightness === refDna.brightness ? 100 : 70;
  const tempScore = sceneDna.colorTemperature === refDna.colorTemperature ? 100 : 75;
  const keywordOverlap = sceneDna.styleKeywords.filter(k => refDna.styleKeywords.includes(k)).length;
  const keywordScore = Math.min(100, (keywordOverlap / Math.max(1, refDna.styleKeywords.length)) * 100);
  const score = Math.round((colorScore * 0.4 + brightnessScore * 0.15 + tempScore * 0.15 + keywordScore * 0.3) * 100) / 100;
  return score;
}

export function buildSceneQualityScore(scene: Scene, visualScore: number, cv?: CVQualityMetrics): SceneQualityScore {
  const audioCompleteness = scene.audioUrl ? 100 : 0;
  const assetIntegrity = scene.assetUrl ? 100 : (scene.keyframeUrl ? 60 : 0);
  let adjustedVisual = visualScore;
  if (cv?.ssim !== undefined) {
    const ssimScore = cv.ssim * 100;
    adjustedVisual = visualScore * 0.6 + ssimScore * 0.25 + (cv.sharpness ?? 70) * 0.15;
  } else if (cv?.sharpness !== undefined) {
    adjustedVisual = visualScore * 0.85 + cv.sharpness * 0.15;
  }

  const s: SceneQualityScore = {
    visualConsistency: Math.round(Math.min(100, Math.max(0, adjustedVisual)) * 100) / 100,
    audioCompleteness,
    assetIntegrity,
    cv,
    overall: 0,
  };
  s.overall = computeOverallScore(s);
  return s;
}

export const DEFAULT_VISUAL_CONSISTENCY_THRESHOLD = 65;
export const DEFAULT_OVERALL_THRESHOLD = 70;

export function shouldRetryBasedOnVisual(score: number, threshold = DEFAULT_VISUAL_CONSISTENCY_THRESHOLD): boolean {
  return score < threshold;
}

export function shouldDegradeBasedOnOverall(overall: number, threshold = DEFAULT_OVERALL_THRESHOLD): boolean {
  return overall < threshold;
}

export default {};
