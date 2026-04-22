import { describe, expect, it } from 'vitest';
import { PACKAGE_VERSION, assembleVideo } from './index.js';
import { getStageDefinitions } from '@ai-video/pipeline-core';

describe('@ai-video/pipeline-video barrel', () => {
  it('exports a stable version constant', () => {
    expect(PACKAGE_VERSION).toBe('0.0.0');
  });

  it('exports the ffmpeg assembler entry point', () => {
    expect(typeof assembleVideo).toBe('function');
  });

  it('side-effect-imports every built-in stage definition into the shared registry', () => {
    const defs = getStageDefinitions();
    const names = defs.map(d => d.stage);
    // Spot-check a handful of stages from each phase group.
    for (const expected of [
      'CAPABILITY_ASSESSMENT',
      'STYLE_EXTRACTION',
      'STORYBOARD',
      'VIDEO_GEN',
      'TTS',
      'ASSEMBLY',
      'REFINEMENT',
    ] as const) {
      expect(names).toContain(expected);
    }
  });
});
