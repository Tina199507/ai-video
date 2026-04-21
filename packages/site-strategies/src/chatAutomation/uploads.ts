import type { Page } from 'playwright';
import { existsSync } from 'node:fs';
import { createLogger } from '@ai-video/lib/logger.js';
import { FILE_UPLOAD_MAX_RETRIES, TEMP_DIR } from '../runtimeConstants.js';
import type { ProviderSelectors } from './contracts.js';
import { autoDetectSelectors } from './detectors.js';

const log = createLogger('ChatAutomation');

/**
 * Handle Gemini-style two-step upload menus.
 *
 * After clicking an upload button that opens a submenu instead of a filechooser,
 * this scans the newly appeared menu for an "Upload from computer" option,
 * clicks it, then intercepts the filechooser or sets files on a revealed input.
 *
 * @returns true if files were uploaded successfully, false otherwise
 */
async function tryUploadFromMenu(
  page: Page,
  files: string[],
): Promise<boolean> {
  // Wait briefly for the submenu/popover to render
  await page.waitForTimeout(800);

  // Pattern to match "upload from computer" menu items in multiple languages
  const uploadFromComputerPattern = /upload.*file|upload.*computer|from.*computer|local.*file|choose.*file|browse.*file|files?$|photos?|images?|videos?|media|从计算机|上传文件|本地文件|选择文件|浏览文件|文件|图片|照片|视频|媒体|upload$/i;

  // Selectors for menu items in a recently-appeared popover/menu
  const menuItemSelectors = [
    '[role="menuitem"]',
    '[role="option"]',
    '[role="listbox"] > *',
    'menu li',
    'menu a',
    'menu button',
    '[class*="menu"] li',
    '[class*="menu"] a',
    '[class*="menu"] button',
    '[class*="popover"] li',
    '[class*="popover"] button',
    '[class*="dropdown"] li',
    '[class*="dropdown"] button',
  ];

  for (const menuSel of menuItemSelectors) {
    try {
      const items = page.locator(menuSel);
      const count = await items.count();
      if (count === 0) continue;

      for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        const isVisible = await item.isVisible().catch(() => false);
        if (!isVisible) continue;

        const text = await item.innerText().catch(() => '');
        const ariaLabel = await item.getAttribute('aria-label').catch(() => '') || '';
        const combined = text + ' ' + ariaLabel;

        if (uploadFromComputerPattern.test(combined)) {
          log.debug('upload_menu_item_found', { text: text.trim() || ariaLabel, index: i });

          // Try to intercept filechooser when clicking this menu item
          try {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 5_000 }),
              item.click({ timeout: 3_000 }),
            ]);
            await fileChooser.setFiles(files);
            log.debug('upload_filechooser_intercepted', { source: 'menu_item' });
            return true;
          } catch {
            // Menu item click didn't produce filechooser — check for input
            const fileInput = page.locator('input[type="file"]');
            if ((await fileInput.count()) > 0) {
              log.debug('upload_input_revealed', { source: 'menu_item' });
              await fileInput.first().setInputFiles(files);
              return true;
            }
          }
        }
      }
    } catch {
      // selector failed, continue
    }
  }

  // Fallback: run page.evaluate to find menu items across shadow DOM
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const menuItemIndex: number = await (page as any).evaluate(`(() => {
    const pattern = /upload.*file|upload.*computer|from.*computer|local.*file|\u4ece\u8ba1\u7b97\u673a|\u4e0a\u4f20\u6587\u4ef6|\u672c\u5730\u6587\u4ef6|upload$/i;
    const allClickable = document.querySelectorAll('[role="menuitem"], [role="option"], li, a, button');
    for (let i = 0; i < allClickable.length; i++) {
      const el = allClickable[i];
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const text = (el.innerText || el.textContent || '').trim();
      const aria = el.getAttribute('aria-label') || '';
      if (pattern.test(text + ' ' + aria)) return i;
    }
    return -1;
  })()`);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (menuItemIndex >= 0) {
    log.debug('upload_menu_fallback_found', { domIndex: menuItemIndex });
    const allClickable = page.locator('[role="menuitem"], [role="option"], li, a, button');
    const item = allClickable.nth(menuItemIndex);
    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5_000 }),
        item.click({ timeout: 3_000 }),
      ]);
      await fileChooser.setFiles(files);
      log.debug('upload_filechooser_intercepted', { source: 'fallback' });
      return true;
    } catch {
      const fileInput = page.locator('input[type="file"]');
      if ((await fileInput.count()) > 0) {
        log.debug('upload_input_revealed', { source: 'fallback' });
        await fileInput.first().setInputFiles(files);
        return true;
      }
    }
  }

  log.debug('upload_menu_no_match');
  return false;
}

/**
 * Upload files to the chat via the site's attachment/upload button ("+").
 */
export async function uploadFiles(
  page: Page,
  files: string[],
  selectors: ProviderSelectors,
): Promise<void> {
  if (!files.length) return;

  // Validate that all files exist
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) {
    throw new Error(`Files not found: ${missing.join(', ')}`);
  }

  let uploaded = false;

  log.debug('upload_files_start', { pageUrl: page.url() });
  log.debug('upload_files_trigger', { fileUploadTrigger: selectors.fileUploadTrigger });

  // Strategy 1: look for an existing <input type="file"> and set files directly
  {
    const fileInput = page.locator('input[type="file"]');
    const inputCount = await fileInput.count();
    log.debug('upload_s1_probe', { inputCount });
    if (inputCount > 0) {
      log.debug('upload_s1_found');
      await fileInput.first().setInputFiles(files);
      uploaded = true;
    }
  }

  // Strategy 2: click configured trigger selectors → intercept filechooser or handle two-step menu
  if (!uploaded && selectors.fileUploadTrigger) {
    const triggers = selectors.fileUploadTrigger.split(',').map((s) => s.trim());
    log.debug('upload_s2_start', { triggerCount: triggers.length });

    // Retry loop: page may still be loading on first navigation
    const maxRetries = FILE_UPLOAD_MAX_RETRIES;
    for (let attempt = 0; attempt <= maxRetries && !uploaded; attempt++) {
      if (attempt > 0) {
        log.debug('upload_s2_retry', { attempt, maxRetries });
        await page.waitForTimeout(3_000);
      }

      for (const sel of triggers) {
        const loc = page.locator(sel);
        const count = await loc.count();
        log.debug('upload_s2_selector_probe', { selector: sel, count });
        if (count === 0) continue;

        log.debug('upload_s2_try', { selector: sel, count });
        try {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5_000 }),
            loc.first().click({ timeout: 3_000 }),
          ]);
          await fileChooser.setFiles(files);
          uploaded = true;
          log.debug('upload_s2_success', { method: 'filechooser' });
          break;
        } catch {
          // No direct filechooser — check if a hidden input appeared
          const fileInput = page.locator('input[type="file"]');
          if ((await fileInput.count()) > 0) {
            log.debug('upload_s2_success', { method: 'revealed_input', selector: sel });
            await fileInput.first().setInputFiles(files);
            uploaded = true;
            break;
          }
          // No filechooser and no input — likely opened a submenu (Gemini pattern)
          log.debug('upload_s2_menu_detected', { selector: sel });
          uploaded = await tryUploadFromMenu(page, files);
          if (uploaded) break;
          // Dismiss any remaining popover
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        }
      } // end for (triggers)
    } // end retry loop
  }

  // Strategy 3: broad probe — use Playwright locators (shadow-DOM-aware) to find
  // upload/attach buttons by common aria-label patterns.
  if (!uploaded) {
    log.debug('upload_s3_start');
    // These selectors use no tag-name prefix so they match custom web components
    // (e.g. <md-icon-button>) as well as regular <button>.
    const probeSelectors = [
      '[aria-label*="upload" i]',
      '[aria-label*="attach" i]',
      '[aria-label*="上传"]',
      '[aria-label*="添加"]',
      '[aria-label*="附件"]',
      '[aria-label*="Add file" i]',
      '[aria-label*="Add image" i]',
      '[aria-label*="Insert" i]',
      '[aria-label*="tool" i]',
      '[aria-label*="asset" i]',
      '[aria-label*="plus" i]',
      'button:has-text("Tools")',
      'button:has-text("工具")',
      '[data-tooltip*="upload" i]',
      '[data-tooltip*="上传"]',
      '[data-tooltip*="tool" i]',
      '[title*="upload" i]',
      '[title*="tool" i]',
    ];

    const found: string[] = [];
    for (const ps of probeSelectors) {
      if ((await page.locator(ps).count()) > 0) found.push(ps);
    }
    log.debug('upload_s3_probe', { matchCount: found.length, selectors: found });

    for (const sel of found) {
      try {
        const loc = page.locator(sel).first();
        log.debug('upload_s3_try', { selector: sel });
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5_000 }),
          loc.click({ timeout: 3_000 }),
        ]);
        await fileChooser.setFiles(files);
        uploaded = true;
        log.debug('upload_s3_success', { selector: sel, method: 'filechooser' });
        break;
      } catch {
        // Check if clicking created a file input
        const fileInput = page.locator('input[type="file"]');
        if ((await fileInput.count()) > 0) {
          log.debug('upload_s3_success', { selector: sel, method: 'revealed_input' });
          await fileInput.first().setInputFiles(files);
          uploaded = true;
          break;
        }
        // Try two-step menu pattern
        log.debug('upload_s3_menu_detected', { selector: sel });
        uploaded = await tryUploadFromMenu(page, files);
        if (uploaded) break;
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }

  // Strategy 4: auto-detect upload trigger from live DOM
  if (!uploaded) {
    log.debug('upload_s4_start');
    const detected = await autoDetectSelectors(page);
    if (detected.fileUploadTrigger) {
      log.debug('upload_s4_detected', { trigger: detected.fileUploadTrigger });
      const loc = page.locator(detected.fileUploadTrigger);
      const count = await loc.count();
      if (count > 0) {
        try {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5_000 }),
            loc.first().click({ timeout: 3_000 }),
          ]);
          await fileChooser.setFiles(files);
          uploaded = true;
          log.debug('upload_s4_success', { method: 'filechooser' });
        } catch {
          const fileInput = page.locator('input[type="file"]');
          if ((await fileInput.count()) > 0) {
            log.debug('upload_s4_success', { method: 'revealed_input' });
            await fileInput.first().setInputFiles(files);
            uploaded = true;
          } else {
            uploaded = await tryUploadFromMenu(page, files);
            if (uploaded) {
              log.debug('upload_s4_success', { method: 'two_step_menu' });
            }
            await page.keyboard.press('Escape').catch(() => {});
          }
        }
      }
    } else {
      log.debug('upload_s4_no_trigger');
    }
  }

  if (!uploaded) {
    // Take diagnostic screenshot
    try {
      const screenshotPath = `${TEMP_DIR}/upload-fail-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      log.warn('upload_diagnostic', { screenshotPath });
      log.warn('upload_diagnostic_page', { pageTitle: await page.title().catch(() => '(error)'), pageUrl: page.url() });
      // page URL already logged above;
    } catch (e) {
      log.warn('upload_diagnostic_screenshot_failed', { error: String(e) });
    }
    throw new Error(
      'Could not find a file upload trigger. '
      + 'Check the fileUploadTrigger selector in provider config.',
    );
  }

  // Wait for upload to complete: poll for progress indicators to disappear
  await waitForUploadCompletion(page, selectors);
}

/**
 * Wait for file upload to complete.
 */
async function waitForUploadCompletion(
  page: Page,
  selectors: ProviderSelectors,
  maxWaitMs = 600_000,
): Promise<void> {
  const start = Date.now();
  const deadline = start + maxWaitMs;
  log.debug('upload_completion_monitoring', { maxWaitSeconds: maxWaitMs / 1000 });

  // Give the upload a moment to start (file processing begins async)
  await page.waitForTimeout(5_000);

  // --- Gemini-specific upload progress selectors ---
  const uploadProgressSelectors = [
    '[class*="progress"]',
    '[class*="loading"]',
    '[class*="uploading"]',
    '[role="progressbar"]',
    '[class*="spinner"]',
    '[class*="processing"]',
    // Gemini shows a loading animation on the file chip during upload
    '[class*="file-chip"] [class*="loading"]',
    '[class*="upload-chip"] [class*="loading"]',
    'circular-progress',
    'mat-spinner',
    '[class*="CircularProgress"]',
  ];

  // Helper: check if any upload progress indicator is visible
  const hasActiveProgress = async (): Promise<boolean> => {
    for (const sel of uploadProgressSelectors) {
      try {
        const loc = page.locator(sel);
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
          const visible = await loc.first().isVisible().catch(() => false);
          if (visible) return true;
        }
      } catch {
        // ignore invalid selectors
      }
    }
    return false;
  };

  // --- Phase 1: Wait for upload progress to finish ---
  const initialProgress = await hasActiveProgress();
  if (initialProgress) {
    log.debug('upload_progress_detected');
    let pollCount = 0;
    while (Date.now() < deadline) {
      pollCount++;
      const stillActive = await hasActiveProgress();
      if (!stillActive) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        log.info('upload_progress_finished', { elapsedSeconds: elapsed, pollCount });
        break;
      }
      if (pollCount % 12 === 0) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        log.debug('upload_progress_still_active', { elapsedSeconds: elapsed });
      }
      await page.waitForTimeout(5_000);
    }
    // Extra settling time after progress disappears
    await page.waitForTimeout(2_000);
  }

  // --- Phase 2: Wait for send button to become ready (most reliable signal) ---
  if (selectors.sendButton) {
    const sendBtn = page.locator(selectors.sendButton);

    const isBtnReady = async (): Promise<{ visible: boolean; enabled: boolean }> => {
      const count = await sendBtn.count().catch(() => 0);
      if (count === 0) return { visible: false, enabled: false };
      const visible = await sendBtn.first().isVisible().catch(() => false);
      if (!visible) return { visible: false, enabled: false };
      const enabled = await sendBtn.first().isEnabled().catch(() => false);
      return { visible: true, enabled };
    };

    const { visible, enabled } = await isBtnReady();
    if (visible && enabled) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      log.info('upload_complete', { elapsedSeconds: elapsed, signal: 'send_button_ready' });
      await page.waitForTimeout(1_000);
      return;
    }

    // Poll for send button to become ready
    log.debug('upload_waiting_for_send_button', {
      visible,
      enabled,
      note: 'Ensure text was typed before upload so Gemini shows the send button',
    });
    let pollCount = 0;
    while (Date.now() < deadline) {
      pollCount++;
      const state = await isBtnReady();
      if (state.visible && state.enabled) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        log.info('upload_complete', { elapsedSeconds: elapsed, signal: 'send_button_ready', pollCount });
        await page.waitForTimeout(1_000);
        return;
      }
      if (pollCount % 12 === 0) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        log.debug('upload_still_in_progress', { elapsedSeconds: elapsed, ...state });
        // Take a diagnostic screenshot periodically
        try {
          const { mkdirSync } = await import('node:fs');
          const debugDir = `${TEMP_DIR}/chatgpt-debug`;
          mkdirSync(debugDir, { recursive: true });
          await page.screenshot({ path: `${debugDir}/upload_wait_${Date.now()}.png`, fullPage: false });
        } catch {
          // ignore
        }
      }
      await page.waitForTimeout(5_000);
    }
    log.warn('upload_completion_timeout', { maxWaitSeconds: maxWaitMs / 1000 });
    return;
  }

  // --- Fallback: providers without sendButton selector ---
  if (await hasActiveProgress()) {
    while (Date.now() < deadline) {
      if (!(await hasActiveProgress())) break;
      await page.waitForTimeout(2_000);
    }
    await page.waitForTimeout(2_000);
  } else {
    await page.waitForTimeout(5_000);
  }
}
