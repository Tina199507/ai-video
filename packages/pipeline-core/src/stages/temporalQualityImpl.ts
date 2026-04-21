// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import { sanitizeFileSystemPath } from '@ai-video/pipeline-core/libFacade.js';

const log = createLogger('TemporalQuality');
const FFMPEG_BIN = existsSync('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg') ? '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg' : 'ffmpeg';
const BOUNDARY_SSIM_THRESHOLD = 0.15;
const MAX_DISCONTINUITY_RATIO = 0.5;

export interface TemporalMetrics {
  pairsChecked: number;
  discontinuities: number;
  boundarySsim: (number | undefined)[];
  passed: boolean;
  issues: string[];
}

export async function extractFrame(videoPath: string, timestampSec: number, outputPath: string): Promise<string | undefined> {
  const safeVideo = sanitizeFileSystemPath(videoPath, 'frame extraction video');
  const safeOutput = sanitizeFileSystemPath(outputPath, 'frame extraction output');
  try {
    await execFilePromise(FFMPEG_BIN, ['-ss', String(Math.max(0, timestampSec)), '-i', safeVideo, '-frames:v', '1', '-q:v', '2', '-y', safeOutput], 15_000);
    return existsSync(safeOutput) ? safeOutput : undefined;
  } catch {
    return undefined;
  }
}

async function computeSSIM(img1: string, img2: string): Promise<number | undefined> {
  if (!existsSync(img1) || !existsSync(img2)) return undefined;
  try {
    const { stderr } = await execFilePromise(FFMPEG_BIN, ['-i', img1, '-i', img2, '-lavfi', 'ssim', '-f', 'null', '-'], 15_000);
    const match = stderr.match(/All:([\d.]+)/);
    return match ? parseFloat(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

export async function computeTemporalMetrics(sceneVideoPaths: string[], transitions: readonly (string | undefined)[], tmpDir: string): Promise<TemporalMetrics> {
  const issues: string[] = [];
  const boundarySsim: (number | undefined)[] = [];
  let discontinuities = 0;
  let pairsChecked = 0;
  const framesDir = join(tmpDir, 'temporal_frames');
  if (!existsSync(framesDir)) mkdirSync(framesDir, { recursive: true });

  for (let i = 0; i < sceneVideoPaths.length - 1; i++) {
    const currentPath = sceneVideoPaths[i];
    const nextPath = sceneVideoPaths[i + 1];
    if (!currentPath || !nextPath || !existsSync(currentPath) || !existsSync(nextPath)) {
      boundarySsim.push(undefined);
      continue;
    }
    let duration = 5;
    try {
      const { stdout } = await execFilePromise(FFMPEG_BIN.replace('ffmpeg', 'ffprobe'), ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', currentPath], 10_000);
      duration = parseFloat(stdout.trim()) || 5;
    } catch {}

    const [lastFrame, firstFrame] = await Promise.all([
      extractFrame(currentPath, Math.max(0, duration - 0.1), join(framesDir, `scene_${i}_last.jpg`)),
      extractFrame(nextPath, 0.05, join(framesDir, `scene_${i + 1}_first.jpg`)),
    ]);
    if (!lastFrame || !firstFrame) {
      boundarySsim.push(undefined);
      continue;
    }
    const ssim = await computeSSIM(lastFrame, firstFrame);
    boundarySsim.push(ssim);
    pairsChecked++;
    if (ssim !== undefined && ssim < BOUNDARY_SSIM_THRESHOLD) {
      const transition = transitions[i] ?? 'cut';
      if (transition !== 'cut' && transition !== 'none') {
        discontinuities++;
        issues.push(`Scene ${i + 1}→${i + 2}: SSIM ${ssim.toFixed(3)} with ${transition} transition (expected ≥${BOUNDARY_SSIM_THRESHOLD})`);
      }
    }
  }

  const totalPairs = sceneVideoPaths.length - 1;
  const passed = totalPairs === 0 || discontinuities / Math.max(1, pairsChecked) <= MAX_DISCONTINUITY_RATIO;
  log.info('temporal_metrics', { pairsChecked, discontinuities, passed, issueCount: issues.length });
  return { pairsChecked, discontinuities, boundarySsim, passed, issues };
}

function execFilePromise(command: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !stderr) reject(error);
      else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}
