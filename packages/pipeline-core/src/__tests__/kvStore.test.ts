/**
 * kvStore.test.ts — exhaustive parity tests for the JSON and SQLite
 * KV implementations.  Both backends must agree on every public
 * method so D-2 can switch ProjectStore over without behaviour drift.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JsonKVStore,
  SqliteKVStore,
  createProjectKVStore,
  type ProjectKVStore,
} from '@ai-video/lib/kvStore.js';

interface BackendSpec {
  name: string;
  build(dir: string): ProjectKVStore;
}

const SPECS: BackendSpec[] = [
  { name: 'JsonKVStore', build: (d) => new JsonKVStore(d) },
  { name: 'SqliteKVStore', build: (d) => new SqliteKVStore(join(d, 'project.db')) },
];

for (const spec of SPECS) {
  describe(`ProjectKVStore parity — ${spec.name}`, () => {
    let dir: string;
    let store: ProjectKVStore;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'kvstore-'));
      store = spec.build(dir);
    });

    afterEach(() => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('returns undefined for missing keys and false for has()', () => {
      expect(store.get('nope')).toBeUndefined();
      expect(store.has('nope')).toBe(false);
      expect(store.delete('nope')).toBe(false);
    });

    it('round-trips set / get / delete / has', () => {
      store.set('alpha', { n: 1, s: 'one' });
      expect(store.has('alpha')).toBe(true);
      expect(store.get<{ n: number; s: string }>('alpha')).toEqual({ n: 1, s: 'one' });
      expect(store.delete('alpha')).toBe(true);
      expect(store.has('alpha')).toBe(false);
      expect(store.get('alpha')).toBeUndefined();
    });

    it('overwrites on repeated set', () => {
      store.set('k', 'v1');
      store.set('k', 'v2');
      expect(store.get<string>('k')).toBe('v2');
    });

    it('lists keys', () => {
      store.set('a', 1);
      store.set('b', 2);
      const keys = store.keys().sort();
      expect(keys).toEqual(['a', 'b']);
    });

    it('handles arrays and primitives as values', () => {
      store.set('list', [1, 2, 3]);
      expect(store.get<number[]>('list')).toEqual([1, 2, 3]);
      store.set('num', 42);
      expect(store.get<number>('num')).toBe(42);
      store.set('str', 'hello');
      expect(store.get<string>('str')).toBe('hello');
    });

    it('tx batches multiple writes atomically (success path)', () => {
      store.tx(() => {
        store.set('x', 1);
        store.set('y', 2);
      });
      expect(store.get<number>('x')).toBe(1);
      expect(store.get<number>('y')).toBe(2);
    });

    it('tx rolls back on throw', () => {
      // Seed an existing value so we can assert it survives the abort.
      store.set('seed', 'kept');
      expect(() =>
        store.tx(() => {
          store.set('seed', 'overwritten');
          store.set('partial', 'should-not-survive');
          throw new Error('boom');
        }),
      ).toThrow(/boom/);

      // SQLite gives us true atomicity; the JSON backend's tx is a
      // pass-through (writes already happened), so we only assert
      // rollback for sqlite.
      if (store.backend === 'sqlite') {
        expect(store.get<string>('seed')).toBe('kept');
        expect(store.has('partial')).toBe(false);
      }
    });
  });
}

describe('JsonKVStore — file layout', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kvstore-layout-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes one .json file per key', () => {
    const store = new JsonKVStore(dir);
    store.set('hello', { greet: 'world' });
    const file = join(dir, 'hello.json');
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ greet: 'world' });
  });

  it('rejects unsafe keys', () => {
    const store = new JsonKVStore(dir);
    expect(() => store.set('../escape', 1)).toThrow(/invalid/);
    expect(() => store.get('foo/bar')).toThrow(/invalid/);
  });
});

describe('SqliteKVStore — file layout', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kvstore-sqlite-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('creates a single .db file per project and survives reopen', () => {
    const dbFile = join(dir, 'project.db');
    const a = new SqliteKVStore(dbFile);
    a.set('persist', { value: 7 });
    a.close();

    expect(existsSync(dbFile)).toBe(true);

    const b = new SqliteKVStore(dbFile);
    expect(b.get<{ value: number }>('persist')).toEqual({ value: 7 });
    b.close();
  });
});

describe('createProjectKVStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kvstore-factory-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaults to json when env var is unset', () => {
    delete process.env.PROJECT_STORE_BACKEND;
    const s = createProjectKVStore(dir);
    expect(s.backend).toBe('json');
    s.close();
  });

  it('honours backend override', () => {
    const s = createProjectKVStore(dir, { backend: 'sqlite' });
    expect(s.backend).toBe('sqlite');
    s.close();
  });

  it('honours PROJECT_STORE_BACKEND=sqlite', () => {
    process.env.PROJECT_STORE_BACKEND = 'sqlite';
    try {
      const s = createProjectKVStore(dir);
      expect(s.backend).toBe('sqlite');
      s.close();
    } finally {
      delete process.env.PROJECT_STORE_BACKEND;
    }
  });
});
