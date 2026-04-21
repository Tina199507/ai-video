/**
 * Port layer for site strategy resolution.
 */
import { resolveSiteStrategy as defaultResolveSiteStrategy } from './sites.impl.js';
export type { SiteStrategy, VideoProviderKind } from './sites.impl.js';

type SitesPort = {
  resolveSiteStrategy: typeof defaultResolveSiteStrategy;
};

let activeSitesPort: SitesPort = {
  resolveSiteStrategy: defaultResolveSiteStrategy,
};

export function setVideoSitesPort(overrides: Partial<SitesPort>): void {
  activeSitesPort = { ...activeSitesPort, ...overrides };
}

export function resetVideoSitesPort(): void {
  activeSitesPort = { resolveSiteStrategy: defaultResolveSiteStrategy };
}

export const resolveSiteStrategy = (
  ...args: Parameters<typeof defaultResolveSiteStrategy>
): ReturnType<typeof defaultResolveSiteStrategy> => activeSitesPort.resolveSiteStrategy(...args);
