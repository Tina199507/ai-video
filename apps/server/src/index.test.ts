import { describe, expect, it } from 'vitest';
import { PACKAGE_VERSION } from './index.js';

describe('@ai-video/app-server placeholder', () => {
  it('exports a stable version constant for the workspace skeleton', () => {
    expect(PACKAGE_VERSION).toBe('0.0.0');
  });
});
