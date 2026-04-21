export type {
  ScrapedModel,
  ChatResult,
  ChatAutomationOptions,
  DetectedSelectors,
  DetectedVideoSelectors,
} from './providers/chatAutomation/contracts.js';

export { scrapeModels } from './providers/chatAutomation/models.js';
export {
  autoDetectSelectors,
  autoDetectVideoSelectors,
} from './providers/chatAutomation/detectors.js';
export { cleanupDebugScreenshots } from './providers/chatAutomation/debug.js';
