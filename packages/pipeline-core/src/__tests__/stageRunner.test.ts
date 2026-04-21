import { describe, it, expect, vi } from 'vitest';
import { StageRunner, type StageRunnerDeps, type TraceState } from '../stageRunner.js';
import type { PipelineEvent, PipelineProject, PipelineStage } from '../pipelineTypes.js';
import { SSE_EVENT } from '../pipelineTypes.js';
import { AIRequestAbortedError } from '../aiControl.js';
import { CIRValidationError } from '../cir/errors.js';

function makeProject(): PipelineProject {
  return {
    id: 'p1',
    topic: 't',
    title: 't',
    status: 'processing',
    createdAt: '',
    updatedAt: '',
    logs: [],
    stageStatus: {
      CAPABILITY_ASSESSMENT: 'pending',
    } as unknown as PipelineProject['stageStatus'],
  } as unknown as PipelineProject;
}

function makeDeps(overrides: Partial<StageRunnerDeps> = {}): {
  deps: StageRunnerDeps;
  events: PipelineEvent[];
  traceEvents: Array<{ kind: string; data: unknown }>;
  observability: ReturnType<typeof makeObservability>;
} {
  const events: PipelineEvent[] = [];
  const traceEvents: Array<{ kind: string; data: unknown }> = [];
  const traceState: TraceState = {
    writer: {
      append: (ev: { kind: string; data: unknown }) => {
        traceEvents.push({ kind: ev.kind, data: ev.data });
      },
    } as unknown as TraceState['writer'],
    ctx: { traceId: 't', spanId: 's' } as unknown as TraceState['ctx'],
    meta: {} as TraceState['meta'],
    startMs: 0,
  };

  const observability = makeObservability();
  const deps: StageRunnerDeps = {
    saveProject: vi.fn(),
    emit: (e: PipelineEvent) => events.push(e),
    observability: observability.impl,
    sessionManager: { saveTo: vi.fn() } as unknown as StageRunnerDeps['sessionManager'],
    getProjectDir: () => '/tmp/p1',
    getTraceState: () => traceState,
    ...overrides,
  };
  return { deps, events, traceEvents, observability };
}

function makeObservability() {
  const calls: Array<[string, ...unknown[]]> = [];
  const impl = {
    startStage: (...a: unknown[]) => calls.push(['startStage', ...a]),
    completeStage: (...a: unknown[]) => calls.push(['completeStage', ...a]),
    errorStage: (...a: unknown[]) => calls.push(['errorStage', ...a]),
    saveTo: (...a: unknown[]) => calls.push(['saveTo', ...a]),
  } as unknown as StageRunnerDeps['observability'];
  return { impl, calls };
}

describe('StageRunner', () => {
  const STAGE: PipelineStage = 'CAPABILITY_ASSESSMENT';

  it('runs happy path: processing → completed, emits SSE + artifact events', async () => {
    const project = makeProject();
    const { deps, events, traceEvents, observability } = makeDeps();
    const runner = new StageRunner(deps);

    await runner.run(project, STAGE, async () => {});

    expect(project.stageStatus[STAGE]).toBe('completed');
    expect(project.currentStage).toBe(STAGE);
    expect(events.map(e => e.type)).toEqual([
      SSE_EVENT.STAGE,
      SSE_EVENT.STAGE,
      SSE_EVENT.ARTIFACT,
    ]);
    expect(observability.calls.map(c => c[0])).toEqual([
      'startStage',
      'completeStage',
      'saveTo',
    ]);
    expect(traceEvents.map(e => e.kind)).toEqual(['stage.start', 'stage.complete']);
  });

  it('propagates errors, marks stage=error, emits ERROR event and stage.error trace', async () => {
    const project = makeProject();
    const { deps, events, traceEvents, observability } = makeDeps();
    const runner = new StageRunner(deps);

    await expect(
      runner.run(project, STAGE, async () => { throw new Error('boom'); }),
    ).rejects.toThrow(/boom/);

    expect(project.stageStatus[STAGE]).toBe('error');
    expect(project.error).toBe('boom');
    expect(events.find(e => e.type === SSE_EVENT.ERROR)).toBeDefined();
    expect(observability.calls.some(c => c[0] === 'errorStage')).toBe(true);
    expect(traceEvents.map(e => e.kind)).toEqual(['stage.start', 'stage.error']);
  });

  it('handles AIRequestAbortedError as warning (logs, still throws, no ERROR event)', async () => {
    const project = makeProject();
    const { deps, events, observability } = makeDeps();
    const runner = new StageRunner(deps);

    await expect(
      runner.run(project, STAGE, async () => { throw new AIRequestAbortedError('user-abort'); }),
    ).rejects.toBeInstanceOf(AIRequestAbortedError);

    expect(project.stageStatus[STAGE]).toBe('error');
    expect(events.some(e => e.type === SSE_EVENT.ERROR)).toBe(false);
    expect(events.some(e => e.type === SSE_EVENT.LOG)).toBe(true);
    expect(observability.calls.some(c => c[0] === 'errorStage')).toBe(false);
  });

  it('treats CIR validation errors as regular errors but logs enhanced diagnostics', async () => {
    const project = makeProject();
    const { deps, events } = makeDeps();
    const runner = new StageRunner(deps);

    await expect(
      runner.run(project, STAGE, async () => {
        throw new CIRValidationError(STAGE, 'VideoIR', ['required field missing']);
      }),
    ).rejects.toBeInstanceOf(CIRValidationError);

    expect(project.stageStatus[STAGE]).toBe('error');
    expect(events.some(e => e.type === SSE_EVENT.ERROR)).toBe(true);
  });

  it('skips trace events when no trace state is present', async () => {
    const project = makeProject();
    const { deps, traceEvents } = makeDeps({ getTraceState: () => undefined });
    const runner = new StageRunner(deps);

    await runner.run(project, STAGE, async () => {});
    expect(traceEvents).toEqual([]);
  });
});
