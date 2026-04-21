import { basename, dirname } from 'node:path';
import { JsonKVStore, type ProjectKVStore } from '@ai-video/pipeline-core/libFacade.js';
import { getPreset } from './providerPresets.js';
import { chainToSelector, selectorToChain } from './selectorResolver.js';
import { CustomProviderStore } from './customProviderStore.js';
import { ResourceManager } from './resourceManager.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import { WB_EVENT } from './sharedTypes.js';
import type { ProviderSelectors, ProviderId, SelectorChain } from './sharedTypes.js';
import type { DetectedSelectors, DetectedVideoSelectors } from './ports/chatAutomationPort.js';

const log = createLogger('SelectorService');

export type SelectorEventSink = {
  emit(event: { type: string; payload: unknown }): void;
  emitState(): void;
};

export interface SelectorServiceOptions {
  /** Optional shared KV. Falls back to a JSON store rooted at dirname(cachePath). */
  kv?: ProjectKVStore;
  /** Key under which the cache lives in the KV. Default: derived from cachePath. */
  key?: string;
}

/**
 * Manages CSS selector overrides, caching, and auto-detection results.
 * Extracted from Workbench to keep that class focused on orchestration.
 */
export class SelectorService {
  /** Custom selector overrides keyed by provider id. */
  private selectorOverrides: Partial<Record<ProviderId, Partial<ProviderSelectors>>> = {};
  /** SelectorChain cache keyed by provider -> field name. Preserved across restarts. */
  private selectorChainCache: Partial<Record<ProviderId, Record<string, SelectorChain>>> = {};

  private readonly kv: ProjectKVStore;
  private readonly kvKey: string;

  constructor(
    private readonly cachePath: string,
    private readonly customProviderStore: CustomProviderStore,
    private readonly resources: ResourceManager,
    private readonly sink: SelectorEventSink,
    options: SelectorServiceOptions = {},
  ) {
    if (options.kv) {
      this.kv = options.kv;
      this.kvKey = options.key ?? defaultKey(cachePath, 'selector-cache');
    } else if (cachePath) {
      this.kv = new JsonKVStore(dirname(cachePath));
      this.kvKey = defaultKey(cachePath, 'selector-cache');
    } else {
      this.kv = NULL_KV;
      this.kvKey = '';
    }
    this.loadSelectorCache();
  }

  /* ------------------------------------------------------------------ */
  /*  Cache persistence                                                 */
  /* ------------------------------------------------------------------ */

  private loadSelectorCache(): void {
    if (!this.kvKey) return;
    type CacheShape = Record<string, {
      selectors: Partial<ProviderSelectors>;
      chains?: Record<string, SelectorChain>;
      detectedAt: string;
    }>;
    let cache: CacheShape;
    try {
      cache = this.kv.get<CacheShape>(this.kvKey) ?? {};
    } catch (err) {
      log.warn('corrupt selector cache', { err: String(err), path: this.cachePath });
      cache = {};
    }
    for (const [provider, entry] of Object.entries(cache)) {
      if (entry?.selectors) {
        const sel = { ...entry.selectors };
        if (getPreset(provider)) {
          delete sel.responseBlock;
          delete sel.promptInput;
          delete sel.readyIndicator;
        }
        this.selectorOverrides[provider] = { ...this.selectorOverrides[provider], ...sel };
      }
      if (entry?.chains) {
        this.selectorChainCache[provider] = entry.chains;
      }
    }
  }

  persistSelectorCache(): void {
    if (!this.kvKey) return;
    try {
      const cache: Record<string, {
        selectors: Partial<ProviderSelectors>;
        chains?: Record<string, SelectorChain>;
        detectedAt: string;
      }> = {};
      for (const [provider, overrides] of Object.entries(this.selectorOverrides)) {
        if (overrides && Object.keys(overrides).length > 0) {
          cache[provider] = {
            selectors: overrides,
            chains: this.selectorChainCache[provider],
            detectedAt: new Date().toISOString(),
          };
        }
      }
      this.kv.set(this.kvKey, cache);
    } catch (err) {
      log.warn('failed to persist selector cache', { err: String(err), path: this.cachePath });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  setProviderSelectors(provider: ProviderId, overrides: Partial<ProviderSelectors>): void {
    this.selectorOverrides[provider] = overrides;
  }

  getSelectors(provider: ProviderId): ProviderSelectors {
    const preset = getPreset(provider);
    let base: ProviderSelectors | undefined;
    if (preset) {
      base = {
        chatUrl: preset.siteUrl,
        promptInput: chainToSelector(preset.selectors.promptInput),
        responseBlock: preset.selectors.responseBlock ? chainToSelector(preset.selectors.responseBlock) : '',
        readyIndicator: preset.selectors.readyIndicator ? chainToSelector(preset.selectors.readyIndicator) : chainToSelector(preset.selectors.promptInput),
        sendButton: preset.selectors.sendButton ? chainToSelector(preset.selectors.sendButton) : undefined,
        quotaExhaustedIndicator: preset.selectors.quotaExhaustedIndicator ? chainToSelector(preset.selectors.quotaExhaustedIndicator) : undefined,
        modelPickerTrigger: preset.selectors.modelPickerTrigger ? chainToSelector(preset.selectors.modelPickerTrigger) : undefined,
        modelOptionSelector: preset.selectors.modelOptionSelector ? chainToSelector(preset.selectors.modelOptionSelector) : undefined,
        fileUploadTrigger: preset.selectors.fileUploadTrigger ? chainToSelector(preset.selectors.fileUploadTrigger) : undefined,
      };
    }
    if (!base) {
      base = this.customProviderStore.get(provider)?.selectors;
    }
    if (!base) throw new Error(`Unknown provider "${provider}". Add it as a custom provider first.`);
    return { ...base, ...this.selectorOverrides[provider] };
  }

  /** Get a SelectorChain for a specific field of a provider. */
  getSelectorChain(provider: ProviderId, field: string): SelectorChain | undefined {
    const cached = this.selectorChainCache[provider]?.[field];
    if (cached && cached.length > 0) return cached;
    const preset = getPreset(provider);
    if (preset) {
      const chain = preset.selectors[field as keyof typeof preset.selectors] as SelectorChain | undefined;
      if (chain && chain.length > 0) return chain;
    }
    return undefined;
  }

  /** Get cached chains for a provider (used by health monitor). */
  getCachedChains(provider: ProviderId): Record<string, SelectorChain> | undefined {
    return this.selectorChainCache[provider];
  }

  /** Update cached chains for a provider (used by health monitor). */
  setCachedChain(provider: ProviderId, field: string, chain: SelectorChain): void {
    if (!this.selectorChainCache[provider]) this.selectorChainCache[provider] = {};
    this.selectorChainCache[provider]![field] = chain;
  }

  /* ------------------------------------------------------------------ */
  /*  Auto-detection application                                        */
  /* ------------------------------------------------------------------ */

  applyDetectedSelectors(provider: ProviderId, detected: DetectedSelectors): void {
    const overrides: Partial<ProviderSelectors> = { ...this.selectorOverrides[provider] };
    if (detected.promptInput) overrides.promptInput = detected.promptInput;
    if (detected.sendButton) overrides.sendButton = detected.sendButton;
    const hasPreset = !!getPreset(provider);
    if (detected.responseBlock && !hasPreset) overrides.responseBlock = detected.responseBlock;
    if (detected.readyIndicator) overrides.readyIndicator = detected.readyIndicator;
    if (detected.fileUploadTrigger && !hasPreset) overrides.fileUploadTrigger = detected.fileUploadTrigger;
    this.selectorOverrides[provider] = overrides;

    // Bridge: also update AiResource.selectors
    const resources = this.resources.all().filter(r => r.provider === provider);
    for (const resource of resources) {
      if (!resource.selectors) resource.selectors = {};
      if (detected.promptInput) resource.selectors.promptInput = detected.promptInput;
      if (detected.sendButton) resource.selectors.sendButton = detected.sendButton;
      if (detected.responseBlock && !hasPreset) resource.selectors.responseBlock = detected.responseBlock;
      if (detected.readyIndicator) resource.selectors.readyIndicator = detected.readyIndicator;
      if (detected.fileUploadTrigger && !hasPreset) resource.selectors.imageUploadTrigger = detected.fileUploadTrigger;
    }

    // For custom providers, also persist to disk
    const custom = this.customProviderStore.get(provider);
    if (custom) {
      Object.assign(custom.selectors, overrides);
      this.customProviderStore.persist();
    }

    this.persistSelectorCache();
    this.sink.emit({
      type: WB_EVENT.SELECTORS_UPDATED,
      payload: {
        provider,
        source: 'auto_detect',
        fields: Object.keys(overrides).filter(k => overrides[k as keyof ProviderSelectors]),
      },
    });
    this.sink.emitState();
  }

  applyDetectedVideoSelectors(provider: ProviderId, detected: DetectedVideoSelectors): void {
    const overrides: Partial<ProviderSelectors> = { ...this.selectorOverrides[provider] };
    if (detected.promptInput) overrides.promptInput = detected.promptInput;
    if (detected.generateButton) overrides.sendButton = detected.generateButton;
    if (detected.imageUploadTrigger) overrides.fileUploadTrigger = detected.imageUploadTrigger;
    this.selectorOverrides[provider] = overrides;

    // Bridge: also update AiResource.selectors
    const resources = this.resources.all().filter(r => r.provider === provider);
    for (const resource of resources) {
      if (!resource.selectors) resource.selectors = {};
      if (detected.promptInput) resource.selectors.promptInput = detected.promptInput;
      if (detected.generateButton) resource.selectors.generateButton = detected.generateButton;
      if (detected.imageUploadTrigger) resource.selectors.imageUploadTrigger = detected.imageUploadTrigger;
      if (detected.videoResult) resource.selectors.resultElement = detected.videoResult;
      if (detected.progressIndicator) resource.selectors.progressIndicator = detected.progressIndicator;
      if (detected.downloadButton) resource.selectors.downloadButton = detected.downloadButton;
    }

    log.info('video_selectors_applied', { provider });
    this.persistSelectorCache();
    this.sink.emit({
      type: WB_EVENT.SELECTORS_UPDATED,
      payload: {
        provider,
        source: 'auto_detect',
        fields: [
          ...(detected.promptInput ? ['promptInput'] : []),
          ...(detected.generateButton ? ['generateButton'] : []),
          ...(detected.imageUploadTrigger ? ['imageUploadTrigger'] : []),
          ...(detected.videoResult ? ['resultElement'] : []),
          ...(detected.progressIndicator ? ['progressIndicator'] : []),
          ...(detected.downloadButton ? ['downloadButton'] : []),
        ],
      },
    });
    this.sink.emitState();
  }
}

function defaultKey(savePath: string, fallback: string): string {
  if (!savePath) return fallback;
  return basename(savePath).replace(/\.json$/i, '') || fallback;
}

const NULL_KV: ProjectKVStore = {
  backend: 'json',
  get: () => undefined,
  set: () => undefined,
  delete: () => false,
  has: () => false,
  keys: () => [],
  tx: <T>(fn: () => T) => fn(),
  close: () => undefined,
};
