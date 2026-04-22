/**
 * abortable.ts — abort-aware primitives shared by the retry helper and
 * the pipeline's AI call wrappers.  Lives in `src/lib` so generic
 * utilities (retry, future schedulers) can depend on it without
 * pulling in the whole pipeline graph (C-0: break the
 * src/lib → src/pipeline reverse edge).
 */

export class AIRequestAbortedError extends Error {
  constructor(readonly label: string) {
    super(`${label} aborted`);
    this.name = 'AIRequestAbortedError';
  }
}

export function throwIfAborted(signal: AbortSignal | undefined, label: string): void {
  if (signal?.aborted) {
    throw new AIRequestAbortedError(label);
  }
}

export function waitWithAbort(ms: number, signal?: AbortSignal, label = 'AI wait'): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new AIRequestAbortedError(label));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new AIRequestAbortedError(label));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
