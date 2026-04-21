/* ------------------------------------------------------------------ */
/*  Gemini Chat plugin – free browser-based Gemini automation         */
/*  Capabilities: text, image gen, file upload, web search            */
/* ------------------------------------------------------------------ */

import { registerPlugin } from '../registry.js';
import type { ProviderPlugin, PluginDeps } from '../types.js';

const plugin: ProviderPlugin = {
  id: 'gemini-chat',
  name: 'Gemini Chat',
  adapterType: 'chat',
  capabilities: {
    text: true,
    imageGeneration: true,
    videoGeneration: false,
    tts: false,
    fileUpload: true,
    webSearch: true,
  },
  costTier: 'free',
  models: ['Gemini 3.1 Pro'],
  dailyLimits: {
    textQueries: 50,
    imageGenerations: 25,
  },
  routing: [
    {
      taskTypes: ['safety_check', 'video_analysis', 'fact_research', 'claim_verification',
        'calibration', 'narrative_map', 'script_generation', 'quality_review', 'visual_prompts'],
      priority: 10,
      defaultModel: 'Gemini 3.1 Pro',
    },
    {
      stages: ['RESEARCH'],
      taskTypes: ['fact_research'],
      priority: 15,
      defaultModel: 'Gemini 3.1 Pro',
    },
    {
      stages: ['STYLE_EXTRACTION'],
      taskTypes: ['video_analysis'],
      priority: 15,
      defaultModel: 'Gemini 3.1 Pro',
    },
  ],
  createAdapter(deps: PluginDeps) {
    return deps.chatAdapter;
  },
};

registerPlugin(plugin);

export default plugin;
