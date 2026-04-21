/**
 * Port layer for ffmpeg render type surface + default encoding constant.
 */
import { DEFAULT_ENCODING as defaultDefaultEncoding } from './renderTypes.impl.js';

export type {
  AssemblyOptions,
  EncodingProfile,
  ResolvedEncoding,
  SceneInput,
} from './renderTypes.impl.js';

type RenderTypesPort = {
  DEFAULT_ENCODING: typeof defaultDefaultEncoding;
};

const defaultPort: RenderTypesPort = {
  DEFAULT_ENCODING: defaultDefaultEncoding,
};

let activeRenderTypesPort: RenderTypesPort = { ...defaultPort };

export let DEFAULT_ENCODING = defaultDefaultEncoding;

function syncDefaultEncoding(): void {
  DEFAULT_ENCODING = activeRenderTypesPort.DEFAULT_ENCODING;
}

export function setRenderTypesPort(overrides: Partial<RenderTypesPort>): void {
  activeRenderTypesPort = { ...activeRenderTypesPort, ...overrides };
  syncDefaultEncoding();
}

export function resetRenderTypesPort(): void {
  activeRenderTypesPort = { ...defaultPort };
  syncDefaultEncoding();
}
