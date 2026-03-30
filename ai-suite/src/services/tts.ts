
import { getAIAdapter } from "./core";
import { withRetry } from "../lib/utils";

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<{ audioUrl: string, duration: number }> => {
  const ai = getAIAdapter();

  try {
    const result = await withRetry(
      () => ai.generateSpeech!(text, voiceName),
      3, 1000, "TTS Generation"
    );
    return { 
      audioUrl: result.audioUrl || '', 
      duration: result.durationMs ? result.durationMs / 1000 : Math.max(3, text.split(' ').length / 2.5) 
    };
  } catch (error: any) {
    console.warn("TTS failed, using silent fallback.", error);
    const words = text.split(' ').length;
    return { audioUrl: '', duration: Math.max(3, words / 2.5) };
  }
};
