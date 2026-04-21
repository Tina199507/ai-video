/**
 * Port layer for typing and sending prompts in chat UIs.
 */
import {
  typePromptText as defaultTypePromptText,
  sendPrompt as defaultSendPrompt,
} from './prompt.impl.js';

type ChatAutomationPromptPort = {
  typePromptText: typeof defaultTypePromptText;
  sendPrompt: typeof defaultSendPrompt;
};

const defaultPort: ChatAutomationPromptPort = {
  typePromptText: defaultTypePromptText,
  sendPrompt: defaultSendPrompt,
};

let active: ChatAutomationPromptPort = { ...defaultPort };

export function setChatAutomationPromptPort(overrides: Partial<ChatAutomationPromptPort>): void {
  active = { ...active, ...overrides };
}

export function resetChatAutomationPromptPort(): void {
  active = { ...defaultPort };
}

export const typePromptText = (
  ...args: Parameters<typeof defaultTypePromptText>
): ReturnType<typeof defaultTypePromptText> => active.typePromptText(...args);

export const sendPrompt = (
  ...args: Parameters<typeof defaultSendPrompt>
): ReturnType<typeof defaultSendPrompt> => active.sendPrompt(...args);
