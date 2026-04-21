/**
 * @ai-video/lib/promMetrics — minimal Prometheus exposition primitives.
 *
 * Pure-TypeScript Counter / Gauge / Histogram with `render()` that
 * serializes to the Prometheus text format (v0.0.4). No third-party
 * dependency — the audit plan explicitly called out the dependency
 * lint risk of pulling in prom-client just to expose a handful of
 * counters and one histogram, so we ship a lean in-house alternative.
 *
 * Conventions
 *   - Metric names lowercase snake_case ending in the unit suffix
 *     (e.g. `_total`, `_seconds`, `_bytes`).
 *   - Histogram bucket boundaries are upper-bound inclusive, plus a
 *     synthetic `+Inf` bucket to satisfy Prometheus.
 *   - Labels are escaped per the spec (`\\`, `"`, `\n`).
 *
 * Usage
 *   const reg = new MetricsRegistry();
 *   const c = reg.counter('pipeline_retry_total', 'help', ['provider']);
 *   c.inc({ provider: 'gemini' });
 *   const text = reg.render();
 */

/* ------------------------------------------------------------------ */
/*  Label handling                                                    */
/* ------------------------------------------------------------------ */

export type Labels = Record<string, string | number>;

function labelKey(labels: Labels | undefined, names: readonly string[]): string {
  if (!labels || names.length === 0) return '';
  const parts: string[] = [];
  for (const name of names) {
    const raw = labels[name];
    parts.push(`${name}=${raw === undefined ? '' : String(raw)}`);
  }
  return parts.join('|');
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderLabels(labels: Labels | undefined, names: readonly string[], extra?: Record<string, string>): string {
  const pairs: string[] = [];
  if (labels && names.length > 0) {
    for (const name of names) {
      const raw = labels[name];
      const value = raw === undefined ? '' : String(raw);
      pairs.push(`${name}="${escapeLabelValue(value)}"`);
    }
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      pairs.push(`${k}="${escapeLabelValue(v)}"`);
    }
  }
  return pairs.length === 0 ? '' : `{${pairs.join(',')}}`;
}

/* ------------------------------------------------------------------ */
/*  Counter                                                           */
/* ------------------------------------------------------------------ */

export class Counter {
  private readonly values = new Map<string, { labels: Labels | undefined; value: number }>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = [],
  ) {}

  inc(labels?: Labels, delta = 1): void {
    if (delta < 0) throw new Error(`Counter ${this.name} cannot decrease (delta=${delta})`);
    const key = labelKey(labels, this.labelNames);
    const entry = this.values.get(key);
    if (entry) {
      entry.value += delta;
    } else {
      this.values.set(key, { labels, value: delta });
    }
  }

  /** Read the current value for a given label set. Mainly used in tests. */
  get(labels?: Labels): number {
    const key = labelKey(labels, this.labelNames);
    return this.values.get(key)?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  /** Return an array of `{ labels, value }` for every recorded series. */
  series(): Array<{ labels: Labels; value: number }> {
    return Array.from(this.values.values()).map(({ labels, value }) => ({
      labels: labels ? { ...labels } : {},
      value,
    }));
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${renderLabels(labels, this.labelNames)} ${value}`);
    }
    return lines.join('\n');
  }
}

/* ------------------------------------------------------------------ */
/*  Gauge                                                             */
/* ------------------------------------------------------------------ */

export class Gauge {
  private readonly values = new Map<string, { labels: Labels | undefined; value: number }>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = [],
  ) {}

  set(value: number, labels?: Labels): void {
    const key = labelKey(labels, this.labelNames);
    this.values.set(key, { labels, value });
  }

  inc(labels?: Labels, delta = 1): void {
    const key = labelKey(labels, this.labelNames);
    const entry = this.values.get(key);
    if (entry) {
      entry.value += delta;
    } else {
      this.values.set(key, { labels, value: delta });
    }
  }

  dec(labels?: Labels, delta = 1): void {
    this.inc(labels, -delta);
  }

  get(labels?: Labels): number {
    const key = labelKey(labels, this.labelNames);
    return this.values.get(key)?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  /** Return an array of `{ labels, value }` for every recorded series. */
  series(): Array<{ labels: Labels; value: number }> {
    return Array.from(this.values.values()).map(({ labels, value }) => ({
      labels: labels ? { ...labels } : {},
      value,
    }));
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];
    for (const { labels, value } of this.values.values()) {
      lines.push(`${this.name}${renderLabels(labels, this.labelNames)} ${value}`);
    }
    return lines.join('\n');
  }
}

/* ------------------------------------------------------------------ */
/*  Histogram                                                         */
/* ------------------------------------------------------------------ */

interface HistogramSample {
  labels: Labels | undefined;
  buckets: number[];
  sum: number;
  count: number;
}

/**
 * Default bucket layout tuned for AI pipeline stages: from sub-second
 * housekeeping (style extraction, refinement) up to multi-minute LLM
 * generations (script + storyboard + video assembly).
 *
 * Override per metric by passing `buckets` to the constructor.
 */
export const DEFAULT_DURATION_BUCKETS_SECONDS = [
  0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600,
] as const;

export class Histogram {
  private readonly samples = new Map<string, HistogramSample>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: readonly string[] = [],
    public readonly buckets: readonly number[] = DEFAULT_DURATION_BUCKETS_SECONDS,
  ) {
    if (buckets.length === 0) {
      throw new Error(`Histogram ${name} requires at least one bucket`);
    }
    for (let i = 1; i < buckets.length; i++) {
      const prev = buckets[i - 1];
      const cur = buckets[i];
      if (prev === undefined || cur === undefined || cur <= prev) {
        throw new Error(`Histogram ${name} buckets must be strictly increasing`);
      }
    }
  }

  observe(value: number, labels?: Labels): void {
    const key = labelKey(labels, this.labelNames);
    let sample = this.samples.get(key);
    if (!sample) {
      sample = {
        labels,
        buckets: new Array(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.samples.set(key, sample);
    }
    sample.sum += value;
    sample.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      const bound = this.buckets[i];
      if (bound !== undefined && value <= bound) {
        const cur = sample.buckets[i] ?? 0;
        sample.buckets[i] = cur + 1;
      }
    }
  }

  /** Test helper: return the current count + sum for a label set. */
  snapshot(labels?: Labels): { count: number; sum: number; buckets: number[] } | undefined {
    const sample = this.samples.get(labelKey(labels, this.labelNames));
    if (!sample) return undefined;
    return { count: sample.count, sum: sample.sum, buckets: [...sample.buckets] };
  }

  reset(): void {
    this.samples.clear();
  }

  /**
   * Return a structured snapshot of every observed series — useful
   * for the in-app observability UI which renders charts directly
   * from the JSON instead of parsing the Prometheus text format.
   */
  series(): Array<{ labels: Labels; count: number; sum: number; buckets: number[] }> {
    return Array.from(this.samples.values()).map((s) => ({
      labels: s.labels ? { ...s.labels } : {},
      count: s.count,
      sum: s.sum,
      buckets: [...s.buckets],
    }));
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const sample of this.samples.values()) {
      for (let i = 0; i < this.buckets.length; i++) {
        const bound = this.buckets[i];
        const count = sample.buckets[i] ?? 0;
        if (bound === undefined) continue;
        lines.push(
          `${this.name}_bucket${renderLabels(sample.labels, this.labelNames, { le: String(bound) })} ${count}`,
        );
      }
      lines.push(
        `${this.name}_bucket${renderLabels(sample.labels, this.labelNames, { le: '+Inf' })} ${sample.count}`,
      );
      lines.push(
        `${this.name}_sum${renderLabels(sample.labels, this.labelNames)} ${sample.sum}`,
      );
      lines.push(
        `${this.name}_count${renderLabels(sample.labels, this.labelNames)} ${sample.count}`,
      );
    }
    return lines.join('\n');
  }
}

/* ------------------------------------------------------------------ */
/*  Registry                                                          */
/* ------------------------------------------------------------------ */

export class MetricsRegistry {
  private readonly counters = new Map<string, Counter>();
  private readonly gauges = new Map<string, Gauge>();
  private readonly histograms = new Map<string, Histogram>();

  counter(name: string, help: string, labelNames: readonly string[] = []): Counter {
    const existing = this.counters.get(name);
    if (existing) return existing;
    if (this.gauges.has(name) || this.histograms.has(name)) {
      throw new Error(`Metric ${name} already registered with a different type`);
    }
    const c = new Counter(name, help, labelNames);
    this.counters.set(name, c);
    return c;
  }

  gauge(name: string, help: string, labelNames: readonly string[] = []): Gauge {
    const existing = this.gauges.get(name);
    if (existing) return existing;
    if (this.counters.has(name) || this.histograms.has(name)) {
      throw new Error(`Metric ${name} already registered with a different type`);
    }
    const g = new Gauge(name, help, labelNames);
    this.gauges.set(name, g);
    return g;
  }

  histogram(
    name: string,
    help: string,
    labelNames: readonly string[] = [],
    buckets?: readonly number[],
  ): Histogram {
    const existing = this.histograms.get(name);
    if (existing) return existing;
    if (this.counters.has(name) || this.gauges.has(name)) {
      throw new Error(`Metric ${name} already registered with a different type`);
    }
    const h = new Histogram(name, help, labelNames, buckets);
    this.histograms.set(name, h);
    return h;
  }

  /** Drop every collected sample. Useful in tests. */
  clear(): void {
    for (const c of this.counters.values()) c.reset();
    for (const g of this.gauges.values()) g.reset();
    for (const h of this.histograms.values()) h.reset();
  }

  render(): string {
    const blocks: string[] = [];
    for (const c of this.counters.values()) blocks.push(c.render());
    for (const g of this.gauges.values()) blocks.push(g.render());
    for (const h of this.histograms.values()) blocks.push(h.render());
    return blocks.join('\n\n') + '\n';
  }
}

/** Process-wide registry — every long-lived emitter shares this one. */
export const globalMetrics = new MetricsRegistry();
