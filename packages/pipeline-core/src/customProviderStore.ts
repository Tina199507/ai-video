/* ------------------------------------------------------------------ */
/*  CustomProviderStore - CRUD for user-added AI providers            */
/*                                                                     */
/*  Backed by either                                                   */
/*    - the legacy JSON file at `savePath` (default), or              */
/*    - a shared `ProjectKVStore` (e.g. data/global.db) when the      */
/*      caller injects one (D-3 SQLite consolidation).                */
/* ------------------------------------------------------------------ */

import { basename, dirname } from 'node:path';
import { JsonKVStore, type ProjectKVStore } from '@ai-video/pipeline-core/libFacade.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import { BUILTIN_PROVIDER_IDS, BUILTIN_PROVIDER_LABELS } from './providers.js';
import type { ProviderSelectors, ProviderInfo } from './sharedTypes.js';

const log = createLogger('CustomProviderStore');

export interface CustomProviderEntry {
  label: string;
  selectors: ProviderSelectors;
}

export interface CustomProviderStoreOptions {
  kv?: ProjectKVStore;
  key?: string;
}

export class CustomProviderStore {
  private providers: Record<string, CustomProviderEntry> = {};
  private readonly kv: ProjectKVStore;
  private readonly kvKey: string;
  private readonly savePath: string;

  constructor(savePath: string, options: CustomProviderStoreOptions = {}) {
    this.savePath = savePath;
    if (options.kv) {
      this.kv = options.kv;
      this.kvKey = options.key ?? defaultKey(savePath, 'providers');
    } else if (savePath) {
      this.kv = new JsonKVStore(dirname(savePath));
      this.kvKey = defaultKey(savePath, 'providers');
    } else {
      this.kv = NULL_KV;
      this.kvKey = '';
    }
    this.load();
  }

  private load(): void {
    if (!this.kvKey) return;
    try {
      this.providers = this.kv.get<Record<string, CustomProviderEntry>>(this.kvKey) ?? {};
    } catch (err) {
      log.warn('corrupt custom provider store', { err: String(err), path: this.savePath });
      this.providers = {};
    }
  }

  persist(): void {
    if (!this.kvKey) return;
    try {
      this.kv.set(this.kvKey, this.providers);
    } catch (err) {
      log.warn('failed to persist custom providers', { err: String(err), path: this.savePath });
    }
  }

  get(id: string): CustomProviderEntry | undefined {
    return this.providers[id];
  }

  set(id: string, entry: CustomProviderEntry): void {
    this.providers[id] = entry;
    this.persist();
  }

  remove(id: string): boolean {
    if (!this.providers[id]) return false;
    delete this.providers[id];
    this.persist();
    return true;
  }

  has(id: string): boolean {
    return id in this.providers;
  }

  /** Full provider list including builtins. */
  getProviderList(): ProviderInfo[] {
    const builtins: ProviderInfo[] = BUILTIN_PROVIDER_IDS.map((id) => ({
      id,
      label: BUILTIN_PROVIDER_LABELS[id],
      builtin: true,
    }));
    const custom: ProviderInfo[] = Object.entries(this.providers).map(([id, cfg]) => ({
      id,
      label: cfg.label,
      builtin: false,
    }));
    return [...builtins, ...custom];
  }
}

function defaultKey(savePath: string, fallback: string): string {
  if (!savePath) return fallback;
  return basename(savePath).replace(/\.json$/i, '') || fallback;
}

const NULL_KV: ProjectKVStore = {
  backend: 'json',
  get: () => undefined,
  set: () => undefined,
  delete: () => false,
  has: () => false,
  keys: () => [],
  tx: <T>(fn: () => T) => fn(),
  close: () => undefined,
};
