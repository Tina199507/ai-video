/**
 * pluginManifest.ts — type + validator for the on-disk plugin manifest.
 *
 * The JSON Schema lives at data/schemas/plugin-manifest.schema.json; we
 * mirror it here as a TypeScript type plus a small zero-dependency
 * validator so the loader can cheaply reject malformed manifests
 * before touching any plugin code on disk.
 *
 * The validator deliberately covers the high-value subset of the
 * schema (required fields, regex shape, enum membership) — for any
 * future schema extensions, prefer adding a check here over assuming
 * the loader will catch it.
 */

import { readFileSync } from 'node:fs';

/* ---- Public types ---- */

export type PluginKind = 'stage' | 'provider' | 'service';

export type PluginPermission =
  | 'fs.read'
  | 'fs.write'
  | 'net'
  | 'exec'
  | 'ffmpeg'
  | 'tts'
  | 'storage'
  | 'cache'
  | 'logger';

export interface PluginSignature {
  algorithm: 'ed25519';
  /** Hex-encoded 64-byte signature. */
  value: string;
  /** Hex-encoded 32-byte public key (optional — may be looked up by id). */
  publicKey?: string;
}

export interface PluginManifest {
  schemaVersion: 1;
  id: string;
  name?: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  kind: PluginKind;
  entry: string;
  engines?: {
    aiVideo?: string;
    node?: string;
  };
  permissions?: PluginPermission[];
  stages?: string[];
  providers?: string[];
  signature?: PluginSignature;
  metadata?: Record<string, unknown>;
}

export interface ManifestValidationError {
  path: string;
  message: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  manifest?: PluginManifest;
  errors: ManifestValidationError[];
}

/* ---- Constants (kept in sync with the JSON Schema file) ---- */

const ID_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9](\.[a-z0-9][a-z0-9-]*[a-z0-9])*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const ENTRY_RE = /^(?!\.\.\/)(?!\/)[^\0]+\.(mjs|js|cjs)$/;
const SIG_HEX_RE = /^[0-9a-f]{128}$/;
const PUBKEY_HEX_RE = /^[0-9a-f]{64}$/;

const VALID_KINDS: PluginKind[] = ['stage', 'provider', 'service'];

const VALID_PERMISSIONS: PluginPermission[] = [
  'fs.read', 'fs.write', 'net', 'exec', 'ffmpeg', 'tts',
  'storage', 'cache', 'logger',
];

/* ---- Validator ---- */

export function validatePluginManifest(input: unknown): ManifestValidationResult {
  const errors: ManifestValidationError[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: [{ path: '', message: `expected object, got ${Array.isArray(input) ? 'array' : typeof input}` }],
    };
  }

  const m = input as Record<string, unknown>;

  // schemaVersion
  if (m.schemaVersion !== 1) {
    errors.push({ path: 'schemaVersion', message: 'must be the literal integer 1' });
  }

  // id
  if (typeof m.id !== 'string') {
    errors.push({ path: 'id', message: 'is required and must be a string' });
  } else if (!ID_RE.test(m.id) || m.id.length < 3 || m.id.length > 64) {
    errors.push({
      path: 'id',
      message: 'must match /^[a-z0-9][a-z0-9-]*[a-z0-9](\\.[a-z0-9][a-z0-9-]*[a-z0-9])*$/ and be 3..64 chars',
    });
  }

  // version
  if (typeof m.version !== 'string') {
    errors.push({ path: 'version', message: 'is required and must be a string' });
  } else if (!SEMVER_RE.test(m.version)) {
    errors.push({ path: 'version', message: 'must be valid semver (e.g. 1.2.3 or 1.2.3-beta.1)' });
  }

  // kind
  if (typeof m.kind !== 'string') {
    errors.push({ path: 'kind', message: 'is required and must be a string' });
  } else if (!VALID_KINDS.includes(m.kind as PluginKind)) {
    errors.push({ path: 'kind', message: `must be one of: ${VALID_KINDS.join(', ')}` });
  }

  // entry
  if (typeof m.entry !== 'string') {
    errors.push({ path: 'entry', message: 'is required and must be a string' });
  } else {
    if (!ENTRY_RE.test(m.entry)) {
      errors.push({
        path: 'entry',
        message: 'must be a relative path ending in .mjs/.js/.cjs (no leading / or ../)',
      });
    }
    if (m.entry.includes('..')) {
      errors.push({ path: 'entry', message: 'must not contain `..` segments' });
    }
  }

  // optional name / description / author / homepage
  if (m.name !== undefined && typeof m.name !== 'string') {
    errors.push({ path: 'name', message: 'must be a string' });
  }
  if (m.description !== undefined && (typeof m.description !== 'string' || m.description.length > 512)) {
    errors.push({ path: 'description', message: 'must be a string ≤ 512 chars' });
  }
  if (m.author !== undefined && typeof m.author !== 'string') {
    errors.push({ path: 'author', message: 'must be a string' });
  }

  // permissions
  if (m.permissions !== undefined) {
    if (!Array.isArray(m.permissions)) {
      errors.push({ path: 'permissions', message: 'must be an array of strings' });
    } else {
      const seen = new Set<string>();
      for (const [i, p] of m.permissions.entries()) {
        if (typeof p !== 'string') {
          errors.push({ path: `permissions[${i}]`, message: 'must be a string' });
          continue;
        }
        if (!VALID_PERMISSIONS.includes(p as PluginPermission)) {
          errors.push({
            path: `permissions[${i}]`,
            message: `unknown permission "${p}". Allowed: ${VALID_PERMISSIONS.join(', ')}`,
          });
        }
        if (seen.has(p)) {
          errors.push({ path: `permissions[${i}]`, message: `duplicate permission "${p}"` });
        }
        seen.add(p);
      }
    }
  }

  // stages / providers
  for (const arrField of ['stages', 'providers'] as const) {
    const v = m[arrField];
    if (v === undefined) continue;
    if (!Array.isArray(v)) {
      errors.push({ path: arrField, message: 'must be an array of strings' });
      continue;
    }
    const seen = new Set<string>();
    for (const [i, item] of v.entries()) {
      if (typeof item !== 'string' || item.length === 0 || item.length > 64) {
        errors.push({ path: `${arrField}[${i}]`, message: 'must be a non-empty string ≤ 64 chars' });
      } else if (seen.has(item)) {
        errors.push({ path: `${arrField}[${i}]`, message: `duplicate "${item}"` });
      }
      if (typeof item === 'string') seen.add(item);
    }
  }

  // signature
  if (m.signature !== undefined) {
    if (m.signature === null || typeof m.signature !== 'object' || Array.isArray(m.signature)) {
      errors.push({ path: 'signature', message: 'must be an object' });
    } else {
      const sig = m.signature as Record<string, unknown>;
      if (sig.algorithm !== 'ed25519') {
        errors.push({ path: 'signature.algorithm', message: 'must equal "ed25519"' });
      }
      if (typeof sig.value !== 'string' || !SIG_HEX_RE.test(sig.value)) {
        errors.push({ path: 'signature.value', message: 'must be a 128-char lowercase hex string' });
      }
      if (sig.publicKey !== undefined && (typeof sig.publicKey !== 'string' || !PUBKEY_HEX_RE.test(sig.publicKey))) {
        errors.push({ path: 'signature.publicKey', message: 'must be a 64-char lowercase hex string' });
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, manifest: m as unknown as PluginManifest, errors: [] };
}

/* ---- File helpers ---- */

export function loadPluginManifestFromFile(path: string): ManifestValidationResult {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return {
      valid: false,
      errors: [{
        path: '',
        message: `could not read manifest at ${path}: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      valid: false,
      errors: [{
        path: '',
        message: `manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
  return validatePluginManifest(parsed);
}

/**
 * Canonical JSON for signing — sorts keys deterministically and
 * excludes the `signature` field. Both sides of an ed25519 sign /
 * verify must agree on this representation, so the function lives
 * here in the shared module.
 */
export function canonicalManifestForSigning(manifest: PluginManifest): string {
  const { signature: _omit, ...rest } = manifest as PluginManifest & { signature?: PluginSignature };
  return stableStringify(rest);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v)).join(',') + '}';
}
