
import { ModelType, Scene, StyleProfile } from "../types";
import { getAIAdapter } from "./core";
import { withRetry, withFallback, withQuotaFallback } from "../lib/utils";
import { Type } from "@google/genai";

const getLangName = (lang: string) => lang === 'zh' ? 'Chinese (Simplified)' : 'English';
const cleanMarkdown = (text: string) => text.replace(/```markdown|```/g, "").trim();

export const refineScriptWithAI = async (
  currentScript: string, instruction: string, styleProfile: StyleProfile, language: string = 'en', modelName: string = ModelType.SCRIPTING
): Promise<string> => {
  const ai = getAIAdapter();
  
  // Truncate transcript to avoid context limit issues, but keep enough for style reference
  const styleReference = styleProfile.fullTranscript ? styleProfile.fullTranscript.substring(0, 500) + "..." : "None";

  const prompt = `Refine script based on instruction: "${instruction}".
  
  Original Script:
  """${currentScript}"""
  
  Target Style DNA:
  - Tone: ${styleProfile.track_a_script?.emotional_tone_arc || styleProfile.tone}
  - Script Style: ${styleProfile.scriptStyle}
  - Author's Voice Reference (Mimic this style): "${styleReference}"
  
  Language: ${getLangName(language)}. Return Markdown.`;
  
  const response = await withQuotaFallback(
    (model) => ai.generateText(model, prompt, { thinkingConfig: model.includes('pro') ? { thinkingBudget: 4096 } : undefined }),
    modelName,
    undefined,
    "Refine Script"
  );
  return cleanMarkdown(response.text || currentScript);
};

export const refineSingleScene = async (
    sceneText: string, sceneIndex: number, instruction: string, styleProfile: StyleProfile, fullScriptContext: string, language: string = 'en', modelName: string = ModelType.SCRIPTING
): Promise<string> => {
    const ai = getAIAdapter();
    const prompt = `Refine Scene ${sceneIndex + 1}: "${instruction}". 
    
    Original Text: 
    """${sceneText}"""
    
    Style Tone: ${styleProfile.track_a_script?.emotional_tone_arc || styleProfile.tone}. 
    
    Return JSON format: { "refined_scene_text": "string", "edit_summary": "string" }.
    IMPORTANT: Ensure the refined text retains the scene header (e.g., "## Scene X") if present in the original.`;

    const config = {
        thinkingConfig: modelName.includes('pro') ? { thinkingBudget: 1024 } : undefined,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: { refined_scene_text: { type: Type.STRING }, edit_summary: { type: Type.STRING } }
        }
    };

    try {
    const response = await withQuotaFallback(
        (model) => ai.generateText(model, prompt, {
            ...config,
            thinkingConfig: model.includes('pro') ? (config as any).thinkingConfig : undefined
        }),
        modelName,
        undefined,
        "Refine Scene"
    );
        
        let jsonStr = response.text || "{}";
        // Clean markdown code blocks if present (though responseMimeType should prevent this, it's safer)
        jsonStr = jsonStr.replace(/```json|```/g, "").trim();
        
        const json = JSON.parse(jsonStr);
        
        if (!json.refined_scene_text) {
            console.warn("Refine Scene: No refined_scene_text in response", json);
            return sceneText;
        }
        
        return json.refined_scene_text;
    } catch (error) {
        console.error("Refine Scene Error:", error);
        return sceneText;
    }
}

export const refineVisualsWithAI = async (
  scenes: Scene[], instruction: string, styleProfile: StyleProfile, modelName: string = ModelType.SCRIPTING
): Promise<Scene[]> => {
  const ai = getAIAdapter();
  const scenesJson = JSON.stringify(scenes.map(s => ({ id: s.id, number: s.number, narrative: s.narrative, visualPrompt: s.visualPrompt })), null, 2);
  const prompt = `Update visual prompts based on "${instruction}". Scenes: ${scenesJson}. Style: ${styleProfile.track_b_visual?.base_medium || styleProfile.visualStyle}. Return JSON Array.`;

  const config = {
      thinkingConfig: modelName.includes('pro') ? { thinkingBudget: 2048 } : undefined,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { id: { type: Type.STRING }, number: { type: Type.INTEGER }, narrative: { type: Type.STRING }, visualPrompt: { type: Type.STRING } },
          required: ["id", "number", "narrative", "visualPrompt"]
        }
      }
  };

  const response = await withQuotaFallback(
    (model) => ai.generateText(model, prompt, {
        ...config,
        thinkingConfig: model.includes('pro') ? (config as any).thinkingConfig : undefined
    }),
    modelName,
    undefined,
    "Refine Visuals"
  );

  const updates = JSON.parse(response.text) as any[];
  return scenes.map(scene => {
    const update = updates.find(u => u.id === scene.id);
    return update ? { ...scene, visualPrompt: update.visualPrompt } : scene;
  });
};

export const generateSafeAlternative = async (unsafeTopic: string, reason: string): Promise<string> => {
    const ai = getAIAdapter();
    const prompt = `Topic "${unsafeTopic}" flagged for "${reason}". Generate safe alternative topic. Return ONLY string.`;
    const response = await withQuotaFallback(
        (model) => ai.generateText(model, prompt),
        ModelType.SAFETY,
        undefined,
        "Safe Alternative"
    );
    return response.text?.trim() || "History of Science";
}

export const checkScriptSafety = async (scriptText: string, modelName: string = ModelType.SAFETY): Promise<{ isSafe: boolean; reason?: string }> => {
    const ai = getAIAdapter();
    const prompt = `Analyze the following script for safety violations (hate speech, self-harm, sexual content, violence). 
    
    Script: 
    """${scriptText.substring(0, 5000)}"""
    
    Return JSON: { "isSafe": boolean, "reason": "string (if unsafe, otherwise empty)" }`;

    const config = {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: { isSafe: { type: Type.BOOLEAN }, reason: { type: Type.STRING } },
            required: ["isSafe"]
        }
    };

    try {
        const response = await withQuotaFallback(
            (model) => ai.generateText(model, prompt, {
                ...config,
                thinkingConfig: model.includes('pro') ? (config as any).thinkingConfig : undefined
            }),
            modelName,
            undefined,
            "Safety Check"
        );
        return JSON.parse(response.text || '{"isSafe": true}');
    } catch (error) {
        console.error("Safety Check Error:", error);
        return { isSafe: true }; // Fail open to avoid blocking, or fail closed? Let's fail open but log.
    }
}
