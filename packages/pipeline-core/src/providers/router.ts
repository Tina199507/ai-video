/* ------------------------------------------------------------------ */
/*  Plugin-based routing – capability-scored provider selection       */
/*  Replaces the hardcoded ROUTE_TABLE with dynamic scoring against   */
/*  registered plugins. Falls back to legacy routeTask() if no        */
/*  plugin matches.                                                    */
/* ------------------------------------------------------------------ */

import type { PipelineStage, ModelOverrides } from '../pipelineTypes.js';
import type { PluginDecision } from './types.js';
import type { PluginRegistry } from './registry.js';
import { routeTask } from '../qualityRouter.js';

export function resolvePlugin(
  stage: PipelineStage,
  taskType: string,
  registry: PluginRegistry,
  overrides?: ModelOverrides,
): PluginDecision {
  if (overrides?.[taskType]) {
    const ov = overrides[taskType]!;
    return {
      pluginId: '__override__',
      adapter: ov.adapter,
      model: ov.model,
      provider: ov.provider,
      reason: `User override for ${taskType}`,
    };
  }

  const candidates = registry.findForTask(stage, taskType);
  const primary = candidates[0];

  if (!primary) {
    const legacy = routeTask(stage, taskType);
    return { ...legacy, pluginId: '__legacy__' };
  }

  const p = primary.plugin;
  const model = pickModel(p, stage, taskType);
  const fallbackPluginId = resolveFallback(primary, candidates, registry);

  const decision: PluginDecision = {
    pluginId: p.id,
    adapter: p.adapterType,
    provider: p.id,
    model,
    reason: `Plugin ${p.name} (score-based selection)`,
  };
  if (fallbackPluginId) decision.fallbackPluginId = fallbackPluginId;

  if (primary.quotaExhausted && fallbackPluginId) {
    const fb = registry.get(fallbackPluginId);
    if (fb) {
      decision.pluginId = fallbackPluginId;
      decision.fallbackPluginId = p.id;
      decision.adapter = fb.adapterType;
      decision.provider = fb.id;
      decision.reason = `${p.name} 配额已用完，切换到 ${fb.name}`;
      decision.model = pickModel(fb, stage, taskType);
    }
  }

  return decision;
}

function pickModel(
  plugin: { routing?: Array<{ stages?: PipelineStage[]; taskTypes?: string[]; defaultModel?: string }> },
  stage: PipelineStage,
  taskType: string,
): string | undefined {
  if (!plugin.routing) return undefined;
  for (const rule of plugin.routing) {
    const stageMatch = !rule.stages?.length || rule.stages.includes(stage);
    const taskMatch = !rule.taskTypes?.length || rule.taskTypes.includes(taskType);
    if (stageMatch && taskMatch && rule.defaultModel) return rule.defaultModel;
  }
  return undefined;
}

function resolveFallback(
  primary: { plugin: { id: string; fallbackPluginId?: string; costTier: 'free' | 'paid' } },
  candidates: ReadonlyArray<{ plugin: { id: string; costTier: 'free' | 'paid' } }>,
  registry: PluginRegistry,
): string | undefined {
  if (primary.plugin.fallbackPluginId && registry.get(primary.plugin.fallbackPluginId)) {
    return primary.plugin.fallbackPluginId;
  }
  for (const c of candidates) {
    if (c.plugin.id === primary.plugin.id) continue;
    if (c.plugin.costTier !== primary.plugin.costTier) return c.plugin.id;
  }
  for (const c of candidates) {
    if (c.plugin.id !== primary.plugin.id) return c.plugin.id;
  }
  return undefined;
}
