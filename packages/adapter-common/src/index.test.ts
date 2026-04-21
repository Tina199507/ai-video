import { describe, expect, it } from 'vitest';
import {
  PACKAGE_VERSION,
  withRetry,
  isQuotaError,
  GeminiAdapter,
  ChatAdapter,
  AIVideoMakerAdapter,
  FallbackAdapter,
  extractJSON,
  sanitizePromptForKling,
} from './index.js';

describe('@ai-video/adapter-common barrel', () => {
  it('exports a stable version constant', () => {
    expect(PACKAGE_VERSION).toBe('0.0.0');
  });

  it('re-exports retry primitives from @ai-video/lib', () => {
    expect(typeof withRetry).toBe('function');
    expect(typeof isQuotaError).toBe('function');
  });

  it('re-exports the four production adapter classes', () => {
    for (const Cls of [GeminiAdapter, ChatAdapter, AIVideoMakerAdapter, FallbackAdapter]) {
      expect(typeof Cls).toBe('function');
    }
  });

  it('re-exports response + prompt helpers', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(typeof sanitizePromptForKling('test prompt')).toBe('string');
  });
});
