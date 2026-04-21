import type { AIAdapter, AIRequestOptions, GenerationResult } from './types/index.js';
import type { PipelineStage } from './sharedTypes.js';
import {
  AIRequestAbortedError,
  throwIfAborted as throwIfAbortedShared,
  waitWithAbort as waitWithAbortShared,
} from '@ai-video/pipeline-core/libFacade.js';

// Re-export so existing call sites under src/pipeline keep working
// after C-0 moved the abort primitives to src/lib/abortable.ts.
export { AIRequestAbortedError };
export const throwIfAborted = throwIfAbortedShared;
export const waitWithAbort = waitWithAbortShared;

export const DEFAULT_AI_TIMEOUT_MS = {
  text: 120_000,
  image: 180_000,
  video: 15 * 60_000,
  speech: 120_000,
  upload: 5 * 60_000,
} as const;

export class AIRequestTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number,
  ) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'AIRequestTimeoutError';
  }
}

interface AICallControlOptions {
  label: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ControlledAdapterOptions {
  projectId: string;
  stage: PipelineStage;
  taskType: string;
  signal?: AbortSignal;
}

interface SessionContextOptions {
  sessionId: string;
  continueChat: boolean;
}

function mergeRequestOptions(options: AIRequestOptions | undefined, additions: Partial<AIRequestOptions>): AIRequestOptions {
  return {
    ...(options ?? {}),
    ...additions,
  };
}

function makeLabel(stage: PipelineStage, taskType: string, method: string, projectId: string): string {
  return `AI ${method} for ${projectId}:${stage}/${taskType}`;
}

export function runWithAICallControl<T>(
  operation: () => Promise<T>,
  options: AICallControlOptions,
): Promise<T> {
  const { label, signal, timeoutMs } = options;
  throwIfAborted(signal, label);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    const settle = (fn: (value: unknown) => void, value: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      (fn as (v: unknown) => void)(value);
    };

    const onAbort = () => settle(reject as (reason?: unknown) => void, new AIRequestAbortedError(label));

    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        settle(reject as (reason?: unknown) => void, new AIRequestTimeoutError(label, timeoutMs));
      }, timeoutMs);
    }

    signal?.addEventListener('abort', onAbort, { once: true });

    Promise.resolve()
      .then(operation)
      .then(
        (value) => settle(resolve as (value: unknown) => void, value),
        (error) => settle(reject as (reason?: unknown) => void, error),
      );
  });
}

export function createControlledAdapter(
  inner: AIAdapter,
  options: ControlledAdapterOptions,
): AIAdapter {
  return {
    provider: inner.provider,

    generateText(model: string, prompt: string | unknown[], requestOptions?: AIRequestOptions): Promise<GenerationResult> {
      const mergedOptions = mergeRequestOptions(requestOptions, {
        signal: options.signal,
        timeoutMs: requestOptions?.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS.text,
      });
      return runWithAICallControl(
        () => inner.generateText(model, prompt as string | import('./types/index.js').PromptPart[], mergedOptions),
        {
          label: makeLabel(options.stage, options.taskType, 'generateText', options.projectId),
          signal: options.signal,
          timeoutMs: mergedOptions.timeoutMs,
        },
      );
    },

    generateImage(model: string, prompt: string, aspectRatio?: string, negativePrompt?: string, requestOptions?: AIRequestOptions): Promise<GenerationResult> {
      const mergedOptions = mergeRequestOptions(requestOptions, {
        signal: options.signal,
        timeoutMs: requestOptions?.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS.image,
      });
      return runWithAICallControl(
        () => inner.generateImage(model, prompt, aspectRatio, negativePrompt, mergedOptions),
        {
          label: makeLabel(options.stage, options.taskType, 'generateImage', options.projectId),
          signal: options.signal,
          timeoutMs: mergedOptions.timeoutMs,
        },
      );
    },

    generateVideo(model: string, prompt: string, requestOptions?: { aspectRatio?: string; image?: string; duration?: number; fps?: number; resolution?: '720p' | '1080p' } & AIRequestOptions): Promise<GenerationResult> {
      const mergedOptions = {
        ...(requestOptions ?? {}),
        signal: options.signal,
        timeoutMs: requestOptions?.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS.video,
      };
      return runWithAICallControl(
        () => inner.generateVideo(model, prompt, mergedOptions),
        {
          label: makeLabel(options.stage, options.taskType, 'generateVideo', options.projectId),
          signal: options.signal,
          timeoutMs: mergedOptions.timeoutMs,
        },
      );
    },

    uploadFile: inner.uploadFile ? (file) => runWithAICallControl(
      () => inner.uploadFile!(file),
      {
        label: makeLabel(options.stage, options.taskType, 'uploadFile', options.projectId),
        signal: options.signal,
        timeoutMs: DEFAULT_AI_TIMEOUT_MS.upload,
      },
    ) : undefined,

    generateSpeech: inner.generateSpeech ? (text, voice, requestOptions) => {
      const mergedOptions = mergeRequestOptions(requestOptions, {
        signal: options.signal,
        timeoutMs: requestOptions?.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS.speech,
      });
      return runWithAICallControl(
        () => inner.generateSpeech!(text, voice, mergedOptions),
        {
          label: makeLabel(options.stage, options.taskType, 'generateSpeech', options.projectId),
          signal: options.signal,
          timeoutMs: mergedOptions.timeoutMs,
        },
      );
    } : undefined,
  };
}

export function createSessionScopedAdapter(
  inner: AIAdapter,
  session: SessionContextOptions,
  onUse?: () => void,
): AIAdapter {
  let didRecordUsage = false;
  const markUsed = () => {
    if (!didRecordUsage) {
      didRecordUsage = true;
      onUse?.();
    }
  };

  const mergeSessionOptions = (options?: AIRequestOptions): AIRequestOptions => ({
    ...(options ?? {}),
    sessionId: session.sessionId,
    continueChat: session.continueChat,
  });

  return {
    provider: inner.provider,

    generateText(model: string, prompt: string | unknown[], options?: AIRequestOptions): Promise<GenerationResult> {
      markUsed();
      return inner.generateText(model, prompt as string | import('./types/index.js').PromptPart[], mergeSessionOptions(options));
    },

    generateImage(model: string, prompt: string, aspectRatio?: string, negativePrompt?: string, options?: AIRequestOptions): Promise<GenerationResult> {
      markUsed();
      return inner.generateImage(model, prompt, aspectRatio, negativePrompt, mergeSessionOptions(options));
    },

    generateVideo(model: string, prompt: string, options?: { aspectRatio?: string; image?: string; duration?: number; fps?: number; resolution?: '720p' | '1080p' } & AIRequestOptions): Promise<GenerationResult> {
      markUsed();
      return inner.generateVideo(model, prompt, {
        ...(options ?? {}),
        sessionId: session.sessionId,
        continueChat: session.continueChat,
      });
    },

    uploadFile: inner.uploadFile ? async (file) => {
      markUsed();
      return inner.uploadFile!(file);
    } : undefined,

    generateSpeech: inner.generateSpeech ? (text, voice, options) => {
      markUsed();
      return inner.generateSpeech!(text, voice, mergeSessionOptions(options));
    } : undefined,
  };
}
