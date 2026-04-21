/**
 * globalKvStore.ts — process-wide KV store for "global" persistence
 * (resources, models, custom providers, selector cache).  Mirrors the
 * per-project ProjectKVStore (D-1 / D-2) so the four root-level
 * stores can share one sqlite handle when GLOBAL_STORE_BACKEND=sqlite
 * is set.
 *
 * Layout matrix:
 *
 *   backend=json   →  data/<key>.json (one file per store, identical
 *                     to the legacy layout used since v0)
 *   backend=sqlite →  data/global.db (single shared sqlite db, kv
 *                     table with `<key> → JSON value` rows)
 *
 * Each store (ModelStore, CustomProviderStore, SelectorService,
 * ResourceManager) is wired to accept an optional kv handle plus
 * key.  When the handle is omitted the store falls back to the legacy
 * file-path constructor for full backwards compatibility.
 */

import { join } from 'node:path';
import {
  JsonKVStore,
  SqliteKVStore,
  type ProjectKVStore,
} from './kvStore.js';

export interface CreateGlobalKVStoreOptions {
  backend?: 'json' | 'sqlite';
  /** SQLite db filename (relative to dataDir).  Default: global.db */
  dbFileName?: string;
}

/**
 * Build a global KV store rooted at `dataDir`.  The default backend is
 * read from `GLOBAL_STORE_BACKEND` (json | sqlite).  When unset we use
 * the legacy json layout so existing installs see no change.
 */
export function createGlobalKVStore(
  dataDir: string,
  options: CreateGlobalKVStoreOptions = {},
): ProjectKVStore {
  const backend = options.backend ?? (process.env.GLOBAL_STORE_BACKEND === 'sqlite' ? 'sqlite' : 'json');
  if (backend === 'sqlite') {
    return new SqliteKVStore(join(dataDir, options.dbFileName ?? 'global.db'));
  }
  return new JsonKVStore(dataDir);
}
