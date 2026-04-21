import type { Page } from 'playwright';
import type {
  ChatMode,
  ProviderId,
  ProviderInfo,
  ProviderSelectors,
  SelectorChain,
  WorkbenchState,
} from './types.js';
import type { ResourceManager } from './workbenchDeps.js';
import type { TaskQueue } from './workbenchDeps.js';
import type { ModelStore } from './workbenchDeps.js';
import type { LoginBrowserManager } from './workbenchDeps.js';
import type { SelectorService } from './workbenchDeps.js';

export interface WorkbenchStateDeps {
  resources: ResourceManager;
  tasks: TaskQueue;
  running: boolean;
  defaultChatMode: ChatMode;
  getProviderList: () => ProviderInfo[];
  modelStore: ModelStore;
  activeAccountId: string | null;
  loginBrowser: LoginBrowserManager;
}

export function getStateEntry(deps: WorkbenchStateDeps): WorkbenchState {
  return {
    accounts: deps.resources.allAccounts(),
    resources: deps.resources.all(),
    tasks: deps.tasks.all(),
    isRunning: deps.running,
    chatMode: deps.defaultChatMode,
    providers: deps.getProviderList(),
    detectedModels: deps.modelStore.getAll(),
    currentTaskId: deps.tasks.all().find((t) => t.status === 'running')?.id,
    activeAccountId: deps.activeAccountId ?? undefined,
    loginOpenAccountIds: [...deps.loginBrowser.keys()],
  };
}

export function setChatModeEntry(
  setMode: (mode: ChatMode) => void,
  emitState: () => void,
  mode: ChatMode,
): void {
  setMode(mode);
  emitState();
}

export function getActivePageEntry(activePage: Page | null): Page | null {
  return activePage;
}

export function getActiveAccountIdEntry(activeAccountId: string | null): string | null {
  return activeAccountId;
}

export function getActiveSelectorsEntry(
  activeAccountId: string | null,
  resources: ResourceManager,
  getSelectors: (provider: ProviderId) => ProviderSelectors,
): ProviderSelectors | null {
  if (!activeAccountId) return null;
  const account = resources.get(activeAccountId);
  if (!account) return null;
  try {
    return getSelectors(account.provider);
  } catch {
    return null;
  }
}

export function getActiveSelectorChainEntry(
  activeAccountId: string | null,
  resources: ResourceManager,
  selectorService: SelectorService,
  field: string,
): SelectorChain | undefined {
  if (!activeAccountId) return undefined;
  const account = resources.get(activeAccountId);
  if (!account) return undefined;
  return selectorService.getSelectorChain(account.provider, field);
}
