/* ------------------------------------------------------------------ */
/*  Submit-button discovery + API log capture                         */
/* ------------------------------------------------------------------ */

import type { Page, Response } from 'playwright';
import { captureScreenshot } from './diagnostics.js';
import { videoHealthMonitor } from './health.js';
import type { ApiLog, ButtonState, SubmitState, VideoGenerationRuntime, WriteFailure } from './types.js';

export async function submitGeneration(
  page: Page,
  runtime: VideoGenerationRuntime,
  writeFailure: WriteFailure,
): Promise<SubmitState | null> {
  const selectors = runtime.strategy.generateButtonSelectors;
  let genBtnLocator = null as import('playwright').Locator | null;
  let genBtnSelector = '';
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0) > 0) {
      genBtnLocator = loc;
      genBtnSelector = sel;
      console.log(`[videoProvider] Found submit button with selector: ${sel}`);
      break;
    }
  }
  if (!genBtnLocator) {
    writeFailure('SUBMIT_BUTTON_NOT_FOUND: No submit button on page', {
      pageUrl: page.url(),
      triedSelectors: selectors,
    });
    videoHealthMonitor.recordFailure(runtime.config.id, 'Submit button not found', ['generateButton']);
    return null;
  }

  const disabledClassPattern = runtime.strategy.disabledClassName;
  const btnWaitStart = Date.now();
  const timeoutMs = 60_000;
  const escapedBtnSel = genBtnSelector.replace(/'/g, "\\'");
  while (Date.now() - btnWaitStart < timeoutMs) {
    const btnState = await page.evaluate(`(function() {
      var el = document.querySelector('${escapedBtnSel}');
      if (!el) return null;
      return {
        disabled: el.disabled,
        hasDisabledClass: el.className.includes(${JSON.stringify(disabledClassPattern)}),
        classes: el.className.substring(0, 300),
        visible: el.getBoundingClientRect().width > 0,
      };
    })()`).catch(() => null) as ButtonState | null;
    if (!btnState) {
      console.log('[videoProvider] Button not found in DOM, retrying...');
      await page.waitForTimeout(2_000);
      continue;
    }
    if (!btnState.disabled && !btnState.hasDisabledClass) {
      console.log(`[videoProvider] Button is enabled (classes: ${btnState.classes.slice(0, 100)})`);
      break;
    }
    console.log(`[videoProvider] Button not ready: disabled=${btnState.disabled}, hasDisabledClass=${btnState.hasDisabledClass}`);
    await page.waitForTimeout(2_000);
  }

  const btnFinalState = await page.evaluate(`(function() {
    var el = document.querySelector('${escapedBtnSel}');
    if (!el) return null;
    return {
      disabled: el.disabled,
      hasDisabledClass: el.className.includes(${JSON.stringify(disabledClassPattern)}),
      classes: el.className.substring(0, 300),
      rect: JSON.parse(JSON.stringify(el.getBoundingClientRect())),
    };
  })()`).catch(() => null) as ButtonState | null;
  console.log(`[videoProvider] Button final state: ${JSON.stringify(btnFinalState)}`);

  if (!btnFinalState) {
    writeFailure('BUTTON_STATE_CHECK_FAILED: Could not evaluate button state', {
      pageUrl: page.url(),
    });
  }

  if (!btnFinalState || btnFinalState.disabled || btnFinalState.hasDisabledClass) {
    console.log('[videoProvider] ⚠️ Button still disabled — attempting force-enable...');
    await captureScreenshot(page, runtime, 'VIDEO_GEN_BEFORE_FORCE');
    await page.evaluate(`(function() {
      var btnSel = ${JSON.stringify(runtime.isKling ? 'button.generic-button' : 'button[class*="submit"]')};
      var disClass = ${JSON.stringify(disabledClassPattern)};
      document.querySelectorAll(btnSel).forEach(function(btn) {
        btn.classList.remove(disClass);
        btn.disabled = false;
      });
    })()`);
    await page.waitForTimeout(500);

    const forceClicked = await page.evaluate(`(function() {
      var btn = document.querySelector('${escapedBtnSel}');
      if (!btn) return false;
      btn.click();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`).catch(() => false);
    console.log(`[videoProvider] Force-clicked button: ${forceClicked}`);

    await page.evaluate(`(function() {
      var btn = ${runtime.isKling
        ? "document.querySelector('button.generic-button.critical.big') || document.querySelector('button:has-text(\"生成\")')"
        : "document.querySelector('button[class*=\"submit-button-s4a7XV\"]') || document.querySelector('button[class*=\"submit-button\"]:not([class*=\"collapsed\"])')"};
      if (btn) {
        btn.classList.remove(${JSON.stringify(disabledClassPattern)});
        btn.disabled = false;
        btn.click();
      }
    })()`);
    console.log('[videoProvider] Force-enabled and clicked submit button, waiting for result...');
  }

  const apiLogs: ApiLog[] = [];
  const providerApiHosts = runtime.strategy.generationApiHosts;
  const netHandler = async (response: Response) => {
    const url = response.url();
    if (!providerApiHosts.some((host) => url.includes(host))) return;
    if (url.includes('/api/') || url.includes('/muse/') || url.includes('/generate')
      || url.includes('/draft') || url.includes('/task') || url.includes('/aigc')
      || url.includes('/submit') || url.includes('/create')) {
      try {
        const body = await response.text().catch(() => '');
        const maxBody = runtime.isKling && (url.includes('/task/') || url.includes('/works/')) ? 5000 : 500;
        apiLogs.push({ url: url.slice(0, 200), status: response.status(), body: body.slice(0, maxBody) });
      } catch {
        apiLogs.push({ url: url.slice(0, 200), status: response.status() });
      }
    }
  };
  page.on('response', netHandler);

  if (btnFinalState && !btnFinalState.disabled && !btnFinalState.hasDisabledClass) {
    console.log('[videoProvider] Clicking Generate button...');
    await genBtnLocator.click({ timeout: 10_000 });
    console.log('[videoProvider] Generate clicked, waiting for video result...');
  }

  return {
    genBtnLocator,
    btnFinalState,
    apiLogs,
    detachNetworkLogger: () => page.off('response', netHandler),
  };
}
