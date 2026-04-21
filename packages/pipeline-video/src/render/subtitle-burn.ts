// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePathWithinBase } from '@ai-video/lib/pathSafety.js';
import type { AssemblyOptions, ResolvedEncoding, SceneInput } from './types.js';
import { ffmpeg, FFmpegCommandError } from './ffmpeg.js';
import { buildSubtitleForceStyle, generateSRT } from './subtitles.js';

export interface SubtitleBurnResult {
  finalInput: string;
  srtFile: string;
  subsFile: string;
  outputSrt: string;
}

export async function burnSubtitles(
  scenes: SceneInput[],
  concatOutput: string,
  options: Pick<AssemblyOptions, 'subtitleStyle' | 'outputDir'>,
  tmpDir: string,
  safeOutputDir: string,
  enc: ResolvedEncoding,
  progress: (message: string) => void,
): Promise<SubtitleBurnResult> {
  const srtContent = generateSRT(scenes);
  const srtFile = ensurePathWithinBase(tmpDir, join(tmpDir, 'subtitles.srt'), 'subtitle file');
  writeFileSync(srtFile, srtContent, 'utf-8');

  const subsFile = ensurePathWithinBase(tmpDir, join(tmpDir, 'with_subs.mp4'), 'subtitle output');
  const srtRelative = 'subtitles.srt';
  let subsOutput = concatOutput;

  const subStyle = options.subtitleStyle ?? {
    fontName: 'Arial',
    fontSize: 20,
    primaryColor: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 2,
    shadowEnabled: true,
    marginV: 35,
    backdropEnabled: false,
    backdropOpacity: 0,
  };
  const subtitleForceStyle = buildSubtitleForceStyle(subStyle);

  try {
    await ffmpeg([
      '-i', concatOutput,
      '-vf', `subtitles=${srtRelative}:force_style='${subtitleForceStyle}'`,
      '-c:v', enc.videoCodec,
      '-crf', String(enc.crf),
      '-c:a', 'copy',
      '-y', subsFile,
    ], tmpDir);
    subsOutput = subsFile;
    progress('字幕烧录完成');
  } catch (e) {
    const stderrPath = ensurePathWithinBase(safeOutputDir, join(safeOutputDir, 'assembly_subtitle_ffmpeg.stderr.log'), 'subtitle stderr log');
    const stderr = e instanceof FFmpegCommandError
      ? e.stderr
      : (e instanceof Error ? e.message : String(e));
    writeFileSync(stderrPath, stderr, 'utf-8');
    progress('字幕烧录失败（跳过），SRT文件已保留');
  }

  const outputSrt = ensurePathWithinBase(safeOutputDir, join(safeOutputDir, 'subtitles.srt'), 'output subtitle file');
  try { copyFileSync(srtFile, outputSrt); } catch { /* ignore */ }

  return {
    finalInput: subsOutput,
    srtFile,
    subsFile,
    outputSrt,
  };
}
