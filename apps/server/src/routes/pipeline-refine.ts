// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { existsSync, statSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, createReadStream } from 'node:fs';
import { basename, extname, resolve, join } from 'node:path';
import { json, parseJsonBody, parseMultipartFile, sanitizeError, type Route } from './helpers.js';
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';

export function pipelineRefineRoutes(svc: PipelineService): Route[] {
  return [
    /* ---- BGM upload for refinement ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/upload-bgm$/,
      handler: async (req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });

        const contentType = req.headers['content-type'] || '';
        const MAX_BGM_SIZE = 50 * 1024 * 1024; // 50 MB

        // Allowed audio extensions
        const ALLOWED_BGM_EXTENSIONS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.ogg']);

        try {
          let filename: string;
          let fileData: Buffer;

          if (contentType.includes('multipart/form-data')) {
            // Multipart upload from browser FormData
            const file = await parseMultipartFile(req, MAX_BGM_SIZE + 1024 * 64);
            filename = file.filename;
            fileData = file.data;
          } else {
            // Legacy JSON base64 upload
            const body = await parseJsonBody<{ filename: string; data: string }>(req, MAX_BGM_SIZE * 1.5);
            if (!body.filename || !body.data) {
              return json(res, 400, { error: 'filename and data are required' });
            }
            filename = body.filename;
            fileData = Buffer.from(body.data, 'base64');
          }

          if (fileData.length > MAX_BGM_SIZE) {
            return json(res, 400, { error: 'File exceeds 50 MB limit' });
          }

          const safeName = basename(filename).replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_');
          const ext = extname(safeName).toLowerCase();
          if (!ALLOWED_BGM_EXTENSIONS.has(ext)) {
            return json(res, 400, { error: `File type not allowed. Supported: ${[...ALLOWED_BGM_EXTENSIONS].join(', ')}` });
          }

          // Save BGM to project directory
          const projectDir = svc.getProjectDir(projectId);
          const bgmDir = join(projectDir, 'bgm');
          if (!existsSync(bgmDir)) mkdirSync(bgmDir, { recursive: true });

          // Remove any existing bgm.* files before writing new one
          if (existsSync(bgmDir)) {
            for (const f of readdirSync(bgmDir)) {
              if (f.startsWith('bgm.')) unlinkSync(join(bgmDir, f));
            }
          }

          // Use fixed filename 'bgm' with original extension
          const bgmPath = join(bgmDir, `bgm${ext}`);

          // Path containment: ensure final path stays within project directory
          const resolvedBgm = resolve(bgmPath);
          const resolvedProject = resolve(projectDir);
          if (!resolvedBgm.startsWith(resolvedProject + '/') && resolvedBgm !== resolvedProject) {
            return json(res, 400, { error: 'Invalid path' });
          }

          writeFileSync(bgmPath, fileData);

          json(res, 200, { ok: true, filename: `bgm${ext}`, size: fileData.length });
        } catch (err) {
          const msg = sanitizeError(err);
          json(res, 400, { error: msg });
        }
      },
    },

    /* ---- Remove BGM ---- */
    {
      method: 'DELETE',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/bgm$/,
      handler: (_req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });

        const projectDir = svc.getProjectDir(projectId);
        const bgmDir = join(projectDir, 'bgm');

        try {
          if (existsSync(bgmDir)) {
            const files = readdirSync(bgmDir);
            for (const file of files) {
              if (file.startsWith('bgm.')) {
                const bgmPath = join(bgmDir, file);
                if (existsSync(bgmPath)) {
                  unlinkSync(bgmPath);
                }
              }
            }
          }
          json(res, 200, { ok: true });
        } catch (err) {
          json(res, 500, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Get current BGM info ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/bgm$/,
      handler: (_req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });

        const projectDir = svc.getProjectDir(projectId);
        const bgmDir = join(projectDir, 'bgm');

        // Look for any bgm.* file
        if (existsSync(bgmDir)) {
          const files = readdirSync(bgmDir);
          const bgmFile = files.find(f => f.startsWith('bgm.'));
          if (bgmFile) {
            const bgmPath = join(bgmDir, bgmFile);
            const stat = statSync(bgmPath);
            return json(res, 200, { hasBgm: true, filename: bgmFile, size: stat.size, path: bgmPath });
          }
        }
        json(res, 200, { hasBgm: false });
      },
    },

    /* ---- Stream BGM audio (supports Range requests for seeking) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/bgm\/stream$/,
      handler: (req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });

        const projectDir = svc.getProjectDir(projectId);
        const bgmDir = join(projectDir, 'bgm');
        if (!existsSync(bgmDir)) return json(res, 404, { error: 'No BGM uploaded' });

        const files = readdirSync(bgmDir);
        const bgmFile = files.find(f => f.startsWith('bgm.'));
        if (!bgmFile) return json(res, 404, { error: 'No BGM uploaded' });

        const bgmPath = join(bgmDir, bgmFile);
        const stat = statSync(bgmPath);
        const fileSize = stat.size;

        const MIME_MAP: Record<string, string> = {
          '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac',
          '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
        };
        const ext = extname(bgmFile).toLowerCase();
        const contentType = MIME_MAP[ext] || 'application/octet-stream';

        const rangeHeader = req.headers.range;
        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          if (start >= fileSize || end >= fileSize || start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
            return res.end();
          }
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': contentType,
          });
          createReadStream(bgmPath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
          });
          createReadStream(bgmPath).pipe(res);
        }
      },
    },

    /* ---- Get refine options ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/refine-options$/,
      handler: (_req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });
        json(res, 200, svc.getRefineOptions(projectId));
      },
    },

    /* ---- Get refine provenance (fields inferred from reference video) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/refine-provenance$/,
      handler: (_req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });
        json(res, 200, { fields: svc.getRefineProvenance(projectId) });
      },
    },

    /* ---- Get reference defaults (base + packaging-inferred, no user overrides) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/refine-reference-defaults$/,
      handler: (_req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });
        json(res, 200, svc.getRefineReferenceDefaults(projectId));
      },
    },

    /* ---- Update refine options ---- */
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/refine-options$/,
      handler: async (req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });

        try {
          const body = await parseJsonBody<any>(req);
          json(res, 200, svc.updateRefineOptions(projectId, body));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Re-assemble video with refine options ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/re-assemble$/,
      handler: async (req, res, match) => {
        const projectId = match.groups!.id;
        const project = svc.loadProject(projectId);
        if (!project) return json(res, 404, { error: 'Project not found' });

        // Check if assembly stage completed
        if (project.stageStatus.ASSEMBLY !== 'completed') {
          return json(res, 400, { error: 'ASSEMBLY stage must be completed before re-assembly' });
        }

        try {
          // Start re-assembly (async, returns immediately)
          svc.startReAssembly(projectId);
          json(res, 200, { ok: true, message: '重新组装已开始' });
        } catch (err) {
          json(res, 500, { error: sanitizeError(err) });
        }
      },
    },
  ];
}
