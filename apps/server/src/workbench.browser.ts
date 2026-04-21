import type { BrowserContext, Page } from 'playwright';
import type { Account, ChatMode, TaskItem, WorkbenchEvent } from './types.js';
import { WB_EVENT } from './types.js';
import { createLogger } from '@ai-video/lib/logger.js';

const log = createLogger('Workbench');

export interface WorkbenchBrowserDeps {
  getActiveContext: () => BrowserContext | null;
  setActiveContext: (context: BrowserContext | null) => void;
  getActivePage: () => Page | null;
  setActivePage: (page: Page | null) => void;
  getActiveAccountId: () => string | null;
  setActiveAccountId: (accountId: string | null) => void;
  getActiveChatSessionId: () => string | null;
  setActiveChatSessionId: (sessionId: string | null) => void;
  getDefaultChatMode: () => ChatMode;
  getSelectors: (provider: Account['provider']) => any;
  resources: any;
  selectorService: any;
  modelStore: any;
  loginBrowser: any;
  emit: (event: WorkbenchEvent) => void;
  emitState: () => void;
  closeLoginBrowser: (accountId: string) => Promise<void>;
  openChat: (context: BrowserContext, selectors: any) => Promise<Page>;
  autoDetectSelectors: (page: Page) => Promise<any>;
  autoDetectVideoSelectors: (page: Page) => Promise<any>;
  launchWithRetry: (profileDir: string, stealthArgs: readonly string[]) => Promise<BrowserContext>;
  stealthArgs: readonly string[];
  delay: (ms: number) => Promise<void>;
  isElectronShell: () => boolean;
  releaseElectronContext: (profileDir: string) => Promise<void>;
  cleanupProfileDir: (profileDir: string) => Promise<void>;
}

export function requiresFreshChatEntry(
  defaultChatMode: ChatMode,
  activeChatSessionId: string | null,
  task: TaskItem,
): boolean {
  const taskChatMode = task.chatMode ?? defaultChatMode;
  if (taskChatMode === 'new') return true;
  if (task.sessionId) {
    return activeChatSessionId !== task.sessionId;
  }
  return false;
}

export function syncActiveTaskSessionEntry(
  setActiveChatSessionId: (sessionId: string | null) => void,
  task: TaskItem,
): void {
  setActiveChatSessionId(task.sessionId ?? null);
}

export function registerActivePageListenersEntry(
  deps: WorkbenchBrowserDeps,
  page: Page,
  context: BrowserContext,
): void {
  const onCrash = () => {
    if (deps.getActivePage() !== page) return;
    const accountId = deps.getActiveAccountId() ?? 'unknown';
    log.warn('active_page_crashed', { accountId });
    page.close().catch(() => {});
    deps.setActivePage(null);
    deps.setActiveContext(null);
    deps.setActiveAccountId(null);
    deps.setActiveChatSessionId(null);
    deps.emit({ type: WB_EVENT.ACTIVE_PAGE_CRASHED, payload: { accountId, reason: 'page_crash' } });
    deps.emitState();
  };

  const onClose = () => {
    if (deps.getActiveContext() !== context) return;
    const accountId = deps.getActiveAccountId() ?? 'unknown';
    log.warn('active_context_closed', { accountId });
    deps.setActivePage(null);
    deps.setActiveContext(null);
    deps.setActiveAccountId(null);
    deps.setActiveChatSessionId(null);
    deps.emit({ type: WB_EVENT.ACTIVE_PAGE_CRASHED, payload: { accountId, reason: 'context_closed' } });
    deps.emitState();
  };

  const onPageClose = () => {
    if (deps.getActivePage() !== page) return;
    const accountId = deps.getActiveAccountId() ?? 'unknown';
    log.warn('active_page_closed_externally', { accountId });
    deps.setActivePage(null);
    deps.setActiveContext(null);
    deps.setActiveAccountId(null);
    deps.setActiveChatSessionId(null);
    deps.emit({ type: WB_EVENT.ACTIVE_PAGE_CRASHED, payload: { accountId, reason: 'page_closed' } });
    deps.emitState();
  };

  page.on('crash', onCrash);
  page.on('close', onPageClose);
  context.on('close', onClose);
}

export async function openLoginBrowserEntry(
  deps: WorkbenchBrowserDeps,
  accountId: string,
  closeBrowser: () => Promise<void>,
): Promise<void> {
  if (deps.getActiveAccountId() === accountId) {
    await closeBrowser();
    await deps.delay(500);
  }
  await deps.loginBrowser.open(accountId);
}

export async function ensureBrowserEntry(
  deps: WorkbenchBrowserDeps,
  account: Account,
  task: TaskItem,
  closeBrowser: () => Promise<void>,
): Promise<Page> {
  const activeContext = deps.getActiveContext();
  const activePage = deps.getActivePage();
  if (deps.getActiveAccountId() === account.id && activePage && activeContext) {
    try {
      await activePage.title();
    } catch {
      log.warn('browser_context_died');
      await closeBrowser();
    }

    if (deps.getActiveContext()) {
      if (requiresFreshChatEntry(deps.getDefaultChatMode(), deps.getActiveChatSessionId(), task)) {
        const selectors = deps.getSelectors(account.provider);
        try {
          if ((task.chatMode ?? deps.getDefaultChatMode()) === 'continue' && task.sessionId && deps.getActiveChatSessionId() !== task.sessionId) {
            log.warn('session_mismatch_fresh_chat', { requestedSession: task.sessionId });
          }
          deps.setActivePage(await deps.openChat(deps.getActiveContext()!, selectors));
          syncActiveTaskSessionEntry(deps.setActiveChatSessionId, task);
        } catch (e) {
          log.warn('open_chat_failed_recreating', { error: e instanceof Error ? e.message : String(e) });
          await closeBrowser();
        }
      }
      if (deps.getActiveContext()) {
        return deps.getActivePage()!;
      }
    }
  }

  await closeBrowser();

  if (deps.loginBrowser.has(account.id)) {
    await deps.closeLoginBrowser(account.id);
  }

  const selectors = deps.getSelectors(account.provider);
  const context = await deps.launchWithRetry(account.profileDir, deps.stealthArgs);
  const page = await deps.openChat(context, selectors);
  deps.setActiveContext(context);
  deps.setActivePage(page);
  deps.setActiveAccountId(account.id);
  syncActiveTaskSessionEntry(deps.setActiveChatSessionId, task);
  registerActivePageListenersEntry(deps, page, context);

  if ((task.chatMode ?? deps.getDefaultChatMode()) === 'continue' && task.sessionId) {
    log.warn('session_no_reusable_page', { sessionId: task.sessionId });
  }

  const resource = deps.resources.get(account.id);
  const resourceType = resource?.type;
  (async () => {
    try {
      if (resourceType === 'video' || resourceType === 'image') {
        const detected = await deps.autoDetectVideoSelectors(page);
        log.info('video_selectors_auto_detected', { provider: account.provider });
        deps.selectorService.applyDetectedVideoSelectors(account.provider, detected);
      } else {
        const detected = await deps.autoDetectSelectors(page);
        log.info('selectors_auto_detected', { provider: account.provider });
        deps.selectorService.applyDetectedSelectors(account.provider, detected);
      }
    } catch {}
  })();

  if (!deps.modelStore.hasModels(account.provider)) {
    deps.loginBrowser.autoDetectModels(page, account.provider).catch((e: unknown) => {
      log.warn('auto_detect_models_failed', { error: e instanceof Error ? e.message : String(e) });
    });
  }

  return page;
}

export async function closeBrowserEntry(deps: WorkbenchBrowserDeps): Promise<void> {
  if (!deps.getActiveContext()) return;
  const account = deps.getActiveAccountId() ? deps.resources.get(deps.getActiveAccountId()!) : null;
  const profileDir = account?.profileDir;

  if (deps.getActivePage()) {
    await deps.getActivePage()!.close().catch((e: unknown) => log.warn('active_page_close_failed', { error: String(e) }));
  }
  if (deps.getActiveContext()) {
    await deps.getActiveContext()!.close().catch((e: unknown) => log.warn('browser_context_close_failed', { context: 'active', error: String(e) }));
  }
  deps.setActiveContext(null);
  deps.setActivePage(null);
  deps.setActiveAccountId(null);
  deps.setActiveChatSessionId(null);

  if (deps.isElectronShell() && profileDir) {
    try {
      await deps.releaseElectronContext(profileDir);
    } catch {}
  } else if (!deps.isElectronShell()) {
    await deps.delay(2_000);
    if (profileDir) {
      await deps.cleanupProfileDir(profileDir);
    }
  }
}
