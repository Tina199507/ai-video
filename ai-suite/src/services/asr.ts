import { getAIAdapter } from "./core";
import { withQuotaFallback, fileToGenerativePart } from "../lib/utils";
import { ModelType, AIProvider } from "../types";
import { Logger } from "../lib/logger";

export interface ASRResult {
  transcript: string;
  confidence: number;
  segments?: { start: number; end: number; text: string }[];
  language?: string;
  provider: string;
}

/**
 * Perform Automatic Speech Recognition (ASR) on a video or audio file.
 * This service abstracts the underlying provider (e.g., Gemini, Whisper, Google Cloud Speech).
 */
export const performASR = async (
  file: File,
  modelName: string = ModelType.ANALYSIS // Default to analysis model which often has multimodal capabilities
): Promise<ASRResult> => {
  const ai = getAIAdapter(AIProvider.GEMINI);
  
  try {
    Logger.info(`[ASR] Starting transcription for ${file.name} (${file.size} bytes)`);
    
    const prompt = `
      Transcribe the audio from this video file verbatim. 
      Output format: JSON with 'transcript' (full text), 'confidence' (0.0-1.0), 'segments' (array of {start, end, text}), and 'language' (ISO code, e.g. 'en', 'zh').
      If audio is unclear or music-only, set confidence low.
      Detect the language automatically.
    `;

    // Strategy: Use Inline Data (Base64) for small files (< 10MB) to avoid File API auth issues.
    // Use File API (uploadFile) for larger files.
    const MAX_INLINE_SIZE = 10 * 1024 * 1024; // 10MB
    
    let contentPart: any;

    if (file.size < MAX_INLINE_SIZE) {
        Logger.info("[ASR] File is small (<10MB), using Inline Data strategy.");
        const inlineDataPart = await fileToGenerativePart(file);
        contentPart = inlineDataPart;
    } else {
        Logger.info("[ASR] File is large (>10MB), using Upload API strategy.");
        if (ai.uploadFile) {
            const uploadResult = await ai.uploadFile(file);
            contentPart = { 
                fileData: { 
                    fileUri: uploadResult.uri, 
                    mimeType: uploadResult.mimeType || file.type 
                } 
            };
        } else {
            throw new Error("File upload not supported by adapter and file is too large for inline data.");
        }
    }

    const response = await withQuotaFallback(
      (model) => ai.generateText(
        model, 
        [
            contentPart, 
            { text: prompt }
        ], 
        { responseMimeType: "application/json" }
      ),
      modelName,
      undefined,
      "ASR"
    );

    Logger.info("[ASR] Raw Response:", response.text);
    const rawParsed = JSON.parse(response.text);

    // The Gemini model occasionally wraps its JSON response in an array
    // (i.e. returns [{transcript:…}] instead of {transcript:…}).
    // Unwrap the first element so downstream code always receives a plain object.
    const result: any = Array.isArray(rawParsed) ? rawParsed[0] : rawParsed;

    if (!result || typeof result !== 'object') {
      throw new Error(`[ASR] Unexpected response shape: ${JSON.stringify(rawParsed).slice(0, 200)}`);
    }

    Logger.info("[ASR] Parsed Result:", result);
    
    return {
      transcript: result.transcript || "",
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      segments: Array.isArray(result.segments) ? result.segments : [],
      language: result.language || "en",
      provider: "Gemini-Multimodal"
    };

  } catch (error) {
    Logger.error("[ASR] Transcription failed", error);
    // Return a safe fallback rather than crashing, but with 0 confidence
    return {
      transcript: "",
      confidence: 0,
      provider: "Failed"
    };
  }
};