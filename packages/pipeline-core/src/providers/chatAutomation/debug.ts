/**
 * Port layer for chat automation debug utilities.
 */
import { cleanupDebugScreenshots as defaultCleanup } from './debug.impl.js';

type ChatAutomationDebugPort = {
  cleanupDebugScreenshots: typeof defaultCleanup;
};

const defaultPort: ChatAutomationDebugPort = {
  cleanupDebugScreenshots: defaultCleanup,
};

let active: ChatAutomationDebugPort = { ...defaultPort };

export function setChatAutomationDebugPort(overrides: Partial<ChatAutomationDebugPort>): void {
  active = { ...active, ...overrides };
}

export function resetChatAutomationDebugPort(): void {
  active = { ...defaultPort };
}

export const cleanupDebugScreenshots = (
  ...args: Parameters<typeof defaultCleanup>
): ReturnType<typeof defaultCleanup> => active.cleanupDebugScreenshots(...args);
