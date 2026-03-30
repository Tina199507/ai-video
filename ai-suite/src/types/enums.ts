
export enum ModelType {
  // --- HACKATHON CORE MODELS (GEMINI 3 SERIES) ---
  ANALYSIS = 'gemini-3.1-pro-preview',
  SCRIPTING = 'gemini-3.1-pro-preview', 
  IMAGE_GEN = 'gemini-3-pro-image-preview', 
  RESEARCH = 'gemini-3.1-pro-preview',
  SAFETY = 'gemini-3.1-pro-preview',
  TTS = 'gemini-2.5-flash-preview-tts',
  TEXT_FALLBACK = 'gemini-3.1-pro-preview',
}

export enum AIProvider {
  GEMINI = 'GEMINI',
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  LOCAL = 'LOCAL'       // Ready for Ollama/LM Studio
}

export enum AppView {
  LANDING = 'LANDING',
  DASHBOARD = 'DASHBOARD',
  STYLE = 'STYLE',
  SCRIPTING = 'SCRIPTING',
  STORYBOARD = 'STORYBOARD',
  EDITOR = 'EDITOR'
}

export type PipelineStage = 
  | 'RESEARCH'      // 调研阶段
  | 'STRATEGY'      // 策略与 StyleDNA 定义阶段
  | 'SCRIPTING'     // 脚本撰写阶段
  | 'STORYBOARD'    // 分镜设计阶段
  | 'PRODUCTION';   // 最终生产阶段

export type ProcessStatus = 'pending' | 'processing' | 'completed' | 'error';
