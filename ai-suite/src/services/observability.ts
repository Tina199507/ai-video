import { PipelineStage } from "../types";
import { Logger } from "../lib/logger";
import { maskPII } from "../lib/sanitize";

export interface ObservationEvent {
  traceId: string;
  stage: PipelineStage | string;
  model: string;
  promptLength?: number;
  responseLength?: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
  costEstimate?: number;
  timestamp: number;
}

export interface QualityMetric {
  traceId?: string;
  metric: 'style_consistency' | 'safety_score' | 'numeric_risk' | 'fact_coverage' | 'structure_stability';
  value: number; // 0-1
  context?: string;
  timestamp: number;
}

class ObservabilityService {
  private events: ObservationEvent[] = [];
  private metrics: QualityMetric[] = [];
  private promptHistory: Map<string, string[]> = new Map(); // fingerprint -> prompts
  private allPrompts: { stage: string, model: string, prompt: string, timestamp: number }[] = [];
  private totalCost: number = 0;

  /**
   * Log the start of an LLM call with the prompt details.
   */
  logPrompt(traceId: string, stage: string, model: string, prompt: string, metadata?: Record<string, any>) {
    const promptHash = prompt.substring(0, 64) + '...';
    const scopedLogger = Logger.withContext(traceId);
    scopedLogger.info(`PROMPT ${stage} (${model}) Hash: ${promptHash}`, metadata);
    scopedLogger.data(`AI Prompt: ${stage}`, maskPII(prompt));
    
    this.allPrompts.push({
      stage,
      model,
      prompt: maskPII(prompt),
      timestamp: Date.now()
    });
  }

  /**
   * Log the result of an LLM call.
   */
  logResult(traceId: string, stage: string, model: string, durationMs: number, success: boolean, metadata?: Record<string, any>, costEstimate?: number) {
    const event: ObservationEvent = {
      traceId,
      stage,
      model,
      latencyMs: durationMs,
      success,
      error: metadata?.error ? String(metadata.error) : undefined,
      metadata,
      costEstimate,
      timestamp: Date.now()
    };
    
    this.events.push(event);
    if (costEstimate) this.totalCost += costEstimate;

    const scopedLogger = Logger.withContext(traceId);
    scopedLogger.info(`RESULT ${stage} (${model}): ${success ? 'OK' : 'FAIL'} ${durationMs}ms${costEstimate ? ` ~$${costEstimate.toFixed(4)}` : ''}`, {
        tokens: metadata?.tokens,
        error: event.error
    });
    
    // In a real production app, this would send to Datadog/Sentry/Prometheus
    // e.g., metrics.increment(`model_call_total`, { model, stage, success: String(success) });
    // e.g., metrics.histogram(`generation_latency_seconds`, durationMs / 1000, { model, stage });
  }

  /**
   * Legacy method for backward compatibility.
   */
  logLLMCall(
    stage: string,
    model: string,
    latencyMs: number,
    success: boolean,
    metadata?: Record<string, any>
  ) {
    const traceId = metadata?.traceId || `legacy-${Date.now()}`;
    
    if (metadata?.prompt) {
        this.logPrompt(traceId, stage, model, metadata.prompt, { length: metadata.prompt.length });
    }

    this.logResult(traceId, stage, model, latencyMs, success, metadata, metadata?.costEstimate);

    // Track prompt versioning if fingerprint provided
    if (metadata?.fingerprint && metadata?.prompt) {
        if (!this.promptHistory.has(metadata.fingerprint)) {
            this.promptHistory.set(metadata.fingerprint, []);
        }
        this.promptHistory.get(metadata.fingerprint)?.push(maskPII(metadata.prompt));
    }
  }

  /**
   * Log a quality metric (e.g. style score, safety risk)
   */
  logQualityMetric(metric: QualityMetric['metric'], value: number, context?: string, traceId?: string) {
    this.metrics.push({ traceId, metric, value, context, timestamp: Date.now() });
    if (traceId) {
        Logger.withContext(traceId).info(`[QUALITY] ${metric}: ${value.toFixed(2)} ${context || ''}`);
    } else {
        Logger.info(`[QUALITY] ${metric}: ${value.toFixed(2)} ${context || ''}`);
    }
    
    // e.g., metrics.histogram(`quality_${metric}`, value);
  }

  /**
   * Log specific safety event
   */
  logSafety(category: string, isRisk: boolean, details?: string, traceId?: string) {
      this.logQualityMetric('safety_score', isRisk ? 0 : 1, `${category}: ${details}`, traceId);
      if (isRisk) {
          // e.g., metrics.increment(`safety_flags_total`, { category });
      }
  }

  /**
   * Get aggregated stats for dashboard or debugging
   */
  getStats() {
    const totalCalls = this.events.length;
    const failures = this.events.filter(e => !e.success).length;
    const avgLatency = this.events.reduce((acc, e) => acc + e.latencyMs, 0) / (totalCalls || 1);
    
    return {
      totalCalls,
      failureRate: totalCalls ? failures / totalCalls : 0,
      avgLatency,
      totalCost: this.totalCost,
      recentMetrics: this.metrics.slice(-20),
      recentErrors: this.events.filter(e => !e.success).slice(-5),
      allPrompts: this.allPrompts
    };
  }
}

export const Observability = new ObservabilityService();
