import type { SubtitleStyle, TitleCardStyle } from '@ai-video/shared/types.js';

/** Encoding quality profile — configurable output quality controls. */
export interface EncodingProfile {
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: 'libx264' | 'libx265';
  crf?: number;
  audioBitrate?: string;
  audioSampleRate?: number;
  preset?: string;
  maxrate?: string;
  bufsize?: string;
}

/** Core encoding fields that always have a value after resolution. */
export interface ResolvedEncoding {
  width: number;
  height: number;
  fps: number;
  videoCodec: 'libx264' | 'libx265';
  crf: number;
  audioBitrate: string;
  audioSampleRate: number;
  preset: string;
  maxrate?: string;
  bufsize?: string;
}

/** Sensible 1080p defaults. */
export const DEFAULT_ENCODING: ResolvedEncoding = {
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: 'libx264',
  crf: 20,
  audioBitrate: '192k',
  audioSampleRate: 48000,
  preset: 'medium',
};

/** Resolve partial profile against defaults. */
export function resolveEncoding(p?: EncodingProfile): ResolvedEncoding {
  return {
    ...DEFAULT_ENCODING,
    ...p,
    preset: p?.preset ?? DEFAULT_ENCODING.preset,
  };
}

export interface AssemblyOptions {
  assetsDir: string;
  outputDir: string;
  projectTitle?: string;
  bgmPath?: string;
  bgmVolume?: number;
  bgmFadeIn?: number;
  bgmFadeOut?: number;
  parallelism?: number;
  onProgress?: (percent: number, message: string) => void;
  transitions?: readonly ('cut' | 'dissolve' | 'fade' | 'wipe' | 'zoom' | 'none')[];
  transitionDurations?: readonly number[];
  colorGradeFilter?: string;
  encoding?: EncodingProfile;
  twoPass?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  titleCard?: string;
  bgmBeats?: readonly number[];
  subtitleStyle?: SubtitleStyle;
  titleCardStyle?: TitleCardStyle;
  defaultTransitionDuration?: number;
}

export interface SceneInput {
  narrative: string;
  assetUrl?: string;
  assetType: 'image' | 'video' | 'placeholder';
  audioUrl?: string;
  audioDuration?: number;
  estimatedDuration?: number;
  cameraMotion?: string;
  soundDesign?: string;
}
