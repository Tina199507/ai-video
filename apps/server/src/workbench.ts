// @ts-nocheck -- see tsconfig.json noUncheckedIndexedAccess migration (scripts/check-strict-progress.mjs)
import { type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs/promises';
import path, { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TaskQueue } from './workbenchDeps.js';
import { ResourceManager } from './workbenchDeps.js';
import { PROVIDER_MODELS } from './workbenchDeps.js';
import { openChat, sendPrompt, selectModel, scrapeModels, checkQuotaExhausted, uploadFiles, typePromptText, autoDetectSelectors, autoDetectVideoSelectors } from './workbenchDeps.js';
import { STEALTH_ARGS } from './workbenchDeps.js';
import { isElectronShell } from './dataDir.js';
import type { Account, ChatMode, ModelOption, ProviderId, ProviderInfo, ProviderSelectors, SelectorChain, TaskItem, WorkbenchEvent, WorkbenchState } from './types.js';
import { WB_EVENT } from './types.js';
import { createLogger } from '@ai-video/lib/logger.js';
import { ModelStore } from './workbenchDeps.js';
import { CustomProviderStore } from './workbenchDeps.js';
import { SelectorService } from './workbenchDeps.js';
import { HealthMonitor } from './workbenchDeps.js';
import { LoginBrowserManager } from './workbenchDeps.js';
import { getChatAutomationPort } from './workbenchDeps.js';
import { createGlobalKVStore } from '@ai-video/lib/globalKvStore.js';
import type { ProjectKVStore } from '@ai-video/lib/kvStore.js';
import {
  emitEntry,
  emitStateEntry,
  onEventEntry,
  type EventListener,
} from './workbench.events.js';
import {
  delayEntry,
  findModelMatchEntry,
  launchWithRetryEntry,
} from './workbench.helpers.js';
import {
  closeBrowserEntry,
  ensureBrowserEntry,
  openLoginBrowserEntry,
  registerActivePageListenersEntry,
  requiresFreshChatEntry,
  syncActiveTaskSessionEntry,
} from './workbench.browser.js';
import {
  handleQuotaExhaustedEntry,
  processLoopEntry,
} from './workbench.loop.js';
import {
  detectModelsEntry,
  getModelsEntry,
} from './workbench.models.js';
import {
  addCustomProviderEntry,
  addProviderFromUrlEntry,
  getProviderListEntry,
  getSelectorsEntry,
  removeCustomProviderEntry,
  setProviderSelectorsEntry,
} from './workbench.providers.js';
import {
  getActiveAccountIdEntry,
  getActivePageEntry,
  getActiveSelectorChainEntry,
  getActiveSelectorsEntry,
  getStateEntry,
  setChatModeEntry,
} from './workbench.state.js';
import {
  rejectWaiterEntry,
  resolveWaiterEntry,
  submitAndWaitEntry,
} from './workbench.submit.js';

const log = createLogger('Workbench');

/**
 * The core automation engine.
 *
 * Coordinates the task queue, account manager, and Playwright sessions
 * to process batch questions through free-tier AI chat websites.
 */
export class Workbench {
  readonly tasks = new TaskQueue();
  readonly resources: ResourceManager;

  private readonly modelStore: ModelStore;
  private readonly customProviderStore: CustomProviderStore;
  private readonly dataDir: string;
  readonly selectorService: SelectorService;
  private readonly healthMonitor: HealthMonitor;
  readonly loginBrowser: LoginBrowserManager;

  /** Shared KV handle for resources/models/providers/selector cache (D-3). */
  private readonly globalKv: ProjectKVStore | undefined;

  constructor(savePath?: string, skipSeed?: boolean) {
    const dataDir = dirname(savePath ?? join(process.cwd(), 'data', 'resources.json'));
    this.dataDir = dataDir;

    // When GLOBAL_STORE_BACKEND=sqlite, instantiate one shared KV that all
    // root-level stores piggyback on (data/global.db).  In skipSeed (test)
    // mode we leave it undefined so legacy in-memory paths still kick in.
    this.globalKv = !skipSeed && process.env.GLOBAL_STORE_BACKEND === 'sqlite'
      ? createGlobalKVStore(dataDir)
      : undefined;

    this.resources = new ResourceManager(savePath, skipSeed, this.globalKv ? { kv: this.globalKv } : {});
    const modelsSavePath = skipSeed ? '' : join(dataDir, 'models.json');
    const providersSavePath = skipSeed ? '' : join(dataDir, 'providers.json');
    const selectorCachePath = skipSeed ? '' : join(dataDir, 'selector-cache.json');
    this.modelStore = new ModelStore(modelsSavePath, this.globalKv ? { kv: this.globalKv } : {});
    this.customProviderStore = new CustomProviderStore(providersSavePath, this.globalKv ? { kv: this.globalKv } : {});

    const sink = {
      emit: (event: WorkbenchEvent) => this.emit(event),
      emitState: () => this.emitState(),
    };

    this.selectorService = new SelectorService(
      selectorCachePath,
      this.customProviderStore,
      this.resources,
      sink,
      this.globalKv ? { kv: this.globalKv } : {},
    );

    this.healthMonitor = new HealthMonitor({
      selectorService: this.selectorService,
      getActivePage: () => this.activePage,
      getActiveAccountId: () => this.activeAccountId,
      getResourceType: (id) => this.resources.get(id)?.type,
      getResourceProvider: (id) => this.resources.get(id)?.provider,
      emit: (event) => this.emit(event as WorkbenchEvent),
      chatAutomationPort: getChatAutomationPort(),
    });

    this.loginBrowser = new LoginBrowserManager({
      selectorService: this.selectorService,
      modelStore: this.modelStore,
      resources: this.resources,
      sink,
      closeBrowser: () => this.closeBrowser(),
      chatAutomationPort: getChatAutomationPort(),
    });
  }

  /** Custom selector overrides keyed by provider id. */

  private running = false;
  /** Manual/default chat mode exposed to the UI. */
  private defaultChatMode: ChatMode = 'new';
  private abortController: AbortController | null = null;

  private activeContext: BrowserContext | null = null;
  private activePage: Page | null = null;
  private activeAccountId: string | null = null;
  /** Tracks which logical chat session the active page currently represents. */
  private activeChatSessionId: string | null = null;

  private listeners: EventListener[] = [];

  /* -------------------------------------------------------------- */
  /*  Event helpers                                                  */
  /* -------------------------------------------------------------- */

  onEvent(fn: EventListener): () => void {
    return onEventEntry(
      () => this.listeners,
      (next) => { this.listeners = next; },
      fn,
    );
  }

  private emit(event: WorkbenchEvent): void {
    emitEntry(this.listeners, event);
  }

  private emitState(): void {
    emitStateEntry((event) => this.emit(event), () => this.getState());
  }

  /* -------------------------------------------------------------- */
  /*  Provider / selector facade                                   */
  /* -------------------------------------------------------------- */

  getProviderList(): ProviderInfo[] {
    return getProviderListEntry(this.getProviderDeps());
  }

  addCustomProvider(id: string, label: string, selectors: ProviderSelectors): ProviderInfo {
    return addCustomProviderEntry(this.getProviderDeps(), id, label, selectors);
  }

  removeCustomProvider(id: string): boolean {
    return removeCustomProviderEntry(this.getProviderDeps(), id);
  }

  /**
   * Add a custom provider from just a Chat URL.
   *
   * Automatically:
   * 1. Derives provider ID and label from the URL domain
   * 2. Creates a browser profile directory
   * 3. Opens a login browser for the user
   * 4. After the page loads, auto-detects CSS selectors and models
   *
   * Returns the created account ID so the frontend can track it.
   */
  async addProviderFromUrl(chatUrl: string, typeOverride?: string): Promise<{ providerId: string; accountId: string }> {
    return addProviderFromUrlEntry(this.getProviderDeps(), chatUrl, typeOverride);
  }

  /* -------------------------------------------------------------- */
  /*  State                                                         */
  /* -------------------------------------------------------------- */

  getState(): WorkbenchState {
    return getStateEntry({
      resources: this.resources,
      tasks: this.tasks,
      running: this.running,
      defaultChatMode: this.defaultChatMode,
      getProviderList: () => this.getProviderList(),
      modelStore: this.modelStore,
      activeAccountId: this.activeAccountId,
      loginBrowser: this.loginBrowser,
    });
  }

  /* -------------------------------------------------------------- */
  /*  Chat mode                                                     */
  /* -------------------------------------------------------------- */

  setChatMode(mode: ChatMode): void {
    setChatModeEntry(
      (nextMode) => { this.defaultChatMode = nextMode; },
      () => this.emitState(),
      mode,
    );
  }

  /* -------------------------------------------------------------- */
  /*  Model detection                                               */
  /* -------------------------------------------------------------- */

  /**
   * Detect available models for a provider by scanning the page DOM.
   *
   * **Best results**: open a Login browser first, navigate to the chat page,
   * manually click the model picker to open the dropdown, then call this.
   * The scraper will read whatever is currently visible on the page.
   *
   * If no login browser is open, a temporary browser is launched instead.
   */
  async detectModels(provider: ProviderId): Promise<readonly ModelOption[]> {
    return detectModelsEntry(this.getModelDeps(), provider);
  }

  /* -------------------------------------------------------------- */
  /*  Selector overrides — delegated to SelectorService              */
  /* -------------------------------------------------------------- */

  setProviderSelectors(provider: ProviderId, overrides: Partial<ProviderSelectors>): void {
    setProviderSelectorsEntry(this.getProviderDeps(), provider, overrides);
  }

  getSelectors(provider: ProviderId): ProviderSelectors {
    return getSelectorsEntry(this.getProviderDeps(), provider);
  }

  getModels(provider: ProviderId): readonly ModelOption[] {
    return getModelsEntry(this.getModelDeps(), provider);
  }

  /* -------------------------------------------------------------- */
  /*  Facade wiring helpers                                         */
  /* -------------------------------------------------------------- */

  private getProviderDeps() {
    return {
      customProviderStore: this.customProviderStore,
      resources: this.resources,
      selectorService: this.selectorService,
      loginBrowser: this.loginBrowser,
      dataDir: this.dataDir,
      emitState: () => this.emitState(),
    };
  }

  private getModelDeps() {
    return {
      resources: this.resources,
      loginBrowser: this.loginBrowser,
      modelStore: this.modelStore,
      providerModels: PROVIDER_MODELS,
      getSelectors: (provider: ProviderId) => this.getSelectors(provider),
      launchWithRetry: launchWithRetryEntry,
      stealthArgs: STEALTH_ARGS,
      scrapeModels,
      emit: (event: WorkbenchEvent) => this.emit(event),
      emitState: () => this.emitState(),
    };
  }

  private getBrowserDeps() {
    return {
      getActiveContext: () => this.activeContext,
      setActiveContext: (context: BrowserContext | null) => { this.activeContext = context; },
      getActivePage: () => this.activePage,
      setActivePage: (page: Page | null) => { this.activePage = page; },
      getActiveAccountId: () => this.activeAccountId,
      setActiveAccountId: (accountId: string | null) => { this.activeAccountId = accountId; },
      getActiveChatSessionId: () => this.activeChatSessionId,
      setActiveChatSessionId: (sessionId: string | null) => { this.activeChatSessionId = sessionId; },
      getDefaultChatMode: () => this.defaultChatMode,
      getSelectors: (provider: ProviderId) => this.getSelectors(provider),
      resources: this.resources,
      selectorService: this.selectorService,
      modelStore: this.modelStore,
      loginBrowser: this.loginBrowser,
      emit: (event: WorkbenchEvent) => this.emit(event),
      emitState: () => this.emitState(),
      closeLoginBrowser: (accountId: string) => this.closeLoginBrowser(accountId),
      openChat,
      autoDetectSelectors,
      autoDetectVideoSelectors,
      launchWithRetry: launchWithRetryEntry,
      stealthArgs: STEALTH_ARGS,
      delay: delayEntry,
      isElectronShell,
      releaseElectronContext: async (profileDir: string) => {
        const { releaseElectronContext } = await import('@ai-video/pipeline-core/electronBridge.js');
        await releaseElectronContext(profileDir);
      },
      cleanupProfileDir: async (profileDir: string) => {
        try {
          const res = spawnSync('lsof', ['+D', profileDir], {
            encoding: 'utf8',
            timeout: 5000,
            shell: false,
          });
          const pids = (res.stdout ?? '')
            .split('\n')
            .filter(line => line.includes('Chrome'))
            .map(line => line.trim().split(/\s+/)[1])
            .filter((pid): pid is string => !!pid && /^\d+$/.test(pid));
          const uniquePids = Array.from(new Set(pids));
          for (const pid of uniquePids) {
            try { process.kill(Number(pid), 'SIGTERM'); } catch {}
          }
          if (uniquePids.length) {
            log.warn('chrome_lingering_processes_killed', { pidCount: uniquePids.length });
            await delayEntry(2000);
          }
        } catch {}
        await fs.unlink(path.join(profileDir, 'SingletonLock')).catch(() => {});
      },
    };
  }

  /* -------------------------------------------------------------- */
  /*  Login browser — delegated to LoginBrowserManager               */
  /* -------------------------------------------------------------- */

  async openLoginBrowser(accountId: string): Promise<void> {
    await openLoginBrowserEntry(this.getBrowserDeps(), accountId, () => this.closeBrowser());
  }

  async closeLoginBrowser(accountId: string): Promise<void> {
    await this.loginBrowser.close(accountId);
  }

  /* -------------------------------------------------------------- */
  /*  Browser lifecycle                                             */
  /* -------------------------------------------------------------- */

  private requiresFreshChat(task: TaskItem): boolean {
    return requiresFreshChatEntry(this.defaultChatMode, this.activeChatSessionId, task);
  }

  private syncActiveTaskSession(task: TaskItem): void {
    syncActiveTaskSessionEntry((sessionId) => { this.activeChatSessionId = sessionId; }, task);
  }

  /**
   * Register crash/close listeners on the active page and context so the
   * workbench learns about browser failures immediately (milliseconds)
   * instead of waiting for a 120s timeout on the next Playwright operation.
   */
  private registerActivePageListeners(page: Page, context: BrowserContext): void {
    registerActivePageListenersEntry(this.getBrowserDeps(), page, context);
  }

  private async ensureBrowser(account: Account, task: TaskItem): Promise<Page> {
    return ensureBrowserEntry(this.getBrowserDeps(), account, task, () => this.closeBrowser());
  }

  private async closeBrowser(): Promise<void> {
    await closeBrowserEntry(this.getBrowserDeps());
  }

  /* -------------------------------------------------------------- */
  /*  Selector health monitoring — delegated to HealthMonitor       */
  /* -------------------------------------------------------------- */

  startHealthMonitor(): void { this.healthMonitor.start(); }
  stopHealthMonitor(): void { this.healthMonitor.stop(); }

  /* -------------------------------------------------------------- */
  /*  Main loop                                                     */
  /* -------------------------------------------------------------- */

  async start(): Promise<void> {
    if (this.running) return;

    // Close all login browser sessions to release profile locks
    for (const accountId of [...this.loginBrowser.keys()]) {
      await this.closeLoginBrowser(accountId);
    }

    this.running = true;
    this.abortController = new AbortController();
    this.startHealthMonitor();
    this.emitState();

    try {
      await this.processLoop();
    } finally {
      this.running = false;
      this.stopHealthMonitor();
      // Don't close browser immediately — callers (e.g. chatAdapter.generateImage)
      // may still need the active page for image extraction after submitAndWait returns.
      // The browser will be closed by ensureBrowser() when switching providers,
      // or by an explicit stop() call.
      this.emit({ type: WB_EVENT.STOPPED, payload: {} });
      this.emitState();
    }
  }

  stop(): void {
    this.abortController?.abort();
    this.stopHealthMonitor();
  }

  private async processLoop(): Promise<void> {
    await processLoopEntry({
      tasks: this.tasks,
      resources: this.resources,
      getSelectors: (provider) => this.getSelectors(provider),
      getModels: (provider) => this.getModels(provider),
      ensureBrowser: (account, task) => this.ensureBrowser(account, task),
      closeBrowser: () => this.closeBrowser(),
      handleQuotaExhausted: (account, taskId) => this.handleQuotaExhausted(account, taskId),
      resolveWaiter: (taskId, answer) => this.resolveWaiter(taskId, answer),
      rejectWaiter: (taskId, error) => this.rejectWaiter(taskId, error),
      emit: (event) => this.emit(event),
      emitState: () => this.emitState(),
      getAbortSignal: () => this.abortController?.signal,
      getActivePage: () => this.activePage,
      checkQuotaExhausted,
      selectModel,
      typePromptText,
      uploadFiles,
      sendPrompt,
      findModelMatch: findModelMatchEntry,
    });
  }

  private async handleQuotaExhausted(account: Account, _taskId: string): Promise<void> {
    await handleQuotaExhaustedEntry(
      this.resources,
      (event) => this.emit(event),
      () => this.emitState(),
      () => this.closeBrowser(),
      account,
    );
  }

  /* -------------------------------------------------------------- */
  /*  Pipeline integration: submitAndWait                           */
  /* -------------------------------------------------------------- */

  /** Pending promise resolvers keyed by task id. */
  private waitResolvers = new Map<string, { resolve: (answer: string) => void; reject: (err: Error) => void }>();

  /**
   * Submit a single question and wait for the answer.
   * Used by ChatAdapter to bridge the pipeline's synchronous API calls
   * to the workbench's asynchronous chat automation.
   */
  async submitAndWait(opts: {
    question: string;
    preferredProvider?: ProviderId;
    preferredModel?: string;
    attachments?: string[];
    timeoutMs?: number;
    signal?: AbortSignal;
    /** If true, continue in the same chat (don't open a new page). */
    useSameChat?: boolean;
    /** Named session ID for grouping related requests. */
    sessionId?: string;
  }): Promise<string> {
    return submitAndWaitEntry({
      tasks: this.tasks,
      defaultChatMode: this.defaultChatMode,
      waitResolvers: this.waitResolvers,
      isRunning: () => this.running,
      start: () => this.start(),
    }, opts);
  }

  /**
   * Called internally when a task completes to resolve waiting promises.
   * Must be called after markDone/markFailed in processLoop.
   */
  private resolveWaiter(taskId: string, answer: string): void {
    resolveWaiterEntry(this.waitResolvers, taskId, answer);
  }

  private rejectWaiter(taskId: string, error: string): void {
    rejectWaiterEntry(this.waitResolvers, taskId, error);
  }

  /* -------------------------------------------------------------- */
  /*  Pipeline integration: page access for image extraction        */
  /* -------------------------------------------------------------- */

  /**
   * Return the currently active Playwright page (if any).
   * Used by ChatAdapter to extract images from the latest chat response.
   */
  getActivePage(): Page | null {
    return getActivePageEntry(this.activePage);
  }

  /**
   * Return the ID of the account currently driving the active browser.
   * Used by ChatAdapter to mark per-account quota exhaustion.
   */
  getActiveAccountId(): string | null {
    return getActiveAccountIdEntry(this.activeAccountId);
  }

  /**
   * Return the selectors for the currently active account's provider.
   */
  getActiveSelectors(): ProviderSelectors | null {
    return getActiveSelectorsEntry(
      this.activeAccountId,
      this.resources,
      (provider) => this.getSelectors(provider),
    );
  }

  /**
   * Return a SelectorChain for a specific field of the active provider.
   * Checks selectorChainCache first, then falls back to preset chains.
   */
  getActiveSelectorChain(field: string): SelectorChain | undefined {
    return getActiveSelectorChainEntry(
      this.activeAccountId,
      this.resources,
      this.selectorService,
      field,
    );
  }
}
