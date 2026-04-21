import type { BrowserContext } from 'playwright';
import { createLogger } from '@ai-video/lib/logger.js';
import { WB_EVENT } from './types.js';
import type {
  ModelOption,
  ProviderId,
  ProviderSelectors,
  WorkbenchEvent,
} from './types.js';

const log = createLogger('Workbench');

export interface WorkbenchModelsDeps {
  resources: {
    all: () => Array<{ id: string; provider: ProviderId; profileDir: string }>;
  };
  loginBrowser: {
    has: (accountId: string) => boolean;
  };
  modelStore: {
    set: (provider: ProviderId, models: ModelOption[]) => void;
    get: (provider: ProviderId) => readonly ModelOption[] | undefined;
  };
  providerModels: Record<string, readonly ModelOption[]>;
  getSelectors: (provider: ProviderId) => ProviderSelectors;
  launchWithRetry: (profileDir: string, stealthArgs: readonly string[]) => Promise<BrowserContext>;
  stealthArgs: readonly string[];
  scrapeModels: (page: any, selectors: ProviderSelectors) => Promise<Array<{ id: string; label: string }>>;
  emit: (event: WorkbenchEvent) => void;
  emitState: () => void;
}

export function getModelsEntry(
  deps: WorkbenchModelsDeps,
  provider: ProviderId,
): readonly ModelOption[] {
  return deps.modelStore.get(provider) ?? deps.providerModels[provider] ?? [{ id: 'default', label: 'Default' }];
}

export async function detectModelsEntry(
  deps: WorkbenchModelsDeps,
  provider: ProviderId,
): Promise<readonly ModelOption[]> {
  const account = deps.resources.all().find((a) => a.provider === provider);
  if (!account) throw new Error(`No account for provider "${provider}". Add one first.`);

  let ctx: BrowserContext | undefined;
  let needClose = false;

  if (deps.loginBrowser.has(account.id)) {
    // Keep previous behavior: still launch temp browser for detectModels.
  }

  if (!ctx) {
    ctx = await deps.launchWithRetry(account.profileDir, deps.stealthArgs);
    needClose = true;
  }

  try {
    const selectors = deps.getSelectors(provider);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(selectors.chatUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(selectors.readyIndicator, { timeout: 15_000 }).catch((e: unknown) => {
      log.warn('ready_indicator_not_found', { context: 'model_detection', error: e instanceof Error ? e.message : String(e) });
    });
    await page.waitForTimeout(3_000);

    const scraped = await deps.scrapeModels(page, selectors);
    if (scraped.length > 0) {
      const models: ModelOption[] = scraped.map((m) => ({
        id: m.id,
        label: m.label,
        selectSteps: selectors.modelPickerTrigger
          ? [selectors.modelPickerTrigger, `text=${m.label}`]
          : undefined,
      }));
      deps.modelStore.set(provider, models);
      deps.emit({ type: WB_EVENT.MODELS_DETECTED, payload: { provider, models } });
      deps.emitState();
      return models;
    }

    log.warn('detect_models_empty', { provider });
    return getModelsEntry(deps, provider);
  } finally {
    if (needClose) {
      await ctx.close().catch((e: unknown) => log.warn('browser_context_close_failed', { context: 'model_detection', error: String(e) }));
    }
  }
}
