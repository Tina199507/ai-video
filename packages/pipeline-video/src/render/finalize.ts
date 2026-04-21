// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePathWithinBase, sanitizeFileName } from '@ai-video/lib/pathSafety.js';
import { ffmpeg } from './ffmpeg.js';
import { getMediaDuration } from './probe.js';
import type { AssemblyOptions, ResolvedEncoding } from './types.js';

export async function finalizeVideoOutput(
  finalInput: string,
  options: Pick<AssemblyOptions, 'projectTitle' | 'fadeInDuration' | 'fadeOutDuration' | 'titleCard' | 'titleCardStyle' | 'twoPass'>,
  safeOutputDir: string,
  tmpDir: string,
  enc: ResolvedEncoding,
  progress: (message: string) => void,
): Promise<string> {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(options.projectTitle ?? 'video', 'video');
  const finalPath = ensurePathWithinBase(safeOutputDir, join(safeOutputDir, `${safeName}_${timestamp}.mp4`), 'final output path');

  const finalVfParts: string[] = [];
  const fadeIn = options.fadeInDuration ?? 0;
  const fadeOut = options.fadeOutDuration ?? 0;

  if (fadeIn > 0) {
    finalVfParts.push(`fade=t=in:d=${fadeIn}`);
  }
  if (fadeOut > 0) {
    try {
      const inputDur = await getMediaDuration(finalInput);
      if (inputDur > fadeOut) {
        finalVfParts.push(`fade=t=out:st=${(inputDur - fadeOut).toFixed(3)}:d=${fadeOut}`);
      }
    } catch {
      // Ignore missing duration
    }
  }

  const titleCardConfig = options.titleCardStyle ?? (options.titleCard ? {
    text: options.titleCard,
    fontSize: 48,
    fontColor: '#FFFFFF',
    duration: 3,
  } : null);
  if (titleCardConfig?.text) {
    const safeTitle = titleCardConfig.text.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    const fontSize = titleCardConfig.fontSize ?? 48;
    const fontColor = (titleCardConfig.fontColor ?? '#FFFFFF').replace('#', '');
    const duration = titleCardConfig.duration ?? 3;
    const fadeInEnd = 0.5;
    const holdEnd = duration - 0.5;
    finalVfParts.push(
      `drawtext=text='${safeTitle}':fontcolor=0x${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,${fadeInEnd}),t/${fadeInEnd},if(lt(t,${holdEnd}),1,if(lt(t,${duration}),(${duration}-t)/${duration - holdEnd},0)))'`,
    );
  }

  const finalAfParts: string[] = [];
  if (fadeIn > 0) finalAfParts.push(`afade=t=in:d=${fadeIn}`);
  if (fadeOut > 0) {
    try {
      const inputDur = await getMediaDuration(finalInput);
      if (inputDur > fadeOut) {
        finalAfParts.push(`afade=t=out:st=${(inputDur - fadeOut).toFixed(3)}:d=${fadeOut}`);
      }
    } catch {
      // Ignore
    }
  }

  const hasFinalFilters = finalVfParts.length > 0 || finalAfParts.length > 0;
  const useTwoPass = options.twoPass === true && hasFinalFilters === false;

  if (useTwoPass) {
    const passlogfile = ensurePathWithinBase(tmpDir, join(tmpDir, 'ffmpeg2pass'), 'passlog');
    await ffmpeg([
      '-i', finalInput,
      '-c:v', enc.videoCodec,
      '-b:v', enc.maxrate ?? '5M',
      '-preset', enc.preset,
      '-pass', '1',
      '-passlogfile', passlogfile,
      '-an',
      '-f', 'null',
      '-y', '/dev/null',
    ], tmpDir);
    await ffmpeg([
      '-i', finalInput,
      '-c:v', enc.videoCodec,
      '-b:v', enc.maxrate ?? '5M',
      '-preset', enc.preset,
      '-pass', '2',
      '-passlogfile', passlogfile,
      '-c:a', 'aac',
      '-b:a', enc.audioBitrate,
      '-movflags', '+faststart',
      '-y', finalPath,
    ], tmpDir);
    try {
      for (const ext of ['-0.log', '-0.log.mbtree']) {
        const logF = `${passlogfile}${ext}`;
        if (existsSync(logF)) unlinkSync(logF);
      }
    } catch {
      // Best-effort
    }
  } else if (hasFinalFilters) {
    const filterArgs: string[] = [];
    if (finalVfParts.length > 0) filterArgs.push('-vf', finalVfParts.join(','));
    if (finalAfParts.length > 0) filterArgs.push('-af', finalAfParts.join(','));
    await ffmpeg([
      '-i', finalInput,
      ...filterArgs,
      '-c:v', enc.videoCodec,
      '-crf', String(enc.crf),
      '-preset', enc.preset,
      '-c:a', 'aac',
      '-b:a', enc.audioBitrate,
      '-movflags', '+faststart',
      '-y', finalPath,
    ], tmpDir);
  } else {
    await ffmpeg([
      '-i', finalInput,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y', finalPath,
    ], tmpDir);
  }

  progress('最终视频输出完成');
  return finalPath;
}
