import type {
  WorkbenchState as SharedWorkbenchState,
  TaskItem as SharedTaskItem,
  ChatMode as SharedChatMode,
  ProviderInfo as SharedProviderInfo,
} from '@ai-video/shared/types.js';

export type CoreWorkbenchState = SharedWorkbenchState;
export type CoreTaskItem = SharedTaskItem;
export type CoreChatMode = SharedChatMode;
export type CoreProviderInfo = SharedProviderInfo;

export type WorkbenchState = CoreWorkbenchState;
export type TaskItem = CoreTaskItem;
export type ChatMode = CoreChatMode;
export type ProviderInfo = CoreProviderInfo;

export function toCoreWorkbenchState(x: SharedWorkbenchState): CoreWorkbenchState {
  return x;
}

export function toSharedWorkbenchState(x: CoreWorkbenchState): SharedWorkbenchState {
  return x;
}

export function toCoreTaskItem(x: SharedTaskItem): CoreTaskItem {
  return x;
}

export function toSharedTaskItem(x: CoreTaskItem): SharedTaskItem {
  return x;
}

export function toCoreChatMode(x: SharedChatMode): CoreChatMode {
  return x;
}

export function toSharedChatMode(x: CoreChatMode): SharedChatMode {
  return x;
}

export function toCoreProviderInfo(x: SharedProviderInfo): CoreProviderInfo {
  return x;
}

export function toSharedProviderInfo(x: CoreProviderInfo): SharedProviderInfo {
  return x;
}
