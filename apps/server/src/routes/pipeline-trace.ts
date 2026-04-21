// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { json, type Route } from './helpers.js';
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';
import { buildTimeline, findFailureSpan, buildProviderDecisionPath, buildStageDiff, buildAiCallDiff, buildSpanTree } from '@ai-video/pipeline-core/traceAnalyzer.js';

export function pipelineTraceRoutes(svc: PipelineService): Route[] {
  return [
    /* ---- List traces for a project ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/traces$/,
      handler: (_req, res, match) => {
        const traces = svc.listTraces(match.groups!.id);
        json(res, 200, traces);
      },
    },

    /* ---- Get latest trace bundle (with analysis) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/trace$/,
      handler: (_req, res, match) => {
        const bundle = svc.getLatestTrace(match.groups!.id);
        if (!bundle) return json(res, 404, { error: 'No trace data found' });
        const timeline = buildTimeline(bundle);
        const failureSpan = findFailureSpan(bundle);
        const providerPath = buildProviderDecisionPath(bundle);
        const stageDiff = buildStageDiff(bundle);
        const aiDiffs = buildAiCallDiff(svc.getAiLogs(match.groups!.id), {
          startedAt: bundle.startedAt,
          endedAt: bundle.endedAt,
        });
        const spanTree = buildSpanTree(bundle);
        json(res, 200, { bundle, analysis: { timeline, failureSpan, providerPath, stageDiff, aiDiffs, spanTree } });
      },
    },

    /* ---- Get specific trace bundle by traceId ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/traces\/(?<traceId>[^/]+)$/,
      handler: (_req, res, match) => {
        const bundle = svc.getTrace(match.groups!.id, match.groups!.traceId);
        if (!bundle) return json(res, 404, { error: 'Trace not found' });
        const timeline = buildTimeline(bundle);
        const failureSpan = findFailureSpan(bundle);
        const providerPath = buildProviderDecisionPath(bundle);
        const stageDiff = buildStageDiff(bundle);
        const aiDiffs = buildAiCallDiff(svc.getAiLogs(match.groups!.id), {
          startedAt: bundle.startedAt,
          endedAt: bundle.endedAt,
        });
        const spanTree = buildSpanTree(bundle);
        json(res, 200, { bundle, analysis: { timeline, failureSpan, providerPath, stageDiff, aiDiffs, spanTree } });
      },
    },

    /* ---- AI logs (input/output diff) ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/ai-logs$/,
      handler: (_req, res, match) => {
        const logs = svc.getAiLogs(match.groups!.id);
        json(res, 200, logs);
      },
    },

    /* ---- Persistent JSONL event log ---- */
    {
      method: 'GET',
      pattern: /^\/api\/pipeline\/(?<id>[^/]+)\/event-log$/,
      handler: (_req, res, match) => {
        json(res, 200, svc.getEventLog(match.groups!.id));
      },
    },
  ];
}
