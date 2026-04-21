/* ------------------------------------------------------------------ */
/*  Pipeline services bag                                              */
/*                                                                     */
/*  This is the "second channel" alongside ProviderPlugin.PluginDeps:  */
/*  built-in stages and out-of-tree plugins receive a small set of     */
/*  injected capabilities (ffmpeg, tts, storage, logger, cache, ...)   */
/*  through StageRunContext.services.  By going through an interface   */
/*  rather than importing concrete modules:                            */
/*                                                                     */
/*    1. tests can stub each capability deterministically;             */
/*    2. third-party plugins can ride on the same surface without      */
/*       having to know which concrete implementation is wired;        */
/*    3. future swaps (e.g. replacing edge-tts with another backend,   */
/*       or moving ffmpeg into a worker process) become local          */
/*       refactors instead of pipeline-wide rewrites.                  */
/* ------------------------------------------------------------------ */

import type { Logger } from '@ai-video/pipeline-core/libFacade.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import { resolveVoiceFromStyle } from './ttsProvider.js';

/* ---- Storage ---- */

/**
 * Project-scoped artifact storage.  Today this is just a thin wrapper
 * over `saveArtifact` / `loadArtifact` already exposed on
 * StageRunContext, but as a service it's reusable from helpers that
 * don't get the full context (e.g. a pure utility called by a plugin).
 */
export interface StorageService {
  /** Save a JSON artifact.  Filenames are normalised to .json. */
  saveJson(filename: string, data: unknown): void;
  /** Load a previously saved JSON artifact (or undefined if missing). */
  loadJson<T>(filename: string): T | undefined;
  /** Absolute path to the project's assets directory. */
  assetsDir: string;
}

/* ---- Cache ---- */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Lightweight in-process cache.  Plugins shouldn't need any other
 * caching primitive; if persistence is required, use StorageService.
 */
export interface CacheService {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
}

class InMemoryCache implements CacheService {
  private map = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  set<T>(key: string, value: T, ttlMs = 5 * 60_000): void {
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

/* ---- FFmpeg ---- */

/**
 * FFmpeg capability.  Methods are deliberately thin and async so
 * downstream code can be tested with mocks instead of needing the
 * real ffmpeg binary on the test machine.
 */
export interface FfmpegService {
  isAvailable(): Promise<boolean>;
  getMediaDuration(filePath: string): Promise<number>;
  getVideoInfo(filePath: string): Promise<
    { duration: number; width: number; height: number } | undefined
  >;
}

/* ---- TTS ---- */

export interface TtsService {
  isAvailable(): Promise<boolean>;
  /** Resolve a voice id from a free-form style description + language. */
  resolveVoice(voiceStyle?: string, language?: string): string;
}

/* ---- Aggregate bag ---- */

export interface PipelineServices {
  ffmpeg: FfmpegService;
  tts: TtsService;
  storage: StorageService;
  logger: Logger;
  cache: CacheService;
}

/* ---- Default factory (lazy-loads heavy modules) ---- */

export interface CreateServicesOptions {
  assetsDir: string;
  saveArtifact: (filename: string, data: unknown) => void;
  loadArtifact: <T>(filename: string) => T | undefined;
  /** Logger namespace.  Defaults to "pipeline". */
  loggerName?: string;
}

export function createDefaultPipelineServices(
  opts: CreateServicesOptions,
): PipelineServices {
  const logger = createLogger(opts.loggerName ?? 'pipeline');

  const storage: StorageService = {
    assetsDir: opts.assetsDir,
    saveJson: opts.saveArtifact,
    loadJson: opts.loadArtifact,
  };

  // Lazy-load ffmpeg / tts so tests that never touch them don't pay
  // the import cost (and so non-video pipelines could swap them out).
  const ffmpeg: FfmpegService = {
    async isAvailable() {
      const m = await import('./ffmpegAssembler.js');
      return m.isFFmpegAvailable();
    },
    async getMediaDuration(filePath) {
      const m = await import('./ffmpegAssembler.js');
      return m.getMediaDuration(filePath);
    },
    async getVideoInfo(filePath) {
      const m = await import('./ffmpegAssembler.js');
      return m.getVideoInfo(filePath);
    },
  };

  const tts: TtsService = {
    async isAvailable() {
      const m = await import('./ttsProvider.js');
      return m.isEdgeTTSAvailable();
    },
    resolveVoice(voiceStyle, language) {
      return resolveVoiceFromStyle(voiceStyle, language);
    },
  };

  return {
    ffmpeg,
    tts,
    storage,
    logger,
    cache: new InMemoryCache(),
  };
}
