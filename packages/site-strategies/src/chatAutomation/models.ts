import type { Page } from 'playwright';
import { createLogger } from '@ai-video/lib/logger.js';
import type { ModelOption, ProviderSelectors, ScrapedModel } from './contracts.js';

const log = createLogger('ChatAutomation');

/**
 * Select a model/mode on the current page by clicking through the
 * model's `selectSteps`.  If the model has no steps (i.e. it's the
 * default), this is a no-op.
 *
 * Errors are caught and logged — a failed model switch should not
 * block the prompt from being sent (it will just use the default).
 */
export async function selectModel(
  page: Page,
  model: ModelOption | undefined,
): Promise<void> {
  if (!model?.selectSteps?.length) return;

  try {
    for (const step of model.selectSteps) {
      let locator;
      if (step.startsWith('text=')) {
        const label = step.slice(5);
        // Scope text matches to open menu/option elements to avoid hitting
        // unrelated substrings elsewhere on the page (e.g. Gemini's sidebar
        // conversation titles like "Visual Prompt QA for AI" matching "Pro").
        // Fall back to exact-text whole-page match, then first() as last resort.
        const scoped = page.locator(
          '[role="menuitem"], [role="option"], [role="listbox"] *, mat-option, [data-value], li[role="menuitem"]',
        ).getByText(label, { exact: true });
        if ((await scoped.count()) > 0) {
          locator = scoped.first();
        } else {
          const exact = page.getByText(label, { exact: true });
          locator = (await exact.count()) > 0 ? exact.first() : page.getByText(label).first();
        }
      } else {
        locator = page.locator(step);
      }
      await locator.click({ timeout: 5_000 });
      await page.waitForTimeout(500);
    }
  } catch (err) {
    log.warn('select_model_failed', { modelId: model.id, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Scrape model options from the page.
 *
 * Strategy 1 – Read visible menus/dropdowns.
 * Strategy 2 – Auto-click trigger if configured.
 * Strategy 3 – Broad search for model-like text.
 */
export async function scrapeModels(
  page: Page,
  selectors: ProviderSelectors,
): Promise<ScrapedModel[]> {
  // Strategy 1: scan the current page for any open dropdown / menu / popover
  let models = await scanPageForModelOptions(page);
  if (models.length > 0) return models;

  // Strategy 2: try to click trigger, then scan
  if (selectors.modelPickerTrigger) {
    try {
      // Try each selector in the comma-separated list
      const triggers = selectors.modelPickerTrigger.split(',').map((s) => s.trim());
      for (const sel of triggers) {
        const loc = page.locator(sel);
        if ((await loc.count()) > 0) {
          await loc.first().click({ timeout: 3_000 });
          await page.waitForTimeout(1_500);
          models = await scanPageForModelOptions(page);
          if (models.length > 0) {
            await page.keyboard.press('Escape').catch(() => {});
            return models;
          }
        }
      }
    } catch {
      // trigger click failed, continue to strategy 3
    }
  }

  // Strategy 3: broad search for any element with model-like text
  models = await broadModelSearch(page);
  return models;
}

/**
 * Scan the DOM for currently visible dropdown/menu/popover model options.
 * Runs JavaScript inside the browser context.
 */
async function scanPageForModelOptions(page: Page): Promise<ScrapedModel[]> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (page as any).evaluate(`(() => {
    const candidates = [];
    const seen = new Set();

    const selectors = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="menuitemradio"]',
      '[role="listbox"] > *',
      '[data-testid*="model"]',
      '[class*="model"][class*="option"]',
      '[class*="model"][class*="item"]',
      '[class*="Model"][class*="Option"]',
      '[class*="Model"][class*="Item"]',
      'mat-option',
      'mat-list-item',
    ];

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
        const text = (el.innerText || el.textContent || '').trim();
        if (!text || text.length > 80 || text.length < 2) return;
        if (text.includes('\\n') && text.split('\\n').length > 3) return;
        const label = text.split('\\n')[0].trim();
        if (!label || seen.has(label)) return;
        seen.add(label);
        const id = label.toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9\\u4e00-\\u9fff\\-_.]/g, '');
        if (id) candidates.push({ id, label });
      });
    }

    return candidates;
  })()`);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Broad search for model-related elements on the page by looking at
 * buttons, selects, and other interactive elements near the top of the
 * page that might represent a model selector.
 */
async function broadModelSearch(page: Page): Promise<ScrapedModel[]> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (page as any).evaluate(`(() => {
    const candidates = [];
    const seen = new Set();

    const allButtons = document.querySelectorAll('button, [role="button"], [role="combobox"], select');
    for (const btn of allButtons) {
      if (btn.offsetParent === null && getComputedStyle(btn).position !== 'fixed') continue;
      const text = (btn.innerText || btn.textContent || '').trim();
      const modelPatterns = /gpt|gemini|claude|deepseek|kimi|flash|pro|mini|think|turbo|reasoning|4o|o[1-9]/i;
      if (text && text.length < 60 && modelPatterns.test(text)) {
        const label = text.split('\\n')[0].trim();
        if (label && !seen.has(label)) {
          seen.add(label);
          const id = label.toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9\\u4e00-\\u9fff\\-_.]/g, '');
          if (id) candidates.push({ id, label });
        }
      }
    }

    return candidates;
  })()`);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
