import { getAdapterHostBindingsPort, type AdapterHostBindingsPort } from './ports/adapterHostBindingsPort.js';
import { extractLatestImage } from './imageExtractor.js';
import { generateSpeech, isEdgeTTSAvailable } from './ttsProvider.js';
import { quotaBus } from './quotaBus.js';
import { capabilityQuota, hasQuotaSignal } from './quotaRotation.js';
import {
  CHAT_RESPONSE_TIMEOUT_MS,
  MAX_CONTINUATIONS,
  POLLINATIONS_MAX_ATTEMPTS,
  POLLINATIONS_FETCH_TIMEOUT_MS,
  DEFAULT_TEXT_PROVIDER,
  DEFAULT_IMAGE_PROVIDER,
  HTTP_PROXY,
} from './constants.js';

/**
 * Wires browser-side helpers and quota singletons into `@ai-video/adapter-common`
 * so workspace packages never import `../../../src/*` directly.
 */
export function installAdapterHostBindings(): void {
  const adapterHostBindingsPort: AdapterHostBindingsPort = getAdapterHostBindingsPort();
  adapterHostBindingsPort.registerAdapterHostBindings({
    extractLatestImage,
    tts: {
      generateSpeech,
      isEdgeTTSAvailable,
    },
    quota: {
      on: fn => quotaBus.on(fn),
      emit: e => quotaBus.emit(e),
    },
    capabilityQuota: {
      allExhausted: (resources, cap) => capabilityQuota.allExhausted(resources, cap),
      markExhausted: (id, cap, provider) => capabilityQuota.markExhausted(id, cap, provider),
    },
    hasQuotaSignal,
    timeouts: {
      chatResponseTimeoutMs: CHAT_RESPONSE_TIMEOUT_MS,
      maxContinuations: MAX_CONTINUATIONS,
      pollinationsMaxAttempts: POLLINATIONS_MAX_ATTEMPTS,
      pollinationsFetchTimeoutMs: POLLINATIONS_FETCH_TIMEOUT_MS,
    },
    httpProxy: HTTP_PROXY,
    defaultTextProvider: DEFAULT_TEXT_PROVIDER,
    defaultImageProvider: DEFAULT_IMAGE_PROVIDER,
  });
}
