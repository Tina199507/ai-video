// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePathWithinBase } from '@ai-video/lib/pathSafety.js';
import { ffmpeg } from './ffmpeg.js';
import { getMediaDuration } from './probe.js';
import type { AssemblyOptions, ResolvedEncoding } from './types.js';

export interface AudioMixResult {
  finalInput: string;
  loudnormOutput: string;
  bgmOutput?: string;
}

export async function mixFinalAudio(
  inputPath: string,
  options: Pick<AssemblyOptions, 'bgmPath' | 'bgmVolume' | 'bgmFadeIn' | 'bgmFadeOut'>,
  tmpDir: string,
  enc: ResolvedEncoding,
): Promise<AudioMixResult> {
  let finalInput = inputPath;
  const loudnormOutput = ensurePathWithinBase(tmpDir, join(tmpDir, 'loudnorm.mp4'), 'loudnorm output');

  try {
    await ffmpeg([
      '-i', inputPath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', enc.audioBitrate,
      '-y', loudnormOutput,
    ], tmpDir);
    finalInput = loudnormOutput;
  } catch {
    // Non-fatal: continue without loudness normalization
  }

  let bgmOutput: string | undefined;
  if (options.bgmPath && existsSync(options.bgmPath)) {
    const bgmVol = options.bgmVolume ?? 0.15;
    const bgmFadeIn = options.bgmFadeIn ?? 0;
    const bgmFadeOut = options.bgmFadeOut ?? 0;
    bgmOutput = ensurePathWithinBase(tmpDir, join(tmpDir, 'with_bgm.mp4'), 'bgm output');

    let bgmChain = `[1:a]volume=${bgmVol}`;
    if (bgmFadeIn > 0) bgmChain += `,afade=t=in:d=${bgmFadeIn}`;
    if (bgmFadeOut > 0) {
      try {
        const videoDur = await getMediaDuration(finalInput);
        if (videoDur > bgmFadeOut) {
          bgmChain += `,afade=t=out:st=${(videoDur - bgmFadeOut).toFixed(3)}:d=${bgmFadeOut}`;
        }
      } catch {
        // Ignore missing duration
      }
    }
    bgmChain += '[bgmscaled]';

    await ffmpeg([
      '-i', finalInput,
      '-i', options.bgmPath,
      '-filter_complex',
      `${bgmChain};` +
      `[bgmscaled][0:a]sidechaincompress=threshold=0.02:ratio=6:attack=200:release=1000[ducked];` +
      `[0:a][ducked]amix=inputs=2:duration=first:dropout_transition=3[aout]`,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', enc.audioBitrate,
      '-y', bgmOutput,
    ], tmpDir);
    finalInput = bgmOutput;
  }

  return { finalInput, loudnormOutput, bgmOutput };
}
