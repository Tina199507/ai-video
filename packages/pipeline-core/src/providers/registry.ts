/* ------------------------------------------------------------------ */
/*  PluginRegistry – runtime registry for provider plugins            */
/*  Follows the same pattern as stageRegistry.ts: simple register()   */
/*  + query interface. Tracks quota state per plugin.                 */
/* ------------------------------------------------------------------ */

import type { AIAdapter, PipelineStage } from '../pipelineTypes.js';
import type { ProviderPlugin, PluginState, PluginDeps } from './types.js';

/* ---- Task capability requirements ---- */

const TASK_CAPABILITY_MAP: Record<string, keyof import('./types.js').PluginCapabilities> = {
  safety_check: 'text',
  video_analysis: 'text',
  fact_research: 'text',
  claim_verification: 'text',
  calibration: 'text',
  narrative_map: 'text',
  script_generation: 'text',
  quality_review: 'text',
  visual_prompts: 'text',
  image_generation: 'imageGeneration',
  video_generation: 'videoGeneration',
  tts: 'tts',
  assembly: 'text',
};

export class PluginRegistry {
  private plugins = new Map<string, PluginState>();

  register(plugin: ProviderPlugin): void {
    this.plugins.set(plugin.id, { plugin, quotaExhausted: false });
  }

  get(id: string): ProviderPlugin | undefined {
    return this.plugins.get(id)?.plugin;
  }

  getState(id: string): PluginState | undefined {
    return this.plugins.get(id);
  }

  getAll(): ProviderPlugin[] {
    return [...this.plugins.values()].map(s => s.plugin);
  }

  findForTask(stage: PipelineStage, taskType: string): PluginState[] {
    const requiredCap = TASK_CAPABILITY_MAP[taskType] ?? 'text';
    const results: Array<{ state: PluginState; score: number }> = [];

    for (const state of this.plugins.values()) {
      const p = state.plugin;
      if (!p.capabilities[requiredCap]) continue;

      let score = 100;
      if (p.routing) {
        for (const rule of p.routing) {
          let ruleMatches = true;
          if (rule.stages?.length && !rule.stages.includes(stage)) ruleMatches = false;
          if (rule.taskTypes?.length && !rule.taskTypes.includes(taskType)) ruleMatches = false;
          if (ruleMatches) {
            score += 50;
            score += rule.priority ?? 0;
          }
        }
      }
      if (p.costTier === 'free') score += 20;
      if (state.quotaExhausted) score -= 1000;
      results.push({ state, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.state);
  }

  createAdapter(pluginId: string, deps: PluginDeps): AIAdapter | undefined {
    const state = this.plugins.get(pluginId);
    if (!state) return undefined;
    return state.plugin.createAdapter(deps);
  }

  markQuotaExhausted(pluginId: string): void {
    const state = this.plugins.get(pluginId);
    if (state) state.quotaExhausted = true;
  }

  resetQuota(pluginId: string): void {
    const state = this.plugins.get(pluginId);
    if (state) state.quotaExhausted = false;
  }

  resetAllQuotas(): void {
    for (const state of this.plugins.values()) state.quotaExhausted = false;
  }

  toJSON(): Record<string, { id: string; name: string; adapterType: string; capabilities: Record<string, boolean>; costTier: string; quotaExhausted: boolean; models?: string[] }> {
    const result: Record<string, any> = {};
    for (const [id, state] of this.plugins) {
      result[id] = {
        id: state.plugin.id,
        name: state.plugin.name,
        adapterType: state.plugin.adapterType,
        capabilities: { ...state.plugin.capabilities },
        costTier: state.plugin.costTier,
        quotaExhausted: state.quotaExhausted,
        models: state.plugin.models,
      };
    }
    return result;
  }
}

const globalRegistry = new PluginRegistry();

export function registerPlugin(plugin: ProviderPlugin): void {
  globalRegistry.register(plugin);
}

export function getGlobalPluginRegistry(): PluginRegistry {
  return globalRegistry;
}
