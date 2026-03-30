import { StyleProfile, GenerationPlan } from "../types";

// GenerationPlan is the canonical definition in src/types/state.ts and re-exported via src/types.ts.
// It is imported here rather than re-declared to keep a single source of truth.
export type { GenerationPlan };

export const planGeneration = (styleProfile: StyleProfile): GenerationPlan => {
  const reasoning: string[] = [];

  // 1. WPM & Audience
  const targetWPM = styleProfile.track_a_script?.total_words && styleProfile.meta?.video_duration_sec 
    ? Math.round((styleProfile.track_a_script.total_words / styleProfile.meta.video_duration_sec) * 60) 
    : (styleProfile.wordsPerMinute || 140);
  reasoning.push(`Using target WPM: ${targetWPM} from source analysis.`);

  const isExpert = styleProfile.targetAudience?.toLowerCase().includes('expert');
  const audienceFactor = isExpert ? 1.25 : 1.0;
  if (isExpert) reasoning.push("Increased information density for Expert audience.");

  const sourceDuration = styleProfile.meta?.video_duration_sec || styleProfile.sourceDuration || 60;

  // 2. Facts
  // Priority: 1. sourceFactCount from analysis, 2. Formula based on duration
  let factsCount = 0;
  if (styleProfile.sourceFactCount && styleProfile.sourceFactCount > 0) {
      factsCount = Math.max(3, Math.min(15, styleProfile.sourceFactCount));
      reasoning.push(`Using ${factsCount} facts identified from source analysis.`);
  } else {
      let baseFacts = Math.round(sourceDuration / 30);
      baseFacts = Math.max(3, Math.min(15, baseFacts));
      factsCount = Math.max(3, Math.min(15, Math.round(baseFacts * audienceFactor)));
      reasoning.push(`Planned ${factsCount} facts based on ${sourceDuration}s duration formula.`);
  }

  // 3. Sequences
  // Strictly follow narrative structure length
  const narrativeStructure = styleProfile.track_a_script?.narrative_arc || styleProfile.narrativeStructure;
  const sequenceCount = narrativeStructure && narrativeStructure.length > 0 
    ? narrativeStructure.length 
    : 4; // Default fallback
  reasoning.push(`Narrative structure defines ${sequenceCount} sequences.`);

  // 4. Scenes
  // Formula: ceil(total_duration / target_scene_duration)
  let targetSceneDuration = styleProfile.track_b_visual?.scene_avg_duration_sec || 8; // Moderate
  const pacing = styleProfile.track_a_script?.sentence_length?.avg < 15 ? 'fast' : (styleProfile.pacing?.toLowerCase() || 'medium');
  
  if (styleProfile.track_b_visual?.scene_avg_duration_sec) {
      reasoning.push(`Using explicit scene duration: ~${targetSceneDuration}s per scene.`);
  } else if (pacing.includes('fast')) {
      targetSceneDuration = 4;
      reasoning.push("Fast pacing: ~4s per scene.");
  } else if (pacing.includes('slow')) {
      targetSceneDuration = 12;
      reasoning.push("Slow pacing: ~12s per scene.");
  } else {
      reasoning.push("Moderate pacing: ~8s per scene.");
  }

  const estimatedSceneCount = styleProfile.track_b_visual?.estimated_total_scenes || Math.max(1, Math.ceil(sourceDuration / targetSceneDuration));
  reasoning.push(`Estimated ${estimatedSceneCount} scenes total.`);

  return {
    factsCount,
    sequenceCount,
    estimatedSceneCount,
    targetSceneDuration,
    targetWPM,
    audienceFactor,
    reasoning
  };
};