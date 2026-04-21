// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { json, parseJsonBody, sanitizeError, type Route } from './helpers.js';
import type { PipelineStage, ModelOverrides } from '@ai-video/pipeline-core/index.js';
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';

export function pipelineControlRoutes(svc: PipelineService): Route[] {
  return [
    /* ---- List projects ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline$/,
      handler: (_req, res) => json(res, 200, svc.listProjects()),
    },

    /* ---- Create project ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<{ topic: string; title?: string; modelOverrides?: ModelOverrides }>(req);
        if (!body.topic?.trim()) return json(res, 400, { error: 'topic is required' });
        const project = svc.createProject(body.topic.trim(), body.title?.trim(), body.modelOverrides);
        json(res, 201, project);
      },
    },

    /* ---- Batch create projects ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/batch$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<{
          topics: string[];
          titlePrefix?: string;
          modelOverrides?: ModelOverrides;
        }>(req);
        const topics = (body.topics ?? [])
          .map((t) => t?.trim())
          .filter((t): t is string => !!t);
        if (topics.length === 0) {
          return json(res, 400, { error: 'topics array is required' });
        }

        const projects = topics.map((topic, idx) => {
          const title = body.titlePrefix?.trim()
            ? `${body.titlePrefix.trim()} #${idx + 1}`
            : undefined;
          return svc.createProject(topic, title, body.modelOverrides);
        });

        json(res, 201, { ok: true, count: projects.length, projects });
      },
    },

    /* ---- Get project ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)$/,
      handler: (_req, res, match) => {
        const project = svc.loadProject(match.groups!.id);
        if (!project) return json(res, 404, { error: 'Project not found' });
        json(res, 200, project);
      },
    },

    /* ---- Delete project ---- */
    {
      method: 'DELETE',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)$/,
      handler: (_req, res, match) => {
        const deleted = svc.deleteProject(match.groups!.id);
        if (!deleted) return json(res, 404, { error: 'Project not found' });
        json(res, 200, { ok: true });
      },
    },

    /* ---- Start pipeline ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>(?!batch\/)[^/]+)\/start$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ videoFilePath?: string }>(req).catch(() => ({} as { videoFilePath?: string }));
        const result = svc.startPipeline(match.groups!.id, body.videoFilePath);
        if ('error' in result) return json(res, result.status, { error: result.error });
        json(res, 200, { ok: true, projectId: match.groups!.id });
      },
    },

    /* ---- Batch start pipelines (bounded concurrency via queue) ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/batch\/start$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<{ projectIds: string[] }>(req);
        const projectIds = (body.projectIds ?? [])
          .map((id) => id?.trim())
          .filter((id): id is string => !!id);
        if (projectIds.length === 0) {
          return json(res, 400, { error: 'projectIds array is required' });
        }

        const started: string[] = [];
        const queued: string[] = [];
        const failed: Array<{ projectId: string; error: string; status: number }> = [];

        for (const projectId of projectIds) {
          const result = svc.enqueueProject(projectId);
          if ('error' in result) {
            failed.push({ projectId, error: result.error, status: result.status });
          } else if (result.position === 'started') {
            started.push(projectId);
          } else {
            queued.push(projectId);
          }
        }

        const hasFailure = failed.length > 0;
        json(res, hasFailure ? 207 : 200, {
          ok: !hasFailure,
          started,
          queued,
          failed,
        });
      },
    },

    /* ---- Queue / running status ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/running$/,
      handler: (_req, res) => json(res, 200, svc.getQueueSnapshot()),
    },

    /* ---- Stop pipeline ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/stop$/,
      handler: (_req, res, match) => {
        svc.stopPipeline(match.groups!.id);
        json(res, 200, { ok: true });
      },
    },

    /* ---- Retry stage ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/retry\/(?<stage>[A-Z_]+)$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ directive?: string }>(req).catch(() => ({} as { directive?: string }));
        const result = svc.retryStage(match.groups!.id, match.groups!.stage as PipelineStage, body.directive);
        if ('error' in result) return json(res, result.status, { error: result.error });
        json(res, 200, { ok: true, projectId: match.groups!.id, stage: match.groups!.stage });
      },
    },

    /* ---- ETA estimate ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/eta$/,
      handler: (_req, res, match) => {
        const eta = svc.getEta(match.groups!.id);
        json(res, 200, eta ?? { etaMs: null });
      },
    },

    /* ---- Regenerate scene (with optional feedback) ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/scenes\/(?<sceneId>[^/]+)\/regenerate$/,
      handler: async (req, res, match) => {
        try {
          const body = await parseJsonBody<{ feedback?: string }>(req).catch(() => ({} as { feedback?: string }));
          const scene = await svc.regenerateScene(match.groups!.id, match.groups!.sceneId, body.feedback);
          json(res, 200, scene);
        } catch (err) {
          const msg = sanitizeError(err);
          const status = msg.includes('already being regenerated') ? 409 : 400;
          json(res, status, { error: msg });
        }
      },
    },

    /* ---- Resume pipeline ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/resume$/,
      handler: (_req, res, match) => {
        const result = svc.resumePipeline(match.groups!.id);
        if ('error' in result) return json(res, result.status, { error: result.error });
        json(res, 200, { ok: true, projectId: match.groups!.id });
      },
    },

    /* ---- Pause pipeline ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/pause$/,
      handler: (_req, res, match) => {
        const result = svc.requestPause(match.groups!.id);
        if ('error' in result) return json(res, result.status, { error: result.error });
        json(res, 200, { ok: true, projectId: match.groups!.id });
      },
    },
  ];
}
