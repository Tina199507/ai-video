import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Workbench } from './workbench.js';
import type { WorkbenchEvent } from './types.js';
import { WB_EVENT } from './types.js';
import { json, BodyTooLargeError, type Route } from './routes/helpers.js';
import { workbenchRoutes } from './routes/workbench.js';
import { pipelineRoutesV2 } from './routes/pipeline.js';
import { setupRoutes } from './routes/setup.js';
import { bgmLibraryRoutes } from './routes/bgmLibrary.js';
import { RateLimiter } from './rateLimiter.js';
import { createLogger, type Logger } from '@ai-video/lib/logger.js';
import { globalMetrics } from '@ai-video/lib/promMetrics.js';
import {
  retryCounter,
  quotaErrorCounter,
  sseConnectionsGauge,
  stageDurationHistogram,
} from '@ai-video/pipeline-core/metrics.js';
import {
  MAX_SSE_CLIENTS as MAX_SSE_CLIENTS_CONST,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  SHUTDOWN_FORCE_EXIT_MS,
} from './constants.js';
import type { PipelineService } from '@ai-video/pipeline-core/pipelineService.js';

interface SSEClient {
  id: number;
  res: ServerResponse;
}

interface ObservabilitySnapshot {
  generatedAt: string;
  sse: { active: number; max: number };
  retries: Array<{ label: string; reason: string; count: number }>;
  quotaErrors: Array<{ provider: string; count: number }>;
  stages: Array<{
    stage: string;
    status: string;
    count: number;
    sumSeconds: number;
    avgSeconds: number;
    p50Seconds: number;
    p95Seconds: number;
    buckets: Array<{ le: string; count: number }>;
  }>;
}

export interface ServerRuntimeOptions {
  port: number;
  dataDir: string;
  uploadDir: string;
  allowedOrigins: string[];
  apiKey: string;
  workbench: Workbench;
  pipelineService: PipelineService;
  logger?: Logger;
}

export interface ServerRuntime {
  server: Server;
  broadcastEvent: (event: WorkbenchEvent) => void;
}

function approximateQuantile(
  buckets: number[],
  boundaries: readonly number[],
  total: number,
  q: number,
): number {
  if (total === 0) return 0;
  const target = total * q;
  for (let i = 0; i < boundaries.length; i++) {
    if ((buckets[i] ?? 0) >= target) {
      const bound = boundaries[i];
      return bound ?? 0;
    }
  }
  return boundaries[boundaries.length - 1] ?? 0;
}

function snapshotMetrics(maxSseClients: number): ObservabilitySnapshot {
  const sseActive = sseConnectionsGauge.get();

  const retries = retryCounter.series().map((s) => ({
    label: String(s.labels.label ?? ''),
    reason: String(s.labels.reason ?? 'unknown'),
    count: s.value,
  }));

  const quotaErrors = quotaErrorCounter.series().map((s) => ({
    provider: String(s.labels.provider ?? ''),
    count: s.value,
  }));

  const boundaries = stageDurationHistogram.buckets;
  const stages = stageDurationHistogram.series().map((s) => {
    const avg = s.count > 0 ? s.sum / s.count : 0;
    return {
      stage: String(s.labels.stage ?? ''),
      status: String(s.labels.status ?? ''),
      count: s.count,
      sumSeconds: s.sum,
      avgSeconds: avg,
      p50Seconds: approximateQuantile(s.buckets, boundaries, s.count, 0.5),
      p95Seconds: approximateQuantile(s.buckets, boundaries, s.count, 0.95),
      buckets: [
        ...boundaries.map((b, i) => ({ le: String(b), count: s.buckets[i] ?? 0 })),
        { le: '+Inf', count: s.count },
      ],
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sse: { active: sseActive, max: maxSseClients },
    retries,
    quotaErrors,
    stages,
  };
}

function parsePath(url: string): string {
  return new URL(url, 'http://localhost').pathname;
}

function setCors(req: IncomingMessage, res: ServerResponse, allowedOrigins: string[]): void {
  const origin = req.headers.origin ?? '';
  if (allowedOrigins.length === 0) {
    // No whitelist configured → allow all (dev mode)
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Set standard security response headers on every response.
 * Prevents MIME sniffing, clickjacking, and information leakage.
 */
function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  // Explicitly disable legacy XSS filter (modern browsers use CSP instead)
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

/**
 * Constant-time API key comparison to prevent timing attacks.
 * Uses `crypto.timingSafeEqual` so the comparison time is independent
 * of how many characters match.
 */
function checkApiKey(req: IncomingMessage, apiKey: string): boolean {
  if (!apiKey) return true;
  const header = req.headers.authorization ?? '';
  const expected = `Bearer ${apiKey}`;
  // Length check first (timingSafeEqual requires equal-length buffers)
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * Derive the client IP from the request.
 *
 * `X-Forwarded-For` is only trusted when the `TRUST_PROXY=1` environment
 * variable is set; otherwise the direct socket address is used.  Blindly
 * trusting `X-Forwarded-For` without this guard allows any client to
 * spoof its IP and bypass per-IP rate limiting.
 */
function getClientIp(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function startServerRuntime(options: ServerRuntimeOptions): ServerRuntime {
  const {
    port,
    dataDir,
    uploadDir,
    allowedOrigins,
    apiKey,
    workbench,
    pipelineService,
  } = options;
  const log = options.logger ?? createLogger('server');

  const maxSseClients = MAX_SSE_CLIENTS_CONST;
  let clientIdCounter = 0;
  const sseClients: SSEClient[] = [];

  function broadcastEvent(event: WorkbenchEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
      client.res.write(data);
    }
  }

  const routes: Route[] = [
    // UI crash reporter — logs crash details to terminal
    {
      method: 'POST',
      pattern: /^\/api\/ui-crash$/,
      handler: async (req, res) => {
        // Limit the body even though this endpoint is unauthenticated:
        // prevents memory exhaustion via large payloads.
        const { readBody } = await import('./routes/helpers.js');
        let body = '';
        try {
          body = await readBody(req, 64 * 1024); // 64 KB limit for crash reports
        } catch {
          // If body exceeds limit, still respond 200 to avoid crashing the reporter.
          json(res, 200, { ok: true });
          return;
        }
        try {
          const data = JSON.parse(body) as { message?: string; stack?: string; componentStack?: string };
          log.error('ui_crash', undefined, {
            message: data.message,
            stack: data.stack,
            componentStack: data.componentStack,
          });
        } catch {
          log.error('ui_crash_parse_failed', undefined, { body: body.slice(0, 500) });
        }
        json(res, 200, { ok: true });
      },
    },
    ...workbenchRoutes(workbench, uploadDir),
    ...pipelineRoutesV2(pipelineService),
    ...bgmLibraryRoutes(pipelineService, broadcastEvent),
    ...setupRoutes(pipelineService),
  ];

  const rateLimiter = new RateLimiter({
    max: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const path = parsePath(req.url ?? '/');
    log.debug('request', { method, path });

    setCors(req, res, allowedOrigins);
    setSecurityHeaders(res);

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const clientIp = getClientIp(req);
    const rl = rateLimiter.consume(clientIp);
    res.setHeader('X-RateLimit-Limit', rateLimiter.maxRequests);
    res.setHeader('X-RateLimit-Remaining', rl.remaining);
    if (!rl.allowed) {
      res.setHeader('Retry-After', Math.ceil(rl.retryAfterMs / 1000));
      return json(res, 429, { error: 'Too many requests — please retry later' });
    }

    if (method === 'GET' && path === '/metrics') {
      if (!checkApiKey(req, apiKey)) {
        return json(res, 401, { error: 'Unauthorized — invalid or missing API key' });
      }
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(globalMetrics.render());
      return;
    }

    if (method === 'GET' && path === '/api/observability/snapshot') {
      if (!checkApiKey(req, apiKey)) {
        return json(res, 401, { error: 'Unauthorized — invalid or missing API key' });
      }
      return json(res, 200, snapshotMetrics(maxSseClients));
    }

    if (method === 'GET' && path === '/health') {
      const accounts = workbench.resources.all();
      const apiResources = accounts.filter(a => a.type === 'api');
      const browserResources = accounts.filter(a => a.type !== 'api');
      return json(res, 200, {
        status: 'ok',
        uptime: process.uptime(),
        version: '0.1.0',
        providers: accounts.length,
        browserResources: browserResources.length,
        apiResources: apiResources.length,
        ready: true,
      });
    }

    if (!checkApiKey(req, apiKey)) {
      return json(res, 401, { error: 'Unauthorized — invalid or missing API key' });
    }

    if (method === 'GET' && path === '/api/events') {
      if (sseClients.length >= maxSseClients) {
        return json(res, 503, { error: 'Too many SSE connections' });
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const client: SSEClient = { id: ++clientIdCounter, res };
      sseClients.push(client);
      sseConnectionsGauge.set(sseClients.length);
      log.info('sse_connected', { clientId: client.id, total: sseClients.length });
      res.write(`data: ${JSON.stringify({ type: WB_EVENT.STATE, payload: workbench.getState() })}\n\n`);
      req.on('close', () => {
        const idx = sseClients.findIndex((c) => c.id === client.id);
        if (idx !== -1) sseClients.splice(idx, 1);
        sseConnectionsGauge.set(sseClients.length);
        log.info('sse_disconnected', { clientId: client.id, remaining: sseClients.length });
      });
      return;
    }

    for (const route of routes) {
      if (method !== route.method) continue;
      const match = route.pattern.exec(path);
      if (match) {
        log.debug('route_matched', { method: route.method, pattern: String(route.pattern) });
        await route.handler(req, res, match);
        return;
      }
    }

    log.info('route_not_found', { method, path });
    json(res, 404, { error: 'Not found' });
  }

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      if (res.headersSent) return;
      if (err instanceof BodyTooLargeError) {
        json(res, 413, { error: err.message });
      } else if (err instanceof SyntaxError && err.message.includes('JSON')) {
        json(res, 400, { error: 'Invalid JSON in request body' });
      } else {
        log.error(
          'unhandled_request_error',
          err instanceof Error ? err : undefined,
          err instanceof Error ? undefined : { error: String(err) },
        );
        json(res, 500, { error: 'Internal server error' });
      }
    });
  });

  function gracefulShutdown(signal: string): void {
    log.info('shutdown_start', { signal });
    server.close(() => {
      log.info('shutdown_complete');
      process.exit(0);
    });
    setTimeout(() => {
      log.error('shutdown_forced', undefined, { timeoutMs: SHUTDOWN_FORCE_EXIT_MS });
      process.exit(1);
    }, SHUTDOWN_FORCE_EXIT_MS).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    log.error(
      'uncaught_exception',
      err instanceof Error ? err : undefined,
      err instanceof Error ? undefined : { error: String(err) },
    );
    gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    log.error(
      'unhandled_rejection',
      reason instanceof Error ? reason : undefined,
      reason instanceof Error ? undefined : { error: String(reason) },
    );
  });

  server.listen(port, () => {
    log.info('server_started', {
      port,
      url: `http://localhost:${port}`,
      dataDir,
      healthUrl: `http://localhost:${port}/health`,
      sseUrl: `http://localhost:${port}/api/events`,
      authEnabled: !!apiKey,
      corsOrigins: allowedOrigins,
      electron: !!process.env.ELECTRON_SHELL,
    });
  });

  return { server, broadcastEvent };
}
