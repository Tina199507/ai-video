// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { existsSync, createReadStream, statSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve, normalize, join } from 'node:path';
import { ARTIFACT, EDITABLE_ARTIFACTS } from '.././constants.js';
import { json, parseJsonBody, type Route } from './helpers.js';
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';

export function pipelineArtifactRoutes(svc: PipelineService): Route[] {
  return [
    /* ---- Stream / Download final video ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/video$/,
      handler: (req, res, match) => {
        const project = svc.loadProject(match.groups!.id);
        if (!project?.finalVideoPath || !existsSync(project.finalVideoPath)) {
          return json(res, 404, { error: 'Video not found' });
        }
        const stat = statSync(project.finalVideoPath);
        const total = stat.size;
        const url = new URL(req.url ?? '', 'http://localhost');
        const wantDownload = url.searchParams.has('dl');
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': 'video/mp4',
          });
          createReadStream(project.finalVideoPath, { start, end }).pipe(res);
        } else {
          const headers: Record<string, string | number> = {
            'Content-Type': 'video/mp4',
            'Content-Length': total,
            'Accept-Ranges': 'bytes',
          };
          if (wantDownload) {
            headers['Content-Disposition'] = `attachment; filename="${basename(project.finalVideoPath)}"`;
          }
          res.writeHead(200, headers);
          createReadStream(project.finalVideoPath).pipe(res);
        }
      },
    },

    /* ---- Resource plan ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/resource-plan$/,
      handler: (_req, res, match) => {
        const project = svc.loadProject(match.groups!.id);
        if (!project) return json(res, 404, { error: 'Project not found' });
        json(res, 200, svc.getResourcePlan(match.groups!.id, project.modelOverrides));
      },
    },

    /* ---- Export ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/export$/,
      handler: (_req, res, match) => {
        const bundle = svc.exportProject(match.groups!.id);
        if (!bundle) return json(res, 404, { error: 'Project not found' });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${match.groups!.id}.json"`,
        });
        res.end(JSON.stringify(bundle, null, 2));
      },
    },

    /* ---- Import ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/import$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<Record<string, any>>(req);
        if (!body.project?.id || !body.project?.topic) {
          return json(res, 400, { error: 'Invalid export bundle: missing project data' });
        }
        json(res, 201, svc.importProject(body));
      },
    },

    /* ---- Data directory ---- */
    {
      method: 'GET',
      pattern: /^\/api\/data-dir$/,
      handler: (_req, res) => json(res, 200, { dataDir: svc.getDataDir() }),
    },

    /* ---- Serve pipeline artifact files (JSON) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/artifacts\/(?<filename>[^/]+)$/,
      handler: (_req, res, match) => {
        const projectDir = svc.getProjectDir(match.groups!.id);
        const filename = match.groups!.filename;
        // Whitelist artifact filenames
        const allowed: readonly string[] = Object.values(ARTIFACT);
        if (!allowed.includes(filename)) return json(res, 400, { error: 'Invalid artifact name' });
        const filePath = join(projectDir, filename);
        if (!existsSync(filePath)) return json(res, 404, { error: 'Artifact not found' });
        try {
          const data = JSON.parse(readFileSync(filePath, 'utf-8'));
          json(res, 200, data);
        } catch {
          json(res, 500, { error: 'Failed to read artifact' });
        }
      },
    },

    /* ---- Update pipeline artifact files (JSON) ---- */
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/artifacts\/(?<filename>[^/]+)$/,
      handler: async (req, res, match) => {
        const projectDir = svc.getProjectDir(match.groups!.id);
        const filename = match.groups!.filename;
        if (!EDITABLE_ARTIFACTS.includes(filename)) return json(res, 400, { error: 'Artifact is not editable' });
        if (!existsSync(projectDir)) return json(res, 404, { error: 'Project not found' });
        try {
          const body = await parseJsonBody<Record<string, unknown>>(req);
          const filePath = join(projectDir, filename);
          writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf-8');

          // Invalidate the ??= cached field so next stage re-reads from disk
          svc.invalidateArtifactCache(match.groups!.id, [filename]);

          json(res, 200, { ok: true });
        } catch {
          json(res, 500, { error: 'Failed to write artifact' });
        }
      },
    },

    /* ---- Serve project-level asset files ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/assets\/(?<filename>[^/]+)$/,
      handler: (_req, res, match) => {
        const projectDir = svc.getProjectDir(match.groups!.id);
        const filename = match.groups!.filename;
        const assetsDir = resolve(projectDir, 'assets');
        const filePath = resolve(assetsDir, filename);
        if (!normalize(filePath).startsWith(normalize(assetsDir))) {
          return json(res, 403, { error: 'Forbidden' });
        }
        if (!existsSync(filePath)) {
          return json(res, 404, { error: 'File not found' });
        }
        const ext = extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
          '.bmp': 'image/bmp',
        };
        const contentType = mimeTypes[ext] ?? 'application/octet-stream';
        const stat = statSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=3600',
        });
        createReadStream(filePath).pipe(res);
      },
    },

    /* ---- Serve asset files (images, etc.) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/assets\/(.+)$/,
      handler: (_req, res, match) => {
        const relPath = decodeURIComponent(match[1]);
        // Security: prevent path traversal
        const assetsDir = resolve(svc.getDataDir(), 'assets');
        const filePath = resolve(assetsDir, relPath);
        if (!normalize(filePath).startsWith(normalize(assetsDir))) {
          return json(res, 403, { error: 'Forbidden' });
        }
        if (!existsSync(filePath)) {
          return json(res, 404, { error: 'File not found' });
        }
        const ext = extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
          '.bmp': 'image/bmp',
        };
        const contentType = mimeTypes[ext] ?? 'application/octet-stream';
        const stat = statSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=3600',
        });
        createReadStream(filePath).pipe(res);
      },
    },
  ];
}
