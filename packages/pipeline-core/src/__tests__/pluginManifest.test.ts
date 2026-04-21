/**
 * pluginManifest.test.ts — verifies the manifest validator and the
 * canonical-JSON helper. The JSON Schema file is also smoke-validated
 * (parses, has the keys we depend on) so a typo there fails CI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validatePluginManifest,
  canonicalManifestForSigning,
  type PluginManifest,
} from '../pluginManifest.js';

const SCHEMA_PATH = join(process.cwd(), 'data/schemas/plugin-manifest.schema.json');

const VALID_MANIFEST: PluginManifest = {
  schemaVersion: 1,
  id: 'demo.video.translator',
  name: 'Demo Translator',
  version: '1.2.3',
  kind: 'stage',
  entry: 'dist/index.mjs',
  permissions: ['storage', 'logger'],
  stages: ['DEMO_TRANSLATE'],
};

describe('plugin-manifest.schema.json', () => {
  it('is valid JSON and declares the fields the loader depends on', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Record<string, unknown>;
    expect(schema.title).toBe('PluginManifest');
    const props = schema.properties as Record<string, unknown>;
    for (const k of ['schemaVersion', 'id', 'version', 'kind', 'entry', 'signature', 'permissions']) {
      expect(props[k]).toBeDefined();
    }
    expect(schema.required).toEqual(expect.arrayContaining(['schemaVersion', 'id', 'version', 'kind', 'entry']));
  });
});

describe('validatePluginManifest', () => {
  it('accepts a well-formed manifest', () => {
    const r = validatePluginManifest(VALID_MANIFEST);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.manifest?.id).toBe('demo.video.translator');
  });

  it('rejects non-object inputs', () => {
    expect(validatePluginManifest(null).valid).toBe(false);
    expect(validatePluginManifest(['x']).valid).toBe(false);
    expect(validatePluginManifest('string').valid).toBe(false);
  });

  it('requires schemaVersion === 1', () => {
    const bad = { ...VALID_MANIFEST, schemaVersion: 2 };
    const r = validatePluginManifest(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.find(e => e.path === 'schemaVersion')).toBeDefined();
  });

  it('rejects ids with invalid characters', () => {
    for (const bad of ['Demo', 'demo!', '-leading', 'trailing-', 'a..b', 'ab']) {
      const r = validatePluginManifest({ ...VALID_MANIFEST, id: bad });
      expect(r.valid, `id="${bad}" should be invalid`).toBe(false);
    }
  });

  it('rejects non-semver versions', () => {
    for (const bad of ['1', '1.0', 'v1.0.0', '1.0.0.0']) {
      const r = validatePluginManifest({ ...VALID_MANIFEST, version: bad });
      expect(r.valid, `version="${bad}" should be invalid`).toBe(false);
    }
  });

  it('rejects path-traversal entries', () => {
    for (const bad of ['../escape.mjs', '/abs/path.mjs', 'no.extension', 'good/../bad.mjs']) {
      const r = validatePluginManifest({ ...VALID_MANIFEST, entry: bad });
      expect(r.valid, `entry="${bad}" should be invalid`).toBe(false);
    }
  });

  it('rejects unknown permissions and duplicates', () => {
    const r1 = validatePluginManifest({ ...VALID_MANIFEST, permissions: ['fs.read', 'unknown-cap'] as unknown[] as never[] });
    expect(r1.valid).toBe(false);
    const r2 = validatePluginManifest({ ...VALID_MANIFEST, permissions: ['logger', 'logger'] });
    expect(r2.valid).toBe(false);
  });

  it('rejects signatures that are not 128-char hex / wrong algorithm', () => {
    const r1 = validatePluginManifest({
      ...VALID_MANIFEST,
      signature: { algorithm: 'rsa' as unknown as 'ed25519', value: 'a'.repeat(128) },
    });
    expect(r1.valid).toBe(false);

    const r2 = validatePluginManifest({
      ...VALID_MANIFEST,
      signature: { algorithm: 'ed25519', value: 'A'.repeat(128) }, // uppercase
    });
    expect(r2.valid).toBe(false);

    const r3 = validatePluginManifest({
      ...VALID_MANIFEST,
      signature: { algorithm: 'ed25519', value: 'a'.repeat(127) }, // wrong length
    });
    expect(r3.valid).toBe(false);
  });

  it('accepts a valid signature block', () => {
    const r = validatePluginManifest({
      ...VALID_MANIFEST,
      signature: {
        algorithm: 'ed25519',
        value: 'a'.repeat(128),
        publicKey: 'b'.repeat(64),
      },
    });
    expect(r.valid).toBe(true);
  });
});

describe('canonicalManifestForSigning', () => {
  it('strips the signature field and emits stable key order', () => {
    const a: PluginManifest = {
      ...VALID_MANIFEST,
      signature: { algorithm: 'ed25519', value: 'a'.repeat(128) },
    };
    const b: PluginManifest = {
      // same fields, different declaration order
      kind: 'stage',
      version: '1.2.3',
      stages: ['DEMO_TRANSLATE'],
      permissions: ['storage', 'logger'],
      schemaVersion: 1,
      entry: 'dist/index.mjs',
      name: 'Demo Translator',
      id: 'demo.video.translator',
    };
    const ca = canonicalManifestForSigning(a);
    const cb = canonicalManifestForSigning(b);
    expect(ca).toBe(cb);
    expect(ca.includes('signature')).toBe(false);
  });

  it('omits undefined fields entirely', () => {
    const m: PluginManifest = {
      schemaVersion: 1,
      id: 'demo.x',
      version: '0.0.1',
      kind: 'service',
      entry: 'index.mjs',
    };
    const c = canonicalManifestForSigning(m);
    expect(c).toBe(JSON.stringify({
      entry: 'index.mjs',
      id: 'demo.x',
      kind: 'service',
      schemaVersion: 1,
      version: '0.0.1',
    }));
  });
});
