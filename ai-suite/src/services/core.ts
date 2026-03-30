import { AIAdapter, AIProvider } from "../types";
import { GeminiAdapter } from "./adapters/geminiAdapter";

// Adapter Cache
const adapters: Map<string, AIAdapter> = new Map();

/**
 * Provider-to-environment-variable mapping.
 * Each provider checks a localStorage key first (runtime override),
 * then falls back to build-time environment variables.
 */
const PROVIDER_ENV_KEYS: Record<AIProvider, string[]> = {
  [AIProvider.GEMINI]:    ['API_KEY', 'GEMINI_API_KEY', 'VITE_GEMINI_API_KEY'],
  [AIProvider.OPENAI]:    ['OPENAI_API_KEY', 'VITE_OPENAI_API_KEY'],
  [AIProvider.ANTHROPIC]: ['ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'],
  [AIProvider.LOCAL]:     ['LOCAL_API_KEY', 'VITE_LOCAL_API_KEY'],
};

// API Key Retrieval with Multi-Provider Support
export const getApiKey = (provider: AIProvider = AIProvider.GEMINI): string | undefined => {
  // 1. Check LocalStorage (Runtime overrides — e.g. set via Dashboard UI)
  if (typeof window !== 'undefined') {
    const localKey = localStorage.getItem(`VS_API_KEY_${provider}`);
    if (localKey) return localKey;
  }

  // 2. Check Environment Variables (Build/Deploy time), provider-specific
  const env = (typeof window !== 'undefined' ? (window as any).process?.env : process.env) || {};
  const envKeys = PROVIDER_ENV_KEYS[provider] ?? [];
  for (const key of envKeys) {
    if (env[key]) return env[key];
  }

  return undefined;
};

// FACTORY: Get correct adapter based on provider
export const getAIAdapter = (provider: AIProvider = AIProvider.GEMINI): AIAdapter => {
  const apiKey = getApiKey(provider);

  // If no key found for this specific provider, throw a provider-specific error
  if (!apiKey) {
    throw new Error(`API_KEY_MISSING: No API key found for provider "${provider}". ` +
      `Set it via the Dashboard or the corresponding environment variable.`);
  }

  const cacheKey = `${provider}-${apiKey.substring(0, 5)}`;

  if (adapters.has(cacheKey)) {
    return adapters.get(cacheKey)!;
  }

  let adapter: AIAdapter;

  switch (provider) {
    case AIProvider.GEMINI:
      adapter = new GeminiAdapter(apiKey);
      break;
    case AIProvider.OPENAI:
      // OpenAI adapter is not yet implemented; throw a clear, actionable error
      // rather than silently falling back to Gemini with the wrong key.
      throw new Error(
        'OpenAI adapter is not yet implemented. ' +
        'To add support, create src/services/adapters/openaiAdapter.ts implementing the AIAdapter interface.'
      );
    case AIProvider.ANTHROPIC:
      throw new Error(
        'Anthropic adapter is not yet implemented. ' +
        'To add support, create src/services/adapters/anthropicAdapter.ts implementing the AIAdapter interface.'
      );
    case AIProvider.LOCAL:
      throw new Error(
        'Local model adapter is not yet implemented. ' +
        'To add Ollama/LM Studio support, create src/services/adapters/localAdapter.ts implementing the AIAdapter interface.'
      );
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }

  adapters.set(cacheKey, adapter);
  return adapter;
};

// --- LEGACY/HELPER EXPORTS ---

export const checkApiKey = async (provider: AIProvider = AIProvider.GEMINI): Promise<boolean> => {
  if (provider === AIProvider.GEMINI && typeof window !== 'undefined' && (window as any).aistudio) {
    return await (window as any).aistudio.hasSelectedApiKey();
  }
  return !!getApiKey(provider);
};

export const promptApiKeySelection = async (): Promise<void> => {
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    await (window as any).aistudio.openSelectKey();
  } else {
    // For non-Gemini or fallback, we might prompt a modal (omitted for brevity)
    alert("Please set API Keys in the Dashboard configuration.");
  }
};

export { withRetry, withFallback } from "../lib/utils";