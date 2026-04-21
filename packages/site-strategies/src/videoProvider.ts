/**
 * Re-export pipeline-core video provider surface without symbols owned by
 * `./videoSites.js` / `./types.js` on this package's public barrel
 * (`resolveSiteStrategy`, `SiteStrategy`, `VideoProviderKind`).
 */
export {
  sanitizePromptForJimeng,
  sanitizePromptForKling,
  rewritePromptForCompliance,
} from '@ai-video/pipeline-core/videoProviderSurface.js';
export { detectQueueStateFromText } from '@ai-video/pipeline-core/videoProviderSurface.js';
export { videoHealthMonitor } from '@ai-video/pipeline-core/videoProviderSurface.js';
export type {
  VideoGenRequest,
  VideoGenResult,
  VideoProviderConfig,
  VideoProviderType,
} from '@ai-video/pipeline-core/videoProviderSurface.js';
export {
  detectProvider,
  legacyConfigToSiteConfig,
} from '@ai-video/pipeline-core/videoProviderSurface.js';
export {
  generateVideoViaSiteConfig,
  generateVideoViaWeb,
} from '@ai-video/pipeline-core/videoProviderSurface.js';
