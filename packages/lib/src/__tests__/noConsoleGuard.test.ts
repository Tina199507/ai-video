/* ------------------------------------------------------------------ */
/*  noConsoleGuard – lightweight lint for console.* regression         */
/*                                                                     */
/*  We lack a full ESLint setup, so this test scans a hand-picked set  */
/*  of "production" directories (server, quota, core pipeline) and     */
/*  asserts there are zero `console.*` call-sites in them. CLI tools   */
/*  under `scripts/testing/**` and `src/cli/**` are explicitly excluded —  */
/*  they are CLI scripts where direct stdout is the point.             */
/* ------------------------------------------------------------------ */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GUARDED_FILES: readonly string[] = [
  'apps/server/src/main.ts',
  'packages/pipeline-core/src/quotaBus.ts',
  'packages/pipeline-core/src/quotaRotation.ts',
];

/**
 * Directories where every .ts file (excluding *.test.ts) is scanned for
 * console.* call-sites. Keep this list small and meaningful — the goal
 * is to prevent regressions in the new structured-logging code, not to
 * force a project-wide migration via this one test.
 */
const GUARDED_DIRS: readonly string[] = [
  // After the B-codemod (post-C-2) the src/lib re-export shims were
  // deleted; the canonical lib sources live entirely under
  // packages/lib/src.  We guard the new location to keep zero
  // console.* coverage intact.
  'packages/lib/src',
  'packages/pipeline-core/src/providers',
];

const CONSOLE_RE = /\bconsole\.(log|warn|error|info|debug)\s*\(/g;

function listFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      listFiles(full, out);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts') && !full.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function scan(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const hits: string[] = [];
  for (const match of src.matchAll(CONSOLE_RE)) {
    const idx = match.index ?? 0;
    const line = src.slice(0, idx).split('\n').length;
    hits.push(`${file}:${line}: ${match[0]}`);
  }
  return hits;
}

describe('no-console guard (structured logging only)', () => {
  it('has zero console.* calls in guarded files', () => {
    const hits = GUARDED_FILES.flatMap(scan);
    expect(hits, `Found console.* calls; use createLogger instead:\n${hits.join('\n')}`).toEqual([]);
  });

  it('has zero console.* calls in guarded directories', () => {
    const files = GUARDED_DIRS.flatMap(dir => listFiles(dir));
    const hits = files.flatMap(scan);
    expect(hits, `Found console.* calls; use createLogger instead:\n${hits.join('\n')}`).toEqual([]);
  });
});
