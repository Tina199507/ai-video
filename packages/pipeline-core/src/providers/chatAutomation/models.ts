/**
 * Port layer for chat automation model scraping / selection.
 */
import { scrapeModels as defaultScrapeModels, selectModel as defaultSelectModel } from './models.impl.js';

type ChatAutomationModelsPort = {
  scrapeModels: typeof defaultScrapeModels;
  selectModel: typeof defaultSelectModel;
};

const defaultPort: ChatAutomationModelsPort = {
  scrapeModels: defaultScrapeModels,
  selectModel: defaultSelectModel,
};

let active: ChatAutomationModelsPort = { ...defaultPort };

export function setChatAutomationModelsPort(overrides: Partial<ChatAutomationModelsPort>): void {
  active = { ...active, ...overrides };
}

export function resetChatAutomationModelsPort(): void {
  active = { ...defaultPort };
}

export const scrapeModels = (
  ...args: Parameters<typeof defaultScrapeModels>
): ReturnType<typeof defaultScrapeModels> => active.scrapeModels(...args);

export const selectModel = (
  ...args: Parameters<typeof defaultSelectModel>
): ReturnType<typeof defaultSelectModel> => active.selectModel(...args);
