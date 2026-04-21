/* ------------------------------------------------------------------ */
/*  Provider Presets — ready-to-use SiteAutomationConfig templates     */
/*                                                                     */
/*  Presets live in JSON (`data/site-automation-presets.json`) so      */
/*  adding / tuning a site no longer requires editing TypeScript.      */
/*  User tweaks can be written to                                      */
/*  `<data-dir>/site-automation-overrides.json`, which is shallow-     */
/*  merged over the bundled defaults per provider id.                  */
/* ------------------------------------------------------------------ */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SiteAutomationConfig, QueueDetectionConfig } from './runtimeTypes.js';
import { resolveDataDir } from './dataDir.js';

/* ---- Queue detection rules loaded from JSON data sources ---- */

/**
 * Load queue-detection presets from JSON data files.
 *
 * Search order:
 * 1. User data directory (overrides) — `queue-detection-overrides.json`
 * 2. User data directory — `queue-detection-presets.json`
 * 3. Bundled `data/queue-detection-presets.json` — shipped defaults
 *
 * User overrides are merged on top of bundled defaults per provider.
 */
function loadQueueDetectionPresets(): Record<string, QueueDetectionConfig> {
  const BUNDLED_FILE = 'queue-detection-presets.json';
  const OVERRIDE_FILE = 'queue-detection-overrides.json';

  let bundled: Record<string, QueueDetectionConfig> = {};
  let overrides: Record<string, QueueDetectionConfig> = {};

  const dataDir = resolveDataDir();
  let bundledPath = join(dataDir, BUNDLED_FILE);
  if (!existsSync(bundledPath)) {
    bundledPath = resolve('data', BUNDLED_FILE);
  }
  if (existsSync(bundledPath)) {
    try { bundled = JSON.parse(readFileSync(bundledPath, 'utf-8')); } catch { /* ignore */ }
  }

  const overridePath = join(dataDir, OVERRIDE_FILE);
  if (existsSync(overridePath)) {
    try { overrides = JSON.parse(readFileSync(overridePath, 'utf-8')); } catch { /* ignore */ }
  }

  return { ...bundled, ...overrides };
}

let _queuePresetCache: Record<string, QueueDetectionConfig> | null = null;

/** Get merged queue detection presets (cached). */
export function getQueueDetectionPresets(): Record<string, QueueDetectionConfig> {
  if (!_queuePresetCache) _queuePresetCache = loadQueueDetectionPresets();
  return _queuePresetCache;
}

/** Invalidate cache so next access re-reads from disk. */
export function invalidateQueueDetectionCache(): void {
  _queuePresetCache = null;
}

/**
 * Save user queue detection overrides to the data directory.
 * Merges the given entries into the existing overrides file.
 */
export function saveQueueDetectionOverrides(overrides: Record<string, QueueDetectionConfig>): void {
  const dataDir = resolveDataDir();
  const overridePath = join(dataDir, 'queue-detection-overrides.json');

  let existing: Record<string, QueueDetectionConfig> = {};
  if (existsSync(overridePath)) {
    try { existing = JSON.parse(readFileSync(overridePath, 'utf-8')); } catch { /* ignore */ }
  }

  const merged = { ...existing, ...overrides };
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(overridePath, JSON.stringify(merged, null, 2), 'utf-8');
  invalidateQueueDetectionCache();
}

/**
 * Delete a provider's queue detection override.
 * Returns true if an entry was removed.
 */
export function deleteQueueDetectionOverride(providerId: string): boolean {
  const dataDir = resolveDataDir();
  const overridePath = join(dataDir, 'queue-detection-overrides.json');
  if (!existsSync(overridePath)) return false;

  let existing: Record<string, QueueDetectionConfig> = {};
  try { existing = JSON.parse(readFileSync(overridePath, 'utf-8')); } catch { return false; }

  if (!(providerId in existing)) return false;
  delete existing[providerId];
  writeFileSync(overridePath, JSON.stringify(existing, null, 2), 'utf-8');
  invalidateQueueDetectionCache();
  return true;
}

/* ================================================================== */
/*  Site automation preset loader                                     */
/* ================================================================== */

const BUNDLED_PRESETS_FILE = 'site-automation-presets.json';
const PRESET_OVERRIDES_FILE = 'site-automation-overrides.json';

/**
 * Shallow-merge a user override onto a bundled preset. For known nested
 * objects (`selectors`, `timing`, `capabilities`, `dailyLimits`,
 * `queueDetection`) we merge field-by-field so a partial override does not
 * wipe out the rest of the shipped defaults.
 */
function mergePreset(
  base: SiteAutomationConfig,
  override: Partial<SiteAutomationConfig>,
): SiteAutomationConfig {
  if (!override || Object.keys(override).length === 0) return base;
  const merged: SiteAutomationConfig = { ...base, ...override };
  if (override.selectors) merged.selectors = { ...base.selectors, ...override.selectors };
  if (override.timing) merged.timing = { ...base.timing, ...override.timing };
  if (override.capabilities) merged.capabilities = { ...base.capabilities, ...override.capabilities };
  if (override.dailyLimits || base.dailyLimits) {
    merged.dailyLimits = { ...(base.dailyLimits ?? {}), ...(override.dailyLimits ?? {}) };
  }
  if (override.queueDetection || base.queueDetection) {
    merged.queueDetection = { ...(base.queueDetection ?? {}), ...(override.queueDetection ?? {}) };
  }
  return merged;
}

function loadSiteAutomationPresets(): Record<string, SiteAutomationConfig> {
  const dataDir = resolveDataDir();

  let bundled: Record<string, SiteAutomationConfig> = {};
  let bundledPath = join(dataDir, BUNDLED_PRESETS_FILE);
  if (!existsSync(bundledPath)) {
    bundledPath = resolve('data', BUNDLED_PRESETS_FILE);
  }
  if (existsSync(bundledPath)) {
    try {
      bundled = JSON.parse(readFileSync(bundledPath, 'utf-8')) as Record<string, SiteAutomationConfig>;
    } catch { /* ignore — fall back to empty */ }
  }

  let overrides: Record<string, Partial<SiteAutomationConfig>> = {};
  const overridePath = join(dataDir, PRESET_OVERRIDES_FILE);
  if (existsSync(overridePath)) {
    try {
      overrides = JSON.parse(readFileSync(overridePath, 'utf-8')) as Record<string, Partial<SiteAutomationConfig>>;
    } catch { /* ignore invalid overrides */ }
  }

  const merged: Record<string, SiteAutomationConfig> = {};
  for (const [id, cfg] of Object.entries(bundled)) {
    merged[id] = mergePreset(cfg, overrides[id] ?? {});
  }
  for (const [id, override] of Object.entries(overrides)) {
    if (!(id in merged)) {
      merged[id] = override as SiteAutomationConfig;
    }
  }
  return merged;
}

let _presetCache: Record<string, SiteAutomationConfig> | null = null;

function getLoadedPresets(): Record<string, SiteAutomationConfig> {
  if (!_presetCache) _presetCache = loadSiteAutomationPresets();
  return _presetCache;
}

/**
 * Invalidate the preset cache — the next read will hit the JSON file(s).
 * Mainly used by tests and by settings endpoints after saving overrides.
 */
export function invalidatePresetCache(): void {
  _presetCache = null;
}

/**
 * Persist a partial preset override for a given provider id.
 * Overrides are merged field-by-field into the existing overrides file.
 */
export function savePresetOverride(id: string, override: Partial<SiteAutomationConfig>): void {
  const dataDir = resolveDataDir();
  const overridePath = join(dataDir, PRESET_OVERRIDES_FILE);
  let existing: Record<string, Partial<SiteAutomationConfig>> = {};
  if (existsSync(overridePath)) {
    try {
      existing = JSON.parse(readFileSync(overridePath, 'utf-8')) as Record<string, Partial<SiteAutomationConfig>>;
    } catch { /* ignore */ }
  }
  existing[id] = override;
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(overridePath, JSON.stringify(existing, null, 2), 'utf-8');
  invalidatePresetCache();
}

/**
 * All built-in presets keyed by a stable identifier.
 *
 * Implemented as a live Proxy over the JSON-loaded registry so existing
 * callers can keep using `PROVIDER_PRESETS[id]`, `Object.keys`,
 * `Object.entries`, etc.
 */
export const PROVIDER_PRESETS: Readonly<Record<string, SiteAutomationConfig>> = new Proxy(
  {} as Record<string, SiteAutomationConfig>,
  {
    get(_target, key: string | symbol) {
      if (typeof key !== 'string') return undefined;
      return getLoadedPresets()[key];
    },
    has(_target, key) {
      if (typeof key !== 'string') return false;
      return key in getLoadedPresets();
    },
    ownKeys() {
      return Reflect.ownKeys(getLoadedPresets());
    },
    getOwnPropertyDescriptor(_target, key) {
      if (typeof key !== 'string') return undefined;
      const value = getLoadedPresets()[key];
      if (value === undefined) return undefined;
      return { configurable: true, enumerable: true, writable: false, value };
    },
    set() {
      // The preset registry is read-only; user tweaks must go through
      // savePresetOverride().
      return false;
    },
    deleteProperty() {
      return false;
    },
  },
);

/**
 * Get a list of all available preset IDs and labels, grouped by type.
 */
export function listPresets(): Array<{ id: string; label: string; type: string }> {
  return Object.values(getLoadedPresets()).map((p) => ({
    id: p.id,
    label: p.label,
    type: p.type,
  }));
}

/**
 * Get a deep copy of a preset by ID, ready for customisation.
 * Merges queue detection rules from JSON data sources.
 */
export function getPreset(id: string): SiteAutomationConfig | undefined {
  const preset = getLoadedPresets()[id];
  if (!preset) return undefined;
  const copy = JSON.parse(JSON.stringify(preset)) as SiteAutomationConfig;
  const queuePresets = getQueueDetectionPresets();
  if (queuePresets[id]) {
    copy.queueDetection = queuePresets[id];
  }
  return copy;
}

/**
 * Try to match a URL to an existing preset by comparing hostnames.
 * Returns the matched preset (deep copy) or undefined.
 */
export function matchPresetByUrl(url: string): SiteAutomationConfig | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const preset of Object.values(getLoadedPresets())) {
      const presetHost = new URL(preset.siteUrl).hostname.replace(/^www\./, '');
      if (host === presetHost) {
        const copy = JSON.parse(JSON.stringify(preset)) as SiteAutomationConfig;
        const queuePresets = getQueueDetectionPresets();
        if (queuePresets[preset.id]) {
          copy.queueDetection = queuePresets[preset.id];
        }
        return copy;
      }
    }
  } catch { /* invalid URL */ }
  return undefined;
}
