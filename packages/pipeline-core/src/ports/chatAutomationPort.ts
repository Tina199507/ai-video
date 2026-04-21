import {
  autoDetectSelectors,
  autoDetectVideoSelectors,
  cleanupDebugScreenshots,
  scrapeModels,
} from '../chatAutomationSurface.js';
import { assertPipelineCorePortsMutable } from './lifecycle.js';

export type {
  DetectedSelectors,
  DetectedVideoSelectors,
} from '../chatAutomationSurface.js';

export interface ChatAutomationPort {
  autoDetectSelectors: typeof autoDetectSelectors;
  autoDetectVideoSelectors: typeof autoDetectVideoSelectors;
  cleanupDebugScreenshots: typeof cleanupDebugScreenshots;
  scrapeModels: typeof scrapeModels;
}

export const defaultChatAutomationPort: ChatAutomationPort = {
  autoDetectSelectors,
  autoDetectVideoSelectors,
  cleanupDebugScreenshots,
  scrapeModels,
};

let activeChatAutomationPort: ChatAutomationPort = defaultChatAutomationPort;

export function setChatAutomationPort(port: ChatAutomationPort): void {
  assertPipelineCorePortsMutable('set chatAutomationPort');
  activeChatAutomationPort = port;
}

export function resetChatAutomationPort(): void {
  assertPipelineCorePortsMutable('reset chatAutomationPort');
  activeChatAutomationPort = defaultChatAutomationPort;
}

export function getChatAutomationPort(): ChatAutomationPort {
  return activeChatAutomationPort;
}

export const autoDetectSelectorsPort: typeof autoDetectSelectors = (...args) =>
  getChatAutomationPort().autoDetectSelectors(...args);
export const autoDetectVideoSelectorsPort: typeof autoDetectVideoSelectors = (...args) =>
  getChatAutomationPort().autoDetectVideoSelectors(...args);
export const cleanupDebugScreenshotsPort: typeof cleanupDebugScreenshots = (...args) =>
  getChatAutomationPort().cleanupDebugScreenshots(...args);
export const scrapeModelsPort: typeof scrapeModels = (...args) =>
  getChatAutomationPort().scrapeModels(...args);

export {
  autoDetectSelectorsPort as autoDetectSelectors,
  autoDetectVideoSelectorsPort as autoDetectVideoSelectors,
  cleanupDebugScreenshotsPort as cleanupDebugScreenshots,
  scrapeModelsPort as scrapeModels,
};
