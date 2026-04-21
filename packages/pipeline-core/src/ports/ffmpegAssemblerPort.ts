export * from '../ffmpegAssemblerSurface.js';

import * as ffmpegAssemblerModule from '../ffmpegAssemblerSurface.js';
import { assertPipelineCorePortsMutable } from './lifecycle.js';

export type FfmpegAssemblerPort = typeof ffmpegAssemblerModule;

export const defaultFfmpegAssemblerPort: FfmpegAssemblerPort = ffmpegAssemblerModule;

let activeFfmpegAssemblerPort: FfmpegAssemblerPort = defaultFfmpegAssemblerPort;

export function setFfmpegAssemblerPort(port: FfmpegAssemblerPort): void {
  assertPipelineCorePortsMutable('set ffmpegAssemblerPort');
  activeFfmpegAssemblerPort = port;
}

export function resetFfmpegAssemblerPort(): void {
  assertPipelineCorePortsMutable('reset ffmpegAssemblerPort');
  activeFfmpegAssemblerPort = defaultFfmpegAssemblerPort;
}

export function getFfmpegAssemblerPort(): FfmpegAssemblerPort {
  return activeFfmpegAssemblerPort;
}
