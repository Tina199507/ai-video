import type { ModelOption } from '@ai-video/shared/types.js';

/** CSS / aria selectors that describe how to interact with a provider page (host `src/types.ts`). */
export interface ProviderSelectors {
  chatUrl: string;
  promptInput: string;
  sendButton?: string;
  responseBlock: string;
  readyIndicator: string;
  quotaExhaustedIndicator?: string;
  quotaTextPatterns?: string[];
  modelPickerTrigger?: string;
  modelOptionSelector?: string;
  fileUploadTrigger?: string;
}

/** Result of scraping available models from a provider page. */
export interface ScrapedModel {
  id: string;
  label: string;
}

export interface ChatResult {
  answer: string;
  quotaExhausted: boolean;
}

export interface ChatAutomationOptions {
  /** Max ms to wait for the ready indicator after navigation. */
  readyTimeout?: number;
  /** Max ms to wait for the AI response to appear. */
  responseTimeout?: number;
  /** Interval (ms) to poll for response stability. */
  pollInterval?: number;
  /** Max ms to wait for the send button to appear (e.g. while files upload). */
  sendButtonTimeout?: number;
  /** If true, skip typing the question text (already typed via typePromptText). */
  textAlreadyTyped?: boolean;
}

export interface DetectedSelectors {
  promptInput: string | null;
  sendButton: string | null;
  responseBlock: string | null;
  readyIndicator: string | null;
  fileUploadTrigger: string | null;
}

export interface DetectedVideoSelectors {
  promptInput: string | null;
  generateButton: string | null;
  imageUploadTrigger: string | null;
  videoResult: string | null;
  progressIndicator: string | null;
  downloadButton: string | null;
}

export const DEFAULT_CHAT_AUTOMATION_OPTIONS: Required<ChatAutomationOptions> = {
  readyTimeout: 30_000,
  responseTimeout: 120_000,
  pollInterval: 2_000,
  sendButtonTimeout: 10_000,
  textAlreadyTyped: false,
};

export type { ModelOption };
