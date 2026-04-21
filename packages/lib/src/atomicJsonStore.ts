/* ------------------------------------------------------------------ */
/*  atomicJsonStore – crash-safe JSON persistence helpers              */
/*                                                                     */
/*  Provides:                                                          */
/*    • writeJsonAtomic(path, value)    – tmp file + rename            */
/*    • readJsonSafe<T>(path, fallback) – tolerant reader              */
/*    • withFileLock(path, fn)          – advisory lock (lockfile)     */
/*                                                                     */
/*  Zero external dependencies: the lock uses a sibling `.lock` file   */
/*  with O_EXCL semantics and a stale-lock sweep based on mtime.       */
/* ------------------------------------------------------------------ */

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface AtomicWriteOptions {
  /** Pretty-print indent (default 2). Pass 0 for compact output. */
  indent?: number;
  /** fsync the temp file before rename. Defaults to true for durability. */
  fsync?: boolean;
}

/**
 * Write JSON atomically: tmp file → fsync → rename.
 *
 * Guarantees that at any moment the target file either contains the old
 * value or the new value, never a half-written one.
 */
export function writeJsonAtomic(
  filePath: string,
  value: unknown,
  opts: AtomicWriteOptions = {},
): void {
  const { indent = 2, fsync = true } = opts;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
  const payload = indent > 0
    ? JSON.stringify(value, null, indent)
    : JSON.stringify(value);

  // Write to tmp and fsync before rename to survive crash/power loss
  const fd = openSync(tmpPath, 'w');
  try {
    writeSync(fd, payload);
    if (fsync) {
      try {
        fsyncSync(fd);
      } catch {
        /* fsync is best-effort on platforms that don't support it */
      }
    }
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, filePath);
}

export interface ReadJsonOptions<T> {
  /** Default value if file missing or corrupt. */
  fallback: T;
  /** Called when parse fails — hook for structured logging. */
  onCorrupt?: (err: unknown) => void;
}

/**
 * Tolerant JSON reader. Returns the fallback when the file is missing or
 * cannot be parsed. When a corrupt file is encountered, the raw contents are
 * preserved under `<path>.corrupt-<timestamp>` so operators can recover.
 */
export function readJsonSafe<T>(filePath: string, opts: ReadJsonOptions<T>): T {
  if (!existsSync(filePath)) return opts.fallback;
  let raw = '';
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    opts.onCorrupt?.(err);
    return opts.fallback;
  }
  if (!raw.trim()) return opts.fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    opts.onCorrupt?.(err);
    try {
      const backup = `${filePath}.corrupt-${Date.now()}`;
      writeFileSync(backup, raw);
    } catch {
      /* best-effort */
    }
    return opts.fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Advisory file lock (single-host, cooperative)                      */
/* ------------------------------------------------------------------ */

const DEFAULT_STALE_MS = 30_000;
const DEFAULT_WAIT_MS = 5_000;
const POLL_MS = 25;

export interface FileLockOptions {
  /** Treat existing lock older than this as stale and remove it. */
  staleMs?: number;
  /** Maximum time to wait for the lock before giving up. */
  waitMs?: number;
}

/**
 * Run `fn` while holding an advisory lock on `<filePath>.lock`.
 *
 * The lock uses O_EXCL for atomic acquisition across concurrent processes
 * on the same host; it falls back to timestamp-based sweeping for crashes.
 * Not suitable for cross-host coordination.
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => T | Promise<T>,
  opts: FileLockOptions = {},
): Promise<T> {
  const { staleMs = DEFAULT_STALE_MS, waitMs = DEFAULT_WAIT_MS } = opts;
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + waitMs;

  while (true) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      closeSync(fd);
      break;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (isStaleLock(lockPath, staleMs)) {
        try { unlinkSync(lockPath); } catch { /* race with other sweeper */ }
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`withFileLock timeout after ${waitMs}ms on ${filePath}`);
      }
      await sleep(POLL_MS);
    }
  }

  try {
    return await fn();
  } finally {
    try { unlinkSync(lockPath); } catch { /* already removed */ }
  }
}

function isStaleLock(lockPath: string, staleMs: number): boolean {
  try {
    const st = statSync(lockPath);
    return Date.now() - st.mtimeMs > staleMs;
  } catch {
    return true; // gone already
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
