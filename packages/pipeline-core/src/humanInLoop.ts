/* ------------------------------------------------------------------ */
/*  HumanInLoopService — out-of-band operator API                      */
/*                                                                     */
/*  Extracted from PipelineOrchestrator so the main class can focus on */
/*  stage execution.  Owns the operator-facing "retry" and "regenerate */
/*  a single scene" flows (both re-enter the pipeline engine via       */
/*  deps.runPipeline).                                                 */
/* ------------------------------------------------------------------ */

import { join } from 'node:path';
import { ARTIFACT } from './constants.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import type { AIAdapter, ModelOverrides, PipelineProject, PipelineStage, Scene } from './pipelineTypes.js';
import type { SessionManager } from './sessionManager.js';
import type { AdapterScope } from './adapterResolver.js';
import type { CIRLoadContext } from './cir/loader.js';
import { loadVideoIR } from './cir/loader.js';
import { regenerateSceneImage } from './stages/referenceImage.js';
import { runKeyframeGen } from './stages/keyframeGen.js';
import { runVideoGen } from './stages/videoGen.js';
import { getStageOrder } from './stageRegistry.js';
import { transitionStage } from './stateMachine.js';

const log = createLogger('HumanInLoop');

export interface HumanInLoopDeps {
  loadProject: (id: string) => PipelineProject | null;
  saveProject: (project: PipelineProject) => void;
  saveArtifact: (projectId: string, filename: string, data: unknown) => void;
  loadArtifact: <T>(projectId: string, filename: string) => T | undefined;
  getProjectDir: (projectId: string) => string;
  getAdapter: (
    scope: AdapterScope,
    stage: PipelineStage,
    taskType: string,
    overrides?: ModelOverrides,
  ) => AIAdapter;
  sessionManager: SessionManager;
  /** Passthrough for video-gen stage (aivideomaker accounts). */
  getAivideomakerAdapters: () => AIAdapter[] | undefined;
  /** Re-enters the pipeline engine after a retry reset. */
  runPipeline: (projectId: string) => Promise<PipelineProject>;
}

export class HumanInLoopService {
  private readonly regeneratingScenes = new Set<string>();

  constructor(private readonly deps: HumanInLoopDeps) {}

  /**
   * Retry a specific stage: reset it (and every later stage) to `pending`,
   * clear any error state, and re-enter the main pipeline so the scheduler
   * re-runs from that stage forward.
   */
  async retryStage(projectId: string, stage: PipelineStage): Promise<PipelineProject> {
    const project = this.deps.loadProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const stages = getStageOrder();
    const stageIdx = stages.indexOf(stage);
    for (let i = stageIdx; i < stages.length; i++) {
      const s = stages[i];
      if (!s) continue;
      if (project.stageStatus[s] !== 'pending') {
        transitionStage(project.stageStatus, s, 'pending');
      }
    }
    project.error = undefined;

    // When retrying VIDEO_GEN, restore degraded scenes back to assetType='video'
    // so they will be re-processed instead of skipped.
    if (stage === 'VIDEO_GEN' && project.scenes) {
      let restored = 0;
      for (const scene of project.scenes) {
        if (scene.assetType === 'image' && scene.keyframeUrl) {
          scene.assetType = 'video';
          scene.assetUrl = undefined;
          scene.status = 'pending';
          restored++;
        }
      }
      if (restored > 0) {
        log.info('video_gen_retry_restored', { restored });
        this.deps.saveArtifact(projectId, ARTIFACT.SCENES, project.scenes);
      }
    }

    // Clear session group for the retried stage (force new chat context)
    this.deps.sessionManager.clearGroup(projectId, stage);

    this.deps.saveProject(project);
    return this.deps.runPipeline(projectId);
  }

  /**
   * Regenerate a single scene's image (+ keyframe + video for video scenes).
   * Guarded by an in-memory lock so two concurrent requests for the same
   * scene cannot race on the artifacts file.
   */
  async regenerateSceneAssets(projectId: string, sceneId: string): Promise<Scene> {
    const lockKey = `${projectId}:${sceneId}`;
    if (this.regeneratingScenes.has(lockKey)) {
      throw new Error(`Scene ${sceneId} is already being regenerated`);
    }
    this.regeneratingScenes.add(lockKey);
    try {
      return await this._regenerateSceneAssetsInner(projectId, sceneId);
    } finally {
      this.regeneratingScenes.delete(lockKey);
    }
  }

  private async _regenerateSceneAssetsInner(projectId: string, sceneId: string): Promise<Scene> {
    const project = this.deps.loadProject(projectId);
    if (!project?.scenes) throw new Error('Project or scenes not found');

    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);

    const assetsDir = join(this.deps.getProjectDir(projectId), 'assets');
    const scope: AdapterScope = {
      projectId,
      projectDir: this.deps.getProjectDir(projectId),
    };
    const cirCtx: CIRLoadContext = {
      loadArtifact: <T>(f: string) => this.deps.loadArtifact<T>(projectId, f),
    };
    const videoIR = loadVideoIR(cirCtx, 'REFERENCE_IMAGE');

    const imageAdapter = this.deps.getAdapter(
      scope,
      'REFERENCE_IMAGE',
      'image_generation',
      project.modelOverrides,
    );
    let updated = await regenerateSceneImage(imageAdapter, scene, videoIR, assetsDir);

    // For video scenes, also regenerate keyframe + video.
    if (updated.assetType === 'video') {
      const kfAdapter = this.deps.getAdapter(
        scope,
        'KEYFRAME_GEN',
        'image_generation',
        project.modelOverrides,
      );
      const kfResults = await runKeyframeGen(kfAdapter, {
        scenes: [updated],
        videoIR,
        assetsDir,
      });
      if (kfResults[0]) updated = kfResults[0];

      if (updated.keyframeUrl) {
        const vidAdapter = this.deps.getAdapter(
          scope,
          'VIDEO_GEN',
          'video_generation',
          project.modelOverrides,
        );
        const vidResults = await runVideoGen(vidAdapter, {
          scenes: [updated],
          videoIR,
          assetsDir,
          aivideomakerAdapters: this.deps.getAivideomakerAdapters(),
        });
        if (vidResults[0]) updated = vidResults[0];
      }
    }

    const idx = project.scenes.findIndex(s => s.id === sceneId);
    if (idx !== -1) project.scenes[idx] = updated;
    this.deps.saveArtifact(projectId, ARTIFACT.SCENES, project.scenes);
    this.deps.saveProject(project);

    return updated;
  }
}
