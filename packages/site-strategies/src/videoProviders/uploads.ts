/* ------------------------------------------------------------------ */
/*  Upload helpers for img2video site flows                           */
/* ------------------------------------------------------------------ */

import type { Page, Response } from 'playwright';
import { resolveSelector, selectorToChain } from '@ai-video/pipeline-core/selectorResolver.js';
import type { SelectorChain } from '@ai-video/pipeline-core/runtimeTypes.js';
import type { VideoGenerationRuntime } from './types.js';

export async function uploadReferenceImage(
  page: Page,
  runtime: VideoGenerationRuntime,
): Promise<string> {
  if (!runtime.request.imageUrl) return '';

  console.log(`[videoProvider] Uploading keyframe image: ${runtime.request.imageUrl}`);

  let uploadedImageUri = '';
  const apiHosts = runtime.strategy.uploadApiHosts;
  const uploadRespHandler = async (response: Response) => {
    const url = response.url();
    if (!apiHosts.some((host) => url.includes(host))) return;
    if (response.status() !== 200) return;
    if (url.includes('/upload') || url.includes('/resource') || url.includes('/image') || url.includes('/aigc')) {
      try {
        const body = await response.text();
        console.log(`[videoProvider] ${runtime.providerLabel} API response (${url.split('?')[0]}): ${body.slice(0, 500)}`);
        try {
          const parsed = JSON.parse(body);
          const uri = parsed?.data?.uri || parsed?.data?.image_uri || parsed?.data?.url || parsed?.uri || '';
          if (uri) uploadedImageUri = uri;
        } catch {
          // not JSON
        }
      } catch {
        // response already consumed
      }
    }
  };

  page.on('response', uploadRespHandler);
  try {
    const fileInputs = page.locator(runtime.strategy.fileInputSelector);
    const fileInputCount = await fileInputs.count();
    console.log(`[videoProvider] Found ${fileInputCount} file input(s)`);
    const hiddenInput = fileInputs.first();
    if (fileInputCount > 0) {
      await hiddenInput.setInputFiles(runtime.request.imageUrl);
      console.log('[videoProvider] File set via setInputFiles');
      await hiddenInput.dispatchEvent('change', { bubbles: true });
      await hiddenInput.dispatchEvent('input', { bubbles: true });
      console.log('[videoProvider] Dispatched change+input events');

      try {
        await page.waitForResponse(
          (resp) => {
            const u = resp.url();
            if (runtime.isKling) {
              return resp.status() === 200
                && (u.includes('klingai.com') || u.includes('kuaishou.com') || u.includes('ksyun.com'))
                && (u.includes('/upload') || u.includes('/resource') || u.includes('/image'));
            }
            return resp.status() === 200
              && ((u.includes('jimeng.jianying.com') && (u.includes('/upload') || u.includes('/resource')))
                || u.includes('tos-cn-'));
          },
          { timeout: 30_000 },
        );
        console.log('[videoProvider] Image upload server response received');
      } catch {
        console.warn(`[videoProvider] No ${runtime.providerLabel} upload response within 30s, continuing...`);
      }
      await page.waitForTimeout(5_000);
    } else if (runtime.config.selectors.imageUploadTrigger) {
      await uploadImageChain(page, runtime.config.selectors.imageUploadTrigger, runtime.request.imageUrl);
    }
  } finally {
    page.off('response', uploadRespHandler);
  }

  const uploadState = await page.evaluate(`(() => {
    var state = { hasPreview: false, previewSrc: '', uploadedImages: 0 };
    document.querySelectorAll('img').forEach(function(img) {
      if (img.src && (img.src.includes('blob:') || img.src.includes('tos-') || img.src.includes('byteimg'))) {
        state.hasPreview = true;
        state.previewSrc = img.src.substring(0, 100);
        state.uploadedImages++;
      }
    });
    var successEl = document.querySelector('[class*="upload-success"], [class*="uploaded"], [class*="preview-image"], [class*="reference-image"]');
    if (successEl) state.hasPreview = true;
    return state;
  })()`).catch(() => ({ hasPreview: false })) as { hasPreview: boolean; previewSrc?: string; uploadedImages?: number };

  console.log(`[videoProvider] Post-upload UI state: ${JSON.stringify(uploadState)}`);
  if (uploadedImageUri) {
    console.log(`[videoProvider] Captured CDN image URI: ${uploadedImageUri.slice(0, 100)}`);
  }
  console.log(`[videoProvider] After image upload, page URL: ${page.url()}`);
  return uploadedImageUri;
}

export async function uploadImageChain(page: Page, chain: SelectorChain, imagePath: string): Promise<void> {
  try {
    const result = await resolveSelector(page, chain);
    if (result) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5_000 }),
        result.locator.first().click(),
      ]);
      await fileChooser.setFiles(imagePath);
      await page.waitForTimeout(2_000);
      return;
    }
  } catch {
    // fallback below
  }

  const input = page.locator('input[type="file"]').first();
  if (await input.count() > 0) {
    await input.setInputFiles(imagePath);
    await page.waitForTimeout(2_000);
  }
}

export async function uploadImage(page: Page, triggerSelector: string, imagePath: string): Promise<void> {
  await uploadImageChain(page, selectorToChain(triggerSelector), imagePath);
}
