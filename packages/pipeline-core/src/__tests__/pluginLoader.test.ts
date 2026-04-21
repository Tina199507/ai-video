/**
 * pluginLoader.test.ts — end-to-end tests for the plugin discovery /
 * trust verification path. We synthesize a small file-system layout
 * under tmp:
 *
 *   tmp/<root>/<plugin-id>/plugin.manifest.json
 *   tmp/<root>/<plugin-id>/dist/index.mjs
 *
 * Each test pairs a manifest with a trust file and asserts the
 * loader's verdict.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  generateKeyPairSync,
  createPublicKey,
  sign as nodeSign,
  createHash,
} from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  discoverFsPlugins,
  loadAndRegisterPlugins,
  loadTrustFile,
  verifyManifestTrust,
} from '../pluginLoader.js';
import {
  canonicalManifestForSigning,
  type PluginManifest,
} from '../pluginManifest.js';

function genKeyPairHex(): { privKey: ReturnType<typeof generateKeyPairSync>['privateKey']; pubHex: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const pubHex = Buffer.from(der.subarray(der.length - 32)).toString('hex');
  return { privKey: privateKey, pubHex };
}

function signManifest(manifest: PluginManifest, privKey: ReturnType<typeof generateKeyPairSync>['privateKey'], pubHex: string): PluginManifest {
  const canonical = canonicalManifestForSigning(manifest);
  const value = nodeSign(null, Buffer.from(canonical, 'utf8'), privKey).toString('hex');
  return { ...manifest, signature: { algorithm: 'ed25519', value, publicKey: pubHex } };
}

function writePlugin(rootDir: string, manifest: PluginManifest, opts: { entryContent?: string } = {}): string {
  const dir = path.join(rootDir, manifest.id);
  mkdirSync(path.dirname(path.join(dir, manifest.entry)), { recursive: true });
  writeFileSync(path.join(dir, 'plugin.manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(dir, manifest.entry), opts.entryContent ?? `export function register(api){ globalThis.__pluginCalls = globalThis.__pluginCalls || []; globalThis.__pluginCalls.push(api.manifest.id); }`);
  return dir;
}

function writeTrust(file: string, plugins: Record<string, unknown>): void {
  writeFileSync(file, JSON.stringify({ version: 1, plugins }, null, 2));
}

const MANIFEST_BASE: PluginManifest = {
  schemaVersion: 1,
  id: 'demo.alpha',
  version: '0.1.0',
  kind: 'service',
  entry: 'dist/index.mjs',
};

describe('pluginLoader', () => {
  let work: string;
  let rootDir: string;
  let trustFile: string;

  beforeEach(() => {
    work = mkdtempSync(path.join(tmpdir(), 'plugloader-'));
    rootDir = path.join(work, 'plugins');
    trustFile = path.join(work, 'trusted-plugins.json');
    mkdirSync(rootDir, { recursive: true });
    writeTrust(trustFile, {});
    delete (globalThis as Record<string, unknown>).__pluginCalls;
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
    delete (globalThis as Record<string, unknown>).__pluginCalls;
  });

  it('discovers nothing when the root does not exist', () => {
    const r = discoverFsPlugins({
      pluginsRoot: path.join(work, 'no-such-dir'),
      trustFilePath: trustFile,
    });
    expect(r.loaded).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it('loads an unsigned plugin in non-strict mode and skips it in strict mode', () => {
    writePlugin(rootDir, MANIFEST_BASE);
    const lax = discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile });
    expect(lax.loaded).toHaveLength(1);
    expect(lax.loaded[0]?.manifest.id).toBe('demo.alpha');

    expect(() =>
      discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile, strict: true }),
    ).toThrow(/not in trusted-plugins.json/);
  });

  it('verifies a valid ed25519 signature against the trust file pubkey', () => {
    const { privKey, pubHex } = genKeyPairHex();
    const signed = signManifest(MANIFEST_BASE, privKey, pubHex);
    writePlugin(rootDir, signed);
    writeTrust(trustFile, { 'demo.alpha': { publicKey: pubHex } });

    const r = discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile, strict: true });
    expect(r.skipped).toEqual([]);
    expect(r.loaded).toHaveLength(1);
  });

  it('rejects a tampered signature', () => {
    const { privKey, pubHex } = genKeyPairHex();
    const signed = signManifest(MANIFEST_BASE, privKey, pubHex);
    // Tamper after signing
    const tampered: PluginManifest = { ...signed, version: '9.9.9' };
    writePlugin(rootDir, tampered);
    writeTrust(trustFile, { 'demo.alpha': { publicKey: pubHex } });

    const r = discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile });
    expect(r.loaded).toHaveLength(0);
    expect(r.skipped[0]?.reason).toMatch(/signature verification failed/);
  });

  it('rejects when manifest publicKey disagrees with the trust file', () => {
    const { privKey } = genKeyPairHex();
    const fakePub = 'a'.repeat(64);
    const signed = signManifest(MANIFEST_BASE, privKey, fakePub);
    writePlugin(rootDir, signed);
    writeTrust(trustFile, { 'demo.alpha': { publicKey: 'b'.repeat(64) } });

    const r = discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile });
    expect(r.skipped[0]?.reason).toMatch(/publicKey/);
  });

  it('verifies via manifestSha256 pin', () => {
    writePlugin(rootDir, MANIFEST_BASE);
    const sha = createHash('sha256').update(canonicalManifestForSigning(MANIFEST_BASE)).digest('hex');
    writeTrust(trustFile, { 'demo.alpha': { manifestSha256: sha } });

    const r = discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile, strict: true });
    expect(r.loaded).toHaveLength(1);
  });

  it('rejects manifestSha256 pin mismatch', () => {
    writePlugin(rootDir, MANIFEST_BASE);
    writeTrust(trustFile, { 'demo.alpha': { manifestSha256: '0'.repeat(64) } });

    const r = discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile });
    expect(r.skipped[0]?.reason).toMatch(/sha256 mismatch/);
  });

  it('rejects entry paths that escape the plugin directory', () => {
    // Manually craft the file so the validator passes (the regex
    // already blocks `..` prefixes), but the resolved path leaves
    // the plugin dir.  We use an intermediate symlink-like trick:
    // an entry that parses as a relative path containing `/../`.
    // The validator forbids ".." segments outright, so directly
    // setting `entry: "x/../../escape.mjs"` is rejected at schema
    // time. Instead we simulate by writing to disk under a different
    // directory and pointing entry to it via absolute path.
    const dir = path.join(rootDir, MANIFEST_BASE.id);
    mkdirSync(dir, { recursive: true });
    const escapedFile = path.join(work, 'escape.mjs');
    writeFileSync(escapedFile, 'export function register(){}');
    const m = { ...MANIFEST_BASE, entry: escapedFile };
    // Have to write directly because writePlugin would mkdir under dir.
    writeFileSync(path.join(dir, 'plugin.manifest.json'), JSON.stringify(m, null, 2));

    const r = discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile });
    // Validator already refuses absolute / non-.mjs/.js/.cjs entries with leading slash.
    expect(r.loaded).toHaveLength(0);
    expect(r.skipped[0]?.reason).toMatch(/manifest validation failed/);
  });

  it('skips plugins with missing entry files', () => {
    const dir = path.join(rootDir, MANIFEST_BASE.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'plugin.manifest.json'), JSON.stringify(MANIFEST_BASE, null, 2));
    // Note: no dist/index.mjs file written.
    const r = discoverFsPlugins({ pluginsRoot: rootDir, trustFilePath: trustFile });
    expect(r.skipped[0]?.reason).toMatch(/entry not found/);
  });

  it('loadAndRegisterPlugins dynamic-imports and calls register()', async () => {
    writePlugin(rootDir, MANIFEST_BASE);
    const r = await loadAndRegisterPlugins({}, { pluginsRoot: rootDir, trustFilePath: trustFile });
    expect(r.loaded).toHaveLength(1);
    expect((globalThis as Record<string, unknown>).__pluginCalls).toEqual(['demo.alpha']);
  });

  it('loadTrustFile rejects malformed JSON and bad versions', () => {
    writeFileSync(trustFile, 'not json');
    expect(() => loadTrustFile(trustFile)).toThrow(/malformed/);
    writeFileSync(trustFile, JSON.stringify({ version: 2, plugins: {} }));
    expect(() => loadTrustFile(trustFile)).toThrow(/version/);
  });

  it('verifyManifestTrust handles unsigned-untracked correctly', () => {
    const trust = { version: 1 as const, plugins: {} };
    const r1 = verifyManifestTrust(MANIFEST_BASE, trust);
    expect(r1).toEqual({ ok: true, reason: 'unsigned-untracked' });
    const r2 = verifyManifestTrust(MANIFEST_BASE, trust, { strict: true });
    expect(r2.ok).toBe(false);
  });
});
