import { describe, it, expect, afterEach } from 'vitest';
import {
  registerStage,
  getStageOrder,
  getStageDefinitions,
  __getRegistrySizeForTests,
  __truncateRegistryForTests,
  type StageDefinition,
  type StageRunContext,
} from '../stageRegistry.js';
import type { PipelineStage } from '../pipelineTypes.js';

const noop = async (_ctx: StageRunContext) => {};

function stage(name: string, extra: Partial<StageDefinition> = {}): StageDefinition {
  return { stage: name as PipelineStage, execute: noop, ...extra };
}

/** Helper for typing synthetic stage names inside the tests. */
const S = (n: string) => n as unknown as PipelineStage;

describe('stageRegistry declarative topology', () => {
  const baseline = __getRegistrySizeForTests();

  afterEach(() => {
    __truncateRegistryForTests(baseline);
  });

  it('preserves insertion order when no constraints are declared', () => {
    registerStage(stage('TEST_ALPHA_1'));
    registerStage(stage('TEST_ALPHA_2'));
    registerStage(stage('TEST_ALPHA_3'));

    const order = getStageOrder().slice(baseline);
    expect(order).toEqual(['TEST_ALPHA_1', 'TEST_ALPHA_2', 'TEST_ALPHA_3']);
  });

  it('honours `after` constraints', () => {
    registerStage(stage('TEST_BETA_A'));
    registerStage(stage('TEST_BETA_C', { after: S('TEST_BETA_B') }));
    registerStage(stage('TEST_BETA_B'));

    const order = getStageOrder().slice(baseline);
    const ia = order.indexOf(S('TEST_BETA_A'));
    const ib = order.indexOf(S('TEST_BETA_B'));
    const ic = order.indexOf(S('TEST_BETA_C'));
    expect(ia).toBeGreaterThanOrEqual(0);
    expect(ib).toBeLessThan(ic);
  });

  it('honours `before` constraints', () => {
    registerStage(stage('TEST_GAMMA_A'));
    registerStage(stage('TEST_GAMMA_B'));
    registerStage(stage('TEST_GAMMA_PRE', { before: S('TEST_GAMMA_B') }));

    const order = getStageOrder().slice(baseline);
    const ipre = order.indexOf(S('TEST_GAMMA_PRE'));
    const ib = order.indexOf(S('TEST_GAMMA_B'));
    expect(ipre).toBeLessThan(ib);
  });

  it('accepts array constraints for after and before', () => {
    registerStage(stage('TEST_DELTA_X'));
    registerStage(stage('TEST_DELTA_Y'));
    registerStage(stage('TEST_DELTA_MID', { after: [S('TEST_DELTA_X'), S('TEST_DELTA_Y')] }));

    const order = getStageOrder().slice(baseline);
    const ix = order.indexOf(S('TEST_DELTA_X'));
    const iy = order.indexOf(S('TEST_DELTA_Y'));
    const im = order.indexOf(S('TEST_DELTA_MID'));
    expect(ix).toBeLessThan(im);
    expect(iy).toBeLessThan(im);
  });

  it('ignores unknown constraint targets so plugins can declare optional ordering', () => {
    registerStage(stage('TEST_EPSILON', { after: S('UNKNOWN_STAGE') }));
    const order = getStageOrder().slice(baseline);
    expect(order).toContain(S('TEST_EPSILON'));
  });

  it('detects and reports cyclic constraints', () => {
    registerStage(stage('TEST_ZETA_A', { after: S('TEST_ZETA_B') }));
    registerStage(stage('TEST_ZETA_B', { after: S('TEST_ZETA_A') }));
    expect(() => getStageDefinitions()).toThrow(/Cycle/);
  });

  it('replaces a re-registered stage in place', () => {
    const first = stage('TEST_ETA', { after: S('TEST_ETA_BASE') });
    const second = stage('TEST_ETA');
    registerStage(stage('TEST_ETA_BASE'));
    registerStage(first);
    registerStage(second);
    const order = getStageOrder().slice(baseline);
    const occurrences = order.filter(s => s === S('TEST_ETA')).length;
    expect(occurrences).toBe(1);
  });
});
