/**
 * @ai-video/adapter-common — public surface.
 *
 * Façade for the shared adapter primitives currently living at
 * `src/adapters/`.  Out-of-tree adapters and downstream apps can
 * depend on this package alias instead of fishing into
 * `src/adapters/*` paths.  A future codemod will physically
 * relocate these modules into `packages/adapter-common/src/`.
 */

export const PACKAGE_VERSION = '0.0.0';

/* ---- Shared adapter contracts ---- */
export type {
  AIAdapter,
  AIRequestOptions,
  GenerationResult,
} from '@ai-video/pipeline-core/types/adapter.js';
export type {
  ChatSubmitRequest,
  ChatResourcesPort,
  ActiveChatSelectors,
  ChatWorkbenchPort,
} from './chatAdapter.port.js';

/* ---- Retry + abort primitives (re-exported from @ai-video/lib) ---- */
export {
  withRetry,
  isQuotaError,
  isTransient,
  tagIfQuota,
  type WithRetryOptions,
} from '@ai-video/lib/retry.js';
export {
  AIRequestAbortedError,
  throwIfAborted,
  waitWithAbort,
} from '@ai-video/lib/abortable.js';
export type { RetryRequestOptions } from '@ai-video/lib/retry.types.js';

/* ---- Adapter implementations ---- */
export { GeminiAdapter } from './geminiAdapter.js';
export {
  ChatAdapter,
  ChatVideoUnsupportedError,
  type ChatAdapterConfig,
} from './chatAdapter.js';
export { AIVideoMakerAdapter } from './aivideomakerAdapter.js';
export { FallbackAdapter } from './fallbackAdapter.js';

/* ---- Shared channel helpers ---- */
export {
  resolveQueueDetection,
  detectQueueStateFromText,
} from './queueDetection.js';
export {
  VideoProviderHealthMonitor,
  type ProviderHealthStatus,
  type HealthEventListener,
  type HealthEvent,
} from './videoProviderHealth.js';

/* ---- Response parsing helpers ---- */
export {
  extractJSON,
  isTruncated,
  mergeContinuation,
} from './responseParser.js';

/* ---- Prompt sanitization ---- */
export {
  sanitizePromptForJimeng,
  sanitizePromptForKling,
  rewritePromptForCompliance,
} from './promptSanitizer.js';

/* ---- TTS voice resolution (edge-tts mapping) ---- */
export {
  resolveVoiceFromStyle,
  DEFAULT_VOICE_MAPPING,
  type VoiceMapping,
} from './resolveVoiceFromStyle.js';

export {
  registerAdapterHostBindings,
  getAdapterHostBindings,
  type AdapterHostBindings,
  type QuotaEvent,
  type QuotaCapability,
} from './hostBindings.js';
