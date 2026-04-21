import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowLeft, RefreshCw, Wifi } from 'lucide-react';
import { api, type ObservabilitySnapshot } from '../api/client';
import { Card } from '../components/ui/Card';

const POLL_INTERVAL_MS = 5_000;
const MAX_BARS = 12;

export function ObservabilityPage() {
  const [snapshot, setSnapshot] = useState<ObservabilitySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getObservabilitySnapshot();
      setSnapshot(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回
            </Link>
            <Activity className="h-5 w-5 text-emerald-400" />
            <h1 className="text-lg font-semibold">Observability</h1>
            <span className="text-xs text-zinc-500">
              SLO 详情见{' '}
              <a
                href="https://github.com/"
                className="underline hover:text-zinc-300"
                onClick={(e) => e.preventDefault()}
              >
                docs/slo.md
              </a>
            </span>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-700/40 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4" />
            <span>无法获取 observability 快照：{error}</span>
          </div>
        )}

        {!snapshot && !error && (
          <p className="text-sm text-zinc-400">正在加载……</p>
        )}

        {snapshot && (
          <>
            <SummaryRow snapshot={snapshot} />
            <StagePanel snapshot={snapshot} />
            <RetryPanel snapshot={snapshot} />
            <FooterMeta snapshot={snapshot} />
          </>
        )}
      </main>
    </div>
  );
}

function SummaryRow({ snapshot }: { snapshot: ObservabilitySnapshot }) {
  const totalRetries = snapshot.retries.reduce((s, r) => s + r.count, 0);
  const totalQuota = snapshot.quotaErrors.reduce((s, q) => s + q.count, 0);
  const totalRuns = snapshot.stages.reduce((s, st) => s + st.count, 0);

  const cards: Array<{
    label: string;
    value: string;
    sub: string;
    tone: 'ok' | 'warn' | 'alert' | 'neutral';
    icon: React.ReactNode;
  }> = [
    {
      label: 'SSE 连接',
      value: `${snapshot.sse.active}`,
      sub: `上限 ${snapshot.sse.max}`,
      tone:
        snapshot.sse.active >= snapshot.sse.max * 0.8
          ? 'warn'
          : snapshot.sse.active === 0
            ? 'neutral'
            : 'ok',
      icon: <Wifi className="h-4 w-4" />,
    },
    {
      label: 'Stage 执行总次数',
      value: `${totalRuns}`,
      sub: `覆盖 ${snapshot.stages.length} 个 stage 标签`,
      tone: 'neutral',
      icon: <Activity className="h-4 w-4" />,
    },
    {
      label: '累计 Retry',
      value: `${totalRetries}`,
      sub: `${snapshot.retries.length} 类 reason`,
      tone: totalRetries > 100 ? 'warn' : 'neutral',
      icon: <RefreshCw className="h-4 w-4" />,
    },
    {
      label: 'Quota 错误',
      value: `${totalQuota}`,
      sub: `${snapshot.quotaErrors.length} 个 provider`,
      tone: totalQuota >= 5 ? 'alert' : totalQuota > 0 ? 'warn' : 'ok',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card
          key={c.label}
          className={`flex flex-col gap-2 border ${TONE_BORDER[c.tone]} bg-zinc-900/60 p-4`}
        >
          <div className={`flex items-center gap-2 text-xs ${TONE_TEXT[c.tone]}`}>
            {c.icon}
            <span>{c.label}</span>
          </div>
          <div className="text-2xl font-semibold">{c.value}</div>
          <div className="text-xs text-zinc-500">{c.sub}</div>
        </Card>
      ))}
    </div>
  );
}

function StagePanel({ snapshot }: { snapshot: ObservabilitySnapshot }) {
  const rows = useMemo(() => {
    return [...snapshot.stages]
      .filter((s) => s.status === 'completed')
      .sort((a, b) => b.p95Seconds - a.p95Seconds)
      .slice(0, 20);
  }, [snapshot.stages]);

  if (rows.length === 0) {
    return (
      <Card className="border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Stage 时长（P95 / P50）</h2>
        <p className="text-xs text-zinc-500">尚无 stage 完成数据。运行任意 pipeline 后回来再看。</p>
      </Card>
    );
  }

  const maxP95 = Math.max(...rows.map((r) => r.p95Seconds), 1);

  return (
    <Card className="border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium text-zinc-300">
        Stage 时长（P95 vs P50，单位秒）
      </h2>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={`${r.stage}-${r.status}`} className="text-xs">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="font-mono text-zinc-200">{r.stage}</span>
              <span className="tabular-nums">
                P95 {r.p95Seconds.toFixed(1)}s · P50 {r.p50Seconds.toFixed(1)}s · n={r.count}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full bg-emerald-500/70"
                style={{ width: `${(r.p95Seconds / maxP95) * 100}%` }}
              />
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-zinc-800">
              <div
                className="h-full bg-sky-500/70"
                style={{ width: `${(r.p50Seconds / maxP95) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RetryPanel({ snapshot }: { snapshot: ObservabilitySnapshot }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const r of snapshot.retries) {
      const inner = map.get(r.label) ?? new Map<string, number>();
      inner.set(r.reason, (inner.get(r.reason) ?? 0) + r.count);
      map.set(r.label, inner);
    }
    const list = Array.from(map.entries()).map(([label, reasonMap]) => ({
      label,
      total: Array.from(reasonMap.values()).reduce((s, v) => s + v, 0),
      reasons: Array.from(reasonMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    }));
    list.sort((a, b) => b.total - a.total);
    return list.slice(0, MAX_BARS);
  }, [snapshot.retries]);

  if (grouped.length === 0) {
    return (
      <Card className="border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Retry 队列</h2>
        <p className="text-xs text-zinc-500">尚无 retry 记录。一切平静。</p>
      </Card>
    );
  }

  const max = Math.max(...grouped.map((g) => g.total), 1);

  return (
    <Card className="border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium text-zinc-300">
        Retry 队列（按 label，前 {MAX_BARS} 条）
      </h2>
      <div className="space-y-3">
        {grouped.map((g) => (
          <div key={g.label} className="text-xs">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="font-mono text-zinc-200">{g.label || '(unlabeled)'}</span>
              <span className="tabular-nums">合计 {g.total}</span>
            </div>
            <div className="mt-1 flex h-3 w-full overflow-hidden rounded bg-zinc-800">
              {g.reasons.map((r) => (
                <div
                  key={r.reason}
                  className={REASON_COLOR[r.reason] ?? REASON_COLOR.unknown}
                  style={{ width: `${(r.count / max) * 100}%` }}
                  title={`${r.reason}: ${r.count}`}
                />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-500">
              {g.reasons.map((r) => (
                <span key={r.reason} className="tabular-nums">
                  <span
                    className={`mr-1 inline-block h-2 w-2 rounded ${REASON_COLOR[r.reason] ?? REASON_COLOR.unknown}`}
                  />
                  {r.reason} {r.count}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FooterMeta({ snapshot }: { snapshot: ObservabilitySnapshot }) {
  return (
    <p className="text-xs text-zinc-500">
      快照生成于 {new Date(snapshot.generatedAt).toLocaleString()}，
      自动 {POLL_INTERVAL_MS / 1000} 秒刷新。Prometheus 文本格式：<code className="text-zinc-400">GET /metrics</code>
    </p>
  );
}

const TONE_BORDER: Record<string, string> = {
  ok: 'border-emerald-700/40',
  warn: 'border-amber-700/40',
  alert: 'border-red-700/40',
  neutral: 'border-zinc-800',
};

const TONE_TEXT: Record<string, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  alert: 'text-red-400',
  neutral: 'text-zinc-400',
};

const REASON_COLOR: Record<string, string> = {
  quota: 'bg-red-500/70',
  timeout: 'bg-amber-500/70',
  network: 'bg-sky-500/70',
  internal: 'bg-rose-500/70',
  cancelled: 'bg-zinc-500/70',
  other: 'bg-violet-500/70',
  unknown: 'bg-zinc-600/70',
};
