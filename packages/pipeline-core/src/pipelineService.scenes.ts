import type { PipelineOrchestrator } from './orchestrator.js';
import type {
  ModelOverrides,
  PipelineProject,
  Scene,
  StoryboardReplicationSettings,
  StoryboardReplicationStrength,
} from './pipelineTypes.js';
import type { SceneQualityScore } from './sceneQuality.js';
import type { StoryboardReplicationUpdate } from './pipelineService.js';

type IterationRecorder = (projectId: string, data: Record<string, unknown>) => void;

export async function regenerateSceneAssets(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  sceneId: string,
  feedback?: string,
): Promise<Scene> {
  if (feedback?.trim()) {
    const project = orchestrator.loadProject(projectId);
    if (project?.scenes) {
      const scene = project.scenes.find(s => s.id === sceneId);
      if (scene) {
        const stripped = scene.visualPrompt.replace(/^\[用户反馈:[^\]]*\]\n/g, '');
        scene.visualPrompt = `[用户反馈: ${feedback.trim()}]\n${stripped}`;
        orchestrator.updateScenes(projectId, project.scenes);
      }
    }
  }
  return orchestrator.regenerateSceneAssets(projectId, sceneId);
}

export function updateScriptText(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  scriptText: string,
): PipelineProject {
  return orchestrator.updateScript(projectId, scriptText);
}

export function updateProjectScenes(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  scenes: Scene[],
): PipelineProject {
  return orchestrator.updateScenes(projectId, scenes);
}

export function updateSceneQualityScore(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  sceneId: string,
  quality: SceneQualityScore,
): PipelineProject {
  const project = orchestrator.loadProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.scenes) project.scenes = [];
  const idx = project.scenes.findIndex(s => s.id === sceneId || String(s.number) === sceneId);
  if (idx === -1) throw new Error(`Scene ${sceneId} not found`);
  const scene = project.scenes[idx];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  scene.quality = quality;
  project.updatedAt = new Date().toISOString();
  orchestrator.updateScenes(projectId, project.scenes);
  return orchestrator.loadProject(projectId)!;
}

export function updateModelOverridesForProject(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  overrides: ModelOverrides,
): PipelineProject {
  return orchestrator.updateModelOverrides(projectId, overrides);
}

export function approveProjectScene(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  sceneId: string,
): PipelineProject {
  return orchestrator.approveScene(projectId, sceneId);
}

export function rejectProjectScene(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  sceneId: string,
  reason: string | undefined,
  recordIteration: IterationRecorder,
): PipelineProject {
  if (reason?.trim()) {
    recordIteration(projectId, { type: 'reject_scene', sceneId, reason: reason.trim() });
  }
  return orchestrator.rejectScene(projectId, sceneId, reason);
}

export function approveQaReviewForProject(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  override?: { feedback?: string },
): PipelineProject {
  return orchestrator.approveQaReview(projectId, override);
}

export function approveReferenceImagesForProject(
  orchestrator: PipelineOrchestrator,
  projectId: string,
): PipelineProject {
  return orchestrator.approveReferenceImages(projectId);
}

export function updateStoryboardReplicationSettings(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  update: StoryboardReplicationUpdate,
): PipelineProject {
  const project = orchestrator.loadProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const existing = project.storyboardReplication;
  const strength = (update.strength ?? existing?.strength ?? 'medium') as StoryboardReplicationStrength;
  if (!['low', 'medium', 'high'].includes(strength)) {
    throw new Error(`Invalid storyboard replication strength: ${String(update.strength)}`);
  }

  const enabled = update.enabled ?? existing?.enabled ?? true;
  let sourceProjectId = existing?.sourceProjectId;
  let referenceScenes = existing?.referenceScenes ?? [];

  if (update.sourceProjectId !== undefined) {
    const rawSourceId = update.sourceProjectId.trim();
    if (!rawSourceId) {
      sourceProjectId = undefined;
      referenceScenes = [];
    } else {
      if (rawSourceId === projectId) throw new Error('sourceProjectId cannot be the same as target project');
      const sourceProject = orchestrator.loadProject(rawSourceId);
      if (!sourceProject) throw new Error(`Source project ${rawSourceId} not found`);
      if (!sourceProject.scenes?.length) throw new Error(`Source project ${rawSourceId} has no storyboard scenes`);
      sourceProjectId = rawSourceId;
      referenceScenes = sourceProject.scenes
        .map((scene) => ({
          number: scene.number,
          narrative: scene.narrative,
          visualPrompt: scene.visualPrompt,
          camera: scene.productionSpecs?.camera,
          lighting: scene.productionSpecs?.lighting,
          estimatedDuration: scene.estimatedDuration,
        }))
        .slice(0, 24);
    }
  }

  const nextSettings: StoryboardReplicationSettings = {
    enabled,
    strength,
    sourceProjectId,
    notes: update.notes !== undefined ? (update.notes.trim() || undefined) : existing?.notes,
    referenceScenes,
  };

  return orchestrator.updateStoryboardReplication(projectId, nextSettings);
}
