/**
 * Port layer for chat file uploads.
 */
import { uploadFiles as defaultUploadFiles } from './uploads.impl.js';

type ChatAutomationUploadsPort = {
  uploadFiles: typeof defaultUploadFiles;
};

const defaultPort: ChatAutomationUploadsPort = {
  uploadFiles: defaultUploadFiles,
};

let active: ChatAutomationUploadsPort = { ...defaultPort };

export function setChatAutomationUploadsPort(overrides: Partial<ChatAutomationUploadsPort>): void {
  active = { ...active, ...overrides };
}

export function resetChatAutomationUploadsPort(): void {
  active = { ...defaultPort };
}

export const uploadFiles = (
  ...args: Parameters<typeof defaultUploadFiles>
): ReturnType<typeof defaultUploadFiles> => active.uploadFiles(...args);
