/**
 * Port layer for ffmpeg probe helpers.
 */
import {
  isFFmpegAvailable as defaultIsFFmpegAvailable,
  getMediaDuration as defaultGetMediaDuration,
  getAudioMeanVolume as defaultGetAudioMeanVolume,
  getVideoInfo as defaultGetVideoInfo,
} from './renderProbe.impl.js';

type RenderProbePort = {
  isFFmpegAvailable: typeof defaultIsFFmpegAvailable;
  getMediaDuration: typeof defaultGetMediaDuration;
  getAudioMeanVolume: typeof defaultGetAudioMeanVolume;
  getVideoInfo: typeof defaultGetVideoInfo;
};

const defaultPort: RenderProbePort = {
  isFFmpegAvailable: defaultIsFFmpegAvailable,
  getMediaDuration: defaultGetMediaDuration,
  getAudioMeanVolume: defaultGetAudioMeanVolume,
  getVideoInfo: defaultGetVideoInfo,
};

let activeRenderProbePort: RenderProbePort = { ...defaultPort };

export function setRenderProbePort(overrides: Partial<RenderProbePort>): void {
  activeRenderProbePort = { ...activeRenderProbePort, ...overrides };
}

export function resetRenderProbePort(): void {
  activeRenderProbePort = { ...defaultPort };
}

export const isFFmpegAvailable = (
  ...args: Parameters<typeof defaultIsFFmpegAvailable>
): ReturnType<typeof defaultIsFFmpegAvailable> => activeRenderProbePort.isFFmpegAvailable(...args);

export const getMediaDuration = (
  ...args: Parameters<typeof defaultGetMediaDuration>
): ReturnType<typeof defaultGetMediaDuration> => activeRenderProbePort.getMediaDuration(...args);

export const getAudioMeanVolume = (
  ...args: Parameters<typeof defaultGetAudioMeanVolume>
): ReturnType<typeof defaultGetAudioMeanVolume> => activeRenderProbePort.getAudioMeanVolume(...args);

export const getVideoInfo = (
  ...args: Parameters<typeof defaultGetVideoInfo>
): ReturnType<typeof defaultGetVideoInfo> => activeRenderProbePort.getVideoInfo(...args);
