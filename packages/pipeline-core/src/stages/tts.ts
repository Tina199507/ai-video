// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
/* ------------------------------------------------------------------ */
/*  Pass 12: TTS – codegen (script text → speech audio)              */
/*  Compiles narrative text into audio tracks per scene.             */
/* ------------------------------------------------------------------ */

import type { Scene, LogEntry } from '../pipelineTypes.js';
import { generateSpeech as ttsGenerateSpeech, type TTSConfig } from '../ttsProvider.js';
import { getMediaDuration, getAudioMeanVolume } from '../ffmpegAssembler.js';
import { createStageLog } from './stageLog.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';

import type { VideoIR } from '../cir/types.js';

const logger = createLogger('TTS');
const SILENCE_THRESHOLD_DB = -60;
const DURATION_GATE_RATIO = 3;
const MAX_DURATION_RETRIES = 2;

export interface TtsInput {
  scenes: Scene[];
  ttsConfig: TTSConfig;
  concurrency?: number;
  videoIR: VideoIR;
}

const log = createStageLog('TTS');

export async function runTts(
  input: TtsInput,
  onLog?: (entry: LogEntry) => void,
): Promise<Scene[]> {
  const emit = onLog ?? (() => {});
  const { scenes, ttsConfig } = input;
  const concurrency = input.concurrency ?? 2;
  const results = scenes.map(s => ({ ...s }));

  emit(log(`Generating TTS for ${scenes.length} scenes (concurrency: ${concurrency})...`));

  let activeCount = 0;
  const waitQueue: Array<() => void> = [];
  function acquire(): Promise<void> {
    if (activeCount < concurrency) {
      activeCount++;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => waitQueue.push(resolve));
  }
  function release(): void {
    const next = waitQueue.shift();
    if (next) next();
    else activeCount--;
  }

  const promises: Promise<void>[] = [];

  for (let i = 0; i < results.length; i++) {
    const scene = results[i];
    const idx = i;

    const p = (async () => {
      await acquire();
      try {
        logger.info('generating', { scene: scene.number, narrative: scene.narrative.slice(0, 200) });
        const irScene = input.videoIR.scenes[idx];
        const baseConfig: TTSConfig = {
          ...ttsConfig,
          voice: ttsConfig.voice ?? irScene?.ttsVoice,
          rate: ttsConfig.rate ?? irScene?.ttsRate,
        };

        const budgetSec = irScene?.ttsBudgetSec ?? scene.estimatedDuration;
        let bestResult: { audioUrl: string; duration: number } | undefined;

        for (let attempt = 0; attempt <= MAX_DURATION_RETRIES; attempt++) {
          const sceneConfig: TTSConfig = { ...baseConfig };
          if (attempt > 0) {
            const boost = attempt * 20;
            sceneConfig.rate = `+${boost}%`;
            logger.info('duration_gate_retry', { scene: scene.number, attempt, rate: sceneConfig.rate });
          }

          const ttsResult = await ttsGenerateSpeech(scene.narrative, sceneConfig);
          if (!ttsResult.audioUrl) break;

          const meanVol = await getAudioMeanVolume(ttsResult.audioUrl);
          if (meanVol < SILENCE_THRESHOLD_DB) {
            logger.warn('silent_audio_detected', { scene: scene.number, meanVolume: meanVol });
            results[idx].logs.push(`TTS produced silent audio (${meanVol.toFixed(1)} dB) — treating as failed`);
            emit(log(`Scene ${scene.number} TTS audio is silent (${meanVol.toFixed(1)} dB < ${SILENCE_THRESHOLD_DB} dB threshold)`, 'warning'));
            break;
          }

          const realDuration = await getMediaDuration(ttsResult.audioUrl);
          bestResult = { audioUrl: ttsResult.audioUrl, duration: realDuration > 0 ? realDuration : scene.estimatedDuration };
          if (budgetSec <= 0 || bestResult.duration <= budgetSec * DURATION_GATE_RATIO) break;

          logger.warn('duration_gate_exceeded', {
            scene: scene.number,
            attempt,
            audioDuration: bestResult.duration,
            budget: budgetSec,
            ratio: +(bestResult.duration / budgetSec).toFixed(1),
          });
          emit(log(`Scene ${scene.number} audio ${bestResult.duration.toFixed(1)}s exceeds budget ${budgetSec.toFixed(1)}s × ${DURATION_GATE_RATIO} — retrying`, 'warning'));
        }

        if (bestResult) {
          results[idx].audioUrl = bestResult.audioUrl;
          results[idx].audioDuration = bestResult.duration;
          logger.info('duration', { scene: scene.number, estimated: scene.estimatedDuration, actual: bestResult.duration });
        }
        emit(log(`Scene ${scene.number} TTS generated`, 'success'));
      } catch {
        results[idx].logs.push('TTS generation failed — will use scene without voiceover');
        emit(log(`Scene ${scene.number} TTS failed (non-fatal)`, 'warning'));
      } finally {
        release();
      }
    })();
    promises.push(p);
  }

  await Promise.all(promises);

  const successCount = results.filter(s => s.audioUrl).length;
  const targetDuration = input.videoIR.targetDurationSec;
  if (targetDuration > 0) {
    const totalAudio = results.reduce((sum, s) => sum + (s.audioDuration ?? 0), 0);
    const ratio = totalAudio / targetDuration;
    if (ratio > 1.5) {
      logger.warn('total_duration_exceeded', { totalAudio: +totalAudio.toFixed(1), target: targetDuration, ratio: +ratio.toFixed(2) });
      emit(log(`⚠ Total TTS audio ${totalAudio.toFixed(0)}s is ${ratio.toFixed(1)}x the target ${targetDuration.toFixed(0)}s — video will be longer than reference`, 'warning'));
    } else if (ratio < 0.5) {
      logger.warn('total_duration_short', { totalAudio: +totalAudio.toFixed(1), target: targetDuration, ratio: +ratio.toFixed(2) });
      emit(log(`⚠ Total TTS audio ${totalAudio.toFixed(0)}s is only ${(ratio * 100).toFixed(0)}% of target ${targetDuration.toFixed(0)}s`, 'warning'));
    }
  }

  emit(log(`TTS complete: ${successCount}/${scenes.length} scenes`, 'success'));
  return results;
}
