/* ------------------------------------------------------------------ */
/*  Diagnostics helpers for browser-driven video providers            */
/* ------------------------------------------------------------------ */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import type { VideoGenerationRuntime, WriteFailure } from './types.js';

export function diagnosticsDir(outputDir: string): string {
  return join(outputDir, '..', 'ai-logs');
}

export function ensureDiagnosticsDir(outputDir: string): string {
  const dir = diagnosticsDir(outputDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function createWriteFailure(runtime: VideoGenerationRuntime): WriteFailure {
  return (reason: string, details?: Record<string, unknown>) => {
    const logDir = ensureDiagnosticsDir(runtime.outputDir);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = join(logDir, `VIDEO_GEN_DIAG_${runtime.profileName}_${ts}.json`);
      writeFileSync(logFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        profile: runtime.profileName,
        filename: runtime.filename,
        prompt: runtime.request.prompt?.slice(0, 200),
        failureReason: reason,
        ...details,
      }, null, 2));
    } catch {
      // best-effort
    }
    console.error(`[videoProvider] ❌ ${runtime.profileName}: ${reason}`);
  };
}

export async function captureScreenshot(
  page: Page,
  runtime: VideoGenerationRuntime,
  basename: string,
  fullPage = true,
): Promise<string | undefined> {
  try {
    const logDir = ensureDiagnosticsDir(runtime.outputDir);
    const screenshotPath = join(logDir, `${basename}_${runtime.profileName}_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

export async function capturePromptEditorDiagnostics(page: Page): Promise<unknown> {
  return page.evaluate(`(() => {
    var info = { url: location.href, title: document.title, editables: [], inputs: [], buttons: [] };
    document.querySelectorAll('[contenteditable]').forEach(function(el) {
      info.editables.push({ tag: el.tagName, classes: el.className.substring(0, 100), role: el.getAttribute('role') });
    });
    document.querySelectorAll('textarea, input[type="text"]').forEach(function(el) {
      info.inputs.push({ tag: el.tagName, classes: el.className.substring(0, 100), placeholder: el.getAttribute('placeholder') });
    });
    document.querySelectorAll('button').forEach(function(el) {
      if (el.getBoundingClientRect().width > 0) {
        info.buttons.push({ text: (el.textContent || '').trim().substring(0, 50), classes: el.className.substring(0, 150), disabled: el.disabled });
      }
    });
    return info;
  })()`).catch(() => ({}));
}
