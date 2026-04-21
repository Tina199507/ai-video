/**
 * Pipeline-level Prometheus metrics — registered against the
 * @ai-video/lib globalMetrics registry so that /metrics in
 * server.ts can render every emitter without explicit wiring.
 *
 * Surface kept tight on purpose (see docs/slo.md):
 *   - pipeline_stage_duration_seconds  histogram (stage, status)
 *   - pipeline_retry_total              counter   (provider, reason)
 *   - pipeline_quota_errors_total       counter   (provider)
 *   - sse_connections_active            gauge
 */

import { globalMetrics } from '@ai-video/pipeline-core/libFacade.js';
import { registerRetryObserver, isQuotaError } from '@ai-video/pipeline-core/libFacade.js';

export const stageDurationHistogram = globalMetrics.histogram(
  'pipeline_stage_duration_seconds',
  'Wall-clock duration of pipeline stages, labelled by stage name and outcome',
  ['stage', 'status'],
);

export const retryCounter = globalMetrics.counter(
  'pipeline_retry_total',
  'Number of retry attempts initiated by withRetry, labelled by provider/label and reason class',
  ['label', 'reason'],
);

export const quotaErrorCounter = globalMetrics.counter(
  'pipeline_quota_errors_total',
  'Quota-exhausted errors observed from upstream providers',
  ['provider'],
);

export const sseConnectionsGauge = globalMetrics.gauge(
  'sse_connections_active',
  'Currently-open Server-Sent Events client connections',
);

/** Convenience wrapper used by retry hooks. Keeps reason cardinality bounded. */
export function recordRetry(label: string, reason: string | undefined): void {
  const cls = classifyReason(reason);
  retryCounter.inc({ label: truncateLabel(label), reason: cls });
}

/** Convenience wrapper for quota / 429 emitters. */
export function recordQuotaError(provider: string): void {
  quotaErrorCounter.inc({ provider: truncateLabel(provider) });
}

const REASON_CLASSES = [
  ['quota', /quota|exhausted|429|rate[\s_-]*limit/i],
  ['timeout', /timeout|timed[\s_-]*out|deadline/i],
  ['network', /network|econnreset|enotfound|socket|disconnect|fetch failed/i],
  ['internal', /internal|server error|503|502|500/i],
  ['cancelled', /aborted|cancel/i],
] as const;

function classifyReason(reason: string | undefined): string {
  if (!reason) return 'unknown';
  for (const [name, re] of REASON_CLASSES) {
    if (re.test(reason)) return name;
  }
  return 'other';
}

function truncateLabel(value: string): string {
  if (value.length <= 64) return value;
  return value.slice(0, 64);
}

/* ------------------------------------------------------------------ */
/*  Module-level installation                                          */
/* ------------------------------------------------------------------ */

let installed = false;

/**
 * Wire the lib-level retry observer into the pipeline counters.
 * Called once from server.ts; tests can re-invoke it after registry
 * resets without leaking duplicate listeners.
 */
export function installPipelineMetrics(): void {
  if (installed) return;
  installed = true;
  registerRetryObserver((obs) => {
    recordRetry(obs.label, obs.reason);
    if (isQuotaError(obs.err) && obs.label) {
      recordQuotaError(obs.label);
    }
  });
}

/** Test-only: undo installation so a fresh observer can be wired. */
export function _resetInstallationForTests(): void {
  installed = false;
}
