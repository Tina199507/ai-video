/**
 * autoMigrateGlobal.ts — boot-time helper that promotes the four
 * known root-level JSON stores into the shared SQLite database
 * introduced by D-3.
 *
 * Stores migrated:
 *   data/resources.json        → kv key "resources"
 *   data/models.json           → kv key "models"
 *   data/providers.json        → kv key "providers"
 *   data/selector-cache.json   → kv key "selector-cache"
 *
 * Behavior:
 *   - Skip entirely unless GLOBAL_STORE_BACKEND=sqlite (or `force`).
 *   - Idempotent: existing rows in `kv` are not clobbered when the
 *     legacy file is gone.
 *   - All-or-nothing: writes happen inside one sqlite transaction;
 *     originals are moved into `_pre-sqlite-backup-global/` only
 *     after the transaction commits.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('autoMigrateGlobal');

const BACKUP_DIR = '_pre-sqlite-backup-global';
const DB_FILE = 'global.db';
const KEYS = ['resources', 'models', 'providers', 'selector-cache'] as const;

export interface AutoMigrateGlobalOptions {
  dataDir: string;
  force?: boolean;
  backend?: string | undefined;
  Database?: new (file: string) => SqliteHandle;
}

export interface GlobalMigrationResult {
  ran: boolean;
  migrated: number;
  skipped: number;
  failed: number;
  details: ReadonlyArray<{ key: string; status: string; error?: string }>;
}

interface SqliteHandle {
  pragma(s: string): unknown;
  exec(s: string): void;
  prepare(s: string): { run(...args: unknown[]): unknown };
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

function loadDatabaseCtor(): new (file: string) => SqliteHandle {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('better-sqlite3') as new (file: string) => SqliteHandle;
}

export function migrateGlobalStoresToSqlite(opts: AutoMigrateGlobalOptions): GlobalMigrationResult {
  const backend = opts.backend ?? process.env.GLOBAL_STORE_BACKEND;
  const out: GlobalMigrationResult = {
    ran: false, migrated: 0, skipped: 0, failed: 0, details: [],
  };
  const details: Array<{ key: string; status: string; error?: string }> = [];

  if (!opts.force && backend !== 'sqlite') {
    return out;
  }
  if (!existsSync(opts.dataDir)) return out;

  const candidates = KEYS
    .map((k) => ({ key: k, file: join(opts.dataDir, `${k}.json`) }))
    .filter(({ file }) => existsSync(file) && statSync(file).isFile());

  if (candidates.length === 0) {
    return out;
  }

  let Database: new (file: string) => SqliteHandle;
  try {
    Database = opts.Database ?? loadDatabaseCtor();
  } catch (err) {
    log.warn('better_sqlite3_unavailable', { error: (err as Error).message });
    return out;
  }

  const dbPath = join(opts.dataDir, DB_FILE);
  let db: SqliteHandle;
  try {
    db = new Database(dbPath);
  } catch (err) {
    log.error('failed_to_open_global_db', { error: (err as Error).message, path: dbPath });
    return { ...out, ran: true, failed: 1 };
  }

  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    ) WITHOUT ROWID;`);
    const upsert = db.prepare(
      'INSERT INTO kv(key,value,updatedAt) VALUES(?,?,?) ' +
      'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt',
    );

    let migratedCount = 0;
    db.transaction(() => {
      const now = Date.now();
      for (const { key, file } of candidates) {
        const raw = readFileSync(file, 'utf8');
        try {
          JSON.parse(raw);
        } catch (err) {
          details.push({ key, status: 'parse-error', error: (err as Error).message });
          continue;
        }
        upsert.run(key, raw, now);
        details.push({ key, status: 'migrated' });
        migratedCount += 1;
      }
    })();

    if (migratedCount === 0) {
      // Nothing landed — clean up the empty db so we don't strand a
      // dummy file on the operator's disk.
      try { db.close(); } catch { /* ignore */ }
      try { if (existsSync(dbPath)) rmSync(dbPath); } catch { /* ignore */ }
      out.ran = true;
      out.skipped = candidates.length;
      return { ...out, details };
    }

    const backupDir = join(opts.dataDir, BACKUP_DIR);
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    for (const { key, file } of candidates) {
      try {
        renameSync(file, join(backupDir, `${key}.json`));
      } catch { /* ignore */ }
    }

    out.ran = true;
    out.migrated = migratedCount;
    out.skipped = candidates.length - migratedCount;
    log.info('global_migration_complete', {
      migrated: out.migrated,
      skipped: out.skipped,
    });
    return { ...out, details };
  } catch (err) {
    log.error('global_migration_failed', { error: (err as Error).message });
    return { ...out, ran: true, failed: 1, details };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}
