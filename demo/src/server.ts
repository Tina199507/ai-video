import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, basename, extname } from 'node:path';
import { Workbench } from './workbench.js';
import type { ProviderId, ChatMode, WorkbenchEvent } from './types.js';

const PORT = Number(process.env.PORT ?? 3220);
const UPLOAD_DIR = resolve('data/uploads');
const workbench = new Workbench();

/* ------------------------------------------------------------------ */
/*  SSE client management                                             */
/* ------------------------------------------------------------------ */

interface SSEClient {
  id: number;
  res: ServerResponse;
}

let clientIdCounter = 0;
const sseClients: SSEClient[] = [];

function broadcastEvent(event: WorkbenchEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.res.write(data);
  }
}

// Subscribe workbench events → SSE broadcast
workbench.onEvent(broadcastEvent);

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

function parsePath(url: string): { path: string; query: URLSearchParams } {
  const u = new URL(url, 'http://localhost');
  return { path: u.pathname, query: u.searchParams };
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const { path } = parsePath(req.url ?? '/');

  // CORS headers for dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- SSE stream ----
  if (method === 'GET' && path === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const client: SSEClient = { id: ++clientIdCounter, res };
    sseClients.push(client);
    // Send current state immediately
    res.write(`data: ${JSON.stringify({ type: 'state', payload: workbench.getState() })}\n\n`);
    req.on('close', () => {
      const idx = sseClients.findIndex((c) => c.id === client.id);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  // ---- State ----
  if (method === 'GET' && path === '/api/state') {
    return json(res, 200, workbench.getState());
  }

  // ---- Tasks ----
  if (method === 'POST' && path === '/api/tasks') {
    const body = JSON.parse(await readBody(req)) as {
      questions: string[];
      preferredProvider?: ProviderId;
      preferredModel?: string;
      attachments?: string[];
    };
    const tasks = workbench.tasks.add(
      body.questions,
      body.preferredProvider,
      body.preferredModel,
      body.attachments,
    );
    return json(res, 201, tasks);
  }

  // ---- File upload ----
  if (method === 'POST' && path === '/api/upload') {
    const body = JSON.parse(await readBody(req)) as {
      files: Array<{ name: string; data: string }>;
    };
    if (!body.files?.length) {
      return json(res, 400, { error: 'No files provided' });
    }

    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const savedPaths: string[] = [];
    for (const file of body.files) {
      // Sanitize filename: only keep basename, strip path traversal
      const safeName = basename(file.name).replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_');
      const ext = extname(safeName);
      const nameWithoutExt = safeName.slice(0, safeName.length - ext.length) || 'file';
      const uniqueName = `${Date.now()}_${nameWithoutExt}${ext}`;
      const filePath = join(UPLOAD_DIR, uniqueName);
      const buffer = Buffer.from(file.data, 'base64');
      writeFileSync(filePath, buffer);
      savedPaths.push(resolve(filePath));
    }

    return json(res, 200, { paths: savedPaths });
  }

  if (method === 'DELETE' && path.startsWith('/api/tasks/')) {
    const taskId = path.split('/').pop()!;
    const ok = workbench.tasks.remove(taskId);
    return json(res, ok ? 200 : 404, { ok });
  }

  if (method === 'POST' && path === '/api/tasks/clear') {
    workbench.tasks.clear();
    return json(res, 200, { ok: true });
  }

  // ---- Accounts ----
  if (method === 'POST' && path === '/api/accounts') {
    const body = JSON.parse(await readBody(req)) as {
      provider: ProviderId;
      label: string;
      profileDir: string;
    };
    const acc = workbench.accounts.addAccount(body.provider, body.label, body.profileDir);
    return json(res, 201, acc);
  }

  if (method === 'DELETE' && path.startsWith('/api/accounts/')) {
    const accountId = path.split('/').pop()!;
    const ok = workbench.accounts.removeAccount(accountId);
    return json(res, ok ? 200 : 404, { ok });
  }

  if (method === 'POST' && path === '/api/accounts/reset-quotas') {
    workbench.accounts.resetAllQuotas();
    return json(res, 200, { ok: true });
  }

  // ---- Account login browser ----
  const loginMatch = path.match(/^\/api\/accounts\/([^/]+)\/login$/);
  if (method === 'POST' && loginMatch) {
    const accountId = loginMatch[1];
    try {
      await workbench.openLoginBrowser(accountId);
      return json(res, 200, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(res, 400, { error: message });
    }
  }

  const closeLoginMatch = path.match(/^\/api\/accounts\/([^/]+)\/close-login$/);
  if (method === 'POST' && closeLoginMatch) {
    const accountId = closeLoginMatch[1];
    await workbench.closeLoginBrowser(accountId);
    return json(res, 200, { ok: true });
  }

  // ---- Chat mode ----
  if (method === 'POST' && path === '/api/chat-mode') {
    const body = JSON.parse(await readBody(req)) as { mode: string };
    if (body.mode !== 'new' && body.mode !== 'continue') {
      return json(res, 400, { error: 'Invalid mode. Must be "new" or "continue".' });
    }
    workbench.setChatMode(body.mode as ChatMode);
    return json(res, 200, { ok: true });
  }

  // ---- Control ----
  if (method === 'POST' && path === '/api/start') {
    // Fire-and-forget: start returns immediately, progress via SSE
    workbench.start().catch((err) => {
      console.error('[workbench] loop error:', err);
    });
    return json(res, 200, { ok: true });
  }

  if (method === 'POST' && path === '/api/stop') {
    workbench.stop();
    return json(res, 200, { ok: true });
  }

  // ---- Provider selectors ----
  if (method === 'GET' && path === '/api/providers') {
    const providers = workbench.getProviderList().map((p) => ({
      ...p,
      selectors: (() => { try { return workbench.getSelectors(p.id); } catch { return null; } })(),
      models: workbench.getModels(p.id),
    }));
    return json(res, 200, providers);
  }

  if (method === 'POST' && path === '/api/providers') {
    const body = JSON.parse(await readBody(req)) as {
      id: string;
      label: string;
      selectors: Record<string, string>;
    };
    if (!body.id?.trim() || !body.label?.trim() || !body.selectors?.chatUrl) {
      return json(res, 400, { error: 'id, label, and selectors.chatUrl are required' });
    }
    try {
      const info = workbench.addCustomProvider(body.id.trim(), body.label.trim(), body.selectors as unknown as import('./types.js').ProviderSelectors);
      return json(res, 201, info);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(res, 400, { error: message });
    }
  }

  if (method === 'POST' && path === '/api/providers/from-url') {
    const body = JSON.parse(await readBody(req)) as { chatUrl: string };
    if (!body.chatUrl?.trim()) {
      return json(res, 400, { error: 'chatUrl is required' });
    }
    try {
      const result = await workbench.addProviderFromUrl(body.chatUrl.trim());
      return json(res, 201, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(res, 400, { error: message });
    }
  }

  const providerDeleteMatch = path.match(/^\/api\/providers\/([^/]+)$/);
  if (method === 'DELETE' && providerDeleteMatch) {
    const providerId = decodeURIComponent(providerDeleteMatch[1]);
    const ok = workbench.removeCustomProvider(providerId);
    return json(res, ok ? 200 : 404, { ok });
  }

  const modelsMatch = path.match(/^\/api\/models\/([^/]+)$/);
  if (method === 'GET' && modelsMatch) {
    const provider = modelsMatch[1] as ProviderId;
    const models = workbench.getModels(provider);
    return json(res, 200, models);
  }

  if (method === 'POST' && modelsMatch) {
    const provider = modelsMatch[1] as ProviderId;
    try {
      const models = await workbench.detectModels(provider);
      return json(res, 200, models);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(res, 400, { error: message });
    }
  }

  // ---- Fallback ----
  json(res, 404, { error: 'Not found' });
}

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[server] unhandled:', err);
    if (!res.headersSent) json(res, 500, { error: 'Internal server error' });
  });
});

server.listen(PORT, () => {
  console.log(`🤖 AI Chat Workbench server running at http://localhost:${PORT}`);
  console.log(`   SSE events: http://localhost:${PORT}/api/events`);
  console.log(`   State:      http://localhost:${PORT}/api/state`);
});
