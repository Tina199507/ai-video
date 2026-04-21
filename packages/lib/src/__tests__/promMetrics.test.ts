import { describe, expect, it } from 'vitest';
import {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  globalMetrics,
} from '../promMetrics.js';

describe('Counter', () => {
  it('starts at zero and accumulates increments', () => {
    const c = new Counter('test_total', 'help text');
    expect(c.get()).toBe(0);
    c.inc();
    c.inc(undefined, 4);
    expect(c.get()).toBe(5);
  });

  it('keeps independent values per label set', () => {
    const c = new Counter('events_total', 'help', ['kind']);
    c.inc({ kind: 'a' });
    c.inc({ kind: 'b' }, 3);
    c.inc({ kind: 'a' });
    expect(c.get({ kind: 'a' })).toBe(2);
    expect(c.get({ kind: 'b' })).toBe(3);
    expect(c.get({ kind: 'c' })).toBe(0);
  });

  it('rejects negative deltas', () => {
    const c = new Counter('foo_total', 'help');
    expect(() => c.inc(undefined, -1)).toThrow(/cannot decrease/);
  });

  it('renders Prometheus format with HELP/TYPE preamble', () => {
    const c = new Counter('http_requests_total', 'Total HTTP requests', ['method', 'status']);
    c.inc({ method: 'GET', status: 200 });
    c.inc({ method: 'POST', status: 500 }, 2);
    const out = c.render();
    expect(out).toContain('# HELP http_requests_total Total HTTP requests');
    expect(out).toContain('# TYPE http_requests_total counter');
    expect(out).toContain('http_requests_total{method="GET",status="200"} 1');
    expect(out).toContain('http_requests_total{method="POST",status="500"} 2');
  });

  it('escapes backslashes, quotes, and newlines in label values', () => {
    const c = new Counter('e_total', 'h', ['v']);
    c.inc({ v: 'a"b\\c\nd' });
    expect(c.render()).toContain('e_total{v="a\\"b\\\\c\\nd"} 1');
  });
});

describe('Gauge', () => {
  it('supports set/inc/dec semantics', () => {
    const g = new Gauge('queue_depth', 'h');
    g.set(5);
    expect(g.get()).toBe(5);
    g.inc();
    g.inc(undefined, 2);
    expect(g.get()).toBe(8);
    g.dec(undefined, 3);
    expect(g.get()).toBe(5);
  });

  it('renders TYPE gauge', () => {
    const g = new Gauge('inflight', 'In-flight requests');
    g.set(7);
    const out = g.render();
    expect(out).toContain('# TYPE inflight gauge');
    expect(out).toContain('inflight 7');
  });
});

describe('Histogram', () => {
  it('throws on empty buckets', () => {
    expect(() => new Histogram('bad', 'h', [], [])).toThrow(/at least one bucket/);
  });

  it('throws on non-monotonic buckets', () => {
    expect(() => new Histogram('bad', 'h', [], [1, 1, 2])).toThrow(/strictly increasing/);
    expect(() => new Histogram('bad', 'h', [], [5, 1])).toThrow(/strictly increasing/);
  });

  it('observes values into the right cumulative buckets', () => {
    const h = new Histogram('latency_seconds', 'h', [], [1, 5, 10]);
    h.observe(0.5);
    h.observe(2);
    h.observe(7);
    h.observe(20);
    const snap = h.snapshot();
    expect(snap?.count).toBe(4);
    expect(snap?.sum).toBeCloseTo(29.5, 5);
    expect(snap?.buckets).toEqual([1, 2, 3]);
  });

  it('renders +Inf bucket and sum/count in Prometheus order', () => {
    const h = new Histogram('stage_duration_seconds', 'help', ['stage'], [1, 5]);
    h.observe(0.5, { stage: 'STYLE' });
    h.observe(3, { stage: 'STYLE' });
    h.observe(8, { stage: 'STYLE' });
    const out = h.render();
    expect(out).toContain('# TYPE stage_duration_seconds histogram');
    expect(out).toContain('stage_duration_seconds_bucket{stage="STYLE",le="1"} 1');
    expect(out).toContain('stage_duration_seconds_bucket{stage="STYLE",le="5"} 2');
    expect(out).toContain('stage_duration_seconds_bucket{stage="STYLE",le="+Inf"} 3');
    expect(out).toContain('stage_duration_seconds_sum{stage="STYLE"} 11.5');
    expect(out).toContain('stage_duration_seconds_count{stage="STYLE"} 3');
  });
});

describe('MetricsRegistry', () => {
  it('returns the same instance for repeated registrations', () => {
    const reg = new MetricsRegistry();
    const a = reg.counter('reuse_total', 'help');
    const b = reg.counter('reuse_total', 'help');
    expect(a).toBe(b);
  });

  it('rejects type collisions on the same name', () => {
    const reg = new MetricsRegistry();
    reg.counter('conflict_total', 'h');
    expect(() => reg.gauge('conflict_total', 'h')).toThrow(/different type/);
    expect(() => reg.histogram('conflict_total', 'h')).toThrow(/different type/);
  });

  it('renders all metrics separated by blank lines', () => {
    const reg = new MetricsRegistry();
    reg.counter('a_total', 'a').inc();
    reg.gauge('b_value', 'b').set(2);
    const out = reg.render();
    expect(out).toMatch(/a_total 1\n+# HELP b_value/);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('clear() resets every collected sample', () => {
    const reg = new MetricsRegistry();
    const c = reg.counter('reset_total', 'h');
    c.inc(undefined, 5);
    reg.clear();
    expect(c.get()).toBe(0);
  });
});

describe('globalMetrics', () => {
  it('exports a shared registry instance', () => {
    const c = globalMetrics.counter('shared_total', 'shared');
    c.inc();
    expect(globalMetrics.counter('shared_total', 'shared').get()).toBeGreaterThanOrEqual(1);
    globalMetrics.clear();
  });
});
