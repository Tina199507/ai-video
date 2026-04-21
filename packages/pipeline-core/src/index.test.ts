import { describe, expect, it } from 'vitest';
import {
  PACKAGE_VERSION,
  registerStage,
  getStageDefinitions,
  getStageOrder,
  AIRequestAbortedError,
  validatePluginManifest,
} from './index.js';

describe('@ai-video/pipeline-core barrel', () => {
  it('exports a stable version constant', () => {
    expect(PACKAGE_VERSION).toBe('0.0.0');
  });

  it('re-exports the stage registry surface from the canonical pipeline source', () => {
    expect(typeof registerStage).toBe('function');
    expect(typeof getStageDefinitions).toBe('function');
    expect(typeof getStageOrder).toBe('function');
  });

  it('re-exports the abort + manifest primitives', () => {
    expect(AIRequestAbortedError.prototype).toBeInstanceOf(Error);
    expect(typeof validatePluginManifest).toBe('function');
  });
});
