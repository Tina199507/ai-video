import type { Page } from 'playwright';
import type { DetectedSelectors, DetectedVideoSelectors, ProviderSelectors } from './contracts.js';

/**
 * Auto-detect CSS selectors for a chat page by probing common patterns.
 *
 * Uses heuristic rules to find the prompt input, send button, response
 * block, and ready indicator on an arbitrary AI chat page.
 */
export async function autoDetectSelectors(page: Page): Promise<DetectedSelectors> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (page as any).evaluate(`(() => {
    // Shadow DOM traversal helper: querySelectorAll that also searches shadow roots
    function querySelectorAllDeep(selector, root) {
      root = root || document;
      var results = [...root.querySelectorAll(selector)];
      // Also search inside shadow roots
      var allElements = root.querySelectorAll('*');
      for (var i = 0; i < allElements.length; i++) {
        if (allElements[i].shadowRoot) {
          results = results.concat([...allElements[i].shadowRoot.querySelectorAll(selector)]);
        }
      }
      return results;
    }

    // --- Prompt input ---
    let promptInput = null;
    // 1) visible textarea (including shadow DOM)
    const textareas = querySelectorAllDeep('textarea').filter(
      (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
    );
    if (textareas.length > 0) {
      // Prefer one with large area (chat input, not search)
      const best = textareas.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
      promptInput = buildSelector(best);
    }
    // 2) contenteditable (including shadow DOM)
    if (!promptInput) {
      const editables = querySelectorAllDeep('[contenteditable="true"]').filter(
        (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
      );
      if (editables.length > 0) {
        const best = editables.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
        promptInput = buildSelector(best);
      }
    }

    // --- Send button ---
    let sendButton = null;
    const buttonCandidates = querySelectorAllDeep('button, [role="button"]').filter(
      (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
    );
    // Look for buttons with send-like attributes
    for (const btn of buttonCandidates) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
      const text = (btn.textContent || '').trim().toLowerCase();
      const cls = (btn.className || '').toLowerCase();
      if (
        aria.includes('send') || aria.includes('submit') || aria.includes('发送') ||
        testId.includes('send') || testId.includes('submit') ||
        text === 'send' || text === '发送' || text === 'submit' ||
        cls.includes('send')
      ) {
        sendButton = buildSelector(btn);
        break;
      }
    }
    // Fallback: button[type="submit"]
    if (!sendButton) {
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn && (submitBtn.offsetParent !== null || getComputedStyle(submitBtn).position === 'fixed')) {
        sendButton = buildSelector(submitBtn);
      }
    }
    // Fallback: find a button near the prompt input area
    if (!sendButton && promptInput) {
      const inputEl = document.querySelector(promptInput);
      if (inputEl) {
        const parent = inputEl.closest('form') || inputEl.parentElement?.parentElement?.parentElement;
        if (parent) {
          const nearBtn = parent.querySelector('button');
          if (nearBtn) sendButton = buildSelector(nearBtn);
        }
      }
    }

    // --- Response block ---
    let responseBlock = null;
    const responseSelectors = [
      '[data-message-author-role="assistant"]',
      'message-content [class*="markdown"]',
      '.model-response-text',
      '.ds-markdown',
      '[class*="response-container"] [class*="markdown"]',
      '[class*="chat-message"]',
      '.prose',
    ];
    for (const sel of responseSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        responseBlock = sel;
        break;
      }
    }
    // Broad fallback
    if (!responseBlock) {
      const divs = [...document.querySelectorAll('div[class]')].filter((el) => {
        const cls = el.className.toLowerCase();
        return cls.includes('message') || cls.includes('response') || cls.includes('reply');
      });
      if (divs.length > 0) {
        const cls = divs[0].className.split(/\\s+/).find((c) =>
          c.toLowerCase().includes('message') || c.toLowerCase().includes('response')
        );
        if (cls) responseBlock = '.' + cls;
      }
    }

    // --- Ready indicator (same as prompt input) ---
    const readyIndicator = promptInput;

    // --- File upload trigger ---
    let fileUploadTrigger = null;
    // 1) Look for buttons with upload/attach/file-related attributes
    for (const btn of buttonCandidates) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
      const tooltip = (btn.getAttribute('data-tooltip') || btn.getAttribute('title') || '').toLowerCase();
      const cls = (btn.className || '').toString().toLowerCase();
      const text = (btn.textContent || '').trim().toLowerCase();
      if (
        aria.includes('upload') || aria.includes('attach') || aria.includes('file') ||
        aria.includes('上传') || aria.includes('附件') || aria.includes('添加文件') ||
        aria.includes('tool') || aria.includes('add') || aria.includes('insert') || aria.includes('asset') || aria.includes('media') ||
        testId.includes('upload') || testId.includes('attach') || testId.includes('file') ||
        tooltip.includes('upload') || tooltip.includes('attach') || tooltip.includes('上传') || tooltip.includes('tool') ||
        cls.includes('upload') || cls.includes('attach') || cls.includes('tool') || cls.includes('plus') ||
        text === '+' || text === 'tools' || text === '工具'
      ) {
        fileUploadTrigger = buildSelector(btn);
        break;
      }
    }
    // 2) Fallback: any input[type="file"] on the page
    if (!fileUploadTrigger) {
      const fileInputs = document.querySelectorAll('input[type="file"]');
      if (fileInputs.length > 0) {
        fileUploadTrigger = 'input[type="file"]';
      }
    }
    // 3) Fallback: icon-only button near the prompt input (not the send button)
    if (!fileUploadTrigger && promptInput) {
      const inputEl = document.querySelector(promptInput);
      if (inputEl) {
        const container = inputEl.closest('form') || inputEl.parentElement?.parentElement?.parentElement?.parentElement;
        if (container) {
          const nearbyBtns = [...container.querySelectorAll('button, [role="button"]')];
          for (const btn of nearbyBtns) {
            if (sendButton && btn.matches(sendButton)) continue;
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (aria.includes('send') || aria.includes('submit') || aria.includes('发送') ||
                aria.includes('stop') || aria.includes('cancel') || aria.includes('voice') ||
                aria.includes('mic') || aria.includes('new') || aria.includes('settings') ||
                aria.includes('menu') || aria.includes('main') || aria.includes('mode') ||
                aria.includes('picker') || aria.includes('more') || aria.includes('share') ||
                aria.includes('copy') || aria.includes('redo') || aria.includes('good') ||
                aria.includes('bad') || aria.includes('thumbs')) continue;
            if (btn.querySelector('svg')) {
              fileUploadTrigger = buildSelector(btn);
              break;
            }
          }
        }
      }
    }

    return { promptInput, sendButton, responseBlock, readyIndicator, fileUploadTrigger };

    // Helper: build a CSS selector for an element
    function buildSelector(el) {
      // Prefer id
      if (el.id) return '#' + CSS.escape(el.id);
      // Prefer data-testid
      const testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId + '"]';
      // Prefer aria-label
      const aria = el.getAttribute('aria-label');
      if (aria) return el.tagName.toLowerCase() + '[aria-label="' + aria.replace(/"/g, '\\\\"') + '"]';
      // Unique class combo
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\\s+/).filter((c) => c.length > 2).slice(0, 3);
        if (classes.length > 0) {
          const sel = el.tagName.toLowerCase() + '.' + classes.join('.');
          if (document.querySelectorAll(sel).length === 1) return sel;
        }
      }
      // Fallback: tag name
      return el.tagName.toLowerCase();
    }
  })()`);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Check whether the page currently shows a quota-exhausted indicator.
 */
export async function checkQuotaExhausted(
  page: Page,
  selectors: ProviderSelectors,
): Promise<boolean> {
  if (!selectors.quotaExhaustedIndicator) return false;
  const indicators = selectors.quotaExhaustedIndicator.split(',').map(s => s.trim()).filter(Boolean);
  for (const ind of indicators) {
    try {
      const locator = ind.startsWith('text=')
        ? page.getByText(ind.slice(5))
        : page.locator(ind);
      if ((await locator.count()) > 0) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * Auto-detect CSS selectors for a video/image generation page.
 *
 * Uses heuristic rules to find the prompt input, generate button,
 * image upload trigger, video result element, progress indicator,
 * and download button on an arbitrary AI video generation page.
 */
export async function autoDetectVideoSelectors(page: Page): Promise<DetectedVideoSelectors> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (page as any).evaluate(`(() => {
    // Shadow DOM traversal helper
    function querySelectorAllDeep(selector, root) {
      root = root || document;
      var results = [...root.querySelectorAll(selector)];
      var allElements = root.querySelectorAll('*');
      for (var i = 0; i < allElements.length; i++) {
        if (allElements[i].shadowRoot) {
          results = results.concat([...allElements[i].shadowRoot.querySelectorAll(selector)]);
        }
      }
      return results;
    }

    // --- Prompt input (textarea / contenteditable) ---
    let promptInput = null;
    const textareas = querySelectorAllDeep('textarea').filter(
      (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
    );
    if (textareas.length > 0) {
      const best = textareas.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
      promptInput = buildSelector(best);
    }
    if (!promptInput) {
      const editables = querySelectorAllDeep('[contenteditable="true"]').filter(
        (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
      );
      if (editables.length > 0) {
        const best = editables.sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
        promptInput = buildSelector(best);
      }
    }

    // --- Generate button ---
    let generateButton = null;
    const buttonCandidates = querySelectorAllDeep('button, [role="button"]').filter(
      (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
    );
    for (const btn of buttonCandidates) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
      const text = (btn.textContent || '').trim().toLowerCase();
      const cls = (btn.className || '').toLowerCase();
      if (
        text.includes('生成') || text.includes('generate') || text.includes('create') ||
        text.includes('开始') || text.includes('start') ||
        aria.includes('generate') || aria.includes('create') || aria.includes('生成') ||
        testId.includes('generate') || testId.includes('create') ||
        cls.includes('generate') || cls.includes('create') || cls.includes('submit')
      ) {
        generateButton = buildSelector(btn);
        break;
      }
    }
    if (!generateButton) {
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn && (submitBtn.offsetParent !== null || getComputedStyle(submitBtn).position === 'fixed')) {
        generateButton = buildSelector(submitBtn);
      }
    }

    // --- Image upload trigger ---
    let imageUploadTrigger = null;
    const fileInputs = [...document.querySelectorAll('input[type="file"]')];
    const imageInput = fileInputs.find((el) => {
      const accept = (el.getAttribute('accept') || '').toLowerCase();
      return accept.includes('image') || accept.includes('png') || accept.includes('jpg') || accept.includes('jpeg');
    });
    if (imageInput) {
      imageUploadTrigger = buildSelector(imageInput);
    }
    if (!imageUploadTrigger && fileInputs.length > 0) {
      imageUploadTrigger = 'input[type="file"]';
    }
    if (!imageUploadTrigger) {
      for (const btn of buttonCandidates) {
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
        const tooltip = (btn.getAttribute('data-tooltip') || btn.getAttribute('title') || '').toLowerCase();
        const text = (btn.textContent || '').trim().toLowerCase();
        const cls = (btn.className || '').toString().toLowerCase();
        if (
          aria.includes('upload') || aria.includes('上传') || aria.includes('image') || aria.includes('图片') ||
          testId.includes('upload') || testId.includes('image') ||
          tooltip.includes('upload') || tooltip.includes('上传') ||
          text.includes('上传') || text.includes('upload') ||
          cls.includes('upload') || cls.includes('image-upload')
        ) {
          imageUploadTrigger = buildSelector(btn);
          break;
        }
      }
    }

    // --- Video result element ---
    let videoResult = null;
    const videos = [...document.querySelectorAll('video')].filter(
      (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
    );
    if (videos.length > 0) {
      videoResult = buildSelector(videos[videos.length - 1]);
    }
    if (!videoResult) {
      const resultSelectors = [
        '[class*="result"]',
        '[class*="output"]',
        '[class*="preview"]',
        '[class*="video-container"]',
        '[class*="player"]',
        '[class*="generation-result"]',
      ];
      for (const sel of resultSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          videoResult = sel;
          break;
        }
      }
    }

    // --- Progress indicator ---
    let progressIndicator = null;
    const progressSelectors = [
      '[class*="progress"]',
      '[role="progressbar"]',
      '[class*="loading"]',
      '[class*="generating"]',
      '[class*="spinner"]',
      '[class*="pending"]',
    ];
    for (const sel of progressSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        progressIndicator = sel;
        break;
      }
    }

    // --- Download button ---
    let downloadButton = null;
    for (const btn of buttonCandidates) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
      const text = (btn.textContent || '').trim().toLowerCase();
      const cls = (btn.className || '').toLowerCase();
      if (
        text.includes('下载') || text.includes('download') || text.includes('save') || text.includes('保存') ||
        aria.includes('download') || aria.includes('下载') ||
        testId.includes('download') ||
        cls.includes('download')
      ) {
        downloadButton = buildSelector(btn);
        break;
      }
    }
    if (!downloadButton) {
      const downloadLinks = [...document.querySelectorAll('a[download]')];
      if (downloadLinks.length > 0) {
        downloadButton = buildSelector(downloadLinks[downloadLinks.length - 1]);
      }
    }

    return { promptInput, generateButton, imageUploadTrigger, videoResult, progressIndicator, downloadButton };

    function buildSelector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId + '"]';
      const aria = el.getAttribute('aria-label');
      if (aria) return el.tagName.toLowerCase() + '[aria-label="' + aria.replace(/"/g, '\\\\"') + '"]';
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\\s+/).filter((c) => c.length > 2).slice(0, 3);
        if (classes.length > 0) {
          const sel = el.tagName.toLowerCase() + '.' + classes.join('.');
          if (document.querySelectorAll(sel).length === 1) return sel;
        }
      }
      return el.tagName.toLowerCase();
    }
  })()`);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
