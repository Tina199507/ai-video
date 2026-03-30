/* ------------------------------------------------------------------ */
/*  AI Chat Automation Workbench – shared type definitions             */
/* ------------------------------------------------------------------ */

/** Built-in provider identifiers. */
export type BuiltinProviderId = 'chatgpt' | 'gemini' | 'deepseek' | 'kimi';

/**
 * Provider identifier — built-in providers plus any user-added custom providers.
 * Custom providers use whatever `id` the user sets (e.g. 'claude', 'grok').
 */
export type ProviderId = string;

/** Chat mode – new chat per question or continue in same chat. */
export type ChatMode = 'new' | 'continue';

/** One login credential for a chat provider. */
export interface Account {
  id: string;
  provider: ProviderId;
  label: string;
  /** Browser user-data directory (persistent cookies / session). */
  profileDir: string;
  /** Whether the account is currently known to have exhausted its quota. */
  quotaExhausted: boolean;
  /** ISO timestamp of last known quota reset, if any. */
  quotaResetAt?: string;
}

/** A model/mode option available for a provider. */
export interface ModelOption {
  id: string;
  label: string;
  /** Sequence of selectors to click to activate this model. Empty/omitted = default (no action needed). */
  selectSteps?: string[];
}

/** CSS / aria selectors that describe how to interact with a provider page. */
export interface ProviderSelectors {
  /** URL to open for a new chat session. */
  chatUrl: string;
  /** Selector for the prompt input (textarea / contenteditable). */
  promptInput: string;
  /** Selector for the send button (if Enter alone is insufficient). */
  sendButton?: string;
  /** Selector for the most-recent assistant response block. */
  responseBlock: string;
  /** Selector whose presence means "ready to accept a prompt". */
  readyIndicator: string;
  /** Selector or text pattern that indicates the free quota is used up. */
  quotaExhaustedIndicator?: string;
  /** Selector to click to open the model picker dropdown. */
  modelPickerTrigger?: string;
  /** Selector for each model option inside the opened dropdown. */
  modelOptionSelector?: string;
  /** Selector for the "+" / attachment button next to the chat input. */
  fileUploadTrigger?: string;
}

/** A single question to be sent to the AI chat. */
export interface TaskItem {
  id: string;
  question: string;
  /** Which provider to prefer (optional – falls back to any available). */
  preferredProvider?: ProviderId;
  /** Which model/mode to use (optional – falls back to provider default). */
  preferredModel?: string;
  /** Absolute file paths on the server to upload with the question. */
  attachments?: string[];
  status: 'pending' | 'running' | 'done' | 'failed';
  answer?: string;
  error?: string;
  /** ISO timestamp when processing started. */
  startedAt?: string;
  /** ISO timestamp when processing completed. */
  completedAt?: string;
  /** Which account was used. */
  accountId?: string;
}

/** Summary info for a provider, exposed to the UI. */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  builtin: boolean;
}

/** Overall workbench state exposed to the UI. */
export interface WorkbenchState {
  accounts: Account[];
  tasks: TaskItem[];
  isRunning: boolean;
  chatMode: ChatMode;
  /** All available providers (built-in + custom). */
  providers: ProviderInfo[];
  /** Dynamically detected models per provider. */
  detectedModels: Partial<Record<ProviderId, ModelOption[]>>;
  currentTaskId?: string;
  activeAccountId?: string;
  /** Account IDs that currently have a login browser open. */
  loginOpenAccountIds: string[];
}

/** Events pushed to the UI via SSE. */
export type WorkbenchEvent =
  | { type: 'state'; payload: WorkbenchState }
  | { type: 'task_started'; payload: { taskId: string; accountId: string } }
  | { type: 'task_done'; payload: { taskId: string; answer: string } }
  | { type: 'task_failed'; payload: { taskId: string; error: string } }
  | { type: 'quota_exhausted'; payload: { accountId: string } }
  | { type: 'account_switched'; payload: { fromAccountId: string; toAccountId: string } }
  | { type: 'login_browser_opened'; payload: { accountId: string } }
  | { type: 'login_browser_closed'; payload: { accountId: string } }
  | { type: 'models_detected'; payload: { provider: ProviderId; models: ModelOption[] } }
  | { type: 'stopped'; payload: Record<string, never> };
