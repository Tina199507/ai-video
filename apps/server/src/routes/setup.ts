/* ------------------------------------------------------------------ */
/*  Setup routes — first-run experience and environment checks         */
/* ------------------------------------------------------------------ */

import { json, parseJsonBody, type Route } from './helpers.js';
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolveChromiumChannel } from '@ai-video/pipeline-core/browserManager.js';

/**
 * When `DISABLE_SETUP_ROUTES=1` the package-install endpoints
 * (`/api/setup/install-browser` and `/api/setup/install-edge-tts`) return
 * 403 instead of spawning child processes.  Set this in production
 * environments where arbitrary software installation should not be triggered
 * via the API.
 */
const SETUP_INSTALL_DISABLED = process.env.DISABLE_SETUP_ROUTES === '1';

function runSilent(file: string, args: string[], timeoutMs = 5000): boolean {
  try {
    const res = spawnSync(file, args, {
      stdio: 'ignore',
      timeout: timeoutMs,
      shell: false,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function isFFmpegAvailable(): boolean {
  return runSilent('ffmpeg', ['-version']);
}

function isEdgeTTSAvailable(): boolean {
  return runSilent('edge-tts', ['--version']);
}

function isPlaywrightAvailable(): boolean {
  try {
    const require = createRequire(import.meta.url);
    require.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a usable Chromium/Chrome browser is available for Playwright.
 * Returns true if either the Playwright bundled Chromium is installed or
 * the system Chrome is accessible via `channel: 'chrome'`.
 */
function isChromiumInstalled(): boolean {
  const channel = resolveChromiumChannel();
  if (channel === undefined) return true;

  const locator = process.platform === 'win32' ? 'where' : 'which';
  const binaries = process.platform === 'win32'
    ? ['chrome']
    : ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'];

  for (const bin of binaries) {
    if (runSilent(locator, [bin])) return true;
  }
  return false;
}

export function setupRoutes(svc: PipelineService): Route[] {
  return [
    /* ---- Setup status check ---- */
    {
      method: 'GET',
      pattern: /^\/api\/setup\/status$/,
      handler: (_req, res) => {
        const accountCount = svc.getProviderCount();
        const apiResourceCount = svc.getApiResourceCount();
        json(res, 200, {
          needsSetup: !svc.hasApiKey() && accountCount === 0,
          dataDir: svc.getDataDir(),
          hasApiKey: svc.hasApiKey(),
          accountCount,
          apiResourceCount,
          ffmpegAvailable: isFFmpegAvailable(),
          edgeTtsAvailable: isEdgeTTSAvailable(),
          playwrightAvailable: isPlaywrightAvailable(),
          chromiumAvailable: isChromiumInstalled(),
          nodeVersion: process.version,
          platform: process.platform,
        });
      },
    },

    /* ---- Install Playwright Chromium browser ---- */
    {
      method: 'POST',
      pattern: /^\/api\/setup\/install-browser$/,
      handler: (_req, res) => {
        if (SETUP_INSTALL_DISABLED) {
          return json(res, 403, { error: 'Setup install routes are disabled (DISABLE_SETUP_ROUTES=1)' });
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const send = (data: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        send({ status: 'installing', message: '正在安装 Chromium 浏览器...' });

        const child = spawn('npx', ['playwright', 'install', 'chromium'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        });

        child.stdout?.on('data', (chunk: Buffer) => {
          send({ status: 'progress', message: chunk.toString().trim() });
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          send({ status: 'progress', message: chunk.toString().trim() });
        });

        child.on('close', (code) => {
          if (code === 0) {
            send({ status: 'done', message: 'Chromium 安装完成 ✅' });
          } else {
            send({ status: 'error', message: `安装失败，退出码 ${code}` });
          }
          res.end();
        });

        child.on('error', (err) => {
          send({ status: 'error', message: `安装失败: ${err.message}` });
          res.end();
        });
      },
    },

    /* ---- Install edge-tts (Python package) ---- */
    {
      method: 'POST',
      pattern: /^\/api\/setup\/install-edge-tts$/,
      handler: (_req, res) => {
        if (SETUP_INSTALL_DISABLED) {
          return json(res, 403, { error: 'Setup install routes are disabled (DISABLE_SETUP_ROUTES=1)' });
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const send = (data: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        send({ status: 'installing', message: '正在安装 edge-tts...' });

        const child = spawn('pip3', ['install', 'edge-tts'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        });

        child.stdout?.on('data', (chunk: Buffer) => {
          send({ status: 'progress', message: chunk.toString().trim() });
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          send({ status: 'progress', message: chunk.toString().trim() });
        });

        child.on('close', (code) => {
          if (code === 0) {
            send({ status: 'done', message: 'edge-tts 安装完成 ✅' });
          } else {
            send({ status: 'error', message: `安装失败，退出码 ${code}。请手动运行: pip install edge-tts` });
          }
          res.end();
        });

        child.on('error', (err) => {
          send({ status: 'error', message: `安装失败: ${err.message}` });
          res.end();
        });
      },
    },

    /* ---- Complete setup (save config) ---- */
    {
      method: 'POST',
      pattern: /^\/api\/setup\/complete$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<{
          geminiApiKey?: string;
          aivideomakerApiKey?: string;
        }>(req);

        json(res, 200, svc.completeSetup(body));
      },
    },
  ];
}
