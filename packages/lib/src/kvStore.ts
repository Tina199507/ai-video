/**
 * kvStore.ts — pluggable key/value store interface for project + artifact
 * persistence.  Two implementations ship with the host:
 *
 *   - JsonKVStore     — wraps the existing atomic file writes inside
 *                       projects/<id>/<key>.json.  No behaviour change
 *                       for users on disk.
 *   - SqliteKVStore   — persists into a single SQLite database file
 *                       per project (better-sqlite3, WAL mode, with
 *                       transaction batching).
 *
 * Why an abstraction?  D-2 migrates ProjectStore to call into this
 * interface so the on-disk layout can switch under a feature flag.
 * Tests stub the interface directly to assert behaviour without
 * needing the real filesystem.
 *
 * Both implementations expose `tx(fn)` so the StageRunner can wrap a
 * full stage run in one atomic batch (D-2 step 2).  For the JSON
 * implementation `tx` is a noop that just runs `fn`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/* ---- Public interface ---- */

export interface ProjectKVStore {
  /** Backend identifier — useful for logging + assertions. */
  readonly backend: 'json' | 'sqlite';

  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): boolean;
  has(key: string): boolean;
  /** All keys in this project, in undefined order. */
  keys(): string[];

  /**
   * Run `fn` inside a single atomic batch.  Both backends guarantee
   * all-or-nothing on success/throw — the JSON implementation just
   * forwards because its writes are already atomic at the file level.
   */
  tx<T>(fn: () => T): T;

  /** Force-flush + release native handles (sqlite). Noop for JSON. */
  close(): void;
}

/* ---- JSON file backend ---- */

function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, filePath);
}

function safeKey(key: string): string {
  if (key.includes('..') || key.includes('/') || key.includes('\\')) {
    throw new Error(`invalid kv key: ${key}`);
  }
  return key.endsWith('.json') ? key : `${key}.json`;
}

export class JsonKVStore implements ProjectKVStore {
  readonly backend = 'json' as const;

  constructor(private readonly projectDir: string) {
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });
  }

  get<T>(key: string): T | undefined {
    const file = join(this.projectDir, safeKey(key));
    if (!existsSync(file)) return undefined;
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown): void {
    atomicWriteFileSync(join(this.projectDir, safeKey(key)), JSON.stringify(value, null, 2));
  }

  delete(key: string): boolean {
    const file = join(this.projectDir, safeKey(key));
    if (!existsSync(file)) return false;
    rmSync(file);
    return true;
  }

  has(key: string): boolean {
    return existsSync(join(this.projectDir, safeKey(key)));
  }

  keys(): string[] {
    if (!existsSync(this.projectDir)) return [];
    return readdirSync(this.projectDir)
      .filter(name => name.endsWith('.json'))
      .map(name => name.slice(0, -'.json'.length));
  }

  tx<T>(fn: () => T): T {
    return fn();
  }

  close(): void {
    // No native handles to release.
  }
}

/* ---- SQLite backend ---- */

/**
 * Lightweight wrapper around a per-project sqlite database.  We keep a
 * single `kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt
 * INTEGER NOT NULL)` table — that's enough for the artifact bag
 * ProjectStore needs today.  WAL journaling gives multi-reader /
 * single-writer concurrency without sacrificing durability.
 *
 * The native module is loaded lazily via dynamic import so test runs
 * that never construct the sqlite store don't pay the import cost,
 * and so packages that ship without better-sqlite3 (e.g. minimal
 * server builds) still load.
 */
export class SqliteKVStore implements ProjectKVStore {
  readonly backend = 'sqlite' as const;

  private db: SqliteDatabase;
  private getStmt: SqliteStmt;
  private setStmt: SqliteStmt;
  private deleteStmt: SqliteStmt;
  private hasStmt: SqliteStmt;
  private keysStmt: SqliteStmt;

  constructor(dbFile: string, options: { Database?: SqliteCtor } = {}) {
    const Ctor = options.Database ?? loadBetterSqlite3();
    if (!existsSync(dirname(dbFile))) mkdirSync(dirname(dbFile), { recursive: true });
    this.db = new Ctor(dbFile);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      ) WITHOUT ROWID;
    `);
    this.getStmt = this.db.prepare('SELECT value FROM kv WHERE key = ?');
    this.setStmt = this.db.prepare(
      'INSERT INTO kv (key, value, updatedAt) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt',
    );
    this.deleteStmt = this.db.prepare('DELETE FROM kv WHERE key = ?');
    this.hasStmt = this.db.prepare('SELECT 1 FROM kv WHERE key = ? LIMIT 1');
    this.keysStmt = this.db.prepare('SELECT key FROM kv');
  }

  get<T>(key: string): T | undefined {
    const row = this.getStmt.get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown): void {
    this.setStmt.run(key, JSON.stringify(value), Date.now());
  }

  delete(key: string): boolean {
    const info = this.deleteStmt.run(key) as { changes: number };
    return info.changes > 0;
  }

  has(key: string): boolean {
    return this.hasStmt.get(key) !== undefined;
  }

  keys(): string[] {
    return (this.keysStmt.all() as { key: string }[]).map(r => r.key);
  }

  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}

/* ---- minimal types so we don't pull better-sqlite3's type defs into the
       core type signature (keeps the import lazy and optional) ---- */

interface SqliteStmt {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

interface SqliteDatabase {
  pragma(s: string): unknown;
  exec(s: string): void;
  prepare(s: string): SqliteStmt;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

type SqliteCtor = new (file: string) => SqliteDatabase;

function loadBetterSqlite3(): SqliteCtor {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('better-sqlite3') as SqliteCtor;
  return m;
}

/* ---- Convenience factory ---- */

export interface CreateKVStoreOptions {
  backend?: 'json' | 'sqlite';
  /** When backend=sqlite, db file lives at this path. Default: <projectDir>/project.db */
  dbFileName?: string;
}

export function createProjectKVStore(
  projectDir: string,
  options: CreateKVStoreOptions = {},
): ProjectKVStore {
  const backend = options.backend ?? (process.env.PROJECT_STORE_BACKEND === 'sqlite' ? 'sqlite' : 'json');
  if (backend === 'sqlite') {
    const dbFile = join(projectDir, options.dbFileName ?? 'project.db');
    return new SqliteKVStore(dbFile);
  }
  return new JsonKVStore(projectDir);
}
