/**
 * Port layer for the final ffmpeg assembly entrypoint.
 */
import { assembleVideo as defaultAssembleVideo } from './renderAssemble.impl.js';

type RenderAssemblePort = {
  assembleVideo: typeof defaultAssembleVideo;
};

const defaultPort: RenderAssemblePort = {
  assembleVideo: defaultAssembleVideo,
};

let activeRenderAssemblePort: RenderAssemblePort = { ...defaultPort };

export function setRenderAssemblePort(overrides: Partial<RenderAssemblePort>): void {
  activeRenderAssemblePort = { ...activeRenderAssemblePort, ...overrides };
}

export function resetRenderAssemblePort(): void {
  activeRenderAssemblePort = { ...defaultPort };
}

export const assembleVideo = (
  ...args: Parameters<typeof defaultAssembleVideo>
): ReturnType<typeof defaultAssembleVideo> => activeRenderAssemblePort.assembleVideo(...args);
