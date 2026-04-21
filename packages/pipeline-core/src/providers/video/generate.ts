/**
 * Port layer for video generation entrypoints.
 */
import {
  generateVideoViaSiteConfig as defaultGenerateVideoViaSiteConfig,
  generateVideoViaWeb as defaultGenerateVideoViaWeb,
} from './generate.impl.js';

type GeneratePort = {
  generateVideoViaSiteConfig: typeof defaultGenerateVideoViaSiteConfig;
  generateVideoViaWeb: typeof defaultGenerateVideoViaWeb;
};

const defaultGeneratePort: GeneratePort = {
  generateVideoViaSiteConfig: defaultGenerateVideoViaSiteConfig,
  generateVideoViaWeb: defaultGenerateVideoViaWeb,
};

let activeGeneratePort: GeneratePort = { ...defaultGeneratePort };

export function setVideoGeneratePort(overrides: Partial<GeneratePort>): void {
  activeGeneratePort = { ...activeGeneratePort, ...overrides };
}

export function resetVideoGeneratePort(): void {
  activeGeneratePort = { ...defaultGeneratePort };
}

export const generateVideoViaSiteConfig = (
  ...args: Parameters<typeof defaultGenerateVideoViaSiteConfig>
): ReturnType<typeof defaultGenerateVideoViaSiteConfig> => activeGeneratePort.generateVideoViaSiteConfig(...args);

export const generateVideoViaWeb = (
  ...args: Parameters<typeof defaultGenerateVideoViaWeb>
): ReturnType<typeof defaultGenerateVideoViaWeb> => activeGeneratePort.generateVideoViaWeb(...args);
