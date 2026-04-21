import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanInLoopService, type HumanInLoopDeps } from '../humanInLoop.js';
import type { PipelineProject, Scene, AIAdapter } from '../pipelineTypes.js';
import { ARTIFACT } from '../constants.js';

/**
 * Unit tests for HumanInLoopService — mocks the full dependency bag so we
 * can exercise the control-flow (retry reset, scene regen lock, error
 * branches) without spinning up an orchestrator.
 */

vi.mock('../stages/referenceImage.js', () => ({
  regenerateSceneImage: vi.fn(async (_adapter: AIAdapter, scene: Scene) => ({
    ...scene,
    referenceImageUrl: 'regen-ref.png',
  })),
  runRemainingReferenceImages: vi.fn(),
}));
vi.mock('../stages/keyframeGen.js', () => ({
  runKeyframeGen: vi.fn(async (_adapter: AIAdapter, { scenes }: { scenes: Scene[] }) =>
    scenes.map(s => ({ ...s, keyframeUrl: 'regen-kf.png' })),
  ),
}));
vi.mock('../stages/videoGen.js', () => ({
  runVideoGen: vi.fn(async (_adapter: AIAdapter, { scenes }: { scenes: Scene[] }) =>
    scenes.map(s => ({ ...s, assetUrl: 'regen-video.mp4', status: 'done' })),
  ),
}));
vi.mock('../cir/loader.js', () => ({
  loadVideoIR: vi.fn(() => ({ scenes: [], style: {}, meta: {} })),
}));
vi.mock('../stageRegistry.js', () => ({
  getStageOrder: () => [
    'CAPABILITY_ASSESSMENT',
    'STYLE_EXTRACTION',
    'RESEARCH',
    'SCRIPT_GENERATION',
    'REFERENCE_IMAGE',
    'KEYFRAME_GEN',
    'VIDEO_GEN',
    'TTS',
    'ASSEMBLY',
  ],
}));

function makeProject(overrides: Partial<PipelineProject> = {}): PipelineProject {
  return {
    id: 'p1',
    topic: 'test',
    title: 'test',
    status: 'processing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [],
    stageStatus: {
      CAPABILITY_ASSESSMENT: 'completed',
      STYLE_EXTRACTION: 'completed',
      RESEARCH: 'completed',
      NARRATIVE_MAP: 'completed',
      SCRIPT_GENERATION: 'completed',
      QA_REVIEW: 'completed',
      TEMPORAL_PLANNING: 'completed',
      STORYBOARD: 'completed',
      VIDEO_IR_COMPILE: 'completed',
      REFERENCE_IMAGE: 'completed',
      KEYFRAME_GEN: 'completed',
      VIDEO_GEN: 'error',
      TTS: 'pending',
      ASSEMBLY: 'pending',
      REFINEMENT: 'pending',
    },
    ...overrides,
  } as unknown as PipelineProject;
}

function makeDeps(overrides: Partial<HumanInLoopDeps> = {}): HumanInLoopDeps {
  const project = makeProject();
  const adapter = {
    generateText: vi.fn(),
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
  } as unknown as AIAdapter;
  return {
    loadProject: vi.fn(() => project),
    saveProject: vi.fn(),
    saveArtifact: vi.fn(),
    loadArtifact: vi.fn(() => undefined),
    getProjectDir: vi.fn(() => '/tmp/p1'),
    getAdapter: vi.fn(() => adapter),
    sessionManager: { clearGroup: vi.fn() } as unknown as HumanInLoopDeps['sessionManager'],
    getAivideomakerAdapters: vi.fn(() => undefined),
    runPipeline: vi.fn(async () => project),
    ...overrides,
  };
}

describe('HumanInLoopService.retryStage', () => {
  it('resets the target stage + all later stages to pending and re-enters pipeline', async () => {
    const project = makeProject();
    const deps = makeDeps({ loadProject: () => project });
    const svc = new HumanInLoopService(deps);

    await svc.retryStage('p1', 'SCRIPT_GENERATION');

    expect(project.stageStatus.SCRIPT_GENERATION).toBe('pending');
    expect(project.stageStatus.REFERENCE_IMAGE).toBe('pending');
    expect(project.stageStatus.VIDEO_GEN).toBe('pending');
    expect(project.error).toBeUndefined();
    expect(deps.sessionManager.clearGroup).toHaveBeenCalledWith('p1', 'SCRIPT_GENERATION');
    expect(deps.saveProject).toHaveBeenCalled();
    expect(deps.runPipeline).toHaveBeenCalledWith('p1');
  });

  it('restores degraded video scenes back to assetType=video when retrying VIDEO_GEN', async () => {
    const scenes: Scene[] = [
      {
        id: 's1',
        assetType: 'image',
        keyframeUrl: 'kf.png',
        assetUrl: 'fallback.png',
        status: 'done',
      } as Scene,
      { id: 's2', assetType: 'image', status: 'done' } as Scene,
    ];
    const project = makeProject({ scenes });
    const deps = makeDeps({ loadProject: () => project });
    const svc = new HumanInLoopService(deps);

    await svc.retryStage('p1', 'VIDEO_GEN');

    expect(scenes[0]!.assetType).toBe('video');
    expect(scenes[0]!.assetUrl).toBeUndefined();
    expect(scenes[0]!.status).toBe('pending');
    expect(scenes[1]!.assetType).toBe('image');
    expect(deps.saveArtifact).toHaveBeenCalledWith('p1', ARTIFACT.SCENES, scenes);
  });

  it('throws when the project cannot be loaded', async () => {
    const deps = makeDeps({ loadProject: () => null });
    const svc = new HumanInLoopService(deps);
    await expect(svc.retryStage('missing', 'SCRIPT_GENERATION')).rejects.toThrow(/not found/);
    expect(deps.runPipeline).not.toHaveBeenCalled();
  });
});

describe('HumanInLoopService.regenerateSceneAssets', () => {
  let project: PipelineProject;
  let deps: HumanInLoopDeps;
  let svc: HumanInLoopService;

  beforeEach(() => {
    project = makeProject({
      scenes: [
        { id: 's1', assetType: 'image', status: 'pending' } as Scene,
        { id: 's2', assetType: 'video', keyframeUrl: 'kf.png', status: 'pending' } as Scene,
      ],
    });
    deps = makeDeps({ loadProject: () => project });
    svc = new HumanInLoopService(deps);
  });

  it('regenerates an image-only scene (no keyframe/video pipeline)', async () => {
    const out = await svc.regenerateSceneAssets('p1', 's1');
    expect(out.referenceImageUrl).toBe('regen-ref.png');
    expect(deps.saveArtifact).toHaveBeenCalledWith('p1', ARTIFACT.SCENES, project.scenes);
    expect(deps.saveProject).toHaveBeenCalled();
  });

  it('throws when the target scene does not exist', async () => {
    await expect(svc.regenerateSceneAssets('p1', 'missing')).rejects.toThrow(/Scene missing not found/);
  });

  it('throws when project.scenes is missing', async () => {
    deps = makeDeps({ loadProject: () => ({ ...makeProject(), scenes: undefined } as PipelineProject) });
    svc = new HumanInLoopService(deps);
    await expect(svc.regenerateSceneAssets('p1', 's1')).rejects.toThrow(/Project or scenes not found/);
  });

  it('rejects a second regen for the same scene while the first is in flight', async () => {
    // Make regenerateSceneImage hang so we can observe the lock.
    const { regenerateSceneImage } = await import('../stages/referenceImage.js');
    let release!: () => void;
    const pending = new Promise<Scene>(resolve => {
      release = () => resolve({ id: 's1', assetType: 'image', status: 'done' } as Scene);
    });
    (regenerateSceneImage as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => pending,
    );

    const inflight = svc.regenerateSceneAssets('p1', 's1');
    await expect(svc.regenerateSceneAssets('p1', 's1')).rejects.toThrow(/already being regenerated/);

    release();
    await inflight;
  });
});
