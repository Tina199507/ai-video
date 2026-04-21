import type { Page } from 'playwright';
import type { AiResource, ProviderId, SelectorChain } from '@ai-video/shared/types.js';

export interface ChatSubmitRequest {
  question: string;
  preferredProvider?: ProviderId;
  preferredModel?: string;
  attachments?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
  useSameChat?: boolean;
  sessionId?: string;
}

export interface ChatResourcesPort {
  byCapability(cap: 'text' | 'image' | 'video' | 'fileUpload' | 'webSearch'): AiResource[];
}

export interface ActiveChatSelectors {
  responseBlock: string;
}

export interface ChatWorkbenchPort {
  submitAndWait(opts: ChatSubmitRequest): Promise<string>;
  resources: ChatResourcesPort;
  getActivePage(): Page | null;
  getActiveAccountId(): string | null;
  getActiveSelectors(): ActiveChatSelectors | null;
  getActiveSelectorChain(field: string): SelectorChain | undefined;
}
