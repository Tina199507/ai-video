/**
 * Port layer for chat automation detector helpers.
 */
import {
  autoDetectSelectors as defaultAutoDetectSelectors,
  autoDetectVideoSelectors as defaultAutoDetectVideoSelectors,
  checkQuotaExhausted as defaultCheckQuotaExhausted,
} from './detectors.impl.js';

type ChatAutomationDetectorsPort = {
  autoDetectSelectors: typeof defaultAutoDetectSelectors;
  autoDetectVideoSelectors: typeof defaultAutoDetectVideoSelectors;
  checkQuotaExhausted: typeof defaultCheckQuotaExhausted;
};

const defaultPort: ChatAutomationDetectorsPort = {
  autoDetectSelectors: defaultAutoDetectSelectors,
  autoDetectVideoSelectors: defaultAutoDetectVideoSelectors,
  checkQuotaExhausted: defaultCheckQuotaExhausted,
};

let active: ChatAutomationDetectorsPort = { ...defaultPort };

export function setChatAutomationDetectorsPort(overrides: Partial<ChatAutomationDetectorsPort>): void {
  active = { ...active, ...overrides };
}

export function resetChatAutomationDetectorsPort(): void {
  active = { ...defaultPort };
}

export const autoDetectSelectors = (
  ...args: Parameters<typeof defaultAutoDetectSelectors>
): ReturnType<typeof defaultAutoDetectSelectors> => active.autoDetectSelectors(...args);

export const autoDetectVideoSelectors = (
  ...args: Parameters<typeof defaultAutoDetectVideoSelectors>
): ReturnType<typeof defaultAutoDetectVideoSelectors> => active.autoDetectVideoSelectors(...args);

export const checkQuotaExhausted = (
  ...args: Parameters<typeof defaultCheckQuotaExhausted>
): ReturnType<typeof defaultCheckQuotaExhausted> => active.checkQuotaExhausted(...args);
