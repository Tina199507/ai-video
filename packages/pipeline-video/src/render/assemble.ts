// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePathWithinBase, sanitizeFileSystemPath } from '@ai-video/lib/pathSafety.js';
import { cleanupDataUrlTempFiles } from './paths.js';
import { burnSubtitles } from './subtitle-burn.js';
import { renderSceneVideos } from './scene-clips.js';
import { normalizeAndConcatScenes } from './normalize.js';
import { mixFinalAudio } from './audio-mix.js';
import { finalizeVideoOutput } from './finalize.js';
import { resolveEncoding, type AssemblyOptions, type SceneInput } from './types.js';

export async function assembleVideo(
  scenes: SceneInput[],
  options: AssemblyOptions,
): Promise<string> {
  const safeAssetsDir = sanitizeFileSystemPath(options.assetsDir, 'assetsDir');
  const safeOutputDir = sanitizeFileSystemPath(options.outputDir, 'outputDir');
  const safeBgmPath = options.bgmPath
    ? sanitizeFileSystemPath(options.bgmPath, 'bgmPath')
    : undefined;
  const { onProgress } = options;
  const enc = resolveEncoding(options.encoding);
  const tmpDir = ensurePathWithinBase(safeOutputDir, join(safeOutputDir, '_assembly_tmp'), 'tmpDir');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const parallelism = Math.max(1, Math.min(4, Math.floor(options.parallelism ?? 2)));
  const totalSteps = scenes.length + 3;
  let currentStep = 0;

  const progress = (msg: string) => {
    currentStep++;
    const pct = Math.round((currentStep / totalSteps) * 100);
    onProgress?.(pct, msg);
  };

  const sceneVideos = await renderSceneVideos({
    scenes,
    assetsDir: safeAssetsDir,
    tmpDir,
    enc,
    parallelism,
    progress,
  });

  const { concatOutput, concatList, normalizedVideos } = await normalizeAndConcatScenes({
    sceneVideos,
    tmpDir,
    enc,
    parallelism,
    transitions: options.transitions,
    transitionDurations: options.transitionDurations,
    colorGradeFilter: options.colorGradeFilter,
    bgmPath: safeBgmPath,
    bgmBeats: options.bgmBeats,
    defaultTransitionDuration: options.defaultTransitionDuration,
    progress,
  });

  const subtitleResult = await burnSubtitles(
    scenes,
    concatOutput,
    {
      subtitleStyle: options.subtitleStyle,
      outputDir: options.outputDir,
    },
    tmpDir,
    safeOutputDir,
    enc,
    progress,
  );

  const audioMix = await mixFinalAudio(
    subtitleResult.finalInput,
    {
      bgmPath: safeBgmPath,
      bgmVolume: options.bgmVolume,
      bgmFadeIn: options.bgmFadeIn,
      bgmFadeOut: options.bgmFadeOut,
    },
    tmpDir,
    enc,
  );

  const finalPath = await finalizeVideoOutput(
    audioMix.finalInput,
    {
      projectTitle: options.projectTitle,
      fadeInDuration: options.fadeInDuration,
      fadeOutDuration: options.fadeOutDuration,
      titleCard: options.titleCard,
      titleCardStyle: options.titleCardStyle,
      twoPass: options.twoPass,
    },
    safeOutputDir,
    tmpDir,
    enc,
    progress,
  );

  try {
    const filesToClean = [
      ...sceneVideos,
      ...normalizedVideos,
      concatOutput,
      subtitleResult.finalInput,
      subtitleResult.srtFile,
      audioMix.loudnormOutput,
    ];
    if (concatList) filesToClean.push(concatList);
    if (audioMix.bgmOutput) filesToClean.push(audioMix.bgmOutput);
    for (const f of filesToClean) {
      if (existsSync(f)) unlinkSync(f);
    }
    cleanupDataUrlTempFiles();
  } catch {
    // Best-effort cleanup
  }

  return finalPath;
}
