// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { spawnSync } from 'node:child_process';
import { json, parseJsonBody, type Route } from './helpers.js';
import type { TTSSettings } from '.././configStore.js';
import type { VideoProviderConfig } from '@ai-video/pipeline-core/videoProvider.js';
import { isEdgeTTSAvailable, listVoices } from '@ai-video/pipeline-core/ttsProvider.js';
import { isFFmpegAvailable } from '@ai-video/pipeline-core/ffmpegAssembler.js';
import { listPresets, getPreset } from '@ai-video/pipeline-core/providerPresets.js';
import { resolveChromiumChannel } from '@ai-video/pipeline-core/browserManager.js';
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';

function runSilent(file: string, args: string[], timeoutMs = 10_000): boolean {
  try {
    const res = spawnSync(file, args, { stdio: 'ignore', timeout: timeoutMs, shell: false });
    return res.status === 0;
  } catch { return false; }
}

function isPlaywrightInstalled(): boolean {
  return runSilent('npx', ['playwright', '--version']);
}

function isChromiumInstalled(): boolean {
  const channel = resolveChromiumChannel();
  if (channel === undefined) return true;
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const binaries = process.platform === 'win32'
    ? ['chrome']
    : ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'];
  for (const bin of binaries) {
    if (runSilent(locator, [bin], 5000)) return true;
  }
  return false;
}

export function pipelineConfigRoutes(svc: PipelineService): Route[] {
  return [
    /* ---- Config ---- */
    {
      method: 'GET',
      pattern: /^\/api\/config$/,
      handler: (_req, res) => json(res, 200, svc.getConfig()),
    },
    {
      method: 'POST',
      pattern: /^\/api\/config$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<{ aivideomakerApiKey?: string; productionConcurrency?: number }>(req);
        json(res, 200, svc.updateConfig(body));
      },
    },

    /* ---- Environment diagnostics ---- */
    {
      method: 'GET',
      pattern: /^\/api\/config\/environment$/,
      handler: async (_req, res) => {
        const [ffmpeg, edgeTts, playwright] = await Promise.all([
          isFFmpegAvailable(),
          isEdgeTTSAvailable(),
          isPlaywrightInstalled(),
        ]);
        json(res, 200, {
          ffmpegAvailable: ffmpeg,
          edgeTtsAvailable: edgeTts,
          playwrightAvailable: playwright,
          chromiumAvailable: isChromiumInstalled(),
          nodeVersion: process.version,
          platform: process.platform,
          dataDir: svc.getDataDir(),
        });
      },
    },

    /* ---- TTS config ---- */
    {
      method: 'GET',
      pattern: /^\/api\/config\/tts$/,
      handler: (_req, res) => json(res, 200, svc.getTtsConfig()),
    },
    {
      method: 'POST',
      pattern: /^\/api\/config\/tts$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<TTSSettings>(req);
        svc.updateTtsConfig(body);
        json(res, 200, { ok: true, ttsConfig: body });
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/config\/tts\/voices$/,
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const voices = await listVoices(url.searchParams.get('locale') ?? undefined);
        json(res, 200, { voices });
      },
    },

    /* ---- Video provider config ---- */
    {
      method: 'GET',
      pattern: /^\/api\/config\/video-provider$/,
      handler: (_req, res) => json(res, 200, svc.getVideoProviderConfig()),
    },
    {
      method: 'POST',
      pattern: /^\/api\/config\/video-provider$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<VideoProviderConfig | null>(req);
        svc.updateVideoProviderConfig(body);
        json(res, 200, { ok: true, videoProviderConfig: body });
      },
    },

    /* ---- Queue detection presets ---- */
    {
      method: 'GET',
      pattern: /^\/api\/config\/queue-detection$/,
      handler: (_req, res) => json(res, 200, svc.getQueueDetectionPresets()),
    },
    {
      method: 'POST',
      pattern: /^\/api\/config\/queue-detection$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<Record<string, any>>(req);
        if (!body || typeof body !== 'object') return json(res, 400, { error: 'Invalid body' });
        svc.updateQueueDetectionPresets(body);
        json(res, 200, { ok: true, queueDetection: svc.getQueueDetectionPresets() });
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/api\/config\/queue-detection\/(?<id>[^/]+)$/,
      handler: (_req, res, match) => {
        const id = decodeURIComponent(match.groups!.id);
        const deleted = svc.deleteQueueDetectionPreset(id);
        if (!deleted) return json(res, 404, { error: 'Override not found' });
        json(res, 200, { ok: true });
      },
    },

    /* ---- Provider capabilities ---- */
    {
      method: 'GET',
      pattern: /^\/api\/providers\/capabilities$/,
      handler: (_req, res) => json(res, 200, svc.getProviderCapabilities()),
    },
    {
      method: 'PUT',
      pattern: /^\/api\/providers\/(?<id>[^/]+)\/capabilities$/,
      handler: async (req, res, match) => {
        const body = await parseJsonBody<Record<string, any>>(req);
        json(res, 200, svc.updateProviderCapability(match.groups!.id, body));
      },
    },

    /* ---- Presets ---- */
    {
      method: 'GET',
      pattern: /^\/api\/presets$/,
      handler: (_req, res) => json(res, 200, listPresets()),
    },
    {
      method: 'GET',
      pattern: /^\/api\/presets\/(?<id>[^/]+)$/,
      handler: (_req, res, match) => {
        const preset = getPreset(decodeURIComponent(match.groups!.id));
        if (!preset) return json(res, 404, { error: 'Preset not found' });
        json(res, 200, preset);
      },
    },

    /* ---- Sessions ---- */
    {
      method: 'GET',
      pattern: /^\/api\/sessions$/,
      handler: (_req, res) => json(res, 200, svc.getSessions()),
    },

    /* ---- Provider summary (for SetupPage dashboard) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/providers\/summary$/,
      handler: (_req, res) => json(res, 200, svc.getProviderSummary()),
    },

    /* ---- Route table (current routing decisions per stage) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/config\/route-table$/,
      handler: (_req, res) => json(res, 200, svc.getRouteTable()),
    },

    /* ---- Style templates ---- */
    {
      method: 'GET',
      pattern: /^\/api\/style-templates$/,
      handler: (_req, res) => json(res, 200, svc.styleLibrary.list()),
    },
    {
      method: 'POST',
      pattern: /^\/api\/style-templates$/,
      handler: async (req, res) => {
        const body = await parseJsonBody<{ name: string; topic: string; styleProfile: Record<string, unknown>; formatSignature?: any }>(req);
        if (!body.name?.trim() || !body.styleProfile) return json(res, 400, { error: 'name and styleProfile required' });
        json(res, 201, svc.styleLibrary.save(body.name.trim(), body.topic ?? '', body.styleProfile, body.formatSignature));
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/style-templates\/(?<id>[^/]+)$/,
      handler: (_req, res, match) => {
        const tpl = svc.styleLibrary.load(match.groups!.id);
        if (!tpl) return json(res, 404, { error: 'Template not found' });
        json(res, 200, tpl);
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/api\/style-templates\/(?<id>[^/]+)$/,
      handler: (_req, res, match) => {
        const deleted = svc.styleLibrary.delete(match.groups!.id);
        if (!deleted) return json(res, 404, { error: 'Template not found' });
        json(res, 200, { ok: true });
      },
    },

    /* ---- Cost tracking ---- */
    {
      method: 'GET',
      pattern: /^\/api\/costs$/,
      handler: (_req, res) => json(res, 200, svc.getGlobalCostSummary()),
    },
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/costs$/,
      handler: (_req, res, match) => {
        json(res, 200, svc.getProjectCostSummary(match.groups!.id));
      },
    },

    /* ---- Video provider health ---- */
    {
      method: 'GET',
      pattern: /^\/api\/providers\/video-health$/,
      handler: (_req, res) => json(res, 200, svc.getVideoProviderHealth()),
    },
    {
      method: 'GET',
      pattern: /^\/api\/providers\/video-health\/(?<id>[^/]+)\/recommendation$/,
      handler: (_req, res, match) => {
        json(res, 200, svc.getVideoProviderRecommendation(decodeURIComponent(match.groups!.id)));
      },
    },
  ];
}
