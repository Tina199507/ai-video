/**
 * Port layer for ffmpeg xfade / transition helpers.
 */
import {
  XFADE_MAP as defaultXFADE_MAP,
  XFADE_DURATION as defaultXFADE_DURATION,
  buildXfadeFilterGraph as defaultBuildXfadeFilterGraph,
} from './renderTransitions.impl.js';

type RenderTransitionsPort = {
  XFADE_MAP: typeof defaultXFADE_MAP;
  XFADE_DURATION: typeof defaultXFADE_DURATION;
  buildXfadeFilterGraph: typeof defaultBuildXfadeFilterGraph;
};

const defaultPort: RenderTransitionsPort = {
  XFADE_MAP: defaultXFADE_MAP,
  XFADE_DURATION: defaultXFADE_DURATION,
  buildXfadeFilterGraph: defaultBuildXfadeFilterGraph,
};

let activeRenderTransitionsPort: RenderTransitionsPort = { ...defaultPort };

function syncExportedConstants(): void {
  XFADE_MAP = activeRenderTransitionsPort.XFADE_MAP;
  XFADE_DURATION = activeRenderTransitionsPort.XFADE_DURATION;
}

export let XFADE_MAP = defaultXFADE_MAP;
export let XFADE_DURATION = defaultXFADE_DURATION;

export function setRenderTransitionsPort(overrides: Partial<RenderTransitionsPort>): void {
  activeRenderTransitionsPort = { ...activeRenderTransitionsPort, ...overrides };
  syncExportedConstants();
}

export function resetRenderTransitionsPort(): void {
  activeRenderTransitionsPort = { ...defaultPort };
  syncExportedConstants();
}

export const buildXfadeFilterGraph = (
  ...args: Parameters<typeof defaultBuildXfadeFilterGraph>
): ReturnType<typeof defaultBuildXfadeFilterGraph> =>
  activeRenderTransitionsPort.buildXfadeFilterGraph(...args);
