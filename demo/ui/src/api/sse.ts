import type { WorkbenchEvent } from '../types';

/**
 * Connect to the SSE event stream. Returns a cleanup function.
 */
export function connectSSE(onEvent: (event: WorkbenchEvent) => void): () => void {
  const source = new EventSource('/api/events');

  source.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as WorkbenchEvent;
      onEvent(event);
    } catch {
      console.warn('[SSE] Failed to parse event:', e.data);
    }
  };

  source.onerror = () => {
    console.warn('[SSE] Connection error, will auto-reconnect');
  };

  return () => source.close();
}
