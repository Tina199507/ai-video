import { createLogger } from '@ai-video/lib/logger.js';
import type { ChatMode, ProviderId } from './types.js';
import type { TaskQueue } from './workbenchDeps.js';

const log = createLogger('Workbench');

export interface SubmitAndWaitDeps {
  tasks: TaskQueue;
  defaultChatMode: ChatMode;
  waitResolvers: Map<string, { resolve: (answer: string) => void; reject: (err: Error) => void }>;
  isRunning: () => boolean;
  start: () => Promise<void>;
}

export async function submitAndWaitEntry(
  deps: SubmitAndWaitDeps,
  opts: {
    question: string;
    preferredProvider?: ProviderId;
    preferredModel?: string;
    attachments?: string[];
    timeoutMs?: number;
    signal?: AbortSignal;
    useSameChat?: boolean;
    sessionId?: string;
  },
): Promise<string> {
  if (opts.signal?.aborted) {
    throw new Error('Chat request aborted before submission');
  }

  const taskChatMode: ChatMode = opts.useSameChat
    ? 'continue'
    : opts.sessionId
      ? 'new'
      : deps.defaultChatMode;

  const [task] = deps.tasks.add(
    [opts.question],
    opts.preferredProvider,
    opts.preferredModel,
    opts.attachments,
    {
      chatMode: taskChatMode,
      sessionId: opts.sessionId,
    },
  );
  if (!task) {
    throw new Error('Failed to enqueue chat task');
  }

  log.info('submit_and_wait', { taskId: task.id, chatMode: taskChatMode, sessionId: opts.sessionId, timeoutMs: opts.timeoutMs ?? 180_000 });

  const promise = new Promise<string>((resolve, reject) => {
    deps.waitResolvers.set(task.id, { resolve, reject });
  });

  const timeoutMs = opts.timeoutMs ?? 180_000;
  const timeoutId = setTimeout(() => {
    const resolver = deps.waitResolvers.get(task.id);
    if (resolver) {
      log.error('submit_and_wait_timeout', undefined, { taskId: task.id, timeoutMs });
      deps.waitResolvers.delete(task.id);
      resolver.reject(new Error(`Chat response timed out after ${timeoutMs}ms`));
    }
  }, timeoutMs);

  const onAbort = () => {
    const resolver = deps.waitResolvers.get(task.id);
    if (resolver) {
      log.warn('submit_and_wait_aborted', { taskId: task.id });
      deps.waitResolvers.delete(task.id);
      resolver.reject(new Error('Chat request aborted'));
    }
  };

  opts.signal?.addEventListener('abort', onAbort, { once: true });

  if (!deps.isRunning()) {
    deps.start().catch((e: unknown) => log.warn('processing_loop_start_failed', { error: String(e) }));
  }

  try {
    return await promise;
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export function resolveWaiterEntry(
  waitResolvers: Map<string, { resolve: (answer: string) => void; reject: (err: Error) => void }>,
  taskId: string,
  answer: string,
): void {
  const resolver = waitResolvers.get(taskId);
  if (resolver) {
    waitResolvers.delete(taskId);
    resolver.resolve(answer);
  }
}

export function rejectWaiterEntry(
  waitResolvers: Map<string, { resolve: (answer: string) => void; reject: (err: Error) => void }>,
  taskId: string,
  error: string,
): void {
  const resolver = waitResolvers.get(taskId);
  if (resolver) {
    waitResolvers.delete(taskId);
    resolver.reject(new Error(error));
  }
}
