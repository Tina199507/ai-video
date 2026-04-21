import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PipelineProject } from './pipelineTypes.js';
import type { PipelineOrchestrator } from './orchestrator.js';

export function listProjects(orchestrator: PipelineOrchestrator): PipelineProject[] {
  return orchestrator.listProjects();
}

export function createProject(
  orchestrator: PipelineOrchestrator,
  topic: string,
  title?: string,
  modelOverrides?: PipelineProject['modelOverrides'],
): PipelineProject {
  return orchestrator.createProject(topic, title, modelOverrides);
}

export function loadProject(orchestrator: PipelineOrchestrator, projectId: string): PipelineProject | null {
  return orchestrator.loadProject(projectId);
}

export function saveProject(orchestrator: PipelineOrchestrator, project: PipelineProject): void {
  orchestrator.saveProject(project);
}

export function invalidateArtifactCache(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  artifacts?: Iterable<string>,
): void {
  orchestrator.invalidateArtifactCache(projectId, artifacts);
}

export function deleteProject(orchestrator: PipelineOrchestrator, projectId: string): boolean {
  return orchestrator.deleteProject(projectId);
}

export function exportProjectBundle(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  exportableArtifacts: readonly string[],
): Record<string, any> | null {
  const project = orchestrator.loadProject(projectId);
  if (!project) return null;

  const projectDir = orchestrator.getProjectDir(projectId);
  const bundle: Record<string, any> = { project };
  for (const name of exportableArtifacts) {
    const filePath = join(projectDir, name);
    if (!existsSync(filePath)) continue;
    try {
      bundle[name] = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      // skip malformed artifacts
    }
  }
  bundle._exportedAt = new Date().toISOString();
  bundle._version = '1.0';
  return bundle;
}

export function importProjectBundle(
  orchestrator: PipelineOrchestrator,
  bundle: Record<string, any>,
  exportableArtifacts: readonly string[],
): PipelineProject {
  const projectId = `proj_${Date.now()}`;
  const imported = { ...bundle.project, id: projectId, updatedAt: new Date().toISOString() };

  const projectDir = orchestrator.getProjectDir(projectId);
  if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'project.json'), JSON.stringify(imported, null, 2));

  for (const name of exportableArtifacts) {
    if (!bundle[name]) continue;
    writeFileSync(join(projectDir, name), JSON.stringify(bundle[name], null, 2));
  }
  return imported;
}

export function readEventLog(dataDir: string, projectId: string): unknown[] {
  const logPath = join(dataDir, 'projects', projectId, 'events.jsonl');
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

export function recordIteration(
  orchestrator: PipelineOrchestrator,
  projectId: string,
  data: Record<string, unknown>,
): void {
  try {
    const projectDir = orchestrator.getProjectDir(projectId);
    const iterPath = join(projectDir, 'iterations.jsonl');
    const entry = { ...data, timestamp: new Date().toISOString() };
    appendFileSync(iterPath, JSON.stringify(entry) + '\n');
  } catch {
    // best effort
  }
}

export function readIterations(orchestrator: PipelineOrchestrator, projectId: string): unknown[] {
  const projectDir = orchestrator.getProjectDir(projectId);
  const iterPath = join(projectDir, 'iterations.jsonl');
  if (!existsSync(iterPath)) return [];
  return readFileSync(iterPath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
