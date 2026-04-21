/* ------------------------------------------------------------------ */
/*  Download helpers for completed generated videos                   */
/* ------------------------------------------------------------------ */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import type { ApiLog, VideoGenResult, VideoGenerationRuntime, WriteFailure } from './types.js';

export async function downloadGeneratedVideo(
  page: Page,
  runtime: VideoGenerationRuntime,
  apiLogs: ApiLog[],
  writeFailure: WriteFailure,
): Promise<VideoGenResult | null> {
  const outputPath = join(runtime.outputDir, runtime.filename);

  if (runtime.strategy.extractVideoUrlFromApi && !existsSync(outputPath)) {
    for (const log of [...apiLogs].reverse()) {
      if (!log.body) continue;
      const cdnMatch = log.body.match(/"resource"\s*:\s*"(https?:\/\/[^"]+(?:\.mp4|\/video\/[^"]+)[^"]*)"/);
      if (!cdnMatch) {
        const videoUrlMatch = log.body.match(/"(https?:\/\/[^"]*(?:kcdn|ksyun|kwai|cos)[^"]*(?:\.mp4|video)[^"]*)"/);
        if (!videoUrlMatch) continue;
        const cdnUrl = videoUrlMatch[1]!;
        console.log(`[videoProvider] Found Kling video URL in API response: ${cdnUrl.slice(0, 120)}...`);
        try {
          const { default: http } = await import('node:https');
          const data = await new Promise<Buffer>((resolve, reject) => {
            http.get(cdnUrl, (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (c: Buffer) => chunks.push(c));
              res.on('end', () => resolve(Buffer.concat(chunks)));
              res.on('error', reject);
            }).on('error', reject);
          });
          if (data.length > 10_000) {
            writeFileSync(outputPath, data);
            console.log(`[videoProvider] Video saved from Kling CDN (node https): ${outputPath} (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
          }
        } catch (e) {
          console.warn(`[videoProvider] Kling CDN download failed: ${e instanceof Error ? e.message : e}`);
        }
        if (existsSync(outputPath)) break;
        continue;
      }

      const cdnUrl = cdnMatch[1]!;
      console.log(`[videoProvider] Found Kling CDN URL in API response: ${cdnUrl.slice(0, 120)}...`);
      try {
        const { default: http } = await import('node:https');
        const data = await new Promise<Buffer>((resolve, reject) => {
          http.get(cdnUrl, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          }).on('error', reject);
        });
        if (data.length > 10_000) {
          writeFileSync(outputPath, data);
          console.log(`[videoProvider] Video saved from Kling CDN (node https): ${outputPath} (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
        }
      } catch (e) {
        console.warn(`[videoProvider] Kling CDN download failed: ${e instanceof Error ? e.message : e}`);
      }
      if (existsSync(outputPath)) break;
    }
  }

  if (!existsSync(outputPath)) {
    const dlBtn = page.locator('a[download], button:has-text("下载"), button:has-text("Download"), a[href*="download" i]').first();
    if (await dlBtn.count() > 0 && await dlBtn.isVisible()) {
      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 15_000 }),
          dlBtn.click(),
        ]);
        await download.saveAs(outputPath);
        console.log(`[videoProvider] Video downloaded via button to: ${outputPath}`);
      } catch (e) {
        console.warn(`[videoProvider] Download button failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  if (!existsSync(outputPath)) {
    const videoUrl = await page.evaluate(`(
      () => {
        var urls = [];
        var walk = function(root) {
          root.querySelectorAll('video').forEach(function(v) {
            if (v.src && (v.src.startsWith('blob:') || v.src.startsWith('http'))) urls.push(v.src);
            var src = v.querySelector('source');
            if (src && src.src) urls.push(src.src);
          });
          root.querySelectorAll('*').forEach(function(el) {
            if (el.shadowRoot) walk(el.shadowRoot);
          });
        };
        walk(document);
        return urls.length > 0 ? urls[urls.length - 1] : null;
      }
    )()`).catch(() => null) as string | null;

    if (videoUrl) {
      console.log(`[videoProvider] Extracting video from URL: ${videoUrl.slice(0, 100)}...`);
      try {
        if (videoUrl.startsWith('blob:')) {
          const base64 = await page.evaluate(`(async () => {
            var url = ${JSON.stringify(videoUrl)};
            return new Promise(function(resolve, reject) {
              var xhr = new XMLHttpRequest();
              xhr.open('GET', url, true);
              xhr.responseType = 'blob';
              xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                  var reader = new FileReader();
                  reader.onload = function() { resolve(reader.result.split(',')[1] || ''); };
                  reader.onerror = function() { reject(new Error('FileReader failed')); };
                  reader.readAsDataURL(xhr.response);
                } else { reject(new Error('XHR status ' + xhr.status)); }
              };
              xhr.onerror = function() { reject(new Error('XHR network error')); };
              xhr.send();
            });
          })()`) as string;
          if (base64) {
            writeFileSync(outputPath, Buffer.from(base64, 'base64'));
            console.log(`[videoProvider] Video saved from blob: ${outputPath}`);
          }
        } else {
          const resp = await page.evaluate(`(async () => {
            var url = ${JSON.stringify(videoUrl)};
            return new Promise(function(resolve, reject) {
              var xhr = new XMLHttpRequest();
              xhr.open('GET', url, true);
              xhr.responseType = 'arraybuffer';
              xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(Array.from(new Uint8Array(xhr.response)));
                } else { reject(new Error('XHR status ' + xhr.status)); }
              };
              xhr.onerror = function() { reject(new Error('XHR network error')); };
              xhr.send();
            });
          })()`) as number[];
          writeFileSync(outputPath, Buffer.from(resp));
          console.log(`[videoProvider] Video saved from URL: ${outputPath}`);
        }
      } catch (e) {
        console.warn(`[videoProvider] Video extraction failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  if (existsSync(outputPath)) {
    return { localPath: outputPath };
  }

  console.warn('[videoProvider] No video file produced');
  writeFailure('NO_VIDEO_FILE: All download strategies failed', { outputPath });
  return null;
}
