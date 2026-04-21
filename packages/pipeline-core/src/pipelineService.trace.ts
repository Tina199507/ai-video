import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TraceWriter, type TraceReplayBundle } from './traceStore.js';
import type { AiLogEntry } from './traceAnalyzer.js';

type ProjectDirResolver = (projectId: string) => string;

export function getLatestTraceBundle(
  projectId: string,
  resolveProjectDir: ProjectDirResolver,
): TraceReplayBundle | null {
  const projectDir = resolveProjectDir(projectId);
  const traceDir = join(projectDir, 'trace');
  if (!existsSync(traceDir)) return null;

  try {
    const files = readdirSync(traceDir)
      .filter(f => f.startsWith('trace-') && f.endsWith('.json'))
      .sort()
      .reverse();
    const latest = files[0];
    if (!latest) return null;
    return TraceWriter.load(join(traceDir, latest));
  } catch {
    return null;
  }
}

export function getTraceBundleById(
  projectId: string,
  traceId: string,
  resolveProjectDir: ProjectDirResolver,
): TraceReplayBundle | null {
  const projectDir = resolveProjectDir(projectId);
  const bundlePath = join(projectDir, 'trace', `trace-${traceId}.json`);
  if (!existsSync(bundlePath)) return null;

  try {
    return TraceWriter.load(bundlePath);
  } catch {
    return null;
  }
}

export function listTraceBundles(
  projectId: string,
  resolveProjectDir: ProjectDirResolver,
): Array<{ traceId: string; startedAt: string; outcome: string; durationMs?: number }> {
  const projectDir = resolveProjectDir(projectId);
  const traceDir = join(projectDir, 'trace');
  if (!existsSync(traceDir)) return [];

  const results: Array<{ traceId: string; startedAt: string; outcome: string; durationMs?: number }> = [];
  try {
    const files = readdirSync(traceDir).filter(f => f.startsWith('trace-') && f.endsWith('.json'));
    for (const f of files) {
      try {
        const bundle = TraceWriter.load(join(traceDir, f));
        results.push({
          traceId: bundle.traceId,
          startedAt: bundle.startedAt,
          outcome: bundle.outcome,
          durationMs: bundle.durationMs,
        });
      } catch {
        // Skip corrupt bundles
      }
    }
  } catch {
    // Ignore read errors
  }

  return results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getAiLogEntries(
  projectId: string,
  resolveProjectDir: ProjectDirResolver,
): AiLogEntry[] {
  const projectDir = resolveProjectDir(projectId);
  const logDir = join(projectDir, 'ai-logs');
  if (!existsSync(logDir)) return [];

  const entries: AiLogEntry[] = [];
  try {
    const files = readdirSync(logDir)
      .filter(f => f.endsWith('.json'))
      .sort();

    for (const f of files) {
      try {
        const raw = readFileSync(join(logDir, f), 'utf-8');
        const parsed = JSON.parse(raw) as Partial<AiLogEntry>;
        if (!parsed || typeof parsed !== 'object') continue;
        if (!parsed.timestamp || !parsed.stage || !parsed.method || !parsed.provider || !parsed.input) continue;
        entries.push({
          seq: parsed.seq ?? '',
          timestamp: String(parsed.timestamp),
          stage: String(parsed.stage),
          taskType: String(parsed.taskType ?? ''),
          method: String(parsed.method),
          provider: String(parsed.provider),
          durationMs: Number(parsed.durationMs ?? 0),
          input: parsed.input as AiLogEntry['input'],
          output: (parsed.output ?? undefined) as AiLogEntry['output'],
          error: (parsed.error ?? undefined) as AiLogEntry['error'],
        });
      } catch {
        // Skip corrupt log files
      }
    }
  } catch {
    // Ignore directory read errors
  }

  return entries;
}
