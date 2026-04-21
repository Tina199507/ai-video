/**
 * pluginExamples.e2e.test.ts — end-to-end coverage for the plugin
 * trust + load pipeline using the in-tree examples that ship under
 * data/plugins/.  Two trust modes are exercised:
 *
 *   1. sha256 manifest pin   — used by data/plugins/{hello-stage,
 *      echo-provider}.  No private key needs to live in the repo.
 *   2. ed25519 signature     — generated on the fly from a fresh
 *      keypair so the test stays self-contained.
 *
 * The test also asserts the negative paths (tampered manifest,
 * wrong public key, missing trust entry under strict mode) so the
 * failure modes documented in docs/plugin-author-guide.md are
 * actually wired up the way the guide claims.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';
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
  loadPluginManifestFromFile,
  type PluginManifest,
} from '../pluginManifest.js';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const REPO_PLUGINS = path.join(REPO_ROOT, 'data/plugins');
const REPO_TRUST = path.join(REPO_ROOT, 'data/trusted-plugins.json');

function copyTree(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true });
}

function rawPubHex(pub: ReturnType<typeof generateKeyPairSync>['publicKey']): string {
  const der = pub.export({ format: 'der', type: 'spki' });
  return Buffer.from(der.subarray(der.length - 32)).toString('hex');
}

describe('plugin examples — sha256 pin path (shipped repo state)', () => {
  it('discovers both shipped demo plugins from the canonical repo paths', () => {
    const result = discoverFsPlugins({
      pluginsRoot: REPO_PLUGINS,
      trustFilePath: REPO_TRUST,
    });

    expect(result.skipped, JSON.stringify(result.skipped)).toEqual([]);
    const ids = result.loaded.map(p => p.manifest.id).sort();
    expect(ids).toContain('ai-video.example.hello-stage');
    expect(ids).toContain('ai-video.example.echo-provider');
  });

  it('accepts the shipped manifests under strict mode (every plugin trusted)', () => {
    const result = discoverFsPlugins({
      pluginsRoot: REPO_PLUGINS,
      trustFilePath: REPO_TRUST,
      strict: true,
    });
    expect(result.skipped).toEqual([]);
    expect(result.loaded.length).toBeGreaterThanOrEqual(2);
  });

  it('hello-stage entry registers a PLUGIN_HELLO stage when invoked', async () => {
    const calls: Array<{ id: string; stage: string }> = [];
    const stageRegistry = {
      registerStage(def: { stage: string; after?: unknown }) {
        calls.push({ id: 'register', stage: def.stage });
      },
    };

    const result = await loadAndRegisterPlugins(
      {
        stageRegistry,
        pluginRegistry: { register: () => undefined },
        services: { logger: { info: () => undefined, warn: () => undefined } },
      },
      { pluginsRoot: REPO_PLUGINS, trustFilePath: REPO_TRUST },
    );

    expect(result.skipped, JSON.stringify(result.skipped)).toEqual([]);
    expect(calls).toContainEqual({ id: 'register', stage: 'PLUGIN_HELLO' });
  });

  it('echo-provider entry registers an echo plugin against pluginRegistry', async () => {
    const registered: Array<{ id: string }> = [];
    const pluginRegistry = {
      register(plugin: { id: string }) {
        registered.push({ id: plugin.id });
      },
    };

    const result = await loadAndRegisterPlugins(
      {
        stageRegistry: { registerStage: () => undefined },
        pluginRegistry,
        services: { logger: { info: () => undefined, warn: () => undefined } },
      },
      { pluginsRoot: REPO_PLUGINS, trustFilePath: REPO_TRUST },
    );

    expect(result.skipped, JSON.stringify(result.skipped)).toEqual([]);
    expect(registered.map(r => r.id)).toContain('ai-video.example.echo-provider');
  });
});

describe('plugin examples — sha256 pin negative paths', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'plugin-pin-neg-'));
    copyTree(REPO_PLUGINS, path.join(tmp, 'plugins'));
    cpSync(REPO_TRUST, path.join(tmp, 'trusted-plugins.json'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects a tampered manifest (sha256 pin mismatch)', () => {
    const manifestPath = path.join(tmp, 'plugins/hello-stage/plugin.manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.description = 'tampered description';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = discoverFsPlugins({
      pluginsRoot: path.join(tmp, 'plugins'),
      trustFilePath: path.join(tmp, 'trusted-plugins.json'),
    });

    const skipped = result.skipped.find(s => s.id === 'ai-video.example.hello-stage');
    expect(skipped).toBeDefined();
    expect(skipped!.reason).toMatch(/sha256 mismatch/);
  });

  it('rejects an unknown plugin under strict mode but accepts it lax', () => {
    const trustPath = path.join(tmp, 'trusted-plugins.json');
    writeFileSync(trustPath, JSON.stringify({ version: 1, plugins: {} }, null, 2));

    const lax = discoverFsPlugins({
      pluginsRoot: path.join(tmp, 'plugins'),
      trustFilePath: trustPath,
    });
    expect(lax.loaded.length).toBeGreaterThan(0);

    expect(() =>
      discoverFsPlugins({
        pluginsRoot: path.join(tmp, 'plugins'),
        trustFilePath: trustPath,
        strict: true,
      }),
    ).toThrow(/not in trusted-plugins\.json/);
  });
});

describe('plugin examples — ed25519 signature path', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'plugin-sig-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function buildSignedPlugin(
    pluginId: string,
    keyPair: ReturnType<typeof generateKeyPairSync>,
  ): { manifestPath: string; pubHex: string } {
    const dir = path.join(tmp, 'plugins', pluginId);
    mkdirSync(path.join(dir, 'dist'), { recursive: true });
    writeFileSync(
      path.join(dir, 'dist/index.mjs'),
      'export function register(){ /* noop */ }',
    );

    const baseManifest: PluginManifest = {
      schemaVersion: 1,
      id: pluginId,
      name: 'Signed Plugin',
      version: '0.1.0',
      kind: 'service',
      entry: 'dist/index.mjs',
      permissions: ['logger'],
    };

    const canonical = canonicalManifestForSigning(baseManifest);
    const value = nodeSign(null, Buffer.from(canonical, 'utf8'), keyPair.privateKey).toString('hex');
    const pubHex = rawPubHex(keyPair.publicKey);
    const signed: PluginManifest = {
      ...baseManifest,
      signature: { algorithm: 'ed25519', value, publicKey: pubHex },
    };

    const manifestPath = path.join(dir, 'plugin.manifest.json');
    writeFileSync(manifestPath, JSON.stringify(signed, null, 2));
    return { manifestPath, pubHex };
  }

  it('accepts a freshly signed manifest pinned by publicKey', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const { pubHex } = buildSignedPlugin('demo.signed.ok', keyPair);

    const trustPath = path.join(tmp, 'trusted-plugins.json');
    writeFileSync(
      trustPath,
      JSON.stringify(
        { version: 1, plugins: { 'demo.signed.ok': { publicKey: pubHex } } },
        null,
        2,
      ),
    );

    const result = discoverFsPlugins({
      pluginsRoot: path.join(tmp, 'plugins'),
      trustFilePath: trustPath,
      strict: true,
    });
    expect(result.skipped).toEqual([]);
    expect(result.loaded.map(p => p.manifest.id)).toEqual(['demo.signed.ok']);
  });

  it('rejects a manifest whose body was modified after signing', () => {
    const keyPair = generateKeyPairSync('ed25519');
    const { manifestPath, pubHex } = buildSignedPlugin('demo.signed.tampered', keyPair);

    const tampered = JSON.parse(readFileSync(manifestPath, 'utf8'));
    tampered.description = 'oops';
    writeFileSync(manifestPath, JSON.stringify(tampered, null, 2));

    const trustPath = path.join(tmp, 'trusted-plugins.json');
    writeFileSync(
      trustPath,
      JSON.stringify(
        { version: 1, plugins: { 'demo.signed.tampered': { publicKey: pubHex } } },
        null,
        2,
      ),
    );

    const result = discoverFsPlugins({
      pluginsRoot: path.join(tmp, 'plugins'),
      trustFilePath: trustPath,
    });
    const skipped = result.skipped.find(s => s.id === 'demo.signed.tampered');
    expect(skipped).toBeDefined();
    expect(skipped!.reason).toMatch(/signature verification failed/);
  });

  it('rejects when the trust file pins the wrong publicKey', () => {
    const keyPair = generateKeyPairSync('ed25519');
    buildSignedPlugin('demo.signed.wrongkey', keyPair);

    const otherPair = generateKeyPairSync('ed25519');
    const otherPub = rawPubHex(otherPair.publicKey);

    const trustPath = path.join(tmp, 'trusted-plugins.json');
    writeFileSync(
      trustPath,
      JSON.stringify(
        { version: 1, plugins: { 'demo.signed.wrongkey': { publicKey: otherPub } } },
        null,
        2,
      ),
    );

    const result = discoverFsPlugins({
      pluginsRoot: path.join(tmp, 'plugins'),
      trustFilePath: trustPath,
    });
    const skipped = result.skipped.find(s => s.id === 'demo.signed.wrongkey');
    expect(skipped).toBeDefined();
    expect(skipped!.reason).toMatch(/publicKey does not match|signature verification failed/);
  });

  it('verifyManifestTrust agrees with the loader on every shipped manifest', () => {
    const trust = loadTrustFile(REPO_TRUST);
    for (const id of ['ai-video.example.hello-stage', 'ai-video.example.echo-provider']) {
      const manifestPath = path.join(REPO_PLUGINS, id.split('.').slice(-2).join('-'),
        'plugin.manifest.json');
      // The on-disk dirname uses a friendlier slug.
      const friendly = id === 'ai-video.example.hello-stage' ? 'hello-stage' : 'echo-provider';
      const fullPath = path.join(REPO_PLUGINS, friendly, 'plugin.manifest.json');
      const result = loadPluginManifestFromFile(fullPath);
      expect(result.valid, `${id} ${JSON.stringify(result.errors)}`).toBe(true);
      const verdict = verifyManifestTrust(result.manifest!, trust, { strict: true });
      expect(verdict, `${id} ${JSON.stringify(verdict)} ${manifestPath}`).toMatchObject({ ok: true });
    }
  });
});
