import type { Account, ChatMode, ModelOption, ProviderId, ProviderInfo, TaskItem, WorkbenchState } from '../types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  getState: () => request<WorkbenchState>('/state'),

  addTasks: (questions: string[], preferredProvider?: ProviderId, preferredModel?: string, attachments?: string[]) =>
    request<TaskItem[]>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ questions, preferredProvider, preferredModel, attachments }),
    }),

  removeTask: (taskId: string) =>
    request<{ ok: boolean }>(`/tasks/${taskId}`, { method: 'DELETE' }),

  clearTasks: () =>
    request<{ ok: boolean }>('/tasks/clear', { method: 'POST' }),

  addAccount: (provider: ProviderId, label: string, profileDir: string) =>
    request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify({ provider, label, profileDir }),
    }),

  removeAccount: (accountId: string) =>
    request<{ ok: boolean }>(`/accounts/${accountId}`, { method: 'DELETE' }),

  resetQuotas: () =>
    request<{ ok: boolean }>('/accounts/reset-quotas', { method: 'POST' }),

  openLoginBrowser: (accountId: string) =>
    request<{ ok: boolean }>(`/accounts/${accountId}/login`, { method: 'POST' }),

  closeLoginBrowser: (accountId: string) =>
    request<{ ok: boolean }>(`/accounts/${accountId}/close-login`, { method: 'POST' }),

  start: () => request<{ ok: boolean }>('/start', { method: 'POST' }),

  stop: () => request<{ ok: boolean }>('/stop', { method: 'POST' }),

  setChatMode: (mode: ChatMode) =>
    request<{ ok: boolean }>('/chat-mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  getProviders: () =>
    request<Array<{ id: ProviderId; selectors: Record<string, string>; models: ModelOption[] }>>('/providers'),

  addProvider: (id: string, label: string, selectors: Record<string, string>) =>
    request<ProviderInfo>('/providers', {
      method: 'POST',
      body: JSON.stringify({ id, label, selectors }),
    }),

  addProviderFromUrl: (chatUrl: string) =>
    request<{ providerId: string; accountId: string }>('/providers/from-url', {
      method: 'POST',
      body: JSON.stringify({ chatUrl }),
    }),

  removeProvider: (id: string) =>
    request<{ ok: boolean }>(`/providers/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getModels: (provider: ProviderId) =>
    request<ModelOption[]>(`/models/${provider}`),

  detectModels: (provider: ProviderId) =>
    request<ModelOption[]>(`/models/${provider}`, { method: 'POST' }),

  uploadFiles: (files: Array<{ name: string; data: string }>) =>
    request<{ paths: string[] }>('/upload', {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),
};
