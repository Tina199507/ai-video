import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@ai-video/lib/logger.js';
import { TEMP_DIR } from '../runtimeConstants.js';

const log = createLogger('ChatAutomation');

const DEBUG_SCREENSHOT_MAX_AGE_MS = 3_600_000; // 1 hour

/**
 * Remove stale debug screenshots from TEMP_DIR.
 * Deletes `.png` files older than `maxAgeMs` from the temp root and the
 * `chatgpt-debug/` subdirectory. Safe to call periodically.
 */
export async function cleanupDebugScreenshots(maxAgeMs = DEBUG_SCREENSHOT_MAX_AGE_MS): Promise<number> {
  const dirs = [TEMP_DIR, path.join(TEMP_DIR, 'chatgpt-debug')];
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue; // directory may not exist
    }
    for (const entry of entries) {
      if (!entry.endsWith('.png')) continue;
      const filePath = path.join(dir, entry);
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          removed++;
        }
      } catch {
        // file may have been deleted concurrently
      }
    }
  }

  if (removed > 0) {
    log.info('debug_screenshots_cleanup', { removedCount: removed });
  }
  return removed;
}
