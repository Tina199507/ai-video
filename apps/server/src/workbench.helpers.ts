import type { BrowserContext } from 'playwright';
import { launchPersistentContextWithRetry } from './workbenchDeps.js';
import type { ModelOption } from './types.js';

export const delayEntry = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function launchWithRetryEntry(
  profileDir: string,
  _stealthArgs: readonly string[],
  retries = 3,
  options?: { active?: boolean },
): Promise<BrowserContext> {
  return launchPersistentContextWithRetry(profileDir, { retries, active: options?.active });
}

export function findModelMatchEntry(
  models: readonly ModelOption[],
  preferredModel: string,
): ModelOption | undefined {
  let match = models.find(m => m.id === preferredModel);
  if (match) return match;

  const lower = preferredModel.toLowerCase();
  match = models.find(m => m.id.toLowerCase() === lower || m.label.toLowerCase() === lower);
  if (match) return match;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = normalize(preferredModel);
  match = models.find(m => normalize(m.id) === target || normalize(m.label) === target);
  if (match) return match;

  const words = preferredModel.trim().split(/\s+/);
  if (words.length > 1) {
    const tail = words[words.length - 1]?.toLowerCase();
    if (tail && tail.length >= 2) {
      match = models.find(m => m.id.toLowerCase() === tail || m.label.toLowerCase() === tail);
      if (match) return match;
    }
  }

  return undefined;
}
