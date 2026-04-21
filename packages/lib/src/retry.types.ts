/**
 * retry.types.ts — minimal type surface needed by `withRetry`.
 *
 * `withRetry` historically accepted either a `WithRetryOptions` bag or
 * the larger `AIRequestOptions` from `src/pipeline/types.ts`.  The
 * latter pulled the whole pipeline type graph into `src/lib`, which is
 * a layering inversion (C-0).  We model the slim subset that retry
 * actually consumes here so `src/lib/retry.ts` no longer reaches up
 * into the pipeline package.
 */

export interface RetryRequestOptions {
  /** Per-call timeout override.  Currently observed by `runWithAICallControl`. */
  timeoutMs?: number;
  /** Per-call abort signal, typically scoped to the current project run. */
  signal?: AbortSignal;
}
