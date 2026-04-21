/**
 * sidecar-manifest.ts — Integrity verification for the packaged backend.
 *
 * The `scripts/build-sidecar.sh` build step writes a manifest next to the
 * bundled `ai-video-server` binary that records sha256 hashes of:
 *   - the backend binary itself
 *   - the Playwright chromium folder (tree hash over sorted file list)
 *   - the git SHA the build was cut from
 *
 * At launch time `verifySidecarManifest()` recomputes the hashes and
 * refuses to start if anything drifted.  This guards against:
 *   - partial / corrupted installs (e.g. quarantined files on macOS)
 *   - on-disk tampering of the binary (supply-chain hygiene)
 *   - accidental mixing of binary + chromium from different builds
 *
 * Dev mode (`app.isPackaged === false`) is always treated as "verified"
 * because nothing gets built into `resources/` during local development.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface SidecarManifest {
  schemaVersion: number;
  gitSha: string;
  builtAt: string;
  binary: {
    name: string;
    size: number;
    sha256: string;
  };
  chromium: {
    dir: string;
    sha256: string;
  };
}

export type VerificationResult =
  | { ok: true; reason: 'verified' | 'dev-mode' | 'no-manifest'; manifest?: SidecarManifest }
  | { ok: false; reason: string; detail?: string };

const MANIFEST_FILE = 'sidecar-manifest.json';

function sha256File(file: string): string {
  const h = createHash('sha256');
  h.update(readFileSync(file));
  return h.digest('hex');
}

/**
 * Mirrors the shell:
 *   find chromium-* -type f -print0 | sort -z | xargs sha256sum | sha256sum
 * We emulate it by hashing "<hex>  <relative-path>\n" lines, sorted by
 * relative path, and then hashing that concatenation.
 */
function hashChromiumDir(absDir: string): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(absDir);

  const parentDir = path.dirname(absDir);
  const relFiles = files
    .map(f => ['./' + path.relative(parentDir, f).split(path.sep).join('/'), f] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // Mirror `sha256sum` output format exactly: "<hex>  <name>\n"
  const perFileLines = relFiles.map(([rel, abs]) => `${sha256File(abs)}  ${rel}\n`);

  const roll = createHash('sha256');
  roll.update(perFileLines.join(''));
  return roll.digest('hex');
}

/**
 * Verify that the sidecar artifacts under `resourcesPath` match the
 * manifest written at build time.  Returns a discriminated union so the
 * caller can differentiate between "dev mode / no manifest" (allowed)
 * and a hard mismatch (must refuse to boot).
 *
 * When `strict` is `false` (the default), a missing manifest is
 * permitted so older builds without this feature still launch.  Set
 * `strict: true` in CI and in release builds once every channel ships
 * manifests.
 */
export function verifySidecarManifest(
  resourcesPath: string,
  options: { isPackaged?: boolean; strict?: boolean } = {},
): VerificationResult {
  const { isPackaged = true, strict = false } = options;

  if (!isPackaged) return { ok: true, reason: 'dev-mode' };

  const manifestPath = path.join(resourcesPath, MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    if (strict) {
      return { ok: false, reason: 'manifest-missing', detail: manifestPath };
    }
    return { ok: true, reason: 'no-manifest' };
  }

  let manifest: SidecarManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as SidecarManifest;
  } catch (err) {
    return {
      ok: false,
      reason: 'manifest-unreadable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (manifest.schemaVersion !== 1) {
    return {
      ok: false,
      reason: 'manifest-schema-mismatch',
      detail: `expected schemaVersion 1, got ${manifest.schemaVersion}`,
    };
  }

  // ── Binary check ────────────────────────────────────────────────
  const binaryPath = path.join(resourcesPath, manifest.binary.name);
  if (!existsSync(binaryPath)) {
    return { ok: false, reason: 'binary-missing', detail: binaryPath };
  }
  const binaryStat = statSync(binaryPath);
  if (binaryStat.size !== manifest.binary.size) {
    return {
      ok: false,
      reason: 'binary-size-mismatch',
      detail: `expected ${manifest.binary.size} bytes, got ${binaryStat.size}`,
    };
  }
  const actualBinarySha = sha256File(binaryPath);
  if (actualBinarySha !== manifest.binary.sha256) {
    return {
      ok: false,
      reason: 'binary-sha-mismatch',
      detail: `expected ${manifest.binary.sha256}, got ${actualBinarySha}`,
    };
  }

  // ── Chromium check (optional — some builds ship without it) ─────
  if (manifest.chromium.sha256 && manifest.chromium.dir) {
    const chromiumDir = path.join(resourcesPath, 'browsers', manifest.chromium.dir);
    if (!existsSync(chromiumDir)) {
      return { ok: false, reason: 'chromium-missing', detail: chromiumDir };
    }
    const actualChromiumSha = hashChromiumDir(chromiumDir);
    if (actualChromiumSha !== manifest.chromium.sha256) {
      return {
        ok: false,
        reason: 'chromium-sha-mismatch',
        detail: `expected ${manifest.chromium.sha256}, got ${actualChromiumSha}`,
      };
    }
  }

  return { ok: true, reason: 'verified', manifest };
}
