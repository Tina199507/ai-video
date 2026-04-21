import {
  defaultAdapterHostBindingsPort,
  resetAdapterHostBindingsPort,
  setAdapterHostBindingsPort,
  type AdapterHostBindingsPort,
} from './adapterHostBindingsPort.js';
import {
  defaultChatAutomationPort,
  resetChatAutomationPort,
  setChatAutomationPort,
  type ChatAutomationPort,
} from './chatAutomationPort.js';
import {
  defaultFfmpegAssemblerPort,
  resetFfmpegAssemblerPort,
  setFfmpegAssemblerPort,
  type FfmpegAssemblerPort,
} from './ffmpegAssemblerPort.js';
import {
  defaultResponseParserPort,
  resetResponseParserPort,
  setResponseParserPort,
  type ResponseParserPort,
} from './responseParserPort.js';
import {
  defaultVideoProviderPort,
  resetVideoProviderPort,
  setVideoProviderPort,
  type VideoProviderPort,
} from './videoProviderPort.js';
import {
  defaultVoiceStylePort,
  resetVoiceStylePort,
  setVoiceStylePort,
  type VoiceStylePort,
} from './voiceStylePort.js';
import {
  arePipelineCorePortsFrozen,
  freezePipelineCorePortsLifecycle,
} from './lifecycle.js';

export type PipelineCorePorts = {
  adapterHostBindingsPort: AdapterHostBindingsPort;
  chatAutomationPort: ChatAutomationPort;
  ffmpegAssemblerPort: FfmpegAssemblerPort;
  responseParserPort: ResponseParserPort;
  videoProviderPort: VideoProviderPort;
  voiceStylePort: VoiceStylePort;
};

export const defaultPipelineCorePorts: PipelineCorePorts = {
  adapterHostBindingsPort: defaultAdapterHostBindingsPort,
  chatAutomationPort: defaultChatAutomationPort,
  ffmpegAssemblerPort: defaultFfmpegAssemblerPort,
  responseParserPort: defaultResponseParserPort,
  videoProviderPort: defaultVideoProviderPort,
  voiceStylePort: defaultVoiceStylePort,
};

export function configurePipelineCorePorts(overrides: Partial<PipelineCorePorts>): void {
  if (overrides.adapterHostBindingsPort) setAdapterHostBindingsPort(overrides.adapterHostBindingsPort);
  if (overrides.chatAutomationPort) setChatAutomationPort(overrides.chatAutomationPort);
  if (overrides.ffmpegAssemblerPort) setFfmpegAssemblerPort(overrides.ffmpegAssemblerPort);
  if (overrides.responseParserPort) setResponseParserPort(overrides.responseParserPort);
  if (overrides.videoProviderPort) setVideoProviderPort(overrides.videoProviderPort);
  if (overrides.voiceStylePort) setVoiceStylePort(overrides.voiceStylePort);
}

export function resetPipelineCorePorts(): void {
  resetAdapterHostBindingsPort();
  resetChatAutomationPort();
  resetFfmpegAssemblerPort();
  resetResponseParserPort();
  resetVideoProviderPort();
  resetVoiceStylePort();
}

export function freezePipelineCorePorts(): void {
  freezePipelineCorePortsLifecycle();
}

export function isPipelineCorePortsFrozen(): boolean {
  return arePipelineCorePortsFrozen();
}
