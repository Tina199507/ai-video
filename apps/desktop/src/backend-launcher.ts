/**
 * backend-launcher.ts — Backend path resolution and environment setup.
 *
 * Provides the utilities needed by BootOrchestrator to spawn the backend:
 *   - resolveBackendPath() — where to find the backend binary / script
 *   - buildBackendEnv()    — whitelisted env vars for the child process
 *   - resolveProjectRoot() — CWD for the child process
 *
 * Process lifecycle (spawn, restart, shutdown) is managed by
 * BootOrchestrator in boot-orchestrator.ts.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { verifySidecarManifest, type VerificationResult } from './sidecar-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the path to the backend entry point.
 * In development, uses the source TypeScript via tsx.
 * In production, uses the bundled sidecar binary.
 */
export function resolveBackendPath(): { command: string; args: string[] } {
  const isDev = !app.isPackaged;

  if (isDev) {
    // app.getAppPath() → apps/desktop/, two levels up = monorepo root
    const projectRoot = path.resolve(app.getAppPath(), '..', '..');
    const serverPath = path.join(projectRoot, 'apps', 'server', 'src', 'main.ts');
    return {
      command: 'node',
      args: ['--import', 'tsx', serverPath],
    };
  }

  const resourcesPath = process.resourcesPath ?? path.join(__dirname, '..');
  const sidecarPath = path.join(resourcesPath, 'ai-video-server');
  return {
    command: sidecarPath,
    args: [],
  };
}

/**
 * Project root directory (used as CWD for the child process).
 */
export function resolveProjectRoot(): string {
  // app.getAppPath() → apps/desktop/; go up two levels to reach the
  // monorepo root that hosts .env, data/, scripts/, etc.
  return path.resolve(app.getAppPath(), '..', '..');
}

/**
 * Verify sha256 hashes of the bundled backend binary and Playwright
 * chromium folder against the sidecar-manifest.json produced at build
 * time.  Returns the structured verification result; callers decide
 * whether a non-OK result is fatal (it should be, in packaged builds).
 *
 * Dev mode is always treated as verified — there's no manifest to
 * compare against when running `npm run dev`.
 */
export function verifySidecarIntegrity(
  options: { strict?: boolean } = {},
): VerificationResult {
  const isPackaged = app.isPackaged;
  const resourcesPath = isPackaged
    ? (process.resourcesPath ?? path.join(__dirname, '..'))
    : path.resolve(app.getAppPath(), 'resources');
  return verifySidecarManifest(resourcesPath, { isPackaged, strict: options.strict });
}

/**
 * Build a whitelisted environment for the backend child process.
 * Only explicitly approved variables are forwarded.
 */
export function buildBackendEnv(): Record<string, string> {
  const dataDir = path.join(app.getPath('userData'), 'data');

  const env: Record<string, string> = {
    PORT: '3220',
    APPDATA_DIR: dataDir,
    ELECTRON_SHELL: '1',
    ELECTRON_CDP_PORT: '9222',
    ELECTRON_CONTROL_PORT: '3221',
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NODE_ENV: process.env.NODE_ENV ?? 'production',
  };

  // Pass through known optional config variables if set
  for (const key of [
    'GEMINI_API_KEY',
    'API_KEY',
    'ALLOWED_ORIGINS',
    'PLAYWRIGHT_BROWSERS_PATH',
    'ELECTRON_AUTOMATION_TOKEN',
    'HTTP_PROXY',
    'http_proxy',
    'HTTPS_PROXY',
    'https_proxy',
    'NO_PROXY',
    'no_proxy',
    'MIN_VIDEO_SCENES',
  ]) {
    if (process.env[key]) env[key] = process.env[key]!;
  }

  if (!env.ELECTRON_AUTOMATION_TOKEN) {
    console.warn(
      '[BackendLauncher] ⚠️ ELECTRON_AUTOMATION_TOKEN not set — ' +
      'automation control requests will fail with 401',
    );
  }

  return env;
}
