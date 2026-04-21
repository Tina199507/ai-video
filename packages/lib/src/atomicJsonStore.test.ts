import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeJsonAtomic, readJsonSafe, withFileLock } from './atomicJsonStore.js';

describe('atomicJsonStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ajs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes JSON atomically', () => {
    const path = join(dir, 'a.json');
    writeJsonAtomic(path, { hello: 'world' });
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ hello: 'world' });
  });

  it('creates the parent directory on demand', () => {
    const path = join(dir, 'nested', 'deep', 'b.json');
    writeJsonAtomic(path, { ok: 1 });
    expect(existsSync(path)).toBe(true);
  });

  it('readJsonSafe returns fallback when missing', () => {
    expect(readJsonSafe(join(dir, 'missing.json'), { fallback: [] })).toEqual([]);
  });

  it('readJsonSafe backs up corrupt files and returns fallback', () => {
    const path = join(dir, 'corrupt.json');
    writeFileSync(path, '{ not valid json');
    let caught: unknown;
    const value = readJsonSafe<{ x: number }>(path, {
      fallback: { x: 0 },
      onCorrupt: (err) => { caught = err; },
    });
    expect(caught).toBeInstanceOf(Error);
    expect(value).toEqual({ x: 0 });
    // backup file exists
    const { readdirSync } = require('node:fs');
    const files = readdirSync(dir);
    expect(files.some((f: string) => f.startsWith('corrupt.json.corrupt-'))).toBe(true);
  });

  it('withFileLock serialises concurrent writers', async () => {
    const path = join(dir, 'counter.json');
    writeJsonAtomic(path, { n: 0 });

    async function incr() {
      await withFileLock(path, async () => {
        const cur = readJsonSafe<{ n: number }>(path, { fallback: { n: 0 } });
        // Simulate a slow critical section
        await new Promise((r) => setTimeout(r, 10));
        writeJsonAtomic(path, { n: cur.n + 1 });
      });
    }

    await Promise.all(Array.from({ length: 10 }, () => incr()));
    const final = readJsonSafe<{ n: number }>(path, { fallback: { n: 0 } });
    expect(final.n).toBe(10);
  });

  it('withFileLock releases the lock even if fn throws', async () => {
    const path = join(dir, 'lock-target.json');
    await expect(
      withFileLock(path, async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    // lock should not remain
    expect(existsSync(`${path}.lock`)).toBe(false);
  });
});
