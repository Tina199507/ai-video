// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { existsSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';
import { ensurePathWithinBase, sanitizePathSegment, sanitizeFileSystemPath } from '@ai-video/lib/pathSafety.js';
import { ffmpeg, FFMPEG_BIN, TIMEOUT } from './ffmpeg.js';
import { runWithConcurrency } from './concurrency.js';
import { concatWithXfade, XFADE_DURATION } from './transitions.js';
import { getMediaDuration } from './probe.js';
import type { ResolvedEncoding } from './types.js';

export interface NormalizeAndConcatOptions {
  sceneVideos: string[];
  tmpDir: string;
  enc: ResolvedEncoding;
  parallelism: number;
  transitions?: readonly ('cut' | 'dissolve' | 'fade' | 'wipe' | 'zoom' | 'none')[];
  transitionDurations?: readonly number[];
  colorGradeFilter?: string;
  bgmPath?: string;
  bgmBeats?: readonly number[];
  defaultTransitionDuration?: number;
  progress: (message: string) => void;
}

export interface NormalizeAndConcatResult {
  concatOutput: string;
  concatList?: string;
  normalizedVideos: string[];
}

export async function normalizeAndConcatScenes(options: NormalizeAndConcatOptions): Promise<NormalizeAndConcatResult> {
  const {
    sceneVideos,
    tmpDir,
    enc,
    parallelism,
    transitions = [],
    transitionDurations,
    colorGradeFilter,
    bgmPath,
    bgmBeats,
    defaultTransitionDuration,
    progress,
  } = options;

  const { resolveFormatPreset } = await import('@ai-video/pipeline-core/stages/formatPresets.js');
  const formatPreset = resolveFormatPreset(enc.width, enc.height);
  const colorGrade = colorGradeFilter ?? '';
  const baseVf = formatPreset.normFilter;
  const normVf = colorGrade ? `${baseVf},${colorGrade}` : baseVf;
  const normalizedVideos: string[] = new Array(sceneVideos.length);
  const presetArgs = ['-preset', enc.preset];
  const rateArgs = enc.maxrate ? ['-maxrate', enc.maxrate, '-bufsize', enc.bufsize ?? enc.maxrate] : [];

  const { parseColorStats, buildColorCorrectionFilter, buildSignalstatsArgs } = await import('@ai-video/pipeline-video/stages/globalLUT.js');
  type ColorStats = import('@ai-video/pipeline-video/stages/globalLUT.js').ColorStats;
  let referenceColorStats: ColorStats | undefined;

  if (sceneVideos.length > 0 && sceneVideos[0]) {
    const normalized0 = ensurePathWithinBase(tmpDir, join(tmpDir, 'norm_0.mp4'), 'normalized scene file');
    await ffmpeg([
      '-i', sceneVideos[0],
      '-vf', normVf,
      '-r', String(enc.fps),
      '-c:v', enc.videoCodec,
      '-crf', String(enc.crf),
      ...presetArgs,
      ...rateArgs,
      '-c:a', 'aac',
      '-b:a', enc.audioBitrate,
      '-ar', String(enc.audioSampleRate),
      '-ac', '2',
      '-y', normalized0,
    ], tmpDir);
    normalizedVideos[0] = normalized0;

    try {
      const statsOutput = await ffmpeg(buildSignalstatsArgs(normalized0), tmpDir);
      referenceColorStats = parseColorStats(statsOutput);
    } catch {
      // Non-fatal
    }
  }

  if (sceneVideos.length > 1) {
    await runWithConcurrency(sceneVideos.slice(1), parallelism, async (sceneVideo, rawIdx) => {
      const i = rawIdx + 1;
      const normalized = ensurePathWithinBase(tmpDir, join(tmpDir, `norm_${i}.mp4`), 'normalized scene file');

      let perSceneVf = normVf;
      if (referenceColorStats) {
        try {
          const scnStatsOutput = await ffmpeg(buildSignalstatsArgs(sceneVideo), tmpDir);
          const sceneStats = parseColorStats(scnStatsOutput);
          if (sceneStats) {
            const correction = buildColorCorrectionFilter(referenceColorStats, sceneStats);
            if (correction) {
              perSceneVf = `${normVf},${correction}`;
            }
          }
        } catch {
          // Non-fatal
        }
      }

      await ffmpeg([
        '-i', sceneVideo,
        '-vf', perSceneVf,
        '-r', String(enc.fps),
        '-c:v', enc.videoCodec,
        '-crf', String(enc.crf),
        ...presetArgs,
        ...rateArgs,
        '-c:a', 'aac',
        '-b:a', enc.audioBitrate,
        '-ar', String(enc.audioSampleRate),
        '-ac', '2',
        '-y', normalized,
      ], tmpDir);
      normalizedVideos[i] = normalized;
    });
  }

  let detectedBeats: readonly number[] | undefined = bgmBeats;
  const safeBgmPath = bgmPath
    ? sanitizeFileSystemPath(bgmPath, 'bgmPath')
    : undefined;
  if (!detectedBeats && safeBgmPath && existsSync(safeBgmPath)) {
    try {
      const { buildBeatDetectionArgs, parseBeatsFromAstats } = await import('@ai-video/pipeline-video/stages/beatAlign.js');
      const beatArgs = buildBeatDetectionArgs(safeBgmPath);
      const beatOutput = await new Promise<string>((resolve, reject) => {
        const proc = spawn(FFMPEG_BIN, beatArgs, { cwd: tmpDir, timeout: TIMEOUT });
        let stdout = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`beat detection exit ${code}`)));
        proc.on('error', reject);
      });
      const bgmDuration = await getMediaDuration(safeBgmPath);
      const beatInfo = parseBeatsFromAstats(beatOutput, bgmDuration);
      if (beatInfo.beats.length > 0) {
        detectedBeats = beatInfo.beats;
      }
    } catch {
      // Non-fatal
    }
  }

  const hasXfade = transitions.some((t, i) => i < normalizedVideos.length - 1 && t && t !== 'cut' && t !== 'none');
  let concatOutput: string;
  let concatList: string | undefined;

  const simpleConcatFallback = async (): Promise<string> => {
    concatList = ensurePathWithinBase(tmpDir, join(tmpDir, 'concat.txt'), 'concat list');
    const concatContent = normalizedVideos.map(f => `file '${sanitizePathSegment(basename(f), 'concat filename')}'`).join('\n');
    writeFileSync(concatList, concatContent);
    const out = ensurePathWithinBase(tmpDir, join(tmpDir, 'concat.mp4'), 'concat output');
    await ffmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c', 'copy',
      '-y', out,
    ], tmpDir);
    return out;
  };

  if (hasXfade && normalizedVideos.length >= 2) {
    concatOutput = ensurePathWithinBase(tmpDir, join(tmpDir, 'concat.mp4'), 'concat output');
    try {
      const defaultXfadeDur = defaultTransitionDuration ?? XFADE_DURATION;
      await concatWithXfade(
        normalizedVideos,
        transitions,
        concatOutput,
        tmpDir,
        enc,
        transitionDurations,
        detectedBeats,
        defaultXfadeDur,
      );
    } catch {
      concatOutput = await simpleConcatFallback();
    }
  } else {
    concatOutput = await simpleConcatFallback();
  }

  progress('场景拼接完成');
  return { concatOutput, concatList, normalizedVideos };
}
