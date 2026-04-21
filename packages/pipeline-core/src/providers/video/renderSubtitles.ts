/**
 * Port layer for subtitle helpers used by the ffmpeg assembler surface.
 */
import {
  generateSRT as defaultGenerateSRT,
  formatSRT as defaultFormatSRT,
  hexToAssColor as defaultHexToAssColor,
  buildSubtitleForceStyle as defaultBuildSubtitleForceStyle,
} from './renderSubtitles.impl.js';

type RenderSubtitlesPort = {
  generateSRT: typeof defaultGenerateSRT;
  formatSRT: typeof defaultFormatSRT;
  hexToAssColor: typeof defaultHexToAssColor;
  buildSubtitleForceStyle: typeof defaultBuildSubtitleForceStyle;
};

const defaultPort: RenderSubtitlesPort = {
  generateSRT: defaultGenerateSRT,
  formatSRT: defaultFormatSRT,
  hexToAssColor: defaultHexToAssColor,
  buildSubtitleForceStyle: defaultBuildSubtitleForceStyle,
};

let activeRenderSubtitlesPort: RenderSubtitlesPort = { ...defaultPort };

export function setRenderSubtitlesPort(overrides: Partial<RenderSubtitlesPort>): void {
  activeRenderSubtitlesPort = { ...activeRenderSubtitlesPort, ...overrides };
}

export function resetRenderSubtitlesPort(): void {
  activeRenderSubtitlesPort = { ...defaultPort };
}

export const generateSRT = (
  ...args: Parameters<typeof defaultGenerateSRT>
): ReturnType<typeof defaultGenerateSRT> => activeRenderSubtitlesPort.generateSRT(...args);

export const formatSRT = (
  ...args: Parameters<typeof defaultFormatSRT>
): ReturnType<typeof defaultFormatSRT> => activeRenderSubtitlesPort.formatSRT(...args);

export const hexToAssColor = (
  ...args: Parameters<typeof defaultHexToAssColor>
): ReturnType<typeof defaultHexToAssColor> => activeRenderSubtitlesPort.hexToAssColor(...args);

export const buildSubtitleForceStyle = (
  ...args: Parameters<typeof defaultBuildSubtitleForceStyle>
): ReturnType<typeof defaultBuildSubtitleForceStyle> =>
  activeRenderSubtitlesPort.buildSubtitleForceStyle(...args);
