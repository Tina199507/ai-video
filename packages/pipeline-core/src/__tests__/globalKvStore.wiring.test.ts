/**
 * globalKvStore.test.ts — D-3 wiring tests:
 *   1. The global KV factory selects backends correctly.
 *   2. ModelStore + CustomProviderStore + SelectorService all read /
 *      write the same shared kv when one is injected.
 *   3. Behaviour matches the legacy json layout default.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGlobalKVStore } from '@ai-video/lib/globalKvStore.js';
import { ModelStore } from '../modelStore.js';
import { CustomProviderStore } from '../customProviderStore.js';
import { SelectorService } from '../selectorService.js';
import { ResourceManager } from '../resourceManager.js';

describe('createGlobalKVStore', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'global-kv-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaults to json when env var is unset', () => {
    delete process.env.GLOBAL_STORE_BACKEND;
    const kv = createGlobalKVStore(dir);
    expect(kv.backend).toBe('json');
    kv.close();
  });

  it('honours sqlite override and writes a single global.db', () => {
    const kv = createGlobalKVStore(dir, { backend: 'sqlite' });
    expect(kv.backend).toBe('sqlite');
    kv.set('models', { gemini: [{ id: 'pro', label: 'Pro' }] });
    kv.close();
    expect(existsSync(join(dir, 'global.db'))).toBe(true);
    expect(readdirSync(dir).filter(f => f.endsWith('.json'))).toEqual([]);
  });

  it('honours GLOBAL_STORE_BACKEND=sqlite env', () => {
    process.env.GLOBAL_STORE_BACKEND = 'sqlite';
    try {
      const kv = createGlobalKVStore(dir);
      expect(kv.backend).toBe('sqlite');
      kv.close();
    } finally {
      delete process.env.GLOBAL_STORE_BACKEND;
    }
  });
});

describe('global stores share one kv', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'shared-kv-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('json backend writes the legacy file layout (compat path)', () => {
    const kv = createGlobalKVStore(dir, { backend: 'json' });
    const models = new ModelStore(join(dir, 'models.json'), { kv });
    const providers = new CustomProviderStore(join(dir, 'providers.json'), { kv });

    models.set('gemini', [{ id: 'pro', label: 'Pro' }]);
    providers.set('mine', { label: 'mine', selectors: { promptInput: 'textarea' } as never });

    expect(JSON.parse(readFileSync(join(dir, 'models.json'), 'utf8'))).toEqual({
      gemini: [{ id: 'pro', label: 'Pro' }],
    });
    expect(JSON.parse(readFileSync(join(dir, 'providers.json'), 'utf8')))
      .toMatchObject({ mine: { label: 'mine' } });

    kv.close();
  });

  it('sqlite backend lands every store in a single global.db', () => {
    const kv = createGlobalKVStore(dir, { backend: 'sqlite' });
    const models = new ModelStore(join(dir, 'models.json'), { kv });
    const providers = new CustomProviderStore(join(dir, 'providers.json'), { kv });
    const resources = new ResourceManager(join(dir, 'resources.json'), false, { kv });
    const sink = { emit: () => {}, emitState: () => {} };
    const selectors = new SelectorService(
      join(dir, 'selector-cache.json'),
      providers,
      resources,
      sink,
      { kv },
    );

    models.set('gemini', [{ id: 'flash', label: 'Flash' }]);
    providers.set('alpha', { label: 'alpha', selectors: { promptInput: 'textarea' } as never });
    selectors.setProviderSelectors('chatgpt', { promptInput: '#new' });
    selectors.persistSelectorCache();

    // Reopen via fresh stores against the same kv to assert persistence.
    expect(kv.keys().sort()).toEqual(expect.arrayContaining([
      'models', 'providers', 'resources', 'selector-cache',
    ]));
    expect(kv.get<{ gemini: { id: string }[] }>('models')?.gemini[0]?.id).toBe('flash');
    expect(kv.get<{ alpha: { label: string } }>('providers')?.alpha?.label).toBe('alpha');
    expect(kv.get<Record<string, { selectors: { promptInput?: string } }>>('selector-cache')?.chatgpt?.selectors?.promptInput).toBe('#new');

    // No legacy json files should be left in `dir`.
    expect(readdirSync(dir).filter(f => f.endsWith('.json'))).toEqual([]);

    kv.close();
  });
});
