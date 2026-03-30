// adapters/geminiAdapter.ts
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AIAdapter, AIProvider, AIRequestOptions, GenerationResult } from "../../types";
import { Logger } from "../../lib/logger";
import { pcmToWav } from "../../lib/audioUtils";
import { Observability } from "../observability";
import { ModelStrategy } from "../modelStrategy";

export class GeminiAdapter implements AIAdapter {
  provider = AIProvider.GEMINI;
  private client: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Wrapper for observability tracking.
   * Logs both successful completions and failures so that uploadFile
   * and any future callers appear in the full call trace.
   */
  private async trackCall<T>(
      operation: string,
      model: string,
      fn: () => Promise<T>,
      metadata?: Record<string, any>
  ): Promise<T> {
      const start = Date.now();
      try {
          const result = await fn();
          Observability.logLLMCall(operation, model, Date.now() - start, true, metadata);
          return result;
      } catch (error) {
          Observability.logLLMCall(operation, model, Date.now() - start, false, {
              ...metadata,
              error: error instanceof Error ? error.message : String(error),
          });
          throw error;
      }
  }

  /* -------------------------
     generateText
  ------------------------- */
  async generateText(model: string, prompt: string | any[], options?: AIRequestOptions): Promise<GenerationResult> {
    const start = Date.now();
    try {
        const contents = Array.isArray(prompt) ? { parts: prompt } : { parts: [{ text: prompt }] };
        const config: any = {};
    
        if (options?.temperature) config.temperature = options.temperature;
        if (options?.responseMimeType) config.responseMimeType = options.responseMimeType;
        if (options?.responseSchema) config.responseSchema = options.responseSchema;
        if (options?.thinkingConfig) config.thinkingConfig = options.thinkingConfig;
        if (options?.systemInstruction) config.systemInstruction = options.systemInstruction;
        if (options?.tools) config.tools = options.tools;
        if (options?.overrides) Object.assign(config, options.overrides);
    
        const response = await this.client.models.generateContent({
          model: model,
          contents: contents,
          config: config
        });
  
        const candidate = response.candidates?.[0] || {};
        const text = (candidate.content?.parts?.map((p: any) => p.text).join('') ?? '');
  
        // try to parse JSON if schema provided
        let parsedData: any = undefined;
        if (options?.responseSchema || options?.responseMimeType === 'application/json') {
          try {
            const jsonStr = text.replace(/```json|```/g, "").trim();
            parsedData = JSON.parse(jsonStr);
          } catch (_) {
            // keep raw text in data if parse fails
            parsedData = undefined;
          }
        }
  
        const inputTokens = response.usageMetadata?.promptTokenCount || 0;
        const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
        const costEstimate = ModelStrategy.estimateCost(model, inputTokens, outputTokens);

        Observability.logLLMCall('generateText', model, Date.now() - start, true, { 
            prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
            tokens: inputTokens + outputTokens,
            costEstimate
        });

        return {
          text: text || "",
          data: parsedData,
          groundingMetadata: candidate?.groundingMetadata || undefined,
          model
        };
    } catch (e: any) {
        let message = e.message || e.toString();
        let status = e.status;
  
        // Parse structured error if possible
        try {
          if (message.includes('{')) {
            const jsonStr = message.substring(message.indexOf('{'));
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              status = parsed.error.code || status;
              message = parsed.error.message || message;
            }
          }
        } catch (parseError) {
          // ignore parse error
        }
  
        const error = new Error(`Gemini Error: ${message}`);
        (error as any).status = status;
  
        if (message.includes('quota') || status === 429) {
          (error as any).isQuotaError = true;
        }
  
        Observability.logLLMCall('generateText', model, Date.now() - start, false, { 
            prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
            error: message 
        });
        throw error;
    }
  }

  /* -------------------------
     generateImage
  ------------------------- */
  async generateImage(model: string, prompt: string, aspectRatio: string = "16:9", negativePrompt?: string): Promise<GenerationResult> {
    const start = Date.now();
    try {
        // Handle Imagen family separately
        if (model.includes('imagen')) {
          const res = await this._generateImagenResult(model, prompt, aspectRatio);
          const costEstimate = ModelStrategy.estimateCost(model, 0, 1);
          Observability.logLLMCall('generateImage', model, Date.now() - start, true, { prompt, costEstimate });
          return res;
        }
    
        const config: any = {
          imageConfig: { aspectRatio }
        };
        if (model.includes('gemini-3-pro')) {
          config.imageConfig.imageSize = "2K";
        }
    
        const response = await this.client.models.generateContent({
          model: model,
          contents: { parts: [{ text: prompt }] },
          config: config
        });
  
        const candidate = response.candidates?.[0];
        let result: GenerationResult | null = null;

        // find inlineData
        for (const part of candidate?.content?.parts || []) {
          if (part.inlineData && part.inlineData.data) {
            const b64 = part.inlineData.data;
            result = { base64: `data:image/png;base64,${b64}`, model, groundingMetadata: candidate?.groundingMetadata };
            break;
          }
        }
  
        if (!result) {
            // If adapter produced an external URL in groundingMetadata or elsewhere, return it
            const external = (candidate?.groundingMetadata as any)?.imageUrl || (candidate?.content as any)?.imageUrl;
            if (external) {
              result = { imageUrl: external, model, groundingMetadata: candidate?.groundingMetadata };
            }
        }

        if (!result) throw new Error("No image returned from Gemini");

        const costEstimate = ModelStrategy.estimateCost(model, 0, 1);
        Observability.logLLMCall('generateImage', model, Date.now() - start, true, { prompt, costEstimate });
        return result;

    } catch (e: any) {
        const error = new Error(`Gemini Image Error: ${e.message || e.toString()}`);
        (error as any).status = e.status;
        Observability.logLLMCall('generateImage', model, Date.now() - start, false, { prompt, error: error.message });
        throw error;
    }
  }

  private async _generateImagenResult(model: string, prompt: string, aspectRatio: string): Promise<GenerationResult> {
    try {
      const response = await this.client.models.generateImages({
        model,
        prompt,
        config: {
          numberOfImages: 1,
          aspectRatio,
          outputMimeType: 'image/jpeg'
        }
      });
      const base64 = response.generatedImages?.[0]?.image?.imageBytes;
      if (!base64) throw new Error("No image returned from Imagen");
      return { base64: `data:image/jpeg;base64,${base64}`, model };
    } catch (e: any) {
      const error = new Error(`Imagen Error: ${e.message || e.toString()}`);
      (error as any).status = e.status;
      throw error;
    }
  }

  /* -------------------------
     generateVideo
  ------------------------- */
  async generateVideo(model: string, prompt: string, options?: { aspectRatio?: string; image?: string; duration?: number }): Promise<GenerationResult> {
    const start = Date.now();
    try {
        Logger.info(`Starting Veo Generation: ${model}`, options);
    
        let requestImage: any = undefined;
        if (options?.image) {
          // Accept full data URL or bare base64
          const base64 = options.image.includes(',') ? options.image.split(',')[1] : options.image;
          requestImage = {
            imageBytes: base64,
            mimeType: 'image/png'
          };
        }
    
        let operation = await this.client.models.generateVideos({
          model,
          prompt,
          image: requestImage,
          config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: options?.aspectRatio || '16:9',
            duration: options?.duration
          } as any
        });
  
        // Poll operation until done
        while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          operation = await this.client.operations.getVideosOperation({ operation: operation });
          Logger.info("Veo Operation Status:", operation.metadata);
        }
  
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Video generation completed but no URI returned.");
  
        // Download video
        const response = await fetch(downloadLink, {
          method: 'GET',
          headers: { 'x-goog-api-key': this.apiKey }
        });
        if (!response.ok) throw new Error("Failed to download generated video.");
  
        const blob = await response.blob();
  
        // Convert blob to dataURL (as previous implementation did)
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
  
        // If operation metadata has keyframe or thumbnail, include it
        const keyframeUrl = (operation.response?.generatedVideos?.[0] as any)?.thumbnailUri || undefined;
  
        const durationMs = (operation.response?.generatedVideos?.[0] as any)?.durationMs || undefined;
  
        const costEstimate = ModelStrategy.estimateCost(model, 0, 1);
        Observability.logLLMCall('generateVideo', model, Date.now() - start, true, { prompt, hasImage: !!options?.image, costEstimate });

        return {
          videoUrl: dataUrl,
          keyframeUrl,
          durationMs,
          model,
          groundingMetadata: operation.metadata || undefined,
          operationId: operation.name
        };
    } catch (e: any) {
        const error = new Error(`Gemini Video Error: ${e.message || e.toString()}`);
        (error as any).status = e.status;
        Observability.logLLMCall('generateVideo', model, Date.now() - start, false, { prompt, hasImage: !!options?.image, error: error.message });
        throw error;
    }
  }

  /* -------------------------
     uploadFile
  ------------------------- */
  async uploadFile(file: File): Promise<{ uri: string; mimeType: string }> {
    return this.trackCall('uploadFile', 'gemini-upload', async () => {
        let mimeType = file.type;
        if (!mimeType) {
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'mkv') mimeType = 'video/x-matroska';
          else if (ext === 'mov') mimeType = 'video/quicktime';
          else mimeType = 'video/mp4';
        }
    
        const uploadResponse = await this.client.files.upload({
          file,
          config: { displayName: file.name, mimeType }
        });
    
        let fileInfo = uploadResponse;
        while (fileInfo.state === 'PROCESSING') {
          await new Promise(r => setTimeout(r, 2000));
          const status = await this.client.files.get({ name: fileInfo.name });
          if (status) fileInfo = status;
        }
    
        if (fileInfo.state === 'FAILED') {
          throw new Error(`Processing failed: ${fileInfo.error?.message}`);
        }
    
        return { uri: fileInfo.uri, mimeType: fileInfo.mimeType };
    }, { fileName: file.name, fileSize: file.size });
  }

  /* -------------------------
     generateSpeech
  ------------------------- */
  async generateSpeech(text: string, voice: string = 'Kore'): Promise<GenerationResult> {
    const start = Date.now();
    try {
        if (!this.apiKey) {
          throw new Error("API_KEY_MISSING: Gemini API Key is required for TTS.");
        }
    
        const response = await this.client.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: { parts: [{ text }] },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
        });
  
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error("No Audio returned");
  
        const wavBase64 = pcmToWav(base64Audio, 24000);
        const url = `data:audio/wav;base64,${wavBase64}`;
  
        const words = text.split(/\s+/).length;
        const isChinese = /[\u4e00-\u9fa5]/.test(text);
        let duration = 0;
        if (isChinese) {
          duration = text.length * 0.3;
        } else {
          duration = words / 2.5;
        }
        duration = Math.max(2, duration);
  
        const costEstimate = ModelStrategy.estimateCost('gemini-2.5-flash-preview-tts', 0, text.length);
        Observability.logLLMCall('generateSpeech', 'gemini-2.5-flash-preview-tts', Date.now() - start, true, { 
            prompt: text,
            textLength: text.length, 
            costEstimate 
        });

        return { audioUrl: url, durationMs: duration * 1000, model: 'gemini-2.5-flash-preview-tts' };
    } catch (e: any) {
        if (e.status === 403 || e.message?.includes('403') || e.message?.includes('PERMISSION_DENIED')) {
          const err = new Error("API_KEY_MISSING: Permission denied. Please check your API key or quota.");
          Observability.logLLMCall('generateSpeech', 'gemini-2.5-flash-preview-tts', Date.now() - start, false, { 
              prompt: text,
              textLength: text.length, 
              error: err.message 
          });
          throw err;
        }
        Observability.logLLMCall('generateSpeech', 'gemini-2.5-flash-preview-tts', Date.now() - start, false, { 
            prompt: text,
            textLength: text.length, 
            error: e.message || e.toString() 
        });
        throw e;
    }
  }
}