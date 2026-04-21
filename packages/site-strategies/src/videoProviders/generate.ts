/* ------------------------------------------------------------------ */
/*  Video generation orchestration via browser automation             */
/* ------------------------------------------------------------------ */

// @ts-nocheck -- preserve current browser-automation behavior while moving code

import { existsSync, mkdirSync } from 'node:fs';
import type { SiteAutomationConfig } from '@ai-video/pipeline-core/runtimeTypes.js';
import { releaseContext } from '@ai-video/pipeline-core/browserManager.js';
import { resolveSiteStrategy } from '../videoSites.js';
import { createWriteFailure } from './diagnostics.js';
import { downloadGeneratedVideo } from './download.js';
import { videoHealthMonitor } from './health.js';
import { detectProvider, legacyConfigToSiteConfig } from './legacy.js';
import { openGenerationPage } from './navigation.js';
import { preparePromptAndOptions } from './prompt.js';
import { submitGeneration } from './submit.js';
import type { VideoGenRequest, VideoGenResult, VideoGenerationRuntime, VideoProviderConfig } from './types.js';
import { uploadReferenceImage } from './uploads.js';
import { waitForGeneration } from './wait.js';

export async function generateVideoViaSiteConfig(
  config: SiteAutomationConfig,
  request: VideoGenRequest,
  outputDir: string,
  filename: string,
  isComplianceRetry = false,
): Promise<VideoGenResult | null> {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  videoHealthMonitor.register(config);
  if (!videoHealthMonitor.isUsable(config.id)) {
    const rec = videoHealthMonitor.getRecommendation(config.id);
    console.warn(`[videoProvider] Provider ${config.label} is down — ${rec.reason}`);
    return null;
  }

  const strategy = resolveSiteStrategy(config.siteUrl);
  const runtime: VideoGenerationRuntime = {
    config,
    request,
    outputDir,
    filename,
    strategy,
    isKling: strategy.kind === 'kling',
    providerLabel: strategy.providerLabel,
    profileName: config.profileDir.split('/').pop() ?? 'unknown',
  };
  const writeFailure = createWriteFailure(runtime);

  let contextAcquired = false;
  try {
    const browserState = await openGenerationPage(runtime, writeFailure);
    if (!browserState) return null;
    contextAcquired = true;

    await uploadReferenceImage(browserState.page, runtime);
    await preparePromptAndOptions(browserState.page, runtime, writeFailure);
    const submitState = await submitGeneration(browserState.page, runtime, writeFailure);
    if (!submitState) return null;

    const waitResult = await waitForGeneration(
      browserState.page,
      runtime,
      submitState,
      writeFailure,
      isComplianceRetry,
    );
    if (waitResult.kind === 'retry') {
      return generateVideoViaSiteConfig(
        config,
        { ...request, prompt: waitResult.rewrittenPrompt },
        outputDir,
        filename,
        true,
      );
    }
    if (waitResult.kind === 'failed') {
      return null;
    }

    await browserState.page.waitForTimeout(3_000);
    const result = await downloadGeneratedVideo(browserState.page, runtime, submitState.apiLogs, writeFailure);
    if (result) {
      videoHealthMonitor.recordSuccess(config.id);
      return result;
    }

    videoHealthMonitor.recordFailure(config.id, 'All download strategies failed');
    return null;
  } catch (err) {
    writeFailure(`EXCEPTION: ${err instanceof Error ? err.message : String(err)}`, {
      stack: err instanceof Error ? err.stack : undefined,
    });
    videoHealthMonitor.recordFailure(config.id, err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    if (contextAcquired) {
      await releaseContext(config.profileDir);
    }
  }
}

export async function generateVideoViaWeb(
  config: VideoProviderConfig,
  request: VideoGenRequest,
  outputDir: string,
  filename: string,
): Promise<VideoGenResult | null> {
  const providerType = detectProvider(config);

  if (providerType === 'kling') {
    const siteConfig = legacyConfigToSiteConfig(config, 'kling-video');
    return generateVideoViaSiteConfig(siteConfig, request, outputDir, filename);
  }

  const primaryUrl = config.agentUrl || config.url;
  const siteConfig = legacyConfigToSiteConfig({ ...config, url: primaryUrl });
  const result = await generateVideoViaSiteConfig(siteConfig, request, outputDir, filename);
  if (result) return result;

  if (config.agentUrl && config.url !== config.agentUrl) {
    console.log('[videoProvider] Agent mode failed — retrying with standard mode URL');
    const stdConfig = legacyConfigToSiteConfig(config, 'jimeng-standard');
    return generateVideoViaSiteConfig(stdConfig, request, outputDir, filename);
  }

  return null;
}
