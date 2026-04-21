// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { json, parseJsonBody, sanitizeError, type Route } from './helpers.js';
import type { ModelOverrides } from '@ai-video/pipeline-core/index.js';
import type { StageProviderOverrides } from '@ai-video/shared/types.js';
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';
import { getAllPrompts, getPromptDefault, getPromptNames } from '@ai-video/pipeline-core/promptResolver.js';

export function pipelineEditorRoutes(svc: PipelineService): Route[] {
  return [
    /* ---- Update script ---- */
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/script$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ scriptText: string }>(req);
        if (!body.scriptText) return json(res, 400, { error: 'scriptText is required' });
        try {
          json(res, 200, svc.updateScript(match.groups!.id, body.scriptText));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Update scenes ---- */
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/scenes$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ scenes: any[] }>(req);
        if (!body.scenes) return json(res, 400, { error: 'scenes array is required' });
        try {
          json(res, 200, svc.updateScenes(match.groups!.id, body.scenes));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Update scene quality ---- */
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/scenes\/(?<sceneId>[^/]+)\/quality$/,
      handler: async (req, res, match) => {
        try {
          const body = await parseJsonBody<any>(req);
          if (!body || typeof body !== 'object') return json(res, 400, { error: 'quality body required' });
          json(res, 200, svc.updateSceneQuality(match.groups!.id, match.groups!.sceneId, body));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Approve scene ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/scenes\/(?<sceneId>[^/]+)\/approve$/,
      handler: (_req, res, match) => {
        try {
          json(res, 200, svc.approveScene(match.groups!.id, match.groups!.sceneId));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Reject scene ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/scenes\/(?<sceneId>[^/]+)\/reject$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ reason?: string }>(req).catch(() => ({} as { reason?: string }));
        try {
          json(res, 200, svc.rejectScene(match.groups!.id, match.groups!.sceneId, body.reason));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- QA override ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/qa-override$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ feedback?: string }>(req).catch(() => ({} as { feedback?: string }));
        try {
          json(res, 200, svc.approveQaReview(match.groups!.id, body));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Approve reference images ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/approve-reference$/,
      handler: (_req, res, match) => {
        try {
          json(res, 200, svc.approveReferenceImages(match.groups!.id));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Set style profile ---- */
    {
      method: 'POST',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/style-profile$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ pastedText?: string; styleProfile?: any; topic?: string; formatSignature?: any }>(req);
        try {
          const project = await svc.setStyleProfile(match.groups!.id, body.pastedText, body.styleProfile, body.topic, body.formatSignature);
          json(res, 200, project);
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Update model overrides ---- */
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/overrides$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ modelOverrides: ModelOverrides }>(req);
        try {
          json(res, 200, svc.updateModelOverrides(match.groups!.id, body.modelOverrides ?? {}));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Stage provider overrides ---- */
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/stage-overrides$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ stageProviderOverrides: StageProviderOverrides }>(req);
        try {
          json(res, 200, svc.updateStageProviderOverrides(match.groups!.id, body.stageProviderOverrides ?? {}));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Storyboard replication settings ---- */
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/storyboard-replication$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ enabled?: boolean; strength?: 'low' | 'medium' | 'high'; sourceProjectId?: string; notes?: string }>(req);
        try {
          json(res, 200, svc.updateStoryboardReplication(match.groups!.id, body ?? {}));
        } catch (err) {
          const msg = sanitizeError(err);
          const status = msg.toLowerCase().includes('not found') ? 404 : 400;
          json(res, status, { error: msg });
        }
      },
    },

    /* ---- Stage providers (available AI providers per stage) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/stage-providers$/,
      handler: (_req, res) => json(res, 200, svc.getStageProviders()),
    },

    /* ---- Prompt overrides CRUD ---- */
    {
      method: 'GET',
      pattern: /^\/api\/prompts\/defaults$/,
      handler: (_req, res) => {
        const names = getPromptNames();
        const defaults: Record<string, string> = {};
        for (const n of names) defaults[n] = getPromptDefault(n) ?? '';
        json(res, 200, defaults);
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/prompts$/,
      handler: (_req, res, match) => {
        const project = svc.loadProject(match.groups!.id);
        if (!project) return json(res, 404, { error: 'Project not found' });
        json(res, 200, getAllPrompts(project));
      },
    },
    {
      method: 'PUT',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/prompts\/(?<promptName>[^/]+)$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<{ text: string }>(req);
        if (typeof body.text !== 'string') return json(res, 400, { error: 'text is required' });
        try {
          json(res, 200, svc.setPromptOverride(match.groups!.id, decodeURIComponent(match.groups!.promptName), body.text));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/prompts\/(?<promptName>[^/]+)$/,
      handler: (_req, res, match) => {
        try {
          json(res, 200, svc.deletePromptOverride(match.groups!.id, decodeURIComponent(match.groups!.promptName)));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },

    /* ---- Iteration records ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/iterations$/,
      handler: (_req, res, match) => {
        try {
          json(res, 200, svc.getIterations(match.groups!.id));
        } catch (err) {
          json(res, 400, { error: sanitizeError(err) });
        }
      },
    },
  ];
}
