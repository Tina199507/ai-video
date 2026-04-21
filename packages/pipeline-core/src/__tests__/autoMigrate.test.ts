/**
 * autoMigrate.test.ts — unit tests for the boot-time JSON→SQLite
 * project store migrator (D-2).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { migrateProjectsToSqlite } from '../autoMigrate.js';
import { SqliteKVStore } from '@ai-video/lib/kvStore.js';

describe('migrateProjectsToSqlite', () => {
  let root: string;
  let projectsDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'auto-migrate-'));
    projectsDir = join(root, 'projects');
    mkdirSync(projectsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function seedProject(id: string, files: Record<string, unknown>): string {
    const dir = join(projectsDir, id);
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, name), JSON.stringify(body, null, 2));
    }
    return dir;
  }

  it('is a noop when neither force nor backend=sqlite is set', () => {
    seedProject('p1', { 'project.json': { id: 'p1' } });
    const result = migrateProjectsToSqlite({ projectsDir, backend: undefined });
    expect(result.total).toBe(0);
    expect(existsSync(join(projectsDir, 'p1', 'project.json'))).toBe(true);
    expect(existsSync(join(projectsDir, 'p1', 'project.db'))).toBe(false);
  });

  it('migrates all .json artifacts into project.db when forced', () => {
    const dir = seedProject('p1', {
      'project.json': { id: 'p1', topic: 'hello' },
      'scenes.json': [{ id: 's1' }],
      'script.json': { text: 'hi' },
    });

    const result = migrateProjectsToSqlite({ projectsDir, force: true, Database });
    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(0);

    expect(existsSync(join(dir, 'project.db'))).toBe(true);
    expect(existsSync(join(dir, 'project.json'))).toBe(false);
    expect(existsSync(join(dir, '_pre-sqlite-backup', 'project.json'))).toBe(true);
    expect(existsSync(join(dir, '_pre-sqlite-backup', 'scenes.json'))).toBe(true);

    const kv = new SqliteKVStore(join(dir, 'project.db'));
    try {
      expect(kv.get<{ topic: string }>('project')?.topic).toBe('hello');
      expect(kv.get<unknown[]>('scenes')).toEqual([{ id: 's1' }]);
      expect(kv.get<{ text: string }>('script')?.text).toBe('hi');
    } finally {
      kv.close();
    }
  });

  it('is idempotent — second run sees already-migrated', () => {
    seedProject('p1', { 'project.json': { id: 'p1' } });
    const first = migrateProjectsToSqlite({ projectsDir, force: true, Database });
    const second = migrateProjectsToSqlite({ projectsDir, force: true, Database });
    expect(first.migrated).toBe(1);
    expect(second.migrated).toBe(0);
    expect(second.alreadyMigrated).toBe(1);
  });

  it('runs via the env-var trigger', () => {
    seedProject('p1', { 'project.json': { id: 'p1' } });
    const result = migrateProjectsToSqlite({ projectsDir, backend: 'sqlite', Database });
    expect(result.migrated).toBe(1);
  });

  it('skips projects that are pure noise', () => {
    mkdirSync(join(projectsDir, 'empty'), { recursive: true });
    const result = migrateProjectsToSqlite({ projectsDir, force: true, Database });
    expect(result.total).toBe(1);
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('leaves malformed JSON in place and reports nothing-to-do', () => {
    const dir = seedProject('p1', {});
    writeFileSync(join(dir, 'project.json'), '{not json');
    const result = migrateProjectsToSqlite({ projectsDir, force: true, Database });
    expect(result.migrated).toBe(0);
    expect(existsSync(join(dir, 'project.json'))).toBe(true);
    // No db should be left behind for an empty migration.
    expect(existsSync(join(dir, 'project.db'))).toBe(false);
    expect(existsSync(join(dir, '_pre-sqlite-backup'))).toBe(false);
  });

  it('handles a mixed state safely (db already exists with json siblings)', () => {
    const dir = seedProject('p1', { 'project.json': { id: 'p1' } });
    writeFileSync(join(dir, 'project.db'), 'pre-existing-db-blob');
    const result = migrateProjectsToSqlite({ projectsDir, force: true, Database });
    expect(result.migrated).toBe(0);
    expect(result.alreadyMigrated).toBe(1);
    // No backup created — operator must intervene.
    expect(existsSync(join(dir, '_pre-sqlite-backup'))).toBe(false);
    expect(existsSync(join(dir, 'project.json'))).toBe(true);
  });

  it('reports failures per project without aborting siblings', () => {
    seedProject('healthy', { 'project.json': { id: 'healthy' } });
    seedProject('broken', { 'project.json': { id: 'broken' } });

    let calls = 0;
    class FlakyDatabase {
      pragma() {}
      exec() {}
      prepare() {
        return { run: () => ({ changes: 1 }) };
      }
      transaction<T>(fn: () => T) { return () => fn(); }
      close() {}
      constructor(file: string) {
        calls += 1;
        if (file.includes('broken')) throw new Error('disk full');
      }
    }

    const result = migrateProjectsToSqlite({
      projectsDir,
      force: true,
      Database: FlakyDatabase as unknown as new (f: string) => never,
    });
    expect(result.total).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.migrated + result.alreadyMigrated + result.skipped).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(2);
    const failed = result.details.find(d => d.status === 'failed');
    expect(failed?.id).toBe('broken');
  });

  it('keeps existing project store readable through SqliteKVStore', () => {
    seedProject('p1', {
      'project.json': { id: 'p1', topic: 'persisted' },
    });
    migrateProjectsToSqlite({ projectsDir, force: true, Database });

    // ProjectStore equivalent — open via kv and verify both layouts agree.
    const kv = new SqliteKVStore(join(projectsDir, 'p1', 'project.db'));
    try {
      expect(kv.keys()).toEqual(['project']);
    } finally {
      kv.close();
    }

    // Ensure backup didn't leak into the db dir.
    const dir = readdirSync(join(projectsDir, 'p1')).sort();
    expect(dir).toContain('project.db');
    expect(dir).toContain('_pre-sqlite-backup');
    expect(dir).not.toContain('project.json');
  });
});
