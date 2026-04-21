/**
 * services.test.ts — sanity tests for the PipelineServices bag.
 *
 * The default implementations forward to existing modules (ffmpeg /
 * tts / logger), so we only validate that the bag is wired correctly,
 * the cache honours TTLs, and the storage facade reuses the
 * orchestrator-provided saveArtifact / loadArtifact closures.
 */

import { describe, it, expect, vi } from 'vitest';
import { createDefaultPipelineServices } from '../pipelineServices.js';

describe('PipelineServices', () => {
  it('storage delegates to the provided saveArtifact / loadArtifact closures', () => {
    const saveArtifact = vi.fn();
    const loadArtifact = vi.fn().mockReturnValue({ ok: true });

    const services = createDefaultPipelineServices({
      assetsDir: '/tmp/services-test',
      saveArtifact,
      loadArtifact,
    });

    services.storage.saveJson('foo.json', { hello: 'world' });
    const out = services.storage.loadJson<{ ok: boolean }>('foo.json');

    expect(saveArtifact).toHaveBeenCalledWith('foo.json', { hello: 'world' });
    expect(loadArtifact).toHaveBeenCalledWith('foo.json');
    expect(out).toEqual({ ok: true });
    expect(services.storage.assetsDir).toBe('/tmp/services-test');
  });

  it('cache enforces TTL and supports delete/clear', () => {
    const services = createDefaultPipelineServices({
      assetsDir: '/tmp/cache-test',
      saveArtifact: vi.fn(),
      loadArtifact: vi.fn(),
    });

    services.cache.set('k1', 'v1', 1_000);
    services.cache.set('k2', 'v2', 1);
    expect(services.cache.get<string>('k1')).toBe('v1');

    // Trigger TTL by waiting a tick; the get() lazily evicts.
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(services.cache.get('k2')).toBeUndefined();

        services.cache.delete('k1');
        expect(services.cache.get('k1')).toBeUndefined();

        services.cache.set('k3', { n: 1 });
        services.cache.clear();
        expect(services.cache.get('k3')).toBeUndefined();
        resolve();
      }, 5);
    });
  });

  it('exposes ffmpeg / tts / logger handles', () => {
    const services = createDefaultPipelineServices({
      assetsDir: '/tmp/handles-test',
      saveArtifact: vi.fn(),
      loadArtifact: vi.fn(),
    });

    expect(typeof services.ffmpeg.isAvailable).toBe('function');
    expect(typeof services.ffmpeg.getMediaDuration).toBe('function');
    expect(typeof services.ffmpeg.getVideoInfo).toBe('function');
    expect(typeof services.tts.isAvailable).toBe('function');
    expect(typeof services.tts.resolveVoice).toBe('function');
    expect(typeof services.logger.info).toBe('function');
    expect(typeof services.logger.error).toBe('function');
  });

  it('tts.resolveVoice returns a non-empty string for sane inputs', () => {
    const services = createDefaultPipelineServices({
      assetsDir: '/tmp/tts-test',
      saveArtifact: vi.fn(),
      loadArtifact: vi.fn(),
    });
    const v = services.tts.resolveVoice('cheerful', 'en-US');
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });
});
