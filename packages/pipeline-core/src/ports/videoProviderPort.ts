export * from '../videoProviderSurface.js';

import * as videoProviderModule from '../videoProviderSurface.js';
import { assertPipelineCorePortsMutable } from './lifecycle.js';

export type VideoProviderPort = typeof videoProviderModule;

export const defaultVideoProviderPort: VideoProviderPort = videoProviderModule;

let activeVideoProviderPort: VideoProviderPort = defaultVideoProviderPort;

export function setVideoProviderPort(port: VideoProviderPort): void {
  assertPipelineCorePortsMutable('set videoProviderPort');
  activeVideoProviderPort = port;
}

export function resetVideoProviderPort(): void {
  assertPipelineCorePortsMutable('reset videoProviderPort');
  activeVideoProviderPort = defaultVideoProviderPort;
}

export function getVideoProviderPort(): VideoProviderPort {
  return activeVideoProviderPort;
}
