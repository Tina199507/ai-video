// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import { sanitizeFileSystemPath } from '@ai-video/pipeline-core/libFacade.js';

const log = createLogger('PostAssemblyQuality');
const FFMPEG_BIN = existsSync('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg') ? '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg' : 'ffmpeg';

export interface PostAssemblyMetrics {
  blackFrameCount: number;
  silenceGapCount: number;
  peakAudioLevel: number | undefined;
  integratedLoudness: number | undefined;
  passed: boolean;
  issues: string[];
}

const MAX_BLACK_FRAMES = 3;
const MAX_SILENCE_GAPS = 2;
const PEAK_CLIP_THRESHOLD = -0.5;

export async function computePostAssemblyMetrics(videoPath: string): Promise<PostAssemblyMetrics> {
  const safePath = sanitizeFileSystemPath(videoPath, 'post-assembly video');
  const issues: string[] = [];
  const [blackFrames, silenceGaps, audioLevels] = await Promise.all([
    detectBlackFrames(safePath),
    detectSilenceGaps(safePath),
    measureAudioLevels(safePath),
  ]);
  if (blackFrames > MAX_BLACK_FRAMES) issues.push(`${blackFrames} black frames detected (max ${MAX_BLACK_FRAMES})`);
  if (silenceGaps > MAX_SILENCE_GAPS) issues.push(`${silenceGaps} silence gaps > 0.5s (max ${MAX_SILENCE_GAPS})`);
  if (audioLevels.peak !== undefined && audioLevels.peak > PEAK_CLIP_THRESHOLD) {
    issues.push(`Audio peak ${audioLevels.peak.toFixed(1)} dBFS exceeds ${PEAK_CLIP_THRESHOLD} (possible clipping)`);
  }
  const passed = issues.length === 0;
  log.info('post_assembly_metrics', { blackFrames, silenceGaps, peak: audioLevels.peak, loudness: audioLevels.loudness, passed, issueCount: issues.length });
  return { blackFrameCount: blackFrames, silenceGapCount: silenceGaps, peakAudioLevel: audioLevels.peak, integratedLoudness: audioLevels.loudness, passed, issues };
}

async function detectBlackFrames(videoPath: string): Promise<number> {
  try {
    const { stderr } = await execFilePromise(FFMPEG_BIN, ['-i', videoPath, '-vf', 'blackdetect=d=0.1:pix_th=0.10', '-an', '-f', 'null', '-'], 30_000);
    return stderr.match(/black_start/g)?.length ?? 0;
  } catch { return 0; }
}
async function detectSilenceGaps(videoPath: string): Promise<number> {
  try {
    const { stderr } = await execFilePromise(FFMPEG_BIN, ['-i', videoPath, '-af', 'silencedetect=n=-40dB:d=0.5', '-vn', '-f', 'null', '-'], 30_000);
    return stderr.match(/silence_start/g)?.length ?? 0;
  } catch { return 0; }
}
async function measureAudioLevels(videoPath: string): Promise<{ peak: number | undefined; loudness: number | undefined }> {
  try {
    const { stderr } = await execFilePromise(FFMPEG_BIN, ['-i', videoPath, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary', '-vn', '-f', 'null', '-'], 30_000);
    const peakMatch = stderr.match(/Input True Peak:\s+([-\d.]+)/);
    const loudMatch = stderr.match(/Input Integrated:\s+([-\d.]+)/);
    return { peak: peakMatch ? parseFloat(peakMatch[1]) : undefined, loudness: loudMatch ? parseFloat(loudMatch[1]) : undefined };
  } catch { return { peak: undefined, loudness: undefined }; }
}
function execFilePromise(command: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !stderr) reject(error);
      else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}
