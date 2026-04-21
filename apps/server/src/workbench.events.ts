import { WB_EVENT } from './types.js';
import type { WorkbenchEvent, WorkbenchState } from './types.js';

export type EventListener = (event: WorkbenchEvent) => void;

export function onEventEntry(
  getListeners: () => EventListener[],
  setListeners: (next: EventListener[]) => void,
  fn: EventListener,
): () => void {
  setListeners([...getListeners(), fn]);
  return () => {
    setListeners(getListeners().filter((l) => l !== fn));
  };
}

export function emitEntry(listeners: EventListener[], event: WorkbenchEvent): void {
  for (const fn of listeners) fn(event);
}

export function emitStateEntry(
  emit: (event: WorkbenchEvent) => void,
  getState: () => WorkbenchState,
): void {
  emit({ type: WB_EVENT.STATE, payload: getState() });
}
