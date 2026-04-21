/**
 * Port layer for opening / preparing a chat page.
 */
import { openChat as defaultOpenChat } from './session.impl.js';

type ChatAutomationSessionPort = {
  openChat: typeof defaultOpenChat;
};

const defaultPort: ChatAutomationSessionPort = {
  openChat: defaultOpenChat,
};

let active: ChatAutomationSessionPort = { ...defaultPort };

export function setChatAutomationSessionPort(overrides: Partial<ChatAutomationSessionPort>): void {
  active = { ...active, ...overrides };
}

export function resetChatAutomationSessionPort(): void {
  active = { ...defaultPort };
}

export const openChat = (
  ...args: Parameters<typeof defaultOpenChat>
): ReturnType<typeof defaultOpenChat> => active.openChat(...args);
