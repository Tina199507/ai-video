/* ------------------------------------------------------------------ */
/*  Legacy videoProvider config compatibility                         */
/* ------------------------------------------------------------------ */

import type { SiteAutomationConfig } from '@ai-video/pipeline-core/runtimeTypes.js';
import { selectorToChain } from '@ai-video/pipeline-core/selectorResolver.js';
import { resolveSiteStrategy } from '../videoSites.js';
import type { VideoProviderConfig, VideoProviderType } from './types.js';

export function legacyConfigToSiteConfig(
  config: VideoProviderConfig,
  id = 'custom-video',
): SiteAutomationConfig {
  const strategy = resolveSiteStrategy(config.url, config.provider);
  const label = strategy.kind === 'kling' ? '可灵 AI（视频生成）' : '即梦（视频生成）';
  return {
    id,
    label,
    type: 'video',
    siteUrl: config.url,
    capabilities: { video: true, fileUpload: !!config.imageUploadTrigger },
    selectors: {
      promptInput: selectorToChain(config.promptInput),
      generateButton: selectorToChain(config.generateButton),
      resultElement: selectorToChain(config.videoResult),
      progressIndicator: config.progressIndicator ? selectorToChain(config.progressIndicator) : undefined,
      downloadButton: config.downloadButton ? selectorToChain(config.downloadButton) : undefined,
      imageUploadTrigger: config.imageUploadTrigger ? selectorToChain(config.imageUploadTrigger) : undefined,
    },
    timing: {
      maxWaitMs: config.maxWaitMs ?? 3_900_000,
      pollIntervalMs: 5_000,
      hydrationDelayMs: strategy.hydrationDelayMs,
    },
    queueDetection: config.queueDetection,
    profileDir: config.profileDir,
  };
}

export function detectProvider(config: VideoProviderConfig): VideoProviderType {
  return resolveSiteStrategy(config.url, config.provider).kind;
}
