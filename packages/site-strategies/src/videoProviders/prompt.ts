/* ------------------------------------------------------------------ */
/*  Video prompt preparation                                          */
/* ------------------------------------------------------------------ */

import { sanitizePromptForJimeng, sanitizePromptForKling } from '@ai-video/adapter-common/promptSanitizer.js';
import type { Locator, Page } from 'playwright';
import { capturePromptEditorDiagnostics, captureScreenshot } from './diagnostics.js';
import type { VideoGenerationRuntime, WriteFailure } from './types.js';
import { selectVideoOptions } from '../videoOptionSelector.js';

export async function preparePromptAndOptions(
  page: Page,
  runtime: VideoGenerationRuntime,
  writeFailure: WriteFailure,
): Promise<void> {
  if (runtime.request.model || runtime.request.duration || runtime.request.resolution) {
    await selectVideoOptions(page, runtime.request, runtime.isKling);
  }

  if (runtime.isKling) {
    await dismissKlingPopovers(page);
  }

  const promptLoc = await locatePromptEditor(page, runtime.strategy.promptSelectors);
  if (!promptLoc) {
    const screenshotPath = await captureScreenshot(page, runtime, 'VIDEO_GEN_DIAG');
    const pageInfo = await capturePromptEditorDiagnostics(page);
    console.warn('[videoProvider] ⚠️ No prompt editor found — continuing without prompt (creation_agent mode)');
    writeFailure('PROMPT_EDITOR_NOT_FOUND_CONTINUING', {
      pageUrl: page.url(),
      screenshotPath,
      pageInfo,
      triedSelectors: runtime.strategy.promptSelectors,
      note: 'Continuing without prompt — will try submit button directly',
    });
    return;
  }

  const sanitizedPrompt = runtime.isKling
    ? sanitizePromptForKling(runtime.request.prompt)
    : sanitizePromptForJimeng(runtime.request.prompt);
  if (sanitizedPrompt !== runtime.request.prompt) {
    console.log(`[videoProvider] Prompt sanitized for ${runtime.providerLabel} compliance`);
  }

  await dismissKlingPopovers(page);
  try {
    await promptLoc.click({ timeout: 5_000 });
  } catch {
    console.log('[videoProvider] Normal click blocked by overlay, using force click');
    await promptLoc.click({ force: true, timeout: 5_000 });
  }

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.press('Backspace');
  await promptLoc.evaluate((el: any, text: string) => {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, sanitizedPrompt);
  await page.waitForTimeout(300);

  const enteredLen = await promptLoc.evaluate((el: any) => (el.textContent || '').length);
  if (enteredLen < sanitizedPrompt.length * 0.5) {
    console.log(`[videoProvider] DOM inject resulted in ${enteredLen} chars, falling back to clipboard paste`);
    await page.evaluate(async (text: string) => {
      await (navigator as any).clipboard.writeText(text);
    }, sanitizedPrompt);
    try {
      await promptLoc.click({ timeout: 5_000 });
    } catch {
      await promptLoc.click({ force: true, timeout: 5_000 });
    }
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
    await page.waitForTimeout(500);
  }

  console.log(`[videoProvider] Prompt entered (${sanitizedPrompt.length} chars)`);
}

export async function dismissKlingPopovers(page: Page): Promise<void> {
  await page.evaluate(`(function() {
    document.querySelectorAll('.el-popper.kling-popover, .setting-collect-popover, [class*="el-popper"][class*="kling"]').forEach(function(el) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('[id^="el-popper-container-"]').forEach(function(c) {
      c.style.pointerEvents = 'none';
    });
  })()`).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function locatePromptEditor(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  let promptLoc: Locator | null = null;
  const waitStart = Date.now();
  const timeoutMs = 15_000;
  while (Date.now() - waitStart < timeoutMs) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.count().catch(() => 0) > 0) {
        promptLoc = loc;
        console.log(`[videoProvider] Found prompt editor with selector: ${sel}`);
        break;
      }
    }
    if (promptLoc) break;
    await page.waitForTimeout(1_000);
  }
  return promptLoc;
}
