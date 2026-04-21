import type { LogEntry as SharedLogEntry } from '@ai-video/shared/types.js';

export type CoreLogEntry = SharedLogEntry;
export type LogEntry = CoreLogEntry;

export function toCoreLogEntry(x: SharedLogEntry): CoreLogEntry {
  return x;
}

export function toSharedLogEntry(x: CoreLogEntry): SharedLogEntry {
  return x;
}
