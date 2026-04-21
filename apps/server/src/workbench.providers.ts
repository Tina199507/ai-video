import { join } from 'node:path';
import { BUILTIN_PROVIDER_IDS } from './workbenchDeps.js';
import { matchPresetByUrl } from './workbenchDeps.js';
import type {
  AiResource,
  AiResourceType,
  BuiltinProviderId,
  ProviderId,
  ProviderInfo,
  ProviderSelectors,
} from './types.js';

export interface WorkbenchProvidersDeps {
  customProviderStore: {
    getProviderList: () => ProviderInfo[];
    get: (id: string) => { label: string; selectors: ProviderSelectors } | undefined;
    set: (id: string, value: { label: string; selectors: ProviderSelectors }) => void;
    remove: (id: string) => boolean;
    persist: () => void;
  };
  resources: {
    all: () => Array<{ id: string; provider: ProviderId }>;
    addResource: (payload: {
      type: AiResourceType;
      provider: string;
      label: string;
      siteUrl: string;
      profileDir: string;
      capabilities: Record<string, boolean>;
      selectors?: AiResource['selectors'];
      timing?: unknown;
      queueDetection?: unknown;
      dailyLimits?: unknown;
    }) => { id: string };
  };
  selectorService: {
    setProviderSelectors: (provider: ProviderId, overrides: Partial<ProviderSelectors>) => void;
    getSelectors: (provider: ProviderId) => ProviderSelectors;
  };
  loginBrowser: {
    openWithAutoDetect: (accountId: string, chatUrl: string, providerId: string, isBuiltin: boolean) => Promise<void>;
  };
  dataDir: string;
  emitState: () => void;
}

export function getProviderListEntry(deps: WorkbenchProvidersDeps): ProviderInfo[] {
  return deps.customProviderStore.getProviderList();
}

export function addCustomProviderEntry(
  deps: WorkbenchProvidersDeps,
  id: string,
  label: string,
  selectors: ProviderSelectors,
): ProviderInfo {
  if (BUILTIN_PROVIDER_IDS.includes(id as BuiltinProviderId)) {
    throw new Error(`Cannot overwrite built-in provider "${id}"`);
  }
  deps.customProviderStore.set(id, { label, selectors });
  deps.emitState();
  return { id, label, builtin: false };
}

export function removeCustomProviderEntry(deps: WorkbenchProvidersDeps, id: string): boolean {
  if (!deps.customProviderStore.remove(id)) return false;
  deps.emitState();
  return true;
}

export async function addProviderFromUrlEntry(
  deps: WorkbenchProvidersDeps,
  chatUrl: string,
  typeOverride?: string,
): Promise<{ providerId: string; accountId: string }> {
  const url = new URL(chatUrl);
  const host = url.hostname.replace(/^www\./, '');
  const parts = host.split('.');
  const providerIdRaw = parts.length >= 2
    ? (parts[0] === 'chat' || parts[0] === 'app' ? parts[1] : parts[0])
    : parts[0];
  const providerId = providerIdRaw ?? 'custom';
  const label = providerId.charAt(0).toUpperCase() + providerId.slice(1);

  const matchedPreset = matchPresetByUrl(chatUrl);
  const validTypes: AiResourceType[] = ['chat', 'video', 'image', 'multi'];
  const resourceType: AiResourceType = (typeOverride && validTypes.includes(typeOverride as AiResourceType))
    ? typeOverride as AiResourceType
    : matchedPreset?.type ?? 'chat';

  const isBuiltin = BUILTIN_PROVIDER_IDS.includes(providerId as BuiltinProviderId);
  const existingCustom = deps.customProviderStore.get(providerId);

  if (!isBuiltin && !existingCustom) {
    deps.customProviderStore.set(providerId, {
      label,
      selectors: {
        chatUrl,
        promptInput: 'textarea',
        responseBlock: '[class*="markdown"]',
        readyIndicator: 'textarea',
      },
    });
  } else if (!isBuiltin && existingCustom) {
    existingCustom.selectors.chatUrl = chatUrl;
    deps.customProviderStore.persist();
  }

  const existingResources = deps.resources.all().filter((a) => a.provider === providerId);
  const suffix = existingResources.length > 0 ? `-${existingResources.length + 1}` : '';
  const profileDir = join(deps.dataDir, 'profiles', `${providerId}${suffix}`);
  const resourceLabel = `${label}${suffix ? ' ' + (existingResources.length + 1) : ''}`;
  const capabilities: Record<string, boolean> = {};
  if (resourceType === 'chat' || resourceType === 'multi') capabilities.text = true;
  if (resourceType === 'video' || resourceType === 'multi') capabilities.video = true;
  if (resourceType === 'image' || resourceType === 'multi') capabilities.image = true;
  if (matchedPreset?.capabilities) {
    if (matchedPreset.capabilities.fileUpload) capabilities.fileUpload = true;
    if (matchedPreset.capabilities.webSearch) capabilities.webSearch = true;
  }

  let flatSelectors: AiResource['selectors'] | undefined;
  if (matchedPreset?.selectors) {
    const pick = (chain?: { selector: string; method: string; priority: number }[]): string | undefined => {
      if (!chain || chain.length === 0) return undefined;
      const css = chain.filter((s) => s.method === 'css').sort((a, b) => b.priority - a.priority);
      const firstCss = css[0];
      if (firstCss) return firstCss.selector;
      const firstAny = chain[0];
      return firstAny?.selector;
    };
    const s = matchedPreset.selectors;
    flatSelectors = {
      promptInput: pick(s.promptInput),
      generateButton: pick(s.generateButton),
      sendButton: pick(s.sendButton),
      responseBlock: pick(s.responseBlock),
      readyIndicator: pick(s.readyIndicator),
      resultElement: pick(s.resultElement),
      progressIndicator: pick(s.progressIndicator),
      downloadButton: pick(s.downloadButton),
      imageUploadTrigger: pick(s.imageUploadTrigger),
    };
  }

  const resource = deps.resources.addResource({
    type: resourceType,
    provider: providerId,
    label: resourceLabel,
    siteUrl: chatUrl,
    profileDir,
    capabilities,
    selectors: flatSelectors,
    timing: matchedPreset?.timing,
    queueDetection: matchedPreset?.queueDetection,
    dailyLimits: matchedPreset?.dailyLimits,
  });

  deps.emitState();
  await deps.loginBrowser.openWithAutoDetect(resource.id, chatUrl, providerId, isBuiltin);
  return { providerId, accountId: resource.id };
}

export function setProviderSelectorsEntry(
  deps: WorkbenchProvidersDeps,
  provider: ProviderId,
  overrides: Partial<ProviderSelectors>,
): void {
  deps.selectorService.setProviderSelectors(provider, overrides);
}

export function getSelectorsEntry(
  deps: WorkbenchProvidersDeps,
  provider: ProviderId,
): ProviderSelectors {
  return deps.selectorService.getSelectors(provider);
}
