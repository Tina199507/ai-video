import { Type } from "@google/genai";
import { Scene, StyleProfile, ModelType, GenerationResult } from "../types";
import { getAIAdapter } from "./core";
import { withQuotaFallback } from "../lib/utils";

const cleanJson = (text: string) => text.replace(/```json|```/g, "").trim();

const getSafeWPM = (wpm?: number) => {
    if (!wpm) return 150;
    return wpm;
};

const countWords = (text: string) => {
    if (!text) return 0;
    const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const eng = (text.replace(/[\u4e00-\u9fa5]/g, '').match(/\b\w+\b/g) || []).length;
    return cjk + eng;
};

export const generateStoryboard = async (
    topic: string, styleProfile: StyleProfile, confirmedScript: string, scriptOutput: any, language: string = 'en', modelName: string = ModelType.SCRIPTING
): Promise<Scene[]> => {
  const provider = modelName.includes('gpt') || modelName.includes('claude') ? 'OPENAI' : 'GEMINI';
  const ai = getAIAdapter(provider as any);

  // Calculate Target Scene Count
  const wordCount = countWords(confirmedScript);
  const wpm = getSafeWPM(styleProfile.wordsPerMinute);
  const estimatedTotalDuration = (wordCount / wpm) * 60;

  const faceRatio = 0; 
  let targetSceneDuration = 8; 
  const pacing = styleProfile.pacing?.toLowerCase() || 'medium';
  
  if (pacing.includes('fast')) targetSceneDuration = 4;
  else if (pacing.includes('slow')) targetSceneDuration = 12;

  if (faceRatio > 0.6) targetSceneDuration = Math.max(3, Math.round(targetSceneDuration * 0.8));
  else if (faceRatio < 0.2) targetSceneDuration = Math.round(targetSceneDuration * 1.15);

  const targetSceneCount = Math.max(1, Math.ceil(estimatedTotalDuration / targetSceneDuration));

  const hookText = scriptOutput?._step2b?.hook_text || styleProfile.track_a_script?.hook_strategy || styleProfile.hookType || 'Standard';
  const ctaText = scriptOutput?._step2b?.cta_text || styleProfile.track_a_script?.cta_structure || styleProfile.callToActionType || 'Standard';

  const prompt = `Convert the provided script about "${topic}" into a storyboard JSON.
  
  Script:
  """${confirmedScript}"""
  
  AESTHETIC REFERENCE (From a source video):
  - Visual Style: ${styleProfile.track_b_visual?.base_medium || styleProfile.visualStyle}
  - Color Palette: ${styleProfile.track_b_visual?.color_grading || styleProfile.colorPalette?.join(', ') || 'None'}
  - Lighting Style: ${styleProfile.track_b_visual?.lighting_style?.description || 'None'}
  - Camera Motion: ${styleProfile.track_b_visual?.camera_motion?.prompt_keywords || 'None'}
  - Composition: ${styleProfile.track_b_visual?.composition || 'None'}
  - Key Elements: ${styleProfile.keyElements?.join(', ') || 'None'}
  - Tone: ${styleProfile.track_a_script?.emotional_tone_arc || styleProfile.tone}
  - Target Audience: ${styleProfile.targetAudience}
  - Audio Style: ${styleProfile.track_c_audio ? JSON.stringify(styleProfile.track_c_audio) : (styleProfile.audioStyle ? JSON.stringify(styleProfile.audioStyle) : 'None')}
  
  CRITICAL INSTRUCTION ON AESTHETICS:
  The Aesthetic Reference above might be from a video about a completely different subject. 
  You MUST ADAPT the visual style and key elements to fit the NEW topic "${topic}". 
  - KEEP the artistic medium, lighting, color palette, and mood.
  - REPLACE subject-specific elements (e.g., if the reference has "heart" but the topic is "kidney", use "kidney"). Do NOT include irrelevant objects from the reference.
  
  Note: Target Aspect Ratio: ${styleProfile.targetAspectRatio || '16:9'}. 
  When generating visual prompts, produce aspect-ratio-specific framing suggestions.

  Pacing: ${styleProfile.pacing}
  Hook Text: ${hookText}
  CTA Text: ${ctaText}
  
  Target Scene Count: Approximately ${targetSceneCount} scenes.
  
  Ensure visual prompts are detailed and match the ADAPTED style. Use the Audio Style to inform the 'sound' production spec.
  Ensure the opening scene visual aligns with the Hook Text.
  Ensure the closing scene visual aligns with the CTA Text.`;
  
  const config = {
      thinkingConfig: modelName.includes('pro') ? { thinkingBudget: 2048 } : undefined,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            narrative: { type: Type.STRING }, visualPrompt: { type: Type.STRING },
            productionSpecs: { type: Type.OBJECT, properties: { camera: { type: Type.STRING }, lighting: { type: Type.STRING }, sound: { type: Type.STRING } } },
            estimatedDuration: { type: Type.NUMBER }
          },
          required: ["narrative", "visualPrompt", "estimatedDuration"]
        }
      }
  };

  const response = await withQuotaFallback<GenerationResult>(
      (model) => ai.generateText(model, prompt, {
          ...config,
          thinkingConfig: model.includes('pro') ? (config as any).thinkingConfig : undefined
      }),
      modelName,
      undefined,
      "Storyboard"
  );

  const scenes = JSON.parse(cleanJson(response.text)) as Scene[];
  if (!Array.isArray(scenes)) return [];
  
  const validatedScenes = scenes.map((s, i) => {
      let duration = s.estimatedDuration;
      if (duration < 2) duration = 2;
      if (duration > 20) duration = 20;
      
      return { 
          ...s, 
          id: `scene-${Date.now()}-${i}`, 
          number: i + 1, 
          estimatedDuration: duration,
          status: 'pending', 
          assetType: 'image', 
          logs: [] 
      };
  });

  return validatedScenes as Scene[];
};

export const subjectIsolationCheck = async (scenes: Scene[], topic: string, styleProfile: StyleProfile, modelName: string = ModelType.SCRIPTING): Promise<Scene[]> => {
    // A high-level guardrail to ensure visual prompts don't contain source-specific entities
    const ai = getAIAdapter();
    const prompt = `Review the following storyboard scenes for a video about "${topic}".
    Ensure that the visual prompts do not contain specific entities or subjects that belong to the original reference video rather than the new topic.
    If a visual prompt contains irrelevant subjects, rewrite it to fit "${topic}" while maintaining the visual style.
    
    Scenes JSON:
    ${JSON.stringify(scenes.map(s => ({ id: s.id, visualPrompt: s.visualPrompt })))}
    
    Return the updated JSON array of scenes with corrected visualPrompts.`;
    
    const config = {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    visualPrompt: { type: Type.STRING }
                },
                required: ["id", "visualPrompt"]
            }
        }
    };
    
    try {
        const response = await withQuotaFallback<GenerationResult>(
            (model) => ai.generateText(model, prompt, config),
            modelName,
            undefined,
            "Subject Isolation Check"
        );
        const updatedPrompts = JSON.parse(cleanJson(response.text));
        
        return scenes.map(scene => {
            const update = updatedPrompts.find((u: any) => u.id === scene.id);
            if (update) {
                return { ...scene, visualPrompt: update.visualPrompt };
            }
            return scene;
        });
    } catch (e) {
        console.warn("Subject Isolation Check failed, returning original scenes", e);
        return scenes;
    }
};

export const planAssets = (scenes: Scene[], quality: string): Scene[] => {
    // Decide which scenes get video and which get images based on quality settings or pacing
    return scenes.map(scene => {
        return {
            ...scene,
            assetType: quality === 'production' ? 'video' : 'image'
        };
    });
};
