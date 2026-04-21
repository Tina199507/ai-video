import type { Page } from 'playwright';
import { createLogger } from '@ai-video/lib/logger.js';
import { TEMP_DIR } from '../runtimeConstants.js';
import type { ChatAutomationOptions, ChatResult, ProviderSelectors } from './contracts.js';
import { DEFAULT_CHAT_AUTOMATION_OPTIONS } from './contracts.js';

const log = createLogger('ChatAutomation');

/**
 * Find the best-matching response block selector from a comma-separated list.
 * Tries each selector individually in order and returns the first one that
 * has at least one match, falling back to the full combined selector.
 */
async function findBestResponseSelector(
  page: Page,
  responseBlockSelector: string,
): Promise<string> {
  const selectors = responseBlockSelector.split(',').map((s) => s.trim()).filter(Boolean);
  const found: { sel: string; count: number }[] = [];
  for (const sel of selectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) found.push({ sel, count });
    } catch {
      // invalid selector — skip
    }
  }
  if (found.length > 0) {
    // Prefer the selector with the fewest matches (most specific to actual responses)
    found.sort((a, b) => a.count - b.count);
    const picked = found[0]!;
    log.debug('response_selector_picked', { picked: picked.sel, candidateCount: found.length });
    return picked.sel;
  }
  // No selector matched — return full combined selector for waiting
  log.debug('response_selector_fallback');
  return responseBlockSelector;
}

/**
 * Extract text from the last matching response element, crossing Shadow DOM
 * boundaries via page.evaluate().  Falls back through three strategies:
 *   1. el.innerText
 *   2. el.textContent
 *   3. Recursive walker that descends into shadow roots
 */
async function extractResponseText(
  page: Page,
  selector: string,
): Promise<string> {
  // Use page.locator().last() so Playwright auto-pierces Shadow DOM to find
  // the element, then run evaluate ON that element for text extraction.
  const loc = page.locator(selector).last();
  if ((await loc.count()) === 0) return '';

  const text = await loc.evaluate((el) => {
    // Strategy 1: innerText (fast, respects layout)
    const inner = (el as any).innerText?.trim();
    if (inner) return inner;

    // Strategy 2: textContent (includes hidden text)
    const tc = el.textContent?.trim();
    if (tc) return tc;

    // Strategy 3: recursive walk into shadow roots
    function walkText(node: any): string {
      let result = '';
      if (node.nodeType === 3 /* TEXT_NODE */) {
        result += node.textContent || '';
      }
      if (node.shadowRoot) {
        result += walkText(node.shadowRoot);
      }
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) {
        result += walkText(children[i]);
      }
      return result;
    }
    return walkText(el).trim();
  });

  return text ?? '';
}

/**
 * Type the prompt text into the input field WITHOUT sending.
 * Call this before uploadFiles() so Gemini's send button can appear
 * once the file upload completes (Gemini requires both text + file ready).
 */
export async function typePromptText(
  page: Page,
  question: string,
  selectors: ProviderSelectors,
): Promise<void> {
  const chatGptRichEditor = page
    .locator('div#prompt-textarea[contenteditable="true"], div[role="textbox"][contenteditable="true"]')
    .first();

  let input = page.locator(selectors.promptInput).first();
  // ChatGPT now often renders a hidden textarea plus a visible contenteditable div.
  // Prefer the visible rich editor when available.
  if (selectors.promptInput.includes('ChatGPT') && (await chatGptRichEditor.count()) > 0) {
    input = chatGptRichEditor;
  }
  try {
    await input.click({ timeout: 8000 });
  } catch {
    // Fall back to the visible textbox when click is intercepted.
    const fallback = chatGptRichEditor;
    if ((await fallback.count()) > 0) {
      input = fallback;
      await input.click({ timeout: 8000 });
    } else {
      throw new Error(`Prompt input not interactable: ${selectors.promptInput}`);
    }
  }

  const isContentEditable = await input.evaluate(
    (el) => el.getAttribute('contenteditable') === 'true',
  ).catch(() => false);

  if (isContentEditable) {
    await input.evaluate((el) => {
      el.textContent = '';
      while (el.firstChild) el.removeChild(el.firstChild);
    });
    log.debug('type_prompt_text', { type: 'contenteditable', length: question.length });
    await input.focus();
    await page.keyboard.insertText(question);
    await input.dispatchEvent('input', { bubbles: true });
    await page.waitForTimeout(800);
  } else {
    log.debug('type_prompt_text', { type: 'standard', length: question.length });
    await input.fill(question);
  }
}

/**
 * Send a prompt and wait for the AI response to stabilize.
 *
 * "Stabilize" means the response text has not changed for two consecutive
 * poll intervals.
 */
export async function sendPrompt(
  page: Page,
  question: string,
  selectors: ProviderSelectors,
  opts?: ChatAutomationOptions,
): Promise<ChatResult> {
  const { responseTimeout, pollInterval, sendButtonTimeout, textAlreadyTyped } = { ...DEFAULT_CHAT_AUTOMATION_OPTIONS, ...opts };

  const sendStart = Date.now();
  log.info('send_prompt_start', { promptLength: question.length, textAlreadyTyped });

  // --- find best response block selector ---
  const responseSelector = await findBestResponseSelector(page, selectors.responseBlock);
  log.debug('send_prompt_selector', { responseSelector });

  // --- count existing response blocks so we know when a *new* one appears ---
  const beforeCount = await page.locator(responseSelector).count();
  log.debug('send_prompt_existing_blocks', { beforeCount });

  // --- type the question (skip if already typed via typePromptText) ---
  const input = page.locator(selectors.promptInput).first();
  if (!textAlreadyTyped) {
    const chatGptRichEditor = page
      .locator('div#prompt-textarea[contenteditable="true"], div[role="textbox"][contenteditable="true"]')
      .first();
    let activeInput = input;
    if (selectors.promptInput.includes('ChatGPT') && (await chatGptRichEditor.count()) > 0) {
      activeInput = chatGptRichEditor;
    }
    try {
      await activeInput.click({ timeout: 8000 });
    } catch {
      const fallback = chatGptRichEditor;
      if ((await fallback.count()) > 0) {
        activeInput = fallback;
        await activeInput.click({ timeout: 8000 });
      } else {
        throw new Error(`Prompt input not interactable: ${selectors.promptInput}`);
      }
    }

    // Detect if the input is a contenteditable element (e.g. Gemini's rich editor)
    const isContentEditable = await activeInput.evaluate(
      (el) => el.getAttribute('contenteditable') === 'true',
    ).catch(() => false);

    if (isContentEditable) {
      // For contenteditable: clear existing content, then insert text.
      // Use keyboard.insertText() for speed — dispatches a single 'input' event
      // instead of typing char-by-char (pressSequentially), which times out on long prompts.
      // Avoid innerHTML to comply with Trusted Types policy (Chrome 131+).
      await activeInput.evaluate((el) => {
        el.textContent = '';
        while (el.firstChild) el.removeChild(el.firstChild);
      });
      log.debug('send_prompt_input_type', { type: 'contenteditable', length: question.length });
      await activeInput.focus();
      await page.keyboard.insertText(question);
      // Dispatch events + small keypress to wake up Quill's internal state
      // (insertText may not trigger all framework event handlers)
      await input.dispatchEvent('input', { bubbles: true });
      await page.waitForTimeout(800);
    } else {
      log.debug('send_prompt_input_type', { type: 'standard' });
      // For standard inputs (textarea, input), use fill()
      await activeInput.fill(question);
    }
  } // end if (!textAlreadyTyped)

  // --- send ---
  let sent = false;
  if (selectors.sendButton) {
    // Quick pre-check: if send button selector has zero matches now,
    // don't waste the full sendButtonTimeout waiting for it.
    // Exception: when textAlreadyTyped (attachment flow), the send button
    // will appear once the file upload finishes — use full timeout.
    const initialSendCount = await page.locator(selectors.sendButton).count().catch(() => 0);
    const maxInitialWaitMs = textAlreadyTyped
      ? sendButtonTimeout
      : (initialSendCount > 0 ? sendButtonTimeout : 30_000);

    if (initialSendCount === 0 && !textAlreadyTyped) {
      log.debug('send_button_not_found_initially', { sendButtonTimeout, reducedTimeoutMs: maxInitialWaitMs });
    }

    // Wait for the send button to become clickable — may take a while if files are uploading.
    // Gemini keeps the button in the DOM but disables it during upload.
    const sendDeadline = Date.now() + maxInitialWaitMs;
    let attempt = 0;
    while (!sent && Date.now() < sendDeadline) {
      attempt++;
      try {
        const sendBtn = page.locator(selectors.sendButton).first();
        const count = await page.locator(selectors.sendButton).count();
        if (count > 0) {
          const visible = await sendBtn.isVisible().catch(() => false);
          const enabled = await sendBtn.isEnabled().catch(() => false);
          if (visible && enabled) {
            await sendBtn.click({ timeout: 5_000 });
            sent = true;
          } else {
            // Button exists but not clickable (disabled during upload)
            if (attempt % 10 === 0) {
              const remaining = Math.round((sendDeadline - Date.now()) / 1000);
              log.debug('send_button_not_ready', { visible, enabled, attempt, remainingSeconds: remaining });
            }
            await page.waitForTimeout(5_000);
          }
        } else {
          if (attempt % 20 === 0) {
            const remaining = Math.round((sendDeadline - Date.now()) / 1000);
            log.debug('send_button_missing', { attempt, remainingSeconds: remaining });
          }
          await page.waitForTimeout(3_000);
        }
      } catch (e) {
        // Send button click failed — retry
        if (attempt % 10 === 0) {
          log.warn('send_button_click_failed', { error: e instanceof Error ? e.message.slice(0, 100) : String(e) });
        }
        await page.waitForTimeout(3_000);
      }
    }
  }
  if (!sent) {
    log.warn('send_prompt_fallback_enter', { timeoutSeconds: sendButtonTimeout / 1000 });
    await input.press('Enter');
  } else {
    log.debug('send_prompt_sent', { method: 'send_button' });
  }

  // --- take a diagnostic screenshot right after send ---
  try {
    const { mkdirSync } = await import('node:fs');
    const debugDir = `${TEMP_DIR}/chatgpt-debug`;
    mkdirSync(debugDir, { recursive: true });
    await page.screenshot({ path: `${debugDir}/after_send_${Date.now()}.png`, fullPage: false });
    log.debug('send_prompt_post_send_screenshot', { debugDir, pageUrl: page.url() });
  } catch {
    // ignore
  }

  // --- wait for a *new* response block to appear ---
  const deadline = Date.now() + responseTimeout;
  log.debug('send_prompt_waiting', { responseTimeoutMs: responseTimeout });

  // Wait for response count to increase
  let waitPollCount = 0;
  let adjustedBeforeCount = beforeCount;
  while (Date.now() < deadline) {
    let currentCount: number;
    try {
      currentCount = await page.locator(responseSelector).count();
    } catch (e) {
      // Page crashed or was closed mid-poll — fail fast instead of waiting 120s
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('send_prompt_page_crashed', { error: msg, waitedMs: Date.now() - sendStart });
      throw new Error(`send_prompt_page_crashed: ${msg}`);
    }
    if (currentCount > adjustedBeforeCount) break;

    // Handle count regression: if the page re-renders (e.g. Gemini SPA
    // navigation or DOM restructuring), existing response blocks can
    // disappear. Reset the baseline so we can still detect the new response.
    if (currentCount < adjustedBeforeCount) {
      log.warn('send_prompt_count_regression', {
        adjustedBeforeCount,
        currentCount,
        responseSelector,
      });
      adjustedBeforeCount = currentCount;
    }

    // Take a diagnostic screenshot early in the wait so we can see page state
    // when the response never arrives
    if (waitPollCount === 5) { // ~10 seconds after send
      try {
        const { mkdirSync } = await import('node:fs');
        const debugDir = `${TEMP_DIR}/chatgpt-debug`;
        mkdirSync(debugDir, { recursive: true });
        await page.screenshot({ path: `${debugDir}/wait_response_${Date.now()}.png`, fullPage: false });
        log.warn('send_prompt_no_response_yet', {
          debugDir,
          pageUrl: page.url(),
          waitedMs: Date.now() - sendStart,
          responseSelector,
          beforeCount,
          currentCount,
        });
      } catch {
        // ignore
      }
    }

    waitPollCount++;
    try {
      await page.waitForTimeout(pollInterval);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('send_prompt_page_crashed', { error: msg, phase: 'response_wait' });
      throw new Error(`send_prompt_page_crashed: ${msg}`);
    }
  }

  if (Date.now() >= deadline && waitPollCount > 0) {
    log.warn('send_prompt_response_never_appeared', {
      pageUrl: page.url(),
      totalWaitMs: Date.now() - sendStart,
      responseSelector,
      beforeCount,
      finalCount: await page.locator(responseSelector).count().catch(() => -1),
    });
  }

  log.debug('send_prompt_response_detected');

  // --- poll until response text stabilises ---
  let prevText = '';
  let stableCount = 0;
  let pollCount = 0;
  const STABLE_THRESHOLD = 2; // consecutive unchanged polls

  // Known static prefixes that appear immediately in response containers
  // before the actual AI response loads. These should NOT count as "text appeared".
  const STATIC_PREFIXES = ['gemini said', 'chatgpt said', 'model said', 'gemini 说'];
  const MIN_MEANINGFUL_LENGTH = 20; // responses shorter than this are likely just prefixes

  function isMeaningfulText(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    if (text.length < MIN_MEANINGFUL_LENGTH) {
      const lower = text.toLowerCase().trim();
      return !STATIC_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(prefix));
    }
    return true;
  }

  while (Date.now() < deadline) {
    const currentText = (await extractResponseText(page, responseSelector).catch(() => '')) ?? '';

    // Debug: capture page state on first few polls and every 30 polls to diagnose issues
    if (pollCount === 0 || pollCount === 2 || pollCount % 30 === 0) {
      try {
        await page.evaluate((sel: string) => {
          const doc = (globalThis as any).document as any;
          const firstSelector = sel.split(',')[0] ?? sel;
          const blocks = doc.querySelectorAll(firstSelector.trim());
          const last = blocks[blocks.length - 1];
          if (!last) return '(no block found)';
          const childInfo = Array.from(last.children).map((c: any) => `<${c.tagName.toLowerCase()} class="${c.className?.toString().slice(0, 60)}">`).join(', ');
          return `block: ${last.tagName} children=[${childInfo}] innerText(${(last as any).innerText?.length ?? 0}) textContent(${last.textContent?.length ?? 0})`;
        }, responseSelector).catch(() => '(eval failed)');
        log.debug('send_prompt_debug_poll', { pollCount });
      } catch {
        // ignore
      }
      // Save a screenshot on first poll to help diagnose page state
      if (pollCount === 0) {
        try {
          const { mkdirSync } = await import('node:fs');
          const debugDir = `${TEMP_DIR}/chatgpt-debug`;
          mkdirSync(debugDir, { recursive: true });
          await page.screenshot({ path: `${debugDir}/poll_${Date.now()}.png`, fullPage: false });
          log.debug('send_prompt_debug_screenshot', { debugDir });
        } catch {
          // ignore
        }
      }
    }

    // Also check for images in the response (for image-only responses like Gemini Imagen)
    const hasImage = await page.evaluate((sel: string) => {
      const doc = (globalThis as any).document as any;
      const selectors = sel.split(',').map((s) => s.trim());
      for (const s of selectors) {
        try {
          const blocks = doc.querySelectorAll(s);
          for (let i = Math.max(0, blocks.length - 2); i < blocks.length; i++) {
            const imgs = blocks[i].querySelectorAll('img');
            for (const img of imgs as any) {
              if ((img as any).naturalWidth > 64 || img.width > 64) return true;
            }
          }
        } catch {
          // skip
        }
      }
      return false;
    }, responseSelector).catch(() => false);

    pollCount++;
    // Log progress every 15 polls (~30s at 2s interval) or when text first appears meaningfully
    if (pollCount % 15 === 0 || (isMeaningfulText(currentText) && !isMeaningfulText(prevText))) {
      const elapsed = Math.round((Date.now() - sendStart) / 1000);
      log.debug('send_prompt_poll_progress', { pollCount, elapsedSeconds: elapsed, textLength: currentText.length, hasImage });
    }

    // Image found → consider response complete immediately
    if (hasImage) {
      log.info('send_prompt_image_detected', { pollCount });
      break;
    }

    if (currentText === prevText && isMeaningfulText(currentText)) {
      stableCount++;
      if (stableCount >= STABLE_THRESHOLD) {
        log.info('send_prompt_response_stable', { pollCount, responseLength: currentText.length });
        break;
      }
    } else {
      stableCount = 0;
    }
    prevText = currentText;
    await page.waitForTimeout(pollInterval);
  }

  if (Date.now() >= deadline) {
    log.warn('send_prompt_response_timeout', { responseTimeoutMs: responseTimeout });
  }

  // --- check for quota exhaustion ---
  let quotaExhausted = false;
  if (selectors.quotaExhaustedIndicator) {
    // Support multiple comma-separated indicators (e.g. "text=foo, text=bar")
    const indicators = selectors.quotaExhaustedIndicator.split(',').map((s) => s.trim()).filter(Boolean);
    for (const ind of indicators) {
      try {
        const locator = ind.startsWith('text=')
          ? page.getByText(ind.slice(5))
          : page.locator(ind);
        if ((await locator.count()) > 0) {
          quotaExhausted = true;
          break;
        }
      } catch {
        // ignore selector errors
      }
    }
  }

  const answer = (await extractResponseText(page, responseSelector).catch(() => '')) ?? '';

  const elapsed = Date.now() - sendStart;
  log.info('send_prompt_response_received', { elapsedMs: elapsed, answerLength: answer.length, quotaExhausted });

  return { answer, quotaExhausted };
}
