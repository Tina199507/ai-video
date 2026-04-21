/* ------------------------------------------------------------------ */
/*  promptsLoader — file-based prompt template registry                */
/* ------------------------------------------------------------------ */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveDataDir } from './dataDir.js';
import { ensurePathWithinBase } from '@ai-video/pipeline-core/libFacade.js';

const BUNDLED_DIR = resolve('data', 'prompts');
const OVERRIDE_SUBDIR = 'prompts';

export interface PromptMeta {
  name: string;
  version: number;
  overridden: boolean;
  source: string;
}

interface LoadedPrompt {
  body: string;
  meta: PromptMeta;
}

const cache = new Map<string, LoadedPrompt>();

function parseFrontMatter(raw: string): { body: string; version: number } {
  if (!raw.startsWith('---')) return { body: raw, version: 1 };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { body: raw, version: 1 };
  const header = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  let version = 1;
  for (const line of header.split(/\r?\n/)) {
    const m = /^version\s*:\s*(\d+)\s*$/.exec(line);
    if (m && m[1]) {
      version = Number(m[1]);
      break;
    }
  }
  return { body, version };
}

function tryLoad(filePath: string): { body: string; version: number } | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  return parseFrontMatter(raw);
}

function resolveOverridePath(name: string): string | null {
  try {
    const base = join(resolveDataDir(), OVERRIDE_SUBDIR);
    const candidate = join(base, `${name}.md`);
    if (!existsSync(candidate)) return null;
    return ensurePathWithinBase(base, candidate, `prompt override ${name}`);
  } catch {
    return null;
  }
}

function load(name: string): LoadedPrompt {
  if (cache.has(name)) return cache.get(name)!;

  const override = resolveOverridePath(name);
  if (override) {
    const parsed = tryLoad(override);
    if (parsed) {
      const entry: LoadedPrompt = {
        body: parsed.body,
        meta: { name, version: parsed.version, overridden: true, source: override },
      };
      cache.set(name, entry);
      return entry;
    }
  }

  const bundled = join(BUNDLED_DIR, `${name}.md`);
  const parsed = tryLoad(bundled);
  if (!parsed) {
    throw new Error(
      `[promptsLoader] prompt "${name}" not found (looked in ${override ?? '(no override)'} and ${bundled}).`,
    );
  }
  const entry: LoadedPrompt = {
    body: parsed.body,
    meta: { name, version: parsed.version, overridden: false, source: bundled },
  };
  cache.set(name, entry);
  return entry;
}

export function getPrompt(name: string): string {
  return load(name).body;
}

export function getPromptMeta(name: string): PromptMeta {
  return load(name).meta;
}

export function invalidatePromptCache(): void {
  cache.clear();
}
