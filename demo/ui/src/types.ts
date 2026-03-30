export type ProviderId = string;
export type ChatMode = 'new' | 'continue';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  builtin: boolean;
}

export interface Account {
  id: string;
  provider: ProviderId;
  label: string;
  profileDir: string;
  quotaExhausted: boolean;
  quotaResetAt?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  selectSteps?: string[];
}

export interface TaskItem {
  id: string;
  question: string;
  preferredProvider?: ProviderId;
  preferredModel?: string;
  attachments?: string[];
  status: 'pending' | 'running' | 'done' | 'failed';
  answer?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  accountId?: string;
}

export interface WorkbenchState {
  accounts: Account[];
  tasks: TaskItem[];
  isRunning: boolean;
  chatMode: ChatMode;
  providers: ProviderInfo[];
  detectedModels: Partial<Record<ProviderId, ModelOption[]>>;
  currentTaskId?: string;
  activeAccountId?: string;
  /** Account IDs that currently have a login browser open. */
  loginOpenAccountIds: string[];
}

export type WorkbenchEvent =
  | { type: 'state'; payload: WorkbenchState }
  | { type: 'task_started'; payload: { taskId: string; accountId: string } }
  | { type: 'task_done'; payload: { taskId: string; answer: string } }
  | { type: 'task_failed'; payload: { taskId: string; error: string } }
  | { type: 'quota_exhausted'; payload: { accountId: string } }
  | { type: 'account_switched'; payload: { fromAccountId: string; toAccountId: string } }
  | { type: 'login_browser_opened'; payload: { accountId: string } }
  | { type: 'login_browser_closed'; payload: { accountId: string } }
  | { type: 'stopped'; payload: Record<string, never> };
