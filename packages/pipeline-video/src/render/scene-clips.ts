// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePathWithinBase } from '@ai-video/lib/pathSafety.js';
import { ffmpeg } from './ffmpeg.js';
import { runWithConcurrency } from './concurrency.js';
import { getMediaDuration } from './probe.js';
import { resolveAssetPath } from './paths.js';
import type { ResolvedEncoding, SceneInput } from './types.js';

export interface RenderSceneVideosOptions {
  scenes: SceneInput[];
  assetsDir: string;
  tmpDir: string;
  enc: ResolvedEncoding;
  parallelism: number;
  progress: (message: string) => void;
}

export async function renderSceneVideos(options: RenderSceneVideosOptions): Promise<string[]> {
  const { scenes, assetsDir, tmpDir, enc, parallelism, progress } = options;
  const sceneVideos: string[] = new Array(scenes.length);
  const resTag = `${enc.width}x${enc.height}`;

  await runWithConcurrency(scenes, parallelism, async (scene, i) => {
    const sceneFile = ensurePathWithinBase(tmpDir, join(tmpDir, `scene_${i}.mp4`), 'scene file');
    const assetPath = resolveAssetPath(scene.assetUrl, assetsDir);
    const audioPath = resolveAssetPath(scene.audioUrl, assetsDir);
    const duration = scene.audioDuration ?? scene.estimatedDuration ?? 5;

    if (scene.assetType === 'video' && assetPath && existsSync(assetPath)) {
      if (audioPath && existsSync(audioPath)) {
        const audioDur = await getMediaDuration(audioPath) || duration;
        const videoDur = await getMediaDuration(assetPath) || duration;

        const { computeAVSyncStrategy, buildAVSyncArgs } = await import('@ai-video/pipeline-video/stages/avSync.js');
        const syncResult = computeAVSyncStrategy(videoDur, audioDur);
        const syncArgs = buildAVSyncArgs(syncResult);

        if (syncArgs.loopInput) {
          const filterArgs: string[] = [];
          if (syncArgs.audioFilter) filterArgs.push('-af', syncArgs.audioFilter);
          await ffmpeg([
            '-stream_loop', '-1',
            '-i', assetPath,
            '-i', audioPath,
            '-map', '0:v',
            '-map', '1:a',
            ...filterArgs,
            '-c:v', enc.videoCodec,
            '-crf', String(enc.crf),
            '-c:a', 'aac',
            '-b:a', enc.audioBitrate,
            ...syncArgs.outputFlags,
            '-y', sceneFile,
          ], tmpDir);
        } else {
          const vfParts: string[] = [];
          const afParts: string[] = [];
          if (syncArgs.videoFilter) vfParts.push(syncArgs.videoFilter);
          if (syncArgs.audioFilter) afParts.push(syncArgs.audioFilter);
          const filterArgs: string[] = [];
          if (vfParts.length > 0) filterArgs.push('-vf', vfParts.join(','));
          if (afParts.length > 0) filterArgs.push('-af', afParts.join(','));
          await ffmpeg([
            '-i', assetPath,
            '-i', audioPath,
            '-map', '0:v',
            '-map', '1:a',
            ...filterArgs,
            '-c:v', enc.videoCodec,
            '-crf', String(enc.crf),
            '-c:a', 'aac',
            '-b:a', enc.audioBitrate,
            ...syncArgs.outputFlags,
            '-y', sceneFile,
          ], tmpDir);
        }
      } else {
        await ffmpeg([
          '-i', assetPath,
          '-f', 'lavfi',
          '-i', `anullsrc=channel_layout=stereo:sample_rate=${enc.audioSampleRate}`,
          '-c:v', enc.videoCodec,
          '-crf', String(enc.crf),
          '-c:a', 'aac',
          '-b:a', enc.audioBitrate,
          '-t', String(duration),
          '-shortest',
          '-y', sceneFile,
        ], tmpDir);
      }
    } else if (assetPath && existsSync(assetPath)) {
      const fps = enc.fps;
      const { resolveKenBurnsVariant, buildKenBurnsFilter } = await import('@ai-video/pipeline-video/stages/cameraMotion.js');
      const variant = resolveKenBurnsVariant(scene.cameraMotion, i);
      const kenBurnsFilter = (totalFrames: number) =>
        buildKenBurnsFilter(variant, totalFrames, enc.width, enc.height, fps);
      if (audioPath && existsSync(audioPath)) {
        const audioDur = await getMediaDuration(audioPath) || duration;
        const totalFrames = Math.ceil(audioDur * fps);
        await ffmpeg([
          '-loop', '1',
          '-i', assetPath,
          '-i', audioPath,
          '-vf', kenBurnsFilter(totalFrames),
          '-c:v', enc.videoCodec,
          '-crf', String(enc.crf),
          '-c:a', 'aac',
          '-b:a', enc.audioBitrate,
          '-pix_fmt', 'yuv420p',
          '-t', String(audioDur),
          '-y', sceneFile,
        ], tmpDir);
      } else {
        const totalFrames = Math.ceil(duration * fps);
        await ffmpeg([
          '-loop', '1',
          '-i', assetPath,
          '-f', 'lavfi',
          '-i', `anullsrc=channel_layout=stereo:sample_rate=${enc.audioSampleRate}`,
          '-vf', kenBurnsFilter(totalFrames),
          '-c:v', enc.videoCodec,
          '-crf', String(enc.crf),
          '-c:a', 'aac',
          '-b:a', enc.audioBitrate,
          '-pix_fmt', 'yuv420p',
          '-t', String(duration),
          '-y', sceneFile,
        ], tmpDir);
      }
    } else {
      if (audioPath && existsSync(audioPath)) {
        const audioDur = await getMediaDuration(audioPath) || duration;
        await ffmpeg([
          '-f', 'lavfi',
          '-i', `color=c=black:s=${resTag}:d=${audioDur}`,
          '-i', audioPath,
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', enc.videoCodec,
          '-crf', String(enc.crf),
          '-c:a', 'aac',
          '-b:a', enc.audioBitrate,
          '-pix_fmt', 'yuv420p',
          '-t', String(audioDur),
          '-y', sceneFile,
        ], tmpDir);
      } else {
        await ffmpeg([
          '-f', 'lavfi',
          '-i', `color=c=black:s=${resTag}:d=${duration}`,
          '-f', 'lavfi',
          '-i', `anullsrc=channel_layout=stereo:sample_rate=${enc.audioSampleRate}`,
          '-c:v', enc.videoCodec,
          '-crf', String(enc.crf),
          '-c:a', 'aac',
          '-b:a', enc.audioBitrate,
          '-pix_fmt', 'yuv420p',
          '-t', String(duration),
          '-y', sceneFile,
        ], tmpDir);
      }
    }

    sceneVideos[i] = sceneFile;
    progress(`场景 ${i + 1}/${scenes.length} 合成完成`);
  });

  const { resolveSFXLayer } = await import('@ai-video/pipeline-video/stages/sfxDesign.js');
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene.soundDesign || !sceneVideos[i]) continue;
    const dur = scene.audioDuration ?? scene.estimatedDuration ?? 5;
    const sfx = resolveSFXLayer(scene.soundDesign, dur);
    if (!sfx) continue;
    const sfxOutput = ensurePathWithinBase(tmpDir, join(tmpDir, `sfx_${i}.mp4`), 'sfx scene file');
    try {
      await ffmpeg([
        '-i', sceneVideos[i],
        '-f', 'lavfi', '-i', sfx.lavfiSource,
        '-filter_complex',
        `[1:a]volume=${sfx.volume}[sfx];[0:a][sfx]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', enc.audioBitrate,
        '-y', sfxOutput,
      ], tmpDir);
      sceneVideos[i] = sfxOutput;
    } catch {
      // Non-fatal: continue without SFX for this scene
    }
  }

  return sceneVideos;
}
