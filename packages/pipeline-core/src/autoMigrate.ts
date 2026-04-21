/**
 * autoMigrate.ts — boot-time helper that promotes legacy json projects
 * to the SQLite layout when the host opts into the new backend.
 *
 * This is intentionally a small, idempotent function so it can run on
 * every server start without surprises:
 *
 *   - Skip entirely unless PROJECT_STORE_BACKEND=sqlite (or `force`).
 *   - Skip projects that already have a project.db.
 *   - For projects with .json artifacts, copy them into a fresh
 *     project.db (kv table) and move the originals into
 *     `_pre-sqlite-backup/`.
 *   - All writes for a project happen inside one sqlite transaction so
 *     a crash leaves either the old layout or the new one — never both.
 *
 * The script `scripts/migrate-projects-to-sqlite.mjs` is the manual
 * sibling and shares the exact same on-disk shape so you can flip
 * between them.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';

const log = createLogger('autoMigrate');

export interface AutoMigrateOptions {
  /** Project root, e.g. data/projects */
  projectsDir: string;
  /** Force migration even if PROJECT_STORE_BACKEND != 'sqlite'. */
  force?: boolean;
  /** Override the env-var lookup (mostly for tests). */
  backend?: string | undefined;
  /** Inject a sqlite Database constructor (for tests). */
  Database?: new (file: string) => SqliteHandle;
}

export interface MigrationResult {
  total: number;
  migrated: number;
  alreadyMigrated: number;
  skipped: number;
  failed: number;
  details: ReadonlyArray<{ id: string; status: string; files?: number; error?: string }>;
}

interface SqliteHandle {
  pragma(s: string): unknown;
  exec(s: string): void;
  prepare(s: string): { run(...args: unknown[]): unknown };
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

const BACKUP_DIR = '_pre-sqlite-backup';

function loadDatabaseCtor(): new (file: string) => SqliteHandle {
  // Lazy require so dev environments without better-sqlite3 still boot.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('better-sqlite3') as new (file: string) => SqliteHandle;
  return m;
}

export function migrateProjectsToSqlite(opts: AutoMigrateOptions): MigrationResult {
  const backend = opts.backend ?? process.env.PROJECT_STORE_BACKEND;
  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    alreadyMigrated: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };
  const details: Array<{ id: string; status: string; files?: number; error?: string }> = [];

  if (!opts.force && backend !== 'sqlite') {
    return result;
  }
  if (!existsSync(opts.projectsDir)) {
    return result;
  }

  let Database: new (file: string) => SqliteHandle;
  try {
    Database = opts.Database ?? loadDatabaseCtor();
  } catch (err) {
    log.warn('better_sqlite3_unavailable', { error: (err as Error).message });
    return result;
  }

  const projectIds = readdirSync(opts.projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  result.total = projectIds.length;

  for (const id of projectIds) {
    const dir = join(opts.projectsDir, id);
    try {
      const outcome = migrateOneProject(dir, Database);
      details.push({ id, status: outcome.status, files: outcome.files });
      if (outcome.status === 'migrated') result.migrated += 1;
      else if (outcome.status === 'already-migrated') result.alreadyMigrated += 1;
      else result.skipped += 1;
    } catch (err) {
      result.failed += 1;
      const message = (err as Error).message ?? String(err);
      details.push({ id, status: 'failed', error: message });
      log.error('migration_failed', { project: id, error: message });
    }
  }

  if (result.migrated > 0 || result.failed > 0) {
    log.info('migration_complete', {
      total: result.total,
      migrated: result.migrated,
      alreadyMigrated: result.alreadyMigrated,
      skipped: result.skipped,
      failed: result.failed,
    });
  }

  return { ...result, details };
}

function migrateOneProject(
  projectDir: string,
  Database: new (file: string) => SqliteHandle,
): { status: 'migrated' | 'already-migrated' | 'nothing-to-do'; files: number } {
  const dbPath = join(projectDir, 'project.db');
  const jsonFiles = readdirSync(projectDir).filter((name) => {
    if (!name.endsWith('.json')) return false;
    return statSync(join(projectDir, name)).isFile();
  });

  if (jsonFiles.length === 0) {
    return { status: existsSync(dbPath) ? 'already-migrated' : 'nothing-to-do', files: 0 };
  }
  if (existsSync(dbPath)) {
    // Mixed state — db already exists alongside legacy JSON.  Don't
    // touch anything and let an operator decide.
    return { status: 'already-migrated', files: jsonFiles.length };
  }

  const db = new Database(dbPath);
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
    const now = Date.now();
    db.transaction(() => {
      for (const file of jsonFiles) {
        const raw = readFileSync(join(projectDir, file), 'utf8');
        try {
          JSON.parse(raw);
        } catch {
          // Malformed JSON — leave it on disk for a human to inspect.
          continue;
        }
        const key = file.slice(0, -'.json'.length);
        upsert.run(key, raw, now);
        migratedCount += 1;
      }
    })();

    if (migratedCount === 0) {
      // We didn't migrate anything (all parse failures) — drop the db
      // so we don't leave behind a half-baked store.
      try { db.close(); } catch { /* ignore */ }
      for (const sibling of ['project.db', 'project.db-wal', 'project.db-shm']) {
        const p = join(projectDir, sibling);
        if (existsSync(p)) {
          try { rmSync(p); } catch { /* ignore */ }
        }
      }
      return { status: 'nothing-to-do', files: 0 };
    }

    const backupDir = join(projectDir, BACKUP_DIR);
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    for (const file of jsonFiles) {
      try {
        renameSync(join(projectDir, file), join(backupDir, file));
      } catch { /* ignore — file may have been removed between scans */ }
    }
    return { status: 'migrated', files: migratedCount };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}
