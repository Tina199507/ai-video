import {
  DEFAULT_VOICE_MAPPING,
  resolveVoiceFromStyle,
} from '../voiceStyleCore.js';
import { assertPipelineCorePortsMutable } from './lifecycle.js';

export type { VoiceMapping } from '../voiceStyleCore.js';

export interface VoiceStylePort {
  DEFAULT_VOICE_MAPPING: typeof DEFAULT_VOICE_MAPPING;
  resolveVoiceFromStyle: typeof resolveVoiceFromStyle;
}

export const defaultVoiceStylePort: VoiceStylePort = {
  DEFAULT_VOICE_MAPPING,
  resolveVoiceFromStyle,
};

let activeVoiceStylePort: VoiceStylePort = defaultVoiceStylePort;

export function setVoiceStylePort(port: VoiceStylePort): void {
  assertPipelineCorePortsMutable('set voiceStylePort');
  activeVoiceStylePort = port;
}

export function resetVoiceStylePort(): void {
  assertPipelineCorePortsMutable('reset voiceStylePort');
  activeVoiceStylePort = defaultVoiceStylePort;
}

export function getVoiceStylePort(): VoiceStylePort {
  return activeVoiceStylePort;
}

export function resolveVoiceFromStylePort(...args: Parameters<typeof resolveVoiceFromStyle>) {
  return getVoiceStylePort().resolveVoiceFromStyle(...args);
}

export { resolveVoiceFromStylePort as resolveVoiceFromStyle };
