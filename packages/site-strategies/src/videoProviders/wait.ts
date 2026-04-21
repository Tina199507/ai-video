/* ------------------------------------------------------------------ */
/*  Wait loop / queue / paywall / compliance handling                 */
/* ------------------------------------------------------------------ */

import { detectQueueStateFromText, resolveQueueDetection } from '@ai-video/adapter-common/queueDetection.js';
import { rewritePromptForCompliance } from '@ai-video/adapter-common/promptSanitizer.js';
import type { Page } from 'playwright';
import { quotaBus } from '@ai-video/pipeline-core/quotaBus.js';
import { captureScreenshot } from './diagnostics.js';
import type { SubmitState, VideoGenerationRuntime, WaitResult, WriteFailure } from './types.js';

export async function waitForGeneration(
  page: Page,
  runtime: VideoGenerationRuntime,
  submitState: SubmitState,
  writeFailure: WriteFailure,
  isComplianceRetry = false,
): Promise<WaitResult> {
  const maxWait = runtime.config.timing.maxWaitMs;
  const pollInterval = runtime.config.timing.pollIntervalMs;
  let elapsed = 0;
  const minWait = 30_000;
  const queueRules = resolveQueueDetection(runtime.config.queueDetection);

  const detectQueueState = async (): Promise<{ queued: boolean; estimatedSec: number }> => {
    const pageText = await page.evaluate(`(() => document.body.innerText || '')()`).catch(() => '') as string;
    return detectQueueStateFromText(pageText, queueRules);
  };

  const paywallDetected = await page.evaluate(`(function() {
    var texts = document.body.innerText || '';
    if (${runtime.isKling}) {
      if (texts.includes('灵感值不足') || texts.includes('开通会员') || texts.includes('升级套餐') || texts.includes('购买灵感值')) {
        return 'SUBSCRIPTION_REQUIRED';
      }
      return false;
    }
    if (texts.includes('订阅即梦') || texts.includes('解锁更多能力') || texts.includes('购买积分')) {
      var hasPricing = texts.includes('基础会员') || texts.includes('高级会员') || texts.includes('标准会员');
      return hasPricing ? 'SUBSCRIPTION_REQUIRED' : false;
    }
    return false;
  })()`).catch(() => false);

  if (paywallDetected) {
    console.error(`[videoProvider] ❌ ${runtime.providerLabel} subscription paywall detected — account has insufficient credits!`);
    console.error('[videoProvider] Free accounts get daily free credits; they may be exhausted for today.');
    quotaBus.emit({
      provider: runtime.strategy.quotaProviderId,
      accountId: runtime.profileName,
      capability: 'video',
      exhausted: true,
      reason: `${runtime.providerLabel} paywall detected for profile ${runtime.profileName} — credits exhausted`,
    });
    await page.evaluate(`(function() {
      var closeBtn = document.querySelector('[class*="modal"] [class*="close"]') ||
                     document.querySelector('[class*="dialog"] [class*="close"]') ||
                     document.querySelector('[aria-label="Close"]') ||
                     document.querySelector('[class*="icon-close"]');
      if (closeBtn) closeBtn.click();
    })()`).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    submitState.detachNetworkLogger();
    writeFailure('INSUFFICIENT_CREDITS: Subscription paywall appeared after clicking Generate', {
      profileName: runtime.profileName,
      hint: 'Free account daily credits exhausted. Try another account or wait for reset.',
    });
    return { kind: 'failed' };
  }

  const remainMin = minWait - elapsed;
  if (remainMin > 0) {
    await page.waitForTimeout(remainMin);
    elapsed += remainMin;
  }

  const countVideos = () => page.evaluate(`(function() {
    var count = 0;
    document.querySelectorAll('video').forEach(function(v) {
      try {
        if (v && v.src) count += 1;
        else if (v && v.querySelector('source[src]')) count += 1;
      } catch {}
    });
    return count;
  })()`).catch(() => 0);

  const getLatestVideoDuration = () => page.evaluate(`(function() {
    var duration = 0;
    var videos = Array.from(document.querySelectorAll('video'));
    for (var i = videos.length - 1; i >= 0; i--) {
      var d = Number(videos[i].duration || 0);
      if (isFinite(d) && d > duration) duration = d;
    }
    return duration;
  })()`).catch(() => 0);

  const preExistingVideoCount = await countVideos() as number;
  let queueConfirmed = false;
  let lastQueueLog = 0;

  while (elapsed < maxWait) {
    await page.waitForTimeout(pollInterval);
    elapsed += pollInterval;

    const paywallInLoop = await page.evaluate(`(function() {
      var t = document.body.innerText || '';
      if (${runtime.isKling}) {
        return t.includes('灵感值不足') || t.includes('开通会员') || t.includes('升级套餐');
      }
      return (t.includes('订阅即梦') || t.includes('解锁更多能力')) && (t.includes('基础会员') || t.includes('高级会员'));
    })()`).catch(() => false);
    if (paywallInLoop) {
      console.error(`[videoProvider] ❌ ${runtime.providerLabel} paywall detected during wait — credits exhausted`);
      submitState.detachNetworkLogger();
      writeFailure('INSUFFICIENT_CREDITS: Paywall detected during video wait', { elapsed });
      quotaBus.emit({
        provider: runtime.strategy.quotaProviderId,
        accountId: runtime.profileName,
        capability: 'video',
        exhausted: true,
        reason: `${runtime.providerLabel} paywall in wait loop for profile ${runtime.profileName}`,
      });
      return { kind: 'failed' };
    }

    const qState = await detectQueueState();
    if (qState.queued && !queueConfirmed) {
      queueConfirmed = true;
      const estMsg = qState.estimatedSec ? ` (estimated wait: ${Math.ceil(qState.estimatedSec / 60)} min)` : '';
      console.log(`[videoProvider] ✅ Task confirmed in queue${estMsg} — will wait up to ${maxWait / 60_000} min`);
    }
    if (qState.queued && elapsed - lastQueueLog >= 60_000) {
      lastQueueLog = elapsed;
      const estMsg = qState.estimatedSec
        ? `~${Math.floor(qState.estimatedSec / 60)}m${qState.estimatedSec % 60}s remaining`
        : 'no ETA';
      console.log(`[videoProvider] ⏳ Still in queue: ${estMsg}, elapsed ${Math.round(elapsed / 1000)}s`);
    }

    const complianceCheck = await page.evaluate(`(function() {
      var t = document.body.innerText || '';
      var isCompliance = t.includes('内容不合规') || t.includes('不符合社区规范')
        || t.includes('内容违规') || t.includes('违反社区') || t.includes('审核未通过')
        || t.includes('content violation') || t.includes('violates our');
      var isGenericFail = !isCompliance && t.includes('生成失败');
      return { compliance: isCompliance, genericFail: isGenericFail };
    })()`).catch(() => ({ compliance: false, genericFail: false })) as { compliance: boolean; genericFail: boolean };

    if (runtime.isKling && !complianceCheck.compliance) {
      const klingTaskFail = submitState.apiLogs.some((log) =>
        log.url.includes('/task/status') && log.body
        && (log.body.includes('"status":50') || log.body.includes('审核') || log.body.includes('违规')));
      if (klingTaskFail) complianceCheck.compliance = true;
    }

    if (complianceCheck.genericFail && !complianceCheck.compliance && elapsed > 60_000) {
      console.warn(`[videoProvider] ⚠️ Generic generation failure detected at ${Math.round(elapsed / 1000)}s (not compliance)`);
    }

    if (complianceCheck.compliance) {
      console.error('[videoProvider] ❌ Content compliance rejection detected');
      submitState.detachNetworkLogger();
      if (!isComplianceRetry && runtime.strategy.allowComplianceRetry) {
        const rewritten = rewritePromptForCompliance(runtime.request.prompt);
        console.log(`[videoProvider] 🔄 Retrying with compliance-safe prompt (${rewritten.length} chars)`);
        writeFailure('CONTENT_COMPLIANCE_REJECTED: will retry with rewritten prompt', {
          elapsed,
          originalPrompt: runtime.request.prompt.slice(0, 200),
          rewrittenPrompt: rewritten.slice(0, 200),
        });
        return { kind: 'retry', rewrittenPrompt: rewritten };
      }
      writeFailure('CONTENT_COMPLIANCE_REJECTED: Prompt was rejected by content moderation', { elapsed });
      return { kind: 'failed' };
    }

    const creditExhausted = await page.evaluate(`(function() {
      var t = document.body.innerText || '';
      if (${runtime.isKling}) {
        return t.includes('灵感值不足') || t.includes('灵感值余额') || t.includes('购买灵感值');
      }
      return t.includes('积分不足') || t.includes('额度不足') || t.includes('次数已用完')
        || t.includes('获取积分') || t.includes('购买积分');
    })()`).catch(() => false);
    if (creditExhausted && elapsed > 30_000) {
      console.error(`[videoProvider] ❌ Credit/quota exhaustion detected — ${runtime.providerLabel} credits insufficient`);
      submitState.detachNetworkLogger();
      writeFailure(`CREDIT_EXHAUSTED: ${runtime.providerLabel} account credits insufficient for video generation`, {
        elapsed,
        profileName: runtime.profileName,
      });
      return { kind: 'failed' };
    }

    const currentVideoCount = await countVideos() as number;
    if (currentVideoCount > preExistingVideoCount) {
      const videoDuration = await getLatestVideoDuration() as number;
      if (videoDuration > 1) {
        console.log(`[videoProvider] ✅ New video detected after ${elapsed / 1000}s (duration: ${videoDuration.toFixed(1)}s)`);
        submitState.detachNetworkLogger();
        return { kind: 'ready' };
      }
      console.log(`[videoProvider] Video element found but duration=${videoDuration.toFixed(1)}s (too short/loading), continuing to wait...`);
    }

    if (elapsed % 30_000 === 0) {
      console.log(`[videoProvider] Still waiting for video... ${Math.round(elapsed / 1000)}s / ${Math.round(maxWait / 1000)}s`);
      if (elapsed % 120_000 === 0) {
        await captureScreenshot(page, runtime, `VIDEO_GEN_WAIT_${Math.round(elapsed / 1000)}s`, false);
      }
    }
  }

  submitState.detachNetworkLogger();
  const finalPageState = await page.evaluate(`(() => {
    var info = { url: location.href, videos: [], allMediaSrc: [] };
    document.querySelectorAll('video').forEach(function(v) {
      info.videos.push({ src: (v.src || '').substring(0, 100), duration: v.duration, paused: v.paused });
    });
    document.querySelectorAll('video source').forEach(function(s) {
      info.allMediaSrc.push(s.src ? s.src.substring(0, 100) : '');
    });
    document.querySelectorAll('a[href*="download"], a[download]').forEach(function(a) {
      info.allMediaSrc.push('download-link:' + (a.href || '').substring(0, 100));
    });
    return info;
  })()`).catch(() => ({}));
  writeFailure(`TIMEOUT: Video generation timed out after ${maxWait / 1000}s`, {
    elapsed,
    maxWait,
    apiCallsCount: submitState.apiLogs.length,
    apiCalls: submitState.apiLogs.slice(0, 20),
    finalPageState,
  });
  return { kind: 'failed' };
}
