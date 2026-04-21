import type { Account, TaskItem, WorkbenchEvent } from './types.js';
import { WB_EVENT } from './types.js';
import { quotaBus } from './workbenchDeps.js';
import { createLogger } from '@ai-video/lib/logger.js';

const log = createLogger('Workbench');

export interface WorkbenchLoopDeps {
  tasks: any;
  resources: any;
  getSelectors: (provider: Account['provider']) => any;
  getModels: (provider: Account['provider']) => readonly { id: string; label: string }[];
  ensureBrowser: (account: Account, task: TaskItem) => Promise<any>;
  closeBrowser: () => Promise<void>;
  handleQuotaExhausted: (account: Account, taskId: string) => Promise<void>;
  resolveWaiter: (taskId: string, answer: string) => void;
  rejectWaiter: (taskId: string, error: string) => void;
  emit: (event: WorkbenchEvent) => void;
  emitState: () => void;
  getAbortSignal: () => AbortSignal | undefined;
  getActivePage: () => any;
  checkQuotaExhausted: (page: any, selectors: any) => Promise<boolean>;
  selectModel: (page: any, model: { id: string; label: string } | undefined) => Promise<void>;
  typePromptText: (page: any, question: string, selectors: any) => Promise<void>;
  uploadFiles: (page: any, attachments: string[], selectors: any) => Promise<void>;
  sendPrompt: (page: any, question: string, selectors: any, options?: any) => Promise<{ answer: string; quotaExhausted?: boolean }>;
  findModelMatch: (models: readonly { id: string; label: string }[], preferredModel: string) => { id: string; label: string } | undefined;
}

export async function processLoopEntry(deps: WorkbenchLoopDeps): Promise<void> {
  while (!deps.getAbortSignal()?.aborted) {
    const task = deps.tasks.next();
    if (!task) break;

    log.info('task_start', { taskId: task.id, provider: task.preferredProvider, model: task.preferredModel, questionLength: task.question.length });

    const account = deps.resources.pickAccount(task.preferredProvider);
    if (!account) {
      log.error('task_no_accounts', undefined, { taskId: task.id, provider: task.preferredProvider });
      deps.tasks.markFailed(task.id, 'No accounts available with remaining quota');
      deps.emit({ type: WB_EVENT.TASK_FAILED, payload: { taskId: task.id, error: 'No accounts available' } });
      deps.emitState();
      break;
    }

    deps.tasks.markRunning(task.id, account.id);
    log.info('task_account_selected', { taskId: task.id, accountId: account.id, provider: account.provider });
    deps.emit({ type: WB_EVENT.TASK_STARTED, payload: { taskId: task.id, accountId: account.id } });
    deps.emitState();

    try {
      const page = await deps.ensureBrowser(account, task);
      const selectors = deps.getSelectors(account.provider);
      if (await deps.checkQuotaExhausted(page, selectors)) {
        log.warn('task_quota_exhausted_before_send', { taskId: task.id, accountId: account.id });
        await deps.handleQuotaExhausted(account, task.id);
        continue;
      }

      if (task.preferredModel) {
        const models = deps.getModels(account.provider);
        const model = deps.findModelMatch(models, task.preferredModel);
        log.info('task_selecting_model', { taskId: task.id, preferredModel: task.preferredModel, matchedId: model?.id });
        await deps.selectModel(page, model);
      }

      if (task.attachments?.length) {
        log.info('task_uploading_attachments', { taskId: task.id, attachmentCount: task.attachments.length });
        await deps.typePromptText(page, task.question, selectors);
        await deps.uploadFiles(page, task.attachments, selectors);
      }

      const result = await deps.sendPrompt(page, task.question, selectors,
        task.attachments?.length ? { responseTimeout: 540_000, sendButtonTimeout: 600_000, textAlreadyTyped: true } : undefined);

      const quotaTextSignal = /usage cap|free plan limit|image generation requests|rate limit|too many requests/i.test(result.answer || '');
      if (quotaTextSignal && !result.quotaExhausted) {
        log.warn('task_quota_text_signal', { taskId: task.id, accountId: account.id });
        result.quotaExhausted = true;
      }

      if (result.quotaExhausted) {
        log.warn('task_quota_exhausted_after_response', { taskId: task.id, accountId: account.id });
        if (result.answer) {
          log.info('task_done_partial', { taskId: task.id, answerLength: result.answer.length });
          deps.tasks.markDone(task.id, result.answer);
          deps.emit({ type: WB_EVENT.TASK_DONE, payload: { taskId: task.id, answer: result.answer } });
          deps.resolveWaiter(task.id, result.answer);
        } else {
          log.warn('task_failed_quota_no_answer', { taskId: task.id });
          deps.tasks.markFailed(task.id, 'Quota exhausted before response');
          deps.emit({ type: WB_EVENT.TASK_FAILED, payload: { taskId: task.id, error: 'Quota exhausted' } });
          deps.rejectWaiter(task.id, 'Quota exhausted before response');
        }
        await deps.handleQuotaExhausted(account, task.id);
      } else {
        log.info('task_done', { taskId: task.id, answerLength: result.answer.length });
        deps.tasks.markDone(task.id, result.answer);
        deps.emit({ type: WB_EVENT.TASK_DONE, payload: { taskId: task.id, answer: result.answer } });
        deps.resolveWaiter(task.id, result.answer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('task_error', err instanceof Error ? err : undefined, { taskId: task.id, error: message });
      deps.tasks.markFailed(task.id, message);
      deps.emit({ type: WB_EVENT.TASK_FAILED, payload: { taskId: task.id, error: message } });
      deps.rejectWaiter(task.id, message);
      if (deps.getActivePage()) {
        try {
          await deps.getActivePage().title();
        } catch {
          log.warn('page_unusable_after_error', { taskId: task.id });
          await deps.closeBrowser();
        }
      }
    }

    deps.emitState();
  }
}

export async function handleQuotaExhaustedEntry(
  resources: any,
  emit: (event: WorkbenchEvent) => void,
  emitState: () => void,
  closeBrowser: () => Promise<void>,
  account: Account,
): Promise<void> {
  resources.markQuotaExhausted(account.id);
  emit({ type: WB_EVENT.QUOTA_EXHAUSTED, payload: { accountId: account.id } });

  quotaBus.emit({
    provider: account.provider,
    accountId: account.id,
    capability: 'text',
    exhausted: true,
    reason: `Account ${account.id} quota exhausted`,
  });

  const next = resources.pickAccount();
  if (next) {
    emit({
      type: WB_EVENT.ACCOUNT_SWITCHED,
      payload: { fromAccountId: account.id, toAccountId: next.id },
    });
    await closeBrowser();
  }
  emitState();
}
