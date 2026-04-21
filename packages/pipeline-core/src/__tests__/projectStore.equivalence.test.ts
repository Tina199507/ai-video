/**
 * projectStore.equivalence.test.ts — runs the existing ProjectStore
 * behaviour suite against both backends so D-2 doesn't drift.  We
 * spell out a self-contained matrix because the JSON-backed legacy
 * suite (src/pipeline/projectStore.test.ts) is happy to keep running
 * unmodified — this file just adds the SQLite mirror.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectStore } from '../projectStore.js';
import { ARTIFACT } from '../constants.js';

const BACKENDS: Array<'json' | 'sqlite'> = ['json', 'sqlite'];

for (const backend of BACKENDS) {
  describe(`ProjectStore (backend=${backend})`, () => {
    let store: ProjectStore;
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), `projstore-${backend}-`));
      store = new ProjectStore(tmpDir, { backend });
    });

    afterEach(() => {
      store.closeAll();
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('round-trips create / save / load', () => {
      const p = store.create('hello');
      expect(p.id).toMatch(/^proj_/);
      const loaded = store.load(p.id);
      expect(loaded?.topic).toBe('hello');
    });

    it('updates persist across save', () => {
      const p = store.create('update');
      p.error = 'boom';
      store.save(p);
      expect(store.load(p.id)?.error).toBe('boom');
    });

    it('saveArtifact + loadArtifact round-trip', () => {
      const p = store.create('artifact');
      store.saveArtifact(p.id, ARTIFACT.SCENES, { scenes: [{ id: 'a' }] });
      const loaded = store.loadArtifact<{ scenes: { id: string }[] }>(p.id, ARTIFACT.SCENES);
      expect(loaded?.scenes[0]?.id).toBe('a');
    });

    it('list returns all projects sorted descending by createdAt', async () => {
      store.create('one');
      await new Promise(r => setTimeout(r, 5));
      store.create('two');
      const all = store.list();
      expect(all.map(p => p.topic)).toEqual(['two', 'one']);
    });

    it('delete drops the project and releases the kv handle', () => {
      const p = store.create('delete-me');
      expect(store.delete(p.id)).toBe(true);
      expect(store.load(p.id)).toBeNull();
    });

    it('tx batches saveProject + saveArtifact (commits succeed)', () => {
      const p = store.create('tx');
      store.tx(p.id, () => {
        p.error = 'in-tx';
        store.save(p);
        store.saveArtifact(p.id, ARTIFACT.SCENES, { batched: true });
      });
      expect(store.load(p.id)?.error).toBe('in-tx');
      expect(store.loadArtifact<{ batched: boolean }>(p.id, ARTIFACT.SCENES)?.batched).toBe(true);
    });

    it('tx rolls back on throw (sqlite only — json is per-file atomic)', () => {
      const p = store.create('tx-rollback');
      // Seed a value so we can detect rollback.
      store.saveArtifact(p.id, ARTIFACT.SCENES, { kept: true });

      expect(() => store.tx(p.id, () => {
        store.saveArtifact(p.id, ARTIFACT.SCENES, { kept: false });
        throw new Error('boom');
      })).toThrow(/boom/);

      const after = store.loadArtifact<{ kept: boolean }>(p.id, ARTIFACT.SCENES);
      if (backend === 'sqlite') {
        expect(after?.kept).toBe(true);
      } else {
        expect(after?.kept).toBe(false);
      }
    });

    if (backend === 'sqlite') {
      it('writes a single project.db file (no per-artifact JSON dribble)', () => {
        const p = store.create('layout');
        store.saveArtifact(p.id, ARTIFACT.SCENES, [1, 2, 3]);
        store.saveArtifact(p.id, ARTIFACT.SCRIPT, { text: 'hi' });
        store.closeAll();
        const projectDir = join(tmpDir, 'projects', p.id);
        const files = readdirSync(projectDir).sort();
        expect(files).toContain('project.db');
        expect(files.filter(f => f.endsWith('.json'))).toEqual([]);
      });
    } else {
      it('writes one .json file per artifact (legacy layout)', () => {
        const p = store.create('layout');
        store.saveArtifact(p.id, ARTIFACT.SCENES, [1, 2, 3]);
        store.saveArtifact(p.id, ARTIFACT.SCRIPT, { text: 'hi' });
        const projectDir = join(tmpDir, 'projects', p.id);
        expect(existsSync(join(projectDir, 'project.json'))).toBe(true);
        expect(existsSync(join(projectDir, ARTIFACT.SCENES))).toBe(true);
        expect(existsSync(join(projectDir, ARTIFACT.SCRIPT))).toBe(true);
        // Sanity check: the project.json content matches load() output.
        const onDisk = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8'));
        expect(onDisk.id).toBe(p.id);
      });
    }
  });
}
