/* ------------------------------------------------------------------ */
/*  Video provider types shared by site-strategy modules              */
/* ------------------------------------------------------------------ */

import type { BrowserContext, Locator, Page } from 'playwright';
import type { QueueDetectionConfig, SiteAutomationConfig } from '@ai-video/pipeline-core/runtimeTypes.js';
import type { SiteStrategy, VideoProviderKind } from '../types.js';

export interface VideoGenRequest {
  prompt: string;
  imageUrl?: string;
  duration?: number;
  aspectRatio?: string;
  model?: string;
  resolution?: '720p' | '1080p';
}

export interface VideoGenResult {
  localPath: string;
  durationMs?: number;
}

export type VideoProviderType = VideoProviderKind;

export interface VideoProviderConfig {
  provider?: VideoProviderType;
  url: string;
  agentUrl?: string;
  promptInput: string;
  imageUploadTrigger?: string;
  generateButton: string;
  progressIndicator?: string;
  videoResult: string;
  downloadButton?: string;
  maxWaitMs?: number;
  profileDir: string;
  profileDirs?: string[];
  queueDetection?: QueueDetectionConfig;
}

export interface VideoGenerationRuntime {
  config: SiteAutomationConfig;
  request: VideoGenRequest;
  outputDir: string;
  filename: string;
  strategy: SiteStrategy;
  isKling: boolean;
  providerLabel: string;
  profileName: string;
}

export type WriteFailure = (reason: string, details?: Record<string, unknown>) => void;

export interface GenerationBrowserState {
  context: BrowserContext;
  page: Page;
}

export interface ApiLog {
  url: string;
  status: number;
  body?: string;
}

export interface ButtonState {
  disabled: boolean;
  hasDisabledClass: boolean;
  classes: string;
  rect?: Record<string, number>;
  visible?: boolean;
}

export interface SubmitState {
  genBtnLocator: Locator;
  btnFinalState: ButtonState | null;
  apiLogs: ApiLog[];
  detachNetworkLogger: () => void;
}

export type WaitResult =
  | { kind: 'ready' }
  | { kind: 'retry'; rewrittenPrompt: string }
  | { kind: 'failed' };
