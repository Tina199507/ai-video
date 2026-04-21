/**
 * autoMigrateGlobal.test.ts — boot-time migration of root-level json
 * stores into data/global.db (D-3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { migrateGlobalStoresToSqlite } from '../autoMigrateGlobal.js';
import { SqliteKVStore } from '../kvStore.js';

describe('migrateGlobalStoresToSqlite', () => {
  let dir: string;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'global-migrate-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function seed(files: Record<string, unknown>): void {
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, name), JSON.stringify(body, null, 2));
    }
  }

  it('is a noop when neither force nor backend=sqlite is set', () => {
    seed({ 'resources.json': [] });
    const result = migrateGlobalStoresToSqlite({ dataDir: dir, backend: undefined });
    expect(result.ran).toBe(false);
    expect(existsSync(join(dir, 'resources.json'))).toBe(true);
    expect(existsSync(join(dir, 'global.db'))).toBe(false);
  });

  it('migrates the four known stores into one global.db', () => {
    seed({
      'resources.json': [{ id: 'r1' }],
      'models.json': { gemini: [{ id: 'pro' }] },
      'providers.json': { mine: { label: 'mine' } },
      'selector-cache.json': { chatgpt: { selectors: { promptInput: '#x' }, detectedAt: 'now' } },
    });

    const result = migrateGlobalStoresToSqlite({ dataDir: dir, force: true, Database });
    expect(result.ran).toBe(true);
    expect(result.migrated).toBe(4);
    expect(result.failed).toBe(0);

    expect(existsSync(join(dir, 'global.db'))).toBe(true);
    expect(existsSync(join(dir, '_pre-sqlite-backup-global', 'resources.json'))).toBe(true);
    expect(readdirSync(dir).filter(f => f.endsWith('.json'))).toEqual([]);

    const kv = new SqliteKVStore(join(dir, 'global.db'));
    try {
      expect(kv.get<{ id: string }[]>('resources')?.[0]?.id).toBe('r1');
      expect(kv.get<{ gemini: { id: string }[] }>('models')?.gemini[0]?.id).toBe('pro');
      expect(kv.get<{ mine: { label: string } }>('providers')?.mine?.label).toBe('mine');
      expect(kv.get<Record<string, unknown>>('selector-cache')?.chatgpt).toBeDefined();
    } finally {
      kv.close();
    }
  });

  it('ignores unrelated json files in data/', () => {
    seed({
      'resources.json': [],
      'config.json': { unrelated: true },
      'unknown.json': 'should-not-touch',
    });
    const result = migrateGlobalStoresToSqlite({ dataDir: dir, force: true, Database });
    expect(result.migrated).toBe(1);
    expect(existsSync(join(dir, 'config.json'))).toBe(true);
    expect(existsSync(join(dir, 'unknown.json'))).toBe(true);
  });

  it('idempotent — second run sees no candidates', () => {
    seed({ 'resources.json': [] });
    const a = migrateGlobalStoresToSqlite({ dataDir: dir, force: true, Database });
    const b = migrateGlobalStoresToSqlite({ dataDir: dir, force: true, Database });
    expect(a.migrated).toBe(1);
    expect(b.ran).toBe(false);
  });

  it('honours the env-var trigger', () => {
    seed({ 'resources.json': [{ id: 'env-trigger' }] });
    const result = migrateGlobalStoresToSqlite({ dataDir: dir, backend: 'sqlite', Database });
    expect(result.migrated).toBe(1);
  });

  it('skips malformed JSON without leaving a half-baked db', () => {
    writeFileSync(join(dir, 'resources.json'), '{not valid');
    const result = migrateGlobalStoresToSqlite({ dataDir: dir, force: true, Database });
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);
    // Originals stay put, db gone.
    expect(existsSync(join(dir, 'resources.json'))).toBe(true);
    expect(existsSync(join(dir, 'global.db'))).toBe(false);
  });
});
