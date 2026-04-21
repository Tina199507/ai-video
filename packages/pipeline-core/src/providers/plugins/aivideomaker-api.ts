/* ------------------------------------------------------------------ */
/*  AIVideoMaker API plugin – paid REST-API video generation           */
/*  Used by VIDEO_GEN stage to generate per-scene video clips.         */
/* ------------------------------------------------------------------ */

import { registerPlugin } from '../registry.js';
import type { ProviderPlugin, PluginDeps } from '../types.js';

const plugin: ProviderPlugin = {
  id: 'aivideomaker-api',
  name: 'AIVideoMaker API',
  adapterType: 'api',
  capabilities: {
    text: false,
    imageGeneration: false,
    videoGeneration: true,
    tts: false,
    fileUpload: false,
    webSearch: false,
  },
  costTier: 'paid',
  models: ['auto'],
  routing: [
    {
      stages: ['VIDEO_GEN'],
      taskTypes: ['video_generation'],
      priority: 20,
    },
  ],
  createAdapter(deps: PluginDeps) {
    return deps.aivideomakerAdapters?.[0];
  },
  isAvailable() {
    return true;
  },
};

registerPlugin(plugin);

export default plugin;
