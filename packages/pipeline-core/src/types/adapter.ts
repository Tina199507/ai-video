/**
 * Generic AI adapter contract shared across the pipeline engine and adapter
 * packages. Keep this file topic-agnostic so video-specific types can stay
 * out of `@ai-video/pipeline-core`.
 */

/**
 * JSON-schema-like shape accepted by Gemini `responseSchema` and tolerated by
 * other providers. We keep it structurally minimal to stay cross-vendor safe.
 */
export type JsonSchemaLike = {
  type?: string;
  properties?: Record<string, JsonSchemaLike>;
  items?: JsonSchemaLike;
  required?: string[];
  enum?: unknown[];
  description?: string;
  [extra: string]: unknown;
};

/** Tool descriptor passed through to Gemini (functionDeclarations, googleSearch, etc.). */
export type ToolDescriptor = Record<string, unknown>;

/** Multimodal prompt part – lets adapters accept strings or vendor-specific parts. */
export type PromptPart =
  | string
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | Record<string, unknown>;

export interface AIRequestOptions {
  temperature?: number;
  topK?: number;
  responseMimeType?: string;
  responseSchema?: JsonSchemaLike;
  tools?: ToolDescriptor[];
  thinkingConfig?: { thinkingBudget?: number; maxTokens?: number };
  systemInstruction?: string;
  overrides?: Record<string, unknown>;
  /** Base64 data-URI of a reference sheet image for visual anchoring */
  referenceImage?: string;
  /** Per-call timeout override applied by the pipeline adapter wrapper. */
  timeoutMs?: number;
  /** Per-call abort signal, typically scoped to the current project run. */
  signal?: AbortSignal;
  /** Session-aware chat grouping (used by ChatAdapter without mutating shared config). */
  sessionId?: string;
  /** Continue inside the same chat thread when supported by the adapter. */
  continueChat?: boolean;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface GenerationResult {
  text?: string;
  /** Vendor-specific parsed payload (JSON, function-call args, etc.). */
  data?: unknown;
  imageUrl?: string;
  videoUrl?: string;
  keyframeUrl?: string;
  audioUrl?: string;
  base64?: string;
  /** Gemini grounding metadata (search results etc.) — shape is vendor-specific. */
  groundingMetadata?: Record<string, unknown>;
  durationMs?: number;
  model?: string;
  operationId?: string;
  tokenUsage?: TokenUsage;
}

export interface AIAdapter {
  provider: string;
  /** Masked API key fingerprint (last 4 chars) for audit logging. */
  keyFingerprint?: string;
  generateText(model: string, prompt: string | PromptPart[], options?: AIRequestOptions): Promise<GenerationResult>;
  generateImage(
    model: string,
    prompt: string,
    aspectRatio?: string,
    negativePrompt?: string,
    options?: AIRequestOptions,
  ): Promise<GenerationResult>;
  generateVideo(
    model: string,
    prompt: string,
    options?: {
      aspectRatio?: string;
      image?: string;
      duration?: number;
      fps?: number;
      resolution?: '720p' | '1080p';
    } & AIRequestOptions,
  ): Promise<GenerationResult>;
  uploadFile?(file: { name: string; path: string; mimeType: string }): Promise<{ uri: string; mimeType: string }>;
  generateSpeech?(text: string, voice?: string, options?: AIRequestOptions): Promise<GenerationResult>;
}
