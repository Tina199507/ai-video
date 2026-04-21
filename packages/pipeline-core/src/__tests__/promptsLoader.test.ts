import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getPrompt,
  getPromptMeta,
  invalidatePromptCache,
} from '../promptsLoader.js';

const ORIGINAL_DATA_DIR = process.env.DATA_DIR;

describe('promptsLoader', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'prompts-loader-'));
    process.env.DATA_DIR = tmpRoot;
    invalidatePromptCache();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
    invalidatePromptCache();
  });

  it('loads a bundled prompt body with the default version 1', () => {
    const body = getPrompt('style-extraction');
    expect(body.length).toBeGreaterThan(100);
    expect(body).toContain('Style DNA');
    const meta = getPromptMeta('style-extraction');
    expect(meta).toMatchObject({
      name: 'style-extraction',
      version: 1,
      overridden: false,
    });
    expect(meta.source.endsWith('data/prompts/style-extraction.md')).toBe(true);
  });

  it('prefers a user override in <data-dir>/prompts over the bundled file', () => {
    const overrideDir = join(tmpRoot, 'prompts');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(
      join(overrideDir, 'style-extraction.md'),
      '---\nversion: 7\n---\nOVERRIDDEN BODY\n',
      'utf8',
    );
    invalidatePromptCache();

    const body = getPrompt('style-extraction');
    expect(body.trim()).toBe('OVERRIDDEN BODY');
    const meta = getPromptMeta('style-extraction');
    expect(meta.overridden).toBe(true);
    expect(meta.version).toBe(7);
    expect(meta.source).toBe(join(overrideDir, 'style-extraction.md'));
  });

  it('falls back to the bundled prompt when the override file is missing', () => {
    // No override created.
    const meta = getPromptMeta('research');
    expect(meta.overridden).toBe(false);
    expect(getPrompt('research')).toContain('research');
  });

  it('caches the loaded body until invalidatePromptCache is called', () => {
    const overrideDir = join(tmpRoot, 'prompts');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(join(overrideDir, 'research.md'), 'V1\n', 'utf8');
    invalidatePromptCache();
    expect(getPrompt('research').trim()).toBe('V1');

    writeFileSync(join(overrideDir, 'research.md'), 'V2\n', 'utf8');
    // Without cache bust we keep seeing V1.
    expect(getPrompt('research').trim()).toBe('V1');

    invalidatePromptCache();
    expect(getPrompt('research').trim()).toBe('V2');
  });

  it('throws a helpful error when a prompt name is missing entirely', () => {
    expect(() => getPrompt('does-not-exist')).toThrow(/does-not-exist/);
  });

  it('treats front-matter-less files as version 1', () => {
    const overrideDir = join(tmpRoot, 'prompts');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(join(overrideDir, 'research.md'), 'NO FRONTMATTER', 'utf8');
    invalidatePromptCache();
    const meta = getPromptMeta('research');
    expect(meta.version).toBe(1);
    expect(getPrompt('research')).toBe('NO FRONTMATTER');
  });
});
