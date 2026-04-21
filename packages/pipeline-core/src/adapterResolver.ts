/* ------------------------------------------------------------------ */
/*  adapterResolver – resolves the AIAdapter to use for a stage/task   */
/*                                                                     */
/*  Extracted from orchestrator.ts. Encapsulates both the legacy       */
/*  qualityRouter path and the plugin-based path behind a single API   */
/*  so the orchestrator no longer carries adapter-wrap plumbing.       */
/* ------------------------------------------------------------------ */

import type { AIAdapter, ModelOverrides, PipelineStage } from './pipelineTypes.js';
import { resolveProvider, selectAdapter } from './qualityRouter.js';
import type { ProviderCapabilityRegistry } from './providerRegistry.js';
import { resolvePlugin, type PluginDeps, type PluginRegistry } from './providers/index.js';
import { createLoggingAdapter } from './loggingAdapter.js';
import { createControlledAdapter, createSessionScopedAdapter } from './aiControl.js';
import { SessionManager } from './sessionManager.js';
import { CostTracker } from './costTracker.js';
import { ObservabilityService } from './observability.js';
import type { TraceContext, TraceWriter } from './traceStore.js';
import { createLogger } from '@ai-video/pipeline-core/libFacade.js';
import type { PipelineProject } from './pipelineTypes.js';

const log = createLogger('AdapterResolver');

export interface AdapterScope {
  projectId: string;
  projectDir: string;
  abortSignal?: AbortSignal;
}

export interface AdapterTraceState {
  writer: TraceWriter;
  ctx: TraceContext;
}

export interface AdapterResolverDeps {
  chatAdapter: AIAdapter;
  providerRegistry: ProviderCapabilityRegistry;
  sessionManager: SessionManager;
  observability: ObservabilityService;
  costTracker: CostTracker;
  pluginRegistry?: PluginRegistry;
  pluginDeps?: PluginDeps;
  loadProject: (projectId: string) => PipelineProject | null;
  /** Look up the current per-project trace state, if any. */
  getTraceState: (projectId: string) => AdapterTraceState | undefined;
}

/**
 * Bind a default model to an adapter by delegating every generateX call
 * with a model-fallback.  Returned adapter is transparent in every other
 * respect (including optional `uploadFile` / `generateSpeech`).
 */
export function bindDefaultModel(adapter: AIAdapter, defaultModel?: string): AIAdapter {
  if (!defaultModel) return adapter;

  const passthrough = adapter as AIAdapter & { config?: { sessionId?: string; continueChat?: boolean } };
  const resolveModel = (model: string) => model || defaultModel;

  return {
    provider: passthrough.provider,
    generateText(model, prompt, options) {
      return passthrough.generateText(resolveModel(model), prompt, options);
    },
    generateImage(model, prompt, aspectRatio, negativePrompt, options) {
      return passthrough.generateImage(resolveModel(model), prompt, aspectRatio, negativePrompt, options);
    },
    generateVideo(model, prompt, options) {
      return passthrough.generateVideo(resolveModel(model), prompt, options);
    },
    uploadFile: passthrough.uploadFile?.bind(passthrough),
    generateSpeech: passthrough.generateSpeech?.bind(passthrough),
  };
}

export class AdapterResolver {
  constructor(private readonly deps: AdapterResolverDeps) {}

  /**
   * Resolve the adapter for a stage+taskType.
   *
   * Routing precedence:
   *   1. Stage-level provider overrides (per project)
   *   2. Plugin-based routing (if `pluginRegistry` + `pluginDeps` present)
   *   3. Legacy `qualityRouter` path
   */
  resolve(
    scope: AdapterScope,
    stage: PipelineStage,
    taskType: string,
    overrides?: ModelOverrides,
  ): AIAdapter {
    const effective = this.applyStageOverride(scope.projectId, stage, taskType, overrides);

    if (this.deps.pluginRegistry && this.deps.pluginDeps) {
      return this.resolveViaPlugin(scope, stage, taskType, effective);
    }
    return this.resolveViaLegacy(scope, stage, taskType, effective);
  }

  /** Wrap the resolver output in session-aware metadata for ChatAdapter. */
  resolveSessionAware(
    scope: AdapterScope,
    stage: PipelineStage,
    taskType: string,
    overrides?: ModelOverrides,
  ): AIAdapter {
    const adapter = this.resolve(scope, stage, taskType, overrides);
    const shouldContinue = this.deps.sessionManager.shouldContinueChat(scope.projectId, stage);
    const session = this.deps.sessionManager.getSession(scope.projectId, stage);
    return createSessionScopedAdapter(
      adapter,
      { sessionId: session.sessionId, continueChat: shouldContinue },
      () => this.deps.sessionManager.recordMessage(scope.projectId, stage),
    );
  }

  /* ----------------------------- private ---------------------------- */

  private applyStageOverride(
    projectId: string,
    stage: PipelineStage,
    taskType: string,
    overrides?: ModelOverrides,
  ): ModelOverrides | undefined {
    const project = this.deps.loadProject(projectId);
    const stageOverride = project?.stageProviderOverrides?.[stage];
    if (!stageOverride) return overrides;
    return {
      ...overrides,
      [taskType]: {
        adapter: stageOverride.adapter,
        provider: stageOverride.provider,
        model: stageOverride.model,
      },
    };
  }

  private buildTraceCtx(projectId: string) {
    const state = this.deps.getTraceState(projectId);
    return state
      ? { writer: state.writer, parentTrace: state.ctx, projectId }
      : undefined;
  }

  private wrapChat(
    raw: AIAdapter,
    scope: AdapterScope,
    stage: PipelineStage,
    taskType: string,
  ): AIAdapter {
    const controlled = createControlledAdapter(raw, {
      projectId: scope.projectId,
      stage,
      taskType,
      signal: scope.abortSignal,
    });
    return createLoggingAdapter(
      controlled, scope.projectDir, stage, taskType,
      { costTracker: this.deps.costTracker, projectId: scope.projectId },
      this.buildTraceCtx(scope.projectId),
      (_method: string, estimatedTokens?: number) => {
        this.deps.observability.recordLlmCall(scope.projectId, stage as any, estimatedTokens);
      },
    );
  }

  private resolveViaLegacy(
    scope: AdapterScope,
    stage: PipelineStage,
    taskType: string,
    overrides?: ModelOverrides,
  ): AIAdapter {
    const decision = resolveProvider(stage, taskType, this.deps.providerRegistry, overrides);
    const chatForStage = this.wrapChat(this.deps.chatAdapter, scope, stage, taskType);
    const adapter = selectAdapter(decision, chatForStage);
    const bound = bindDefaultModel(adapter, decision.model);
    log.info('adapter_resolved', {
      stage, taskType, adapter: decision.adapter,
      provider: adapter.provider, model: decision.model || undefined,
    });
    return bound;
  }

  private resolveViaPlugin(
    scope: AdapterScope,
    stage: PipelineStage,
    taskType: string,
    overrides?: ModelOverrides,
  ): AIAdapter {
    const registry = this.deps.pluginRegistry!;
    const pluginDeps = this.deps.pluginDeps!;
    const decision = resolvePlugin(stage, taskType, registry, overrides);

    const primaryRaw = registry.createAdapter(decision.pluginId, pluginDeps);
    if (!primaryRaw) {
      log.info('plugin_adapter_fallback', {
        pluginId: decision.pluginId, stage, taskType,
        reason: 'createAdapter returned undefined',
      });
      const legacyDecision = resolveProvider(stage, taskType, this.deps.providerRegistry, overrides);
      const chatForStage = this.wrapChat(this.deps.chatAdapter, scope, stage, taskType);
      return bindDefaultModel(chatForStage, legacyDecision.model);
    }

    const primary = this.wrapChat(primaryRaw, scope, stage, taskType);
    const bound = bindDefaultModel(primary, decision.model);
    log.info('adapter_resolved_plugin', {
      stage, taskType, pluginId: decision.pluginId,
      model: decision.model || undefined,
    });
    return bound;
  }
}
