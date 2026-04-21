/**
 * Port layer for legacy provider config translation.
 */
import {
  detectProvider as defaultDetectProvider,
  legacyConfigToSiteConfig as defaultLegacyConfigToSiteConfig,
} from './legacy.impl.js';

type LegacyPort = {
  detectProvider: typeof defaultDetectProvider;
  legacyConfigToSiteConfig: typeof defaultLegacyConfigToSiteConfig;
};

const defaultLegacyPort: LegacyPort = {
  detectProvider: defaultDetectProvider,
  legacyConfigToSiteConfig: defaultLegacyConfigToSiteConfig,
};

let activeLegacyPort: LegacyPort = { ...defaultLegacyPort };

export function setVideoLegacyPort(overrides: Partial<LegacyPort>): void {
  activeLegacyPort = { ...activeLegacyPort, ...overrides };
}

export function resetVideoLegacyPort(): void {
  activeLegacyPort = { ...defaultLegacyPort };
}

export const detectProvider = (
  ...args: Parameters<typeof defaultDetectProvider>
): ReturnType<typeof defaultDetectProvider> => activeLegacyPort.detectProvider(...args);

export const legacyConfigToSiteConfig = (
  ...args: Parameters<typeof defaultLegacyConfigToSiteConfig>
): ReturnType<typeof defaultLegacyConfigToSiteConfig> => activeLegacyPort.legacyConfigToSiteConfig(...args);
