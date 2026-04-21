import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerRetryObserver,
  clearRetryObservers,
  withRetry,
} from '@ai-video/lib/retry.js';
import { globalMetrics } from '@ai-video/lib/promMetrics.js';
import {
  installPipelineMetrics,
  _resetInstallationForTests,
  recordRetry,
  recordQuotaError,
  retryCounter,
  quotaErrorCounter,
  stageDurationHistogram,
} from '../metrics.js';

beforeEach(() => {
  globalMetrics.clear();
  clearRetryObservers();
  _resetInstallationForTests();
});

describe('pipeline metrics surface', () => {
  it('classifies retry reasons into a bounded set', () => {
    recordRetry('Gemini API request', 'Resource exhausted');
    recordRetry('Gemini API request', 'request timeout');
    recordRetry('Gemini API request', 'ECONNRESET socket disconnect');
    recordRetry('Gemini API request', 'Internal error');
    recordRetry('Gemini API request', 'aborted');
    recordRetry('Gemini API request', 'something weird');
    recordRetry('Gemini API request', undefined);

    expect(retryCounter.get({ label: 'Gemini API request', reason: 'quota' })).toBe(1);
    expect(retryCounter.get({ label: 'Gemini API request', reason: 'timeout' })).toBe(1);
    expect(retryCounter.get({ label: 'Gemini API request', reason: 'network' })).toBe(1);
    expect(retryCounter.get({ label: 'Gemini API request', reason: 'internal' })).toBe(1);
    expect(retryCounter.get({ label: 'Gemini API request', reason: 'cancelled' })).toBe(1);
    expect(retryCounter.get({ label: 'Gemini API request', reason: 'other' })).toBe(1);
    expect(retryCounter.get({ label: 'Gemini API request', reason: 'unknown' })).toBe(1);
  });

  it('truncates pathological labels to 64 chars', () => {
    const huge = 'x'.repeat(200);
    recordQuotaError(huge);
    const trimmed = 'x'.repeat(64);
    expect(quotaErrorCounter.get({ provider: trimmed })).toBe(1);
  });

  it('observes stage durations in seconds with explicit status label', () => {
    stageDurationHistogram.observe(1.5, { stage: 'STYLE_EXTRACTION', status: 'completed' });
    stageDurationHistogram.observe(0.2, { stage: 'STYLE_EXTRACTION', status: 'completed' });
    const snap = stageDurationHistogram.snapshot({
      stage: 'STYLE_EXTRACTION',
      status: 'completed',
    });
    expect(snap?.count).toBe(2);
    expect(snap?.sum).toBeCloseTo(1.7, 5);
  });

  it('installPipelineMetrics is idempotent and bridges retry observers to counters', async () => {
    installPipelineMetrics();
    installPipelineMetrics();

    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          if (attempts === 1) {
            const err = Object.assign(new Error('quota exceeded'), {
              status: 429,
              isQuotaError: true,
            });
            throw err;
          }
          return 'ok';
        },
        { label: 'gemini-test', maxRetries: 1, delayMs: () => 0 },
      ),
    ).resolves.toBe('ok');

    expect(retryCounter.get({ label: 'gemini-test', reason: 'quota' })).toBe(1);
    expect(quotaErrorCounter.get({ provider: 'gemini-test' })).toBe(1);
  });

  it('only registers a single retry observer regardless of repeat installs', () => {
    let count = 0;
    const unsubscribe = registerRetryObserver(() => {
      count++;
    });
    installPipelineMetrics();
    installPipelineMetrics();
    installPipelineMetrics();
    // Trigger a synthetic retry observation through withRetry.
    return withRetry(
      async () => {
        if (count === 0) {
          throw Object.assign(new Error('rate limit'), { status: 429 });
        }
        return 'done';
      },
      { label: 'install-test', maxRetries: 1, delayMs: () => 0 },
    ).then(() => {
      expect(count).toBe(1);
      unsubscribe();
    });
  });
});

describe('Prometheus exposition contract', () => {
  it('renders the pipeline counters and histograms in valid text format', () => {
    recordRetry('gemini', 'quota exhausted');
    stageDurationHistogram.observe(2, { stage: 'REFINEMENT', status: 'completed' });
    const text = globalMetrics.render();

    expect(text).toContain('# TYPE pipeline_retry_total counter');
    expect(text).toContain('pipeline_retry_total{label="gemini",reason="quota"} 1');
    expect(text).toContain('# TYPE pipeline_stage_duration_seconds histogram');
    expect(text).toContain('pipeline_stage_duration_seconds_bucket{stage="REFINEMENT",status="completed",le="+Inf"} 1');
    expect(text.endsWith('\n')).toBe(true);
  });
});
