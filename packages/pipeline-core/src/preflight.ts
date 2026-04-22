/* ------------------------------------------------------------------ */
/*  preflight – pre-run checks executed before the stage loop          */
/*                                                                     */
/*  Extracted from orchestrator.ts to keep that file focused on stage  */
/*  execution and state management. These checks fail fast so the UI   */
/*  gets an actionable error in seconds instead of minutes.            */
/* ------------------------------------------------------------------ */

import type { LogEntry, PipelineProject, PipelineStage } from './pipelineTypes.js';
import type { ProviderCapabilityRegistry } from './providerRegistry.js';
import type { ResourcePlan } from './resourcePlanner.js';
import type { AIAdapter } from './pipelineTypes.js';

export interface PreflightDependencies {
  providerRegistry: ProviderCapabilityRegistry;
  aivideomakerAdapters?: AIAdapter[];
  /** Stages already completed (skip their preflight guard). */
  preCompletedStages: Set<PipelineStage>;
  /** Callback used to pipe preflight warnings into the project log. */
  addLog: (entry: LogEntry) => void;
  /** Resource-plan provider for the feasibility gate. */
  getResourcePlan: (project: PipelineProject) => ResourcePlan;
}

/**
 * Run every preflight guard. Throws on hard-blockers, logs warnings
 * for soft issues. Keep in sync with the stage list — additional stages
 * that need fail-fast checks should register guards here.
 */
export async function runPreflight(
  project: PipelineProject,
  stagesCount: number,
  deps: PreflightDependencies,
): Promise<void> {
  // B1: Stage registry must be populated
  if (stagesCount === 0) {
    throw new Error(
      'Pipeline stage registry is empty — no stages registered. ' +
      'This indicates a broken build or missing stage definitions.',
    );
  }

  // B4: at least one text-capable provider for CAPABILITY_ASSESSMENT
  const textProviders = deps.providerRegistry.findProviders({ text: true });
  if (textProviders.length === 0) {
    throw new Error(
      'No text-capable provider available. CAPABILITY_ASSESSMENT requires at least ' +
      'one provider with text: true. Configure an account (e.g. gemini) before running the pipeline.',
    );
  }

  // B5: video provider must be configured if VIDEO_GEN will run
  if (!deps.preCompletedStages.has('VIDEO_GEN' as PipelineStage)) {
    const videoProviders = deps.providerRegistry.findProviders({ videoGeneration: true });
    const hasAivideomaker = !!(deps.aivideomakerAdapters?.length);
    if (videoProviders.length === 0 && !hasAivideomaker) {
      throw new Error(
        '未配置视频生成服务。VIDEO_GEN 阶段需要 aivideomaker API Key。' +
        '请在设置中配置 aivideomaker API Key。',
      );
    }
  }

  // B5b: FFmpeg for ASSEMBLY (soft warning — ASSEMBLY stage will fail naturally if missing)
  if (!deps.preCompletedStages.has('ASSEMBLY' as PipelineStage)) {
    const { isFFmpegAvailable } = await import('./ffmpegAssembler.js');
    if (!(await isFFmpegAvailable())) {
      deps.addLog({
        id: `log_preflight_ffmpeg_${Date.now()}`,
        timestamp: new Date().toISOString(),
        message:
          '⚠️ FFmpeg 未安装。ASSEMBLY 阶段将无法拼接最终视频。' +
          '请运行: brew install ffmpeg (macOS) 或 apt-get install ffmpeg (Linux)。',
        type: 'warning',
      });
    }
  }

  // B5c: edge-tts for TTS (soft warning)
  if (!deps.preCompletedStages.has('TTS' as PipelineStage)) {
    const { isEdgeTTSAvailable } = await import('./ttsProvider.js');
    if (!(await isEdgeTTSAvailable())) {
      deps.addLog({
        id: `log_preflight_tts_${Date.now()}`,
        timestamp: new Date().toISOString(),
        message: '⚠️ edge-tts 未安装，TTS 阶段将跳过语音合成。安装: pip install edge-tts',
        type: 'warning',
        stage: 'TTS' as PipelineStage,
      });
    }
  }

  // B6: resource plan feasibility gate
  {
    const plan = deps.getResourcePlan(project);
    const criticalBlockers = plan.stages.filter(
      s => !s.feasible && !deps.preCompletedStages.has(s.stage),
    );
    if (criticalBlockers.length > 0) {
      const details = criticalBlockers
        .map(b => `${b.stage} (需要 ${Object.entries(b.requirements).filter(([, v]) => v).map(([k]) => k).join('+')})`)
        .join(', ');
      throw new Error(
        `资源不满足：以下阶段无可用服务商 — ${details}。` +
        '请在设置中配置支持所需能力的服务商账号，并确保浏览器 Profile 目录存在。',
      );
    }
  }

  // B7: warn if all providers lack browser profiles
  {
    const allProviders = deps.providerRegistry.getAll();
    const accountProviders = allProviders.filter(p => typeof p.profileExists === 'boolean');
    const noProfile = accountProviders.filter(p => !p.profileExists);
    if (accountProviders.length > 0 && noProfile.length === accountProviders.length) {
      const hasApiFallback = !!(deps.aivideomakerAdapters?.length);
      if (hasApiFallback) {
        deps.addLog({
          id: `log_preflight_noprofile_${Date.now()}`,
          timestamp: new Date().toISOString(),
          message:
            `⚠️ 所有已配置的服务商 (${noProfile.map(p => p.providerId).join(', ')}) 均缺少浏览器 Profile 目录，将使用 API 适配器。`,
          type: 'warning',
          stage: 'VIDEO_GEN' as PipelineStage,
        });
      } else {
        throw new Error(
          `所有已配置的服务商 (${noProfile.map(p => p.providerId).join(', ')}) 均缺少浏览器 Profile 目录。` +
          '请先在浏览器标签页中登录对应的 AI 服务商，系统会自动创建 Profile。',
        );
      }
    }
  }
}
