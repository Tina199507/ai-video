
import { ModelType, AIProvider } from "../types";

export const IMAGE_NEBULA = 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=1000';
export const IMAGE_LUNGS = 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&q=80&w=1000';
export const IMAGE_VORTEX = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1000';
export const IMAGE_CITY = 'https://images.unsplash.com/photo-1480796927426-f609979314bd?auto=format&fit=crop&q=80&w=1000';
export const IMAGE_MICRO = 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=1000';

export const PLACEHOLDER_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100";

export const AVAILABLE_MODELS = {
    // REQUIREMENT: Must use Gemini for native multimodal video understanding
    ANALYSIS: [
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Recommended)', provider: AIProvider.GEMINI },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Fast)', provider: AIProvider.GEMINI },
    ],
    // FLEXIBLE: Can use any strong reasoning model
    SCRIPTING: [
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: AIProvider.GEMINI },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: AIProvider.GEMINI },
    ],
    // FLEXIBLE: Imagen or DALL-E
    VISUAL: [
        { id: 'gemini-3-pro-image-preview', name: 'Imagen 3 Pro (1K/2K)', provider: AIProvider.GEMINI },
        { id: 'gemini-2.5-flash-image', name: 'Imagen 3 Fast', provider: AIProvider.GEMINI },
    ],
    // REQUIREMENT: Must use Veo for API-based video generation
    VIDEO: [
        { id: 'veo-3.1-generate-preview', name: 'Veo 3.1 (1080p)', provider: AIProvider.GEMINI },
        { id: 'veo-3.1-fast-generate-preview', name: 'Veo 3.1 Fast (720p)', provider: AIProvider.GEMINI },
    ]
};

export const MODEL_PRESETS = {
  LITE: {
    provider: AIProvider.GEMINI,
    analysisProvider: AIProvider.GEMINI, analysisModel: 'gemini-3.1-pro-preview',
    researchProvider: AIProvider.GEMINI, researchModel: 'gemini-3.1-pro-preview',
    scriptingProvider: AIProvider.GEMINI, scriptingModel: 'gemini-3.1-pro-preview',
    visualProvider: AIProvider.GEMINI, visualModel: 'gemini-2.5-flash-image',
    videoProvider: AIProvider.GEMINI, videoModel: 'veo-3.1-fast-generate-preview',
  },
  PLUS: {
    provider: AIProvider.GEMINI,
    analysisProvider: AIProvider.GEMINI, analysisModel: 'gemini-3.1-pro-preview', 
    researchProvider: AIProvider.GEMINI, researchModel: 'gemini-3.1-pro-preview', 
    scriptingProvider: AIProvider.GEMINI, scriptingModel: 'gemini-3.1-pro-preview', 
    visualProvider: AIProvider.GEMINI, visualModel: 'gemini-3-pro-image-preview', 
    videoProvider: AIProvider.GEMINI, videoModel: 'veo-3.1-generate-preview',
  }
};
