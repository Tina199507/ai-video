import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '../registry.js';
import { resolvePlugin } from '../router.js';
import type { ProviderPlugin } from '../types.js';

/* ---- Helper ---- */

function makePlugin(overrides: Partial<ProviderPlugin> & { id: string }): ProviderPlugin {
  return {
    name: overrides.id,
    adapterType: 'chat',
    capabilities: {
      text: true,
      imageGeneration: false,
      videoGeneration: false,
      tts: false,
      fileUpload: false,
      webSearch: false,
    },
    costTier: 'free',
    createAdapter: () => undefined,
    ...overrides,
  };
}

describe('resolvePlugin', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('returns user override as __override__ pluginId', () => {
    registry.register(makePlugin({ id: 'p1' }));
    const decision = resolvePlugin('RESEARCH', 'fact_research', registry, {
      fact_research: { adapter: 'api', model: 'custom-model', provider: 'custom' },
    });

    expect(decision.pluginId).toBe('__override__');
    expect(decision.adapter).toBe('api');
    expect(decision.model).toBe('custom-model');
    expect(decision.provider).toBe('custom');
  });

  it('falls back to legacy routing when no plugins match', () => {
    // Empty registry — no plugins can handle video_generation
    const decision = resolvePlugin('VIDEO_GEN', 'video_generation', registry);

    expect(decision.pluginId).toBe('__legacy__');
    expect(decision.adapter).toBeDefined();
  });

  it('selects highest-scored plugin', () => {
    registry.register(makePlugin({
      id: 'generic',
      capabilities: { text: true, imageGeneration: true, videoGeneration: false, tts: false, fileUpload: false, webSearch: false },
    }));
    registry.register(makePlugin({
      id: 'specialist',
      capabilities: { text: true, imageGeneration: true, videoGeneration: false, tts: false, fileUpload: false, webSearch: false },
      routing: [{
        stages: ['REFERENCE_IMAGE'],
        taskTypes: ['image_generation'],
        priority: 10,
      }],
    }));

    const decision = resolvePlugin('REFERENCE_IMAGE', 'image_generation', registry);
    expect(decision.pluginId).toBe('specialist');
  });

  it('resolves model from routing rule', () => {
    registry.register(makePlugin({
      id: 'with-model',
      routing: [{
        stages: ['RESEARCH'],
        taskTypes: ['fact_research'],
        defaultModel: 'my-model-v2',
      }],
    }));

    const decision = resolvePlugin('RESEARCH', 'fact_research', registry);
    expect(decision.model).toBe('my-model-v2');
  });

  it('swaps to next candidate when primary is quota-exhausted', () => {
    registry.register(makePlugin({
      id: 'primary',
      costTier: 'free',
      routing: [{ taskTypes: ['fact_research'], priority: 10 }],
    }));
    registry.register(makePlugin({
      id: 'secondary',
      costTier: 'free',
    }));

    registry.markQuotaExhausted('primary');

    const decision = resolvePlugin('RESEARCH', 'fact_research', registry);
    // findForTask scores the exhausted 'primary' at -1000 penalty,
    // so 'secondary' (non-exhausted) becomes the top candidate.
    expect(decision.pluginId).toBe('secondary');
  });

  it('uses next-best candidate with different costTier as implicit fallback', () => {
    registry.register(makePlugin({ id: 'free-1', costTier: 'free' }));
    registry.register(makePlugin({ id: 'paid-1', costTier: 'paid', adapterType: 'api' }));

    const decision = resolvePlugin('RESEARCH', 'fact_research', registry);
    // 'free-1' beats 'paid-1' (+20 free bonus); 'paid-1' becomes fallback
    expect(decision.pluginId).toBe('free-1');
    expect(decision.fallbackPluginId).toBe('paid-1');
  });

  it('honours plugin-declared fallbackPluginId over implicit selection', () => {
    registry.register(makePlugin({ id: 'free-1', costTier: 'free', fallbackPluginId: 'paid-2' }));
    registry.register(makePlugin({ id: 'paid-1', costTier: 'paid', adapterType: 'api' }));
    registry.register(makePlugin({ id: 'paid-2', costTier: 'paid', adapterType: 'api' }));

    const decision = resolvePlugin('RESEARCH', 'fact_research', registry);
    expect(decision.pluginId).toBe('free-1');
    expect(decision.fallbackPluginId).toBe('paid-2');
  });

  it('swaps to fallback plugin when primary is quota-exhausted', () => {
    registry.register(makePlugin({ id: 'free-1', costTier: 'free', fallbackPluginId: 'paid-1' }));
    registry.register(makePlugin({ id: 'paid-1', costTier: 'paid', adapterType: 'api' }));

    registry.markQuotaExhausted('free-1');

    const decision = resolvePlugin('RESEARCH', 'fact_research', registry);
    // With quota penalty, paid-1 becomes top candidate
    expect(decision.pluginId).toBe('paid-1');
    // free-1 is now listed as its fallback (the reverse swap)
    expect(decision.fallbackPluginId).toBe('free-1');
  });

  it('returns user override for SCRIPT_GENERATION with script_generation task', () => {
    const decision = resolvePlugin('SCRIPT_GENERATION', 'script_generation', registry, {
      script_generation: { adapter: 'api', provider: 'openai', model: 'gpt-4' },
    } as any);
    expect(decision.pluginId).toBe('__override__');
    expect(decision.adapter).toBe('api');
    expect(decision.model).toBe('gpt-4');
    expect(decision.reason).toContain('User override');
  });

  it('falls back to legacy for RESEARCH when registry is empty', () => {
    const decision = resolvePlugin('RESEARCH', 'fact_research', registry);
    expect(decision.pluginId).toBe('__legacy__');
    expect(decision.reason).toBeDefined();
  });

  it('selects registered plugin when routing matches', () => {
    registry.register(makePlugin({
      id: 'gemini-chat',
      name: 'Gemini Chat',
      routing: [{ taskTypes: ['text', 'fact_research'], defaultModel: 'gemini-2.0-flash' }],
    }));
    const decision = resolvePlugin('RESEARCH', 'fact_research', registry);
    expect(decision.pluginId).toBe('gemini-chat');
    expect(decision.model).toBe('gemini-2.0-flash');
    expect(decision.reason).toContain('Gemini Chat');
  });

  it('resolves model from routing by stage (SCRIPT_GENERATION vs RESEARCH)', () => {
    registry.register(makePlugin({
      id: 'chatgpt',
      name: 'ChatGPT',
      routing: [
        { stages: ['SCRIPT_GENERATION'], defaultModel: 'gpt-4o' },
        { stages: ['RESEARCH'], defaultModel: 'gpt-4-turbo' },
      ],
    }));
    const decision = resolvePlugin('SCRIPT_GENERATION', 'script_generation', registry);
    expect(decision.model).toBe('gpt-4o');
  });

  it('returns undefined model when no routing rule matches the stage', () => {
    registry.register(makePlugin({
      id: 'simple',
      name: 'Simple',
      routing: [{ stages: ['QA_REVIEW'], taskTypes: ['text'], defaultModel: 'gpt-4' }],
    }));
    const decision = resolvePlugin('RESEARCH', 'text', registry);
    expect(decision.model).toBeUndefined();
  });

  it('returns legacy adapter for TTS task when no plugin handles it', () => {
    const decision = resolvePlugin('TTS', 'tts', registry);
    expect(decision.pluginId).toBe('__legacy__');
    expect(decision.adapter).toBeDefined();
  });
});
