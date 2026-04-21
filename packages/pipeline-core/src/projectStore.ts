/* ------------------------------------------------------------------ */
/*  ProjectStore – compilation artifact store with atomic writes      */
/*  Each project is a compilation unit; all intermediate and final    */
/*  artifacts are persisted through this single CRUD gateway.         */
/* ------------------------------------------------------------------ */

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { PipelineProject, PipelineStage, ProcessStatus, ModelOverrides } from './pipelineTypes.js';
import { getStageOrder } from './stageRegistry.js';
import {
  createProjectKVStore,
  type CreateKVStoreOptions,
  type ProjectKVStore,
} from '@ai-video/pipeline-core/libFacade.js';
// Ensure stage definitions are registered before getStageOrder() is called.
import './stages/defs/index.js';

function defaultStageStatus(): Record<PipelineStage, ProcessStatus> {
  return Object.fromEntries(getStageOrder().map(s => [s, 'pending' as ProcessStatus])) as Record<PipelineStage, ProcessStatus>;
}

const PROJECT_KEY = 'project';

function artifactKey(filename: string): string {
  return filename.endsWith('.json') ? filename.slice(0, -'.json'.length) : filename;
}

export interface ProjectStoreOptions {
  createKVStore?: (projectDir: string, options: CreateKVStoreOptions) => ProjectKVStore;
  backend?: 'json' | 'sqlite';
}

export class ProjectStore {
  private readonly kvCache = new Map<string, ProjectKVStore>();
  private readonly createKVStore: NonNullable<ProjectStoreOptions['createKVStore']>;
  private readonly backendHint: ProjectStoreOptions['backend'];

  constructor(
    private readonly dataDir: string,
    options: ProjectStoreOptions = {},
  ) {
    this.createKVStore = options.createKVStore ?? createProjectKVStore;
    this.backendHint = options.backend;
  }

  getProjectDir(projectId: string): string {
    return join(this.dataDir, 'projects', projectId);
  }

  getAssetsDir(projectId: string): string {
    const dir = join(this.getProjectDir(projectId), 'assets');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  private kv(projectId: string): ProjectKVStore {
    let kv = this.kvCache.get(projectId);
    if (!kv) {
      const dir = this.getProjectDir(projectId);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      kv = this.createKVStore(dir, this.backendHint ? { backend: this.backendHint } : {});
      this.kvCache.set(projectId, kv);
    }
    return kv;
  }

  tx<T>(projectId: string, fn: () => T): T {
    return this.kv(projectId).tx(fn);
  }

  create(topic: string, title?: string, modelOverrides?: ModelOverrides): PipelineProject {
    const id = `proj_${Date.now()}_${randomBytes(3).toString('hex')}`;
    const project: PipelineProject = {
      id,
      title: title ?? topic.slice(0, 50),
      topic,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stageStatus: defaultStageStatus(),
      pauseAfterStages: ['QA_REVIEW', 'STORYBOARD', 'REFERENCE_IMAGE'],
      modelOverrides,
      logs: [],
    };
    this.save(project);
    return project;
  }

  save(project: PipelineProject): void {
    this.kv(project.id).set(PROJECT_KEY, project);
  }

  load(projectId: string): PipelineProject | null {
    const kv = this.kv(projectId);
    const proj = kv.get<PipelineProject>(PROJECT_KEY);
    return proj ?? null;
  }

  delete(projectId: string): boolean {
    const dir = this.getProjectDir(projectId);
    if (!existsSync(dir)) return false;
    const cached = this.kvCache.get(projectId);
    if (cached) {
      cached.close();
      this.kvCache.delete(projectId);
    }
    rmSync(dir, { recursive: true, force: true });
    return true;
  }

  list(): PipelineProject[] {
    const projectsDir = join(this.dataDir, 'projects');
    if (!existsSync(projectsDir)) return [];
    return readdirSync(projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => this.load(e.name))
      .filter((p): p is PipelineProject => p !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  saveArtifact(projectId: string, filename: string, data: unknown): void {
    this.kv(projectId).set(artifactKey(filename), data);
  }

  loadArtifact<T>(projectId: string, filename: string): T | undefined {
    return this.kv(projectId).get<T>(artifactKey(filename));
  }

  closeAll(): void {
    for (const kv of this.kvCache.values()) kv.close();
    this.kvCache.clear();
  }
}
