/**
 * Port layer for prompt sanitization helpers.
 */
import {
  sanitizePromptForJimeng as defaultSanitizePromptForJimeng,
  sanitizePromptForKling as defaultSanitizePromptForKling,
  rewritePromptForCompliance as defaultRewritePromptForCompliance,
} from './promptSanitizer.impl.js';

type PromptSanitizerPort = {
  sanitizePromptForJimeng: typeof defaultSanitizePromptForJimeng;
  sanitizePromptForKling: typeof defaultSanitizePromptForKling;
  rewritePromptForCompliance: typeof defaultRewritePromptForCompliance;
};

const defaultPromptSanitizerPort: PromptSanitizerPort = {
  sanitizePromptForJimeng: defaultSanitizePromptForJimeng,
  sanitizePromptForKling: defaultSanitizePromptForKling,
  rewritePromptForCompliance: defaultRewritePromptForCompliance,
};

let activePromptSanitizerPort: PromptSanitizerPort = { ...defaultPromptSanitizerPort };

export function setPromptSanitizerPort(overrides: Partial<PromptSanitizerPort>): void {
  activePromptSanitizerPort = { ...activePromptSanitizerPort, ...overrides };
}

export function resetPromptSanitizerPort(): void {
  activePromptSanitizerPort = { ...defaultPromptSanitizerPort };
}

export const sanitizePromptForJimeng = (
  ...args: Parameters<typeof defaultSanitizePromptForJimeng>
): ReturnType<typeof defaultSanitizePromptForJimeng> => activePromptSanitizerPort.sanitizePromptForJimeng(...args);

export const sanitizePromptForKling = (
  ...args: Parameters<typeof defaultSanitizePromptForKling>
): ReturnType<typeof defaultSanitizePromptForKling> => activePromptSanitizerPort.sanitizePromptForKling(...args);

export const rewritePromptForCompliance = (
  ...args: Parameters<typeof defaultRewritePromptForCompliance>
): ReturnType<typeof defaultRewritePromptForCompliance> => activePromptSanitizerPort.rewritePromptForCompliance(...args);
