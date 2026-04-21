// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { BEAT_SNAP_TOLERANCE } from '@ai-video/pipeline-video/stages/beatAlign.js';
import { DEFAULT_ENCODING, type ResolvedEncoding } from './types.js';
import { getMediaDuration } from './probe.js';
import { ffmpeg } from './ffmpeg.js';

export const XFADE_MAP: Readonly<Record<string, string>> = Object.freeze({
  dissolve: 'dissolve',
  fade: 'fade',
  wipe: 'wipeleft',
  zoom: 'zoomin',
});

export const XFADE_DURATION = 0.5;

export function buildXfadeFilterGraph(
  durations: (number | null)[],
  transitions: readonly ('cut' | 'dissolve' | 'fade' | 'wipe' | 'zoom' | 'none')[],
  transitionDurations?: readonly number[],
  bgmBeats?: readonly number[],
  defaultDuration?: number,
): { vFilters: string[]; aFilters: string[] } {
  const n = durations.length;
  const vFilters: string[] = [];
  const aFilters: string[] = [];
  if (n < 2) return { vFilters, aFilters };
  const xfadeDefault = defaultDuration ?? XFADE_DURATION;

  const snapToBeat = (offset: number): number => {
    if (!bgmBeats || bgmBeats.length === 0) return offset;
    let nearest = offset;
    let bestDist = Infinity;
    for (const b of bgmBeats) {
      const dist = Math.abs(b - offset);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = b;
      }
    }
    return bestDist <= BEAT_SNAP_TOLERANCE ? nearest : offset;
  };

  let prevVideoLabel = '[0:v]';
  let prevAudioLabel = '[0:a]';
  let cumulativeOffset = durations[0] || 5;

  for (let i = 1; i < n; i++) {
    const tType = transitions[i - 1] ?? 'cut';
    let xfadeName = XFADE_MAP[tType] ?? '';
    const outVideoLabel = i === n - 1 ? '[vout]' : `[v${i}]`;
    const outAudioLabel = i === n - 1 ? '[aout]' : `[a${i}]`;
    const xDur = transitionDurations?.[i - 1] ?? xfadeDefault;

    const prevDur = durations[i - 1] || 5;
    const curDur = durations[i] || 5;
    if (xfadeName && (prevDur < xDur * 2 || curDur < xDur * 2)) {
      xfadeName = '';
    }

    if (xfadeName) {
      const rawOffset = Math.max(0, cumulativeOffset - xDur);
      const offset = snapToBeat(rawOffset);
      vFilters.push(`${prevVideoLabel}[${i}:v]xfade=transition=${xfadeName}:offset=${offset.toFixed(3)}:duration=${xDur}${outVideoLabel}`);
      aFilters.push(`${prevAudioLabel}[${i}:a]acrossfade=d=${xDur}:c1=tri:c2=tri${outAudioLabel}`);
      cumulativeOffset = offset + (durations[i] || 5);
    } else {
      vFilters.push(`${prevVideoLabel}[${i}:v]concat=n=2:v=1:a=0${outVideoLabel}`);
      aFilters.push(`${prevAudioLabel}[${i}:a]concat=n=2:v=0:a=1${outAudioLabel}`);
      cumulativeOffset += (durations[i] || 5);
    }

    prevVideoLabel = outVideoLabel;
    prevAudioLabel = outAudioLabel;
  }

  return { vFilters, aFilters };
}

export async function concatWithXfade(
  videos: string[],
  transitions: readonly ('cut' | 'dissolve' | 'fade' | 'wipe' | 'zoom' | 'none')[],
  outputPath: string,
  cwd: string,
  enc: ResolvedEncoding = DEFAULT_ENCODING,
  transitionDurations?: readonly number[],
  bgmBeats?: readonly number[],
  defaultDuration?: number,
): Promise<void> {
  const n = videos.length;
  if (n < 2) return;

  const durations = await Promise.all(videos.map(v => getMediaDuration(v)));

  const inputs: string[] = [];
  for (const v of videos) inputs.push('-i', v);

  const { vFilters, aFilters } = buildXfadeFilterGraph(
    durations,
    transitions,
    transitionDurations,
    bgmBeats,
    defaultDuration,
  );
  const filterComplex = [...vFilters, ...aFilters].join(';');

  await ffmpeg([
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', enc.videoCodec,
    '-crf', String(enc.crf),
    '-c:a', 'aac',
    '-b:a', enc.audioBitrate,
    '-pix_fmt', 'yuv420p',
    '-y', outputPath,
  ], cwd);
}
