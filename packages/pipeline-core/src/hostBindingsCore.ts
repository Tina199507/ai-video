import type { Page } from 'playwright';
import type { GenerationResult } from '@ai-video/pipeline-core/types/adapter.js';
import type { AiResource, SelectorChain } from './sharedTypes.js';

export type QuotaCapability = 'text' | 'image' | 'video';

export interface QuotaEvent {
  provider: string;
  accountId?: string;
  capability: QuotaCapability;
  exhausted: boolean;
  reason?: string;
  timestamp: string;
}

export interface ExtractedImage {
  localPath: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
}

/** Timeouts and tuning values previously read from `src/constants.js`. */
export interface AdapterHostTimeouts {
  chatResponseTimeoutMs: number;
  maxContinuations: number;
  pollinationsMaxAttempts: number;
  pollinationsFetchTimeoutMs: number;
}

/** TTS options passed to the host `generateSpeech` implementation. */
export interface HostTtsConfig {
  assetsDir: string;
  voice?: string;
  rate?: string;
  pitch?: string;
  preferLocal?: boolean;
}

export interface AdapterHostBindings {
  extractLatestImage: (
    page: Page,
    responseBlockSelector: string,
    outputDir: string,
    filename: string,
    waitTimeoutMs?: number,
    responseBlockChain?: SelectorChain,
  ) => Promise<ExtractedImage | null>;
  tts: {
    generateSpeech: (text: string, config: HostTtsConfig) => Promise<GenerationResult>;
    isEdgeTTSAvailable: () => boolean | Promise<boolean>;
  };
  quota: {
    on: (fn: (e: QuotaEvent) => void) => () => void;
    emit: (e: Omit<QuotaEvent, 'timestamp'>) => void;
  };
  capabilityQuota: {
    allExhausted: (resources: readonly AiResource[], capability: QuotaCapability) => boolean;
    markExhausted: (resourceId: string, capability: QuotaCapability, provider?: string) => void;
  };
  hasQuotaSignal: (text: string) => boolean;
  timeouts: AdapterHostTimeouts;
  httpProxy: string | undefined;
  defaultTextProvider: string;
  defaultImageProvider: string;
}

let bindings: AdapterHostBindings | null = null;

export function registerAdapterHostBindings(next: AdapterHostBindings): void {
  bindings = next;
}

export function getAdapterHostBindings(): AdapterHostBindings {
  if (!bindings) {
    throw new Error(
      'registerAdapterHostBindings() was not called at process startup. ' +
        'Import and invoke installAdapterHostBindings() from src/adapters/installAdapterHostBindings.ts before constructing ChatAdapter.',
    );
  }
  return bindings;
}
