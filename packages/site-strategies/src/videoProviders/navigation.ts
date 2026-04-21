/* ------------------------------------------------------------------ */
/*  Browser navigation + login-state checks                           */
/* ------------------------------------------------------------------ */

import { acquireContext } from '@ai-video/pipeline-core/browserManager.js';
import type { GenerationBrowserState, VideoGenerationRuntime, WriteFailure } from './types.js';

export async function openGenerationPage(
  runtime: VideoGenerationRuntime,
  writeFailure: WriteFailure,
): Promise<GenerationBrowserState | null> {
  const context = await acquireContext(runtime.config.profileDir);
  const page = context.pages()[0] ?? (await context.newPage());

  const currentUrl = page.url();
  const targetOrigin = new URL(runtime.config.siteUrl).origin;
  const needsNav = !currentUrl.startsWith(targetOrigin);
  if (needsNav) {
    await page.goto(runtime.config.siteUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  await page.waitForTimeout(runtime.config.timing.hydrationDelayMs);

  const afterNavUrl = page.url();
  if (afterNavUrl.includes('/ai-tool/home')) {
    writeFailure('NOT_LOGGED_IN: redirected to /ai-tool/home (即梦)', { afterNavUrl });
    console.error('[videoProvider] Run: node open-seedance-login.mjs <account#>');
    return null;
  }
  if (runtime.isKling && (afterNavUrl.includes('/login') || afterNavUrl.includes('/passport'))) {
    writeFailure('NOT_LOGGED_IN: redirected to login page (可灵)', { afterNavUrl });
    console.error('[videoProvider] Run: node open-kling-login.mjs to log in');
    return null;
  }
  if (runtime.isKling) {
    const hasLoginModal = await page.evaluate(`(function() {
      var t = document.body.innerText || '';
      return t.includes('登录') && (t.includes('手机号') || t.includes('验证码') || t.includes('扫码'));
    })()`).catch(() => false);
    if (hasLoginModal) {
      writeFailure('NOT_LOGGED_IN: login modal detected (可灵)', { afterNavUrl });
      console.error('[videoProvider] Run: node open-kling-login.mjs to log in');
      return null;
    }
  }

  return { context, page };
}
