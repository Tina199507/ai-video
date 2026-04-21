/* ------------------------------------------------------------------ */
/*  Edge TTS plugin – free local text-to-speech via edge-tts CLI      */
/*  Capabilities: TTS only                                            */
/* ------------------------------------------------------------------ */

import { registerPlugin } from '../registry.js';
import type { ProviderPlugin, PluginDeps } from '../types.js';

const plugin: ProviderPlugin = {
  id: 'edge-tts',
  name: 'Edge TTS',
  adapterType: 'chat',
  capabilities: {
    text: false,
    imageGeneration: false,
    videoGeneration: false,
    tts: true,
    fileUpload: false,
    webSearch: false,
  },
  costTier: 'free',
  models: [],
  routing: [
    {
      stages: ['TTS'],
      taskTypes: ['tts'],
      priority: 20,
    },
  ],
  createAdapter(deps: PluginDeps) {
    return deps.chatAdapter;
  },
};

registerPlugin(plugin);

export default plugin;
