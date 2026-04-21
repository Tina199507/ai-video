/* ------------------------------------------------------------------ */
/*  Video provider public surface                                     */
/* ------------------------------------------------------------------ */

export {
  sanitizePromptForJimeng,
  sanitizePromptForKling,
  rewritePromptForCompliance,
} from './providers/video/promptSanitizer.js';
export { detectQueueStateFromText } from './providers/video/queueDetection.js';
export { resolveSiteStrategy } from './providers/video/sites.js';
export type { SiteStrategy, VideoProviderKind } from './providers/video/sites.js';

export { videoHealthMonitor } from './providers/video/health.js';
export type {
  VideoGenRequest,
  VideoGenResult,
  VideoProviderConfig,
  VideoProviderType,
} from './providers/video/types.js';
export {
  detectProvider,
  legacyConfigToSiteConfig,
} from './providers/video/legacy.js';
export {
  generateVideoViaSiteConfig,
  generateVideoViaWeb,
} from './providers/video/generate.js';
