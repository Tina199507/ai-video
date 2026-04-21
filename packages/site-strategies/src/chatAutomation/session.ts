import type { BrowserContext, Page } from 'playwright';
import { createLogger } from '@ai-video/lib/logger.js';
import type { ChatAutomationOptions, ProviderSelectors } from './contracts.js';
import { DEFAULT_CHAT_AUTOMATION_OPTIONS } from './contracts.js';

const log = createLogger('ChatAutomation');

/**
 * Drives a single prompt→response cycle on a live browser page.
 *
 * Lifecycle managed externally — this module only deals with one page
 * that is already attached to a persistent BrowserContext.
 */
export async function openChat(
  context: BrowserContext,
  selectors: ProviderSelectors,
  opts?: ChatAutomationOptions,
): Promise<Page> {
  const { readyTimeout } = { ...DEFAULT_CHAT_AUTOMATION_OPTIONS, ...opts };
  const page = context.pages()[0] ?? (await context.newPage());

  // Verify the page is still alive before attempting to use it
  try {
    await page.title();
  } catch {
    // Page is dead — open a fresh one
    const freshPage = await context.newPage();
    await freshPage.goto(selectors.chatUrl, { waitUntil: 'domcontentloaded' });
    await freshPage.waitForSelector(selectors.readyIndicator, { timeout: readyTimeout });
    return freshPage;
  }

  // If already on the target URL (same origin+path), skip navigation to avoid ERR_ABORTED
  // on SPAs like Gemini that use service workers.
  const currentUrl = page.url();
  const targetUrl = new URL(selectors.chatUrl);
  const currentParsed = (() => {
    try {
      return new URL(currentUrl);
    } catch {
      return null;
    }
  })();
  const alreadyOnTarget = currentParsed
    && currentParsed.origin === targetUrl.origin
    && currentParsed.pathname === targetUrl.pathname;

  if (!alreadyOnTarget) {
    const MAX_NAV_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_NAV_RETRIES; attempt++) {
      try {
        await page.goto(selectors.chatUrl, { waitUntil: 'domcontentloaded' });
        break;
      } catch (navErr) {
        const msg = navErr instanceof Error ? navErr.message : String(navErr);
        log.warn('open_chat_nav_retry', { attempt: attempt + 1, error: msg });
        if (attempt === MAX_NAV_RETRIES) throw navErr;
        // Wait briefly then retry — the page may be settling after a previous navigation
        await page.waitForTimeout(1500);
      }
    }
  } else {
    log.debug('open_chat_skip_navigation', { url: selectors.chatUrl });
  }

  // Check for login redirects — if the page navigated away from the chat URL,
  // the user likely needs to log in
  const postNavUrl = page.url();
  const expectedHost = new URL(selectors.chatUrl).hostname;
  const actualHost = new URL(postNavUrl).hostname;
  if (actualHost !== expectedHost && !actualHost.endsWith('google.com')) {
    throw new Error(
      `Login required: page redirected from ${selectors.chatUrl} to ${postNavUrl}. `
      + 'Please open a Login browser first and log into the site.',
    );
  }

  // Detect common login/auth page indicators
  const loginIndicators = [
    'input[type="password"]',
    'input[type="email"][autocomplete*="username"]',
    '#identifierId', // Google login
    '[name="identifier"]', // Google login
  ];
  for (const sel of loginIndicators) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        throw new Error(
          `Login required: detected login form element (${sel}) on ${postNavUrl}. `
          + 'Please open a Login browser first and log into the site.',
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Login required')) throw err;
      // selector check failed — continue
    }
  }

  await page.waitForSelector(selectors.readyIndicator, { timeout: readyTimeout });
  return page;
}
