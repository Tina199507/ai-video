/* ------------------------------------------------------------------ */
/*  TTS Backend – speech codegen: text → audio                       */
/*  Dual strategy: edge-tts local CLI (preferred) + web fallback.    */
/* ------------------------------------------------------------------ */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerationResult } from './types/adapter.js';
import { ensurePathWithinBase, sanitizeFileSystemPath, sanitizePathSegment } from '@ai-video/pipeline-core/libFacade.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import {
  getVoiceStylePort,
  resolveVoiceFromStyle,
  type VoiceMapping,
} from './ports/voiceStylePort.js';

const log = createLogger('TTS');

export type { VoiceMapping };
export { resolveVoiceFromStyle };

export interface TTSConfig {
  /** Directory to save audio files */
  assetsDir: string;
  /** Voice for edge-tts (default: zh-CN-XiaoxiaoNeural) */
  voice?: string;
  /** Rate adjustment (e.g. '+10%', '-5%') */
  rate?: string;
  /** Pitch adjustment (e.g. '+0Hz') */
  pitch?: string;
  /** Whether to try edge-tts first (default: true) */
  preferLocal?: boolean;
}

function execFileText(
  binary: string,
  args: readonly string[],
  timeout: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, [...args], { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stderr: stderr ?? '' }));
        return;
      }
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

function sanitizeSpeechText(text: string): string {
  return text
    .replace(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

/** @internal Exported for testing */
export function buildEdgeTtsArgs(
  text: string,
  config: TTSConfig,
  outputPath: string,
): string[] {
  const voice = config.voice ?? getVoiceStylePort().DEFAULT_VOICE_MAPPING.defaultVoice;
  const args = [
    '--voice',
    voice,
    '--text',
    sanitizeSpeechText(text),
    '--write-media',
    sanitizeFileSystemPath(outputPath, 'tts output path'),
  ];
  if (config.rate) {
    args.push('--rate', config.rate);
  }
  if (config.pitch) {
    args.push('--pitch', config.pitch);
  }
  return args;
}

/**
 * Derive a rate adjustment string from a pacing description.
 */
export function resolveRateFromPacing(pacing?: string): string | undefined {
  if (!pacing) return undefined;
  const p = pacing.toLowerCase();
  // Check more-specific patterns before less-specific ones:
  // "medium-fast" must match before "fast", "medium-slow" before "slow"
  if (p.includes('medium-fast') || p.includes('较快')) return '+5%';
  if (p.includes('medium-slow') || p.includes('较慢')) return '-5%';
  if (p.includes('fast') || p.includes('快')) return '+10%';
  if (p.includes('slow') || p.includes('慢')) return '-10%';
  return undefined; // medium = default rate
}

/**
 * Compute TTS rate adjustment from target wordsPerMinute.
 * Edge-tts default Chinese speech rate is ~300 chars/min (~5 chars/sec).
 * Returns a rate string like '+10%' or '-5%' to match the target WPM.
 * Combined with pacing-based rate via `combineRates()`.
 */
const EDGE_TTS_DEFAULT_CHINESE_CPM = 300;

export function computeRateFromWpm(targetWpm?: number): string | undefined {
  if (!targetWpm || targetWpm <= 0) return undefined;
  const ratio = targetWpm / EDGE_TTS_DEFAULT_CHINESE_CPM;
  // Only adjust if deviation is >= 5%
  const pct = Math.round((ratio - 1) * 100);
  if (Math.abs(pct) < 5) return undefined;
  // Clamp to ±50% (edge-tts reasonable range)
  const clamped = Math.max(-50, Math.min(50, pct));
  return clamped > 0 ? `+${clamped}%` : `${clamped}%`;
}

/**
 * Combine pacing-based rate and WPM-based rate.
 * WPM-based rate takes priority when available; pacing is additive as a bonus.
 */
export function combineRates(pacingRate?: string, wpmRate?: string): string | undefined {
  if (!pacingRate && !wpmRate) return undefined;
  if (!pacingRate) return wpmRate;
  if (!wpmRate) return pacingRate;
  // Parse both rates and add them
  const parsePct = (r: string) => parseInt(r.replace('%', ''), 10) || 0;
  const combined = parsePct(pacingRate) + parsePct(wpmRate);
  if (combined === 0) return undefined;
  const clamped = Math.max(-50, Math.min(50, combined));
  return clamped > 0 ? `+${clamped}%` : `${clamped}%`;
}

/**
 * Generate speech using edge-tts CLI (requires `pip install edge-tts`).
 * Returns the path to the generated audio file.
 */
export async function generateSpeechLocal(
  text: string,
  config: TTSConfig,
): Promise<GenerationResult> {
  const voice = config.voice ?? getVoiceStylePort().DEFAULT_VOICE_MAPPING.defaultVoice;
  const assetsDir = sanitizeFileSystemPath(config.assetsDir, 'assetsDir');
  if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });

  const filename = sanitizePathSegment(`tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`, 'tts filename');
  const outputPath = ensurePathWithinBase(assetsDir, join(assetsDir, filename), 'tts output path');
  const args = buildEdgeTtsArgs(text, { ...config, voice }, outputPath);

  try {
    await execFileText('edge-tts', args, 60_000);

    if (!existsSync(outputPath)) {
      throw new Error('edge-tts produced no output file');
    }

    return {
      audioUrl: outputPath,
      model: `edge-tts/${voice}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`edge-tts failed: ${message}`);
  }
}

export const DEFAULT_VOICE_MAPPING = getVoiceStylePort().DEFAULT_VOICE_MAPPING;

/**
 * Check if edge-tts is available on the system.
 */
export async function isEdgeTTSAvailable(): Promise<boolean> {
  try {
    await execFileText('edge-tts', ['--version'], 5000);
    return true;
  } catch {
    return false;
  }
}

/**
 * List available edge-tts voices (filtered by locale if provided).
 */
export async function listVoices(locale?: string): Promise<string[]> {
  try {
    const { stdout } = await execFileText('edge-tts', ['--list-voices'], 10_000);
    const lines = stdout.split('\n').filter(l => l.startsWith('Name:'));
    const voices = lines.map(l => l.replace('Name: ', '').trim());
    if (locale) {
      return voices.filter(v => v.toLowerCase().startsWith(locale.toLowerCase()));
    }
    return voices;
  } catch {
    return [];
  }
}

/**
 * Main TTS function with automatic fallback.
 * Strategy: edge-tts (local) first → error if unavailable
 * (Web automation fallback can be added later via Workbench)
 */
export async function generateSpeech(
  text: string,
  config: TTSConfig,
): Promise<GenerationResult> {
  const preferLocal = config.preferLocal ?? true;

  if (preferLocal) {
    try {
      return await generateSpeechLocal(text, config);
    } catch (err) {
      log.warn('edge_tts_failed_no_fallback', { preferLocal });
      throw err;
    }
  }

  // If local is not preferred, still try it as the only option for now
  return generateSpeechLocal(text, config);
}
