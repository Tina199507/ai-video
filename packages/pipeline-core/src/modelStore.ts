/* ------------------------------------------------------------------ */
/*  ModelStore - persists auto-detected model lists per provider      */
/*                                                                     */
/*  Backed by either                                                   */
/*    - the legacy JSON file at `savePath` (default), or              */
/*    - a shared `ProjectKVStore` (e.g. data/global.db) when the      */
/*      caller injects one (D-3 SQLite consolidation).                */
/* ------------------------------------------------------------------ */

import { basename, dirname } from 'node:path';
import { JsonKVStore, type ProjectKVStore } from '@ai-video/pipeline-core/libFacade.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import type { ProviderId, ModelOption } from './sharedTypes.js';

const log = createLogger('ModelStore');

export interface ModelStoreOptions {
  /** Optional shared KV. Falls back to a JSON store rooted at dirname(savePath). */
  kv?: ProjectKVStore;
  /** Key under which the entire blob lives in the KV. Default: `models`. */
  key?: string;
}

export class ModelStore {
  private models: Partial<Record<ProviderId, ModelOption[]>> = {};
  private readonly kv: ProjectKVStore;
  private readonly kvKey: string;
  private readonly savePath: string;

  constructor(savePath: string, options: ModelStoreOptions = {}) {
    this.savePath = savePath;
    if (options.kv) {
      this.kv = options.kv;
      this.kvKey = options.key ?? defaultKey(savePath, 'models');
    } else if (savePath) {
      this.kv = new JsonKVStore(dirname(savePath));
      this.kvKey = defaultKey(savePath, 'models');
    } else {
      // Empty path => "in-memory" fallback (legacy test mode).
      this.kv = NULL_KV;
      this.kvKey = '';
    }
    this.load();
  }

  private load(): void {
    if (!this.kvKey) return;
    try {
      this.models = this.kv.get<Partial<Record<ProviderId, ModelOption[]>>>(this.kvKey) ?? {};
    } catch (err) {
      log.warn('corrupt model store', { err: String(err), path: this.savePath });
      this.models = {};
    }
  }

  private persist(): void {
    if (!this.kvKey) return;
    try {
      this.kv.set(this.kvKey, this.models);
    } catch (err) {
      log.warn('failed to persist models', { err: String(err), path: this.savePath });
    }
  }

  get(provider: ProviderId): ModelOption[] | undefined {
    return this.models[provider];
  }

  set(provider: ProviderId, models: ModelOption[]): void {
    this.models[provider] = models;
    this.persist();
  }

  getAll(): Partial<Record<ProviderId, ModelOption[]>> {
    return { ...this.models };
  }

  hasModels(provider: ProviderId): boolean {
    return (this.models[provider]?.length ?? 0) > 0;
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
