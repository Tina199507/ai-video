import { ModelType, AIProvider } from "../types";

export interface ModelSelection {
  provider: AIProvider;
  model: string;
  config?: Record<string, any>;
  isFallback?: boolean;
}

/**
 * ModelStage identifies which AI model selection bucket to use within the pipeline.
 * This is intentionally separate from the high-level PipelineStage enum in types/enums.ts,
 * which tracks UI-facing workflow stages (RESEARCH, STRATEGY, SCRIPTING…).
 * ModelStage is a finer-grained, model-strategy-internal concept.
 */
export type ModelStage = 
  | 'analysis' 
  | 'research' 
  | 'planning' 
  | 'scripting' 
  | 'refinement' 
  | 'visual' 
  | 'video' 
  | 'audio' 
  | 'safety';

export type QualityLevel = 'draft' | 'balanced' | 'production' | 'max';

export interface CostBudget {
  maxCostPerCall?: number;
  maxCostPerProject?: number;
}

export interface LatencySLA {
  maxLatencyMs?: number;
}

export interface QualityRequirement {
  level: QualityLevel;
  requiresThinking?: boolean;
  requiresSearch?: boolean;
}

export interface StrategyConstraints {
  quality: QualityRequirement;
  budget?: CostBudget;
  sla?: LatencySLA;
}

// Pricing per 1M tokens (approximate values for demonstration)
const MODEL_PRICING: Record<string, { input: number, output: number }> = {
  'gemini-3.1-pro-preview': { input: 1.25, output: 5.00 },
  'gemini-3-pro-preview': { input: 1.25, output: 5.00 },
  'gemini-3-flash-preview': { input: 0.075, output: 0.30 },
  'gemini-2.5-flash-image': { input: 0, output: 20.00 }, // per 1k images
  'gemini-3-pro-image-preview': { input: 0, output: 30.00 }, // per 1k images
  'gemini-3.1-flash-image-preview': { input: 0, output: 25.00 }, // per 1k images
  'veo-3.1-fast-generate-preview': { input: 0, output: 100.00 }, // per 1k videos
  'veo-3.1-generate-preview': { input: 0, output: 200.00 }, // per 1k videos
  'gemini-2.5-flash-preview-tts': { input: 0, output: 15.00 } // per 1M chars
};

/**
 * Centralized strategy for selecting AI models based on stage, quality, and constraints.
 */
export class ModelStrategy {
  
  /**
   * Estimate cost for a given model and token usage.
   */
  static estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0;
    
    // For images/videos, we assume outputTokens = number of items
    if (model.includes('image') || model.includes('veo')) {
      return (outputTokens / 1000) * pricing.output;
    }
    
    // For TTS, we assume outputTokens = number of characters
    if (model.includes('tts')) {
      return (outputTokens / 1000000) * pricing.output;
    }
    
    return ((inputTokens / 1000000) * pricing.input) + ((outputTokens / 1000000) * pricing.output);
  }

  /**
   * Get the best model for a specific pipeline stage and quality level, considering constraints.
   */
  static getModelForStage(stage: ModelStage, quality: QualityLevel | StrategyConstraints = 'production'): ModelSelection {
    let qLevel: QualityLevel = 'production';
    let constraints: StrategyConstraints | undefined;

    if (typeof quality === 'string') {
      qLevel = quality;
    } else {
      qLevel = quality.quality.level;
      constraints = quality;
    }

    // Determine if we need to downgrade based on SLA or Budget
    let downgrade = false;
    if (constraints?.sla?.maxLatencyMs && constraints.sla.maxLatencyMs < 5000) {
      downgrade = true; // Fast response required
    }
    if (constraints?.budget?.maxCostPerCall && constraints.budget.maxCostPerCall < 0.001) {
      downgrade = true; // Very low budget
    }

    const effectiveQuality = downgrade ? 'draft' : qLevel;

    switch (stage) {
      case 'analysis':
        if (effectiveQuality === 'draft') {
          return { provider: AIProvider.GEMINI, model: 'gemini-3-flash-preview' };
        }
        return { 
          provider: AIProvider.GEMINI, 
          model: 'gemini-3.1-pro-preview',
          config: { thinkingBudget: effectiveQuality === 'max' ? 4096 : 2048 }
        };

      case 'research':
        if (effectiveQuality === 'draft') {
          return { provider: AIProvider.GEMINI, model: 'gemini-3-flash-preview', config: { tools: [{ googleSearch: {} }] } };
        }
        return { 
          provider: AIProvider.GEMINI, 
          model: 'gemini-3.1-pro-preview',
          config: { tools: [{ googleSearch: {} }] }
        };

      case 'scripting':
        if (effectiveQuality === 'draft') {
          return { provider: AIProvider.GEMINI, model: 'gemini-3-flash-preview', config: { temperature: 0.7 } };
        }
        return { 
          provider: AIProvider.GEMINI, 
          model: 'gemini-3.1-pro-preview',
          config: { temperature: 0.7 }
        };

      case 'visual':
        if (effectiveQuality === 'draft') {
          return { provider: AIProvider.GEMINI, model: 'gemini-2.5-flash-image' };
        }
        return { 
          provider: AIProvider.GEMINI, 
          model: 'gemini-3-pro-image-preview',
          config: { imageSize: '2K' }
        };

      case 'video':
        if (effectiveQuality === 'draft') {
          return { provider: AIProvider.GEMINI, model: 'veo-3.1-fast-generate-preview' };
        }
        return { provider: AIProvider.GEMINI, model: 'veo-3.1-generate-preview' };

      case 'audio':
        return { provider: AIProvider.GEMINI, model: 'gemini-2.5-flash-preview-tts' };

      case 'safety':
        return { provider: AIProvider.GEMINI, model: 'gemini-3-flash-preview' };

      default:
        return { provider: AIProvider.GEMINI, model: 'gemini-3.1-pro-preview' };
    }
  }

  /**
   * Get a fallback model if the primary one fails.
   */
  static getFallbackModel(stage: ModelStage, currentModel: string): ModelSelection | null {
    // Visual Fallback Chain
    if (stage === 'visual') {
      if (currentModel.includes('gemini-3-pro-image')) {
        return { provider: AIProvider.GEMINI, model: 'gemini-3.1-flash-image-preview', isFallback: true };
      }
      if (currentModel.includes('gemini-3.1-flash-image')) {
        return { provider: AIProvider.GEMINI, model: 'gemini-2.5-flash-image', isFallback: true };
      }
    }

    // Video Fallback Chain
    if (stage === 'video') {
      if (currentModel === 'veo-3.1-generate-preview') {
        return { provider: AIProvider.GEMINI, model: 'veo-3.1-fast-generate-preview', isFallback: true };
      }
    }

    // Text/Logic Fallback Chain
    if (['scripting', 'analysis', 'research'].includes(stage)) {
      if (currentModel.includes('pro')) {
        return { provider: AIProvider.GEMINI, model: 'gemini-3-flash-preview', isFallback: true };
      }
    }

    return null;
  }

  /**
   * Determine if a model supports a specific feature.
   */
  static supports(model: string, feature: 'search' | 'thinking' | 'vision'): boolean {
    if (feature === 'search') return model.includes('pro') || model.includes('flash');
    if (feature === 'thinking') return model.includes('gemini-3');
    if (feature === 'vision') return model.includes('pro') || model.includes('flash');
    return false;
  }
}