// src/services/scripting.ts
import { Type } from "@google/genai";
import { Scene, StyleProfile, ModelType, AIProvider, ResearchData, NarrativeMap, ScriptOutput, StyleConsistency, GenerationResult } from "../types";
import { getAIAdapter } from "./core";
import { withRetry, withFallback, withQuotaFallback } from "../lib/utils";
import { markSuspiciousClaimsInText } from "./safetyClaims";
import { sanitizeTranscriptForStyle, detectContentContamination } from "../lib/sanitize";
import { 
  STEP_2A_PROMPT, 
  STEP_2B_SYSTEM_PROMPT, 
  STEP_2B_USER_PROMPT, 
  STEP_3_SYSTEM_PROMPT, 
  STEP_3_USER_PROMPT 
} from "../config/prompts";

const getLangName = (lang: string) => lang === 'zh' ? 'Chinese (Simplified)' : 'English';
const cleanJson = (text: string) => text.replace(/```json|```/g, "").trim();
const cleanMarkdown = (text: string) => text.replace(/```markdown|```/g, "").trim();

/**
 * Derive the correct AIProvider from a model name string.
 * This is the single authoritative mapping used across all scripting functions,
 * replacing the four scattered bare-string comparisons that previously existed.
 */
const providerFromModelName = (modelName: string): AIProvider => {
  if (modelName.includes('gpt') || modelName.includes('o1') || modelName.includes('o3')) {
    return AIProvider.OPENAI;
  }
  if (modelName.includes('claude')) {
    return AIProvider.ANTHROPIC;
  }
  if (modelName.includes('ollama') || modelName.includes('llama') || modelName.includes('mistral')) {
    return AIProvider.LOCAL;
  }
  return AIProvider.GEMINI;
};

// Validation functions
const validateNarrativeMap = (data: any, targetDuration?: number): boolean => {
    if (!data || !Array.isArray(data)) return false;
    if (data.length === 0) return false;
    // Check if beats have required fields
    const hasFields = data.every((b: any) => b.sectionTitle && b.description && typeof b.estimatedDuration === 'number');
    if (!hasFields) return false;

    // Validate Total Duration if target provided
    if (targetDuration && targetDuration > 0) {
        const total = data.reduce((acc: number, b: any) => acc + b.estimatedDuration, 0);
        const diff = Math.abs(total - targetDuration);
        // Allow 15% variance or 15 seconds, whichever is larger, to accommodate AI rounding
        const tolerance = Math.max(targetDuration * 0.15, 15);
        if (diff > tolerance) {
            console.warn(`Narrative Map duration mismatch: Generated ${total}s vs Target ${targetDuration}s`);
            return false;
        }
    }
    return true;
};

const validateDraftScript = (text: string): boolean => {
    if (!text || text.length < 50) return false;
    // Check for basic Markdown structure (headers)
    return text.includes('##') || text.includes('**');
};

const getSafeWPM = (wpm?: number) => {
    if (!wpm) return 150;
    return wpm;
};

/* -------------------------
   Helper utilities
   ------------------------- */

/**
 * Determine if nodeConfidence requires manual review.
 * Expects styleProfile.nodeConfidence to be an object mapping field->0..1
 */
const checkNodeConfidenceForReview = (styleProfile?: StyleProfile, threshold: number = 0.5): { requiresReview: boolean; lowFields: string[] } => {
    const lowFields: string[] = [];
    if (!styleProfile || !(styleProfile as any).nodeConfidence) return { requiresReview: false, lowFields: [] };
    const nodeConfidence = (styleProfile as any).nodeConfidence as Record<string, number>;
    const importantFields = ['visualStyle', 'tone', 'pacing', 'narrativeStructure', 'fullTranscript'];
    for (const f of importantFields) {
        const v = nodeConfidence[f];
        if (typeof v === 'number' && v < threshold) lowFields.push(f);
    }
    return { requiresReview: lowFields.length > 0, lowFields };
};

/* -------------------------
   Main exported functions
   ------------------------- */

export const generateNarrativeMap = async (
    topic: string, 
    styleProfile: StyleProfile, 
    researchData: ResearchData, 
    language: string = 'en', 
    modelName: string = ModelType.SCRIPTING,
    targetWPMOverride?: number
): Promise<NarrativeMap> => {
  const provider = providerFromModelName(modelName);
  const ai = getAIAdapter(provider);
  if (!researchData || !researchData.facts || researchData.facts.length === 0) {
      throw new Error("Cannot generate narrative map: Research data is missing.");
  }

  const structureArr = styleProfile.track_a_script?.narrative_arc || (Array.isArray(styleProfile.narrativeStructure) ? styleProfile.narrativeStructure : []);
  const structureStr = structureArr.join(', ');
  const targetSequenceCount = structureArr.length > 0 ? structureArr.length : 4;

  const factsContext = researchData.facts.map((f, i) => `[Fact-${i+1}] ${f.content} (Confidence: ${f.aggConfidence})`).join('\n');
  
  // Calculate target WPM for estimation
  const targetWPM = targetWPMOverride || getSafeWPM(styleProfile.wordsPerMinute);
  const targetDuration = styleProfile.meta?.video_duration_sec || (styleProfile as any).sourceDuration || 60; // Default to 60s if unknown

  // --- NEW: Sanitize Transcript ---
  const extraBlacklist = (styleProfile.suspiciousNumericClaims || []).map(c => c.raw);
  const hookExample = styleProfile.track_a_script?.hook_example;
  const { sanitized: sanitizedTranscript, replaceMap } = sanitizeTranscriptForStyle(styleProfile.fullTranscript, extraBlacklist, hookExample);
  // --------------------------------

  // Safety & Confidence Context
  const lowConfidenceWarning = "";
  
  const suspiciousClaimsContext = styleProfile.suspiciousNumericClaims && styleProfile.suspiciousNumericClaims.length > 0
    ? `SUSPICIOUS CLAIMS FROM SOURCE: ${JSON.stringify(styleProfile.suspiciousNumericClaims)}. CRITICAL: ONLY mark these as [NEEDS VERIFICATION] if they naturally arise and are relevant to the new topic "${topic}". Otherwise, ignore them completely.`
    : "";

  // If narrativeStructure nodeConfidence is low, instruct model to propose conservative structure
  const narrativeNodeConfidence = (styleProfile as any).nodeConfidence?.['narrativeStructure'];
  const narrativeFallbackNote = (typeof narrativeNodeConfidence === 'number' && narrativeNodeConfidence < 0.5)
    ? "NOTE: The source narrativeStructure has low confidence. If unsure, propose a conservative 4-section structure: [Hook, Mechanism, Risks, Actions]."
    : "";

  const prompt = `Create a Narrative Map for the new topic "${topic}".
  
  Context:
  - Source Structure Template: ${structureStr}
  - Target Sequence Count: Exactly ${targetSequenceCount} sections.
  - CRITICAL INSTRUCTION: Use the "Source Structure Template" above ONLY as a guide for the emotional arc and pacing rhythm. You MUST invent NEW, highly relevant 'sectionTitle's that perfectly fit the new topic "${topic}". Do NOT blindly copy the source titles if they don't make sense for "${topic}".
  - Target Audience: ${styleProfile.targetAudience}
  - Tone: ${styleProfile.track_a_script?.emotional_tone_arc || styleProfile.tone}
  - Target WPM: ${targetWPM}
  - Target Total Duration: ${targetDuration} seconds
  - Hook Type: ${styleProfile.track_a_script?.hook_strategy || styleProfile.hookType || 'Standard'}
  - CTA Type: ${styleProfile.track_a_script?.cta_structure || styleProfile.callToActionType || 'Standard'}
  ${lowConfidenceWarning}
  ${suspiciousClaimsContext}
  ${narrativeFallbackNote}
  
  STYLE REFERENCE:
  CRITICAL: The reference transcript below may be about a completely different topic. Do NOT copy its content, facts, or specific subject matter. ONLY extract and apply its writing STYLE to your new content.
  """${sanitizedTranscript || 'None provided'}"""
  
  Research Facts:
  ${factsContext}
  
  Requirements:
  - Assign a 'targetWordCount' to each beat based on its estimatedDuration and the Target WPM (Formula: duration * WPM / 60).
  - First beat (Hook) should be short (<= 10s) and align with Hook Type: ${styleProfile.track_a_script?.hook_strategy || styleProfile.hookType}.
  - Last beat (Conclusion) should include a Call to Action matching: ${styleProfile.track_a_script?.cta_structure || styleProfile.callToActionType}.
  - The sum of 'estimatedDuration' for all sections MUST equal approx ${targetDuration} seconds (±10%).
  - For 'factReferences', use an array of Fact IDs (e.g., ["Fact-1", "Fact-2"]) that are relevant to the section. DO NOT include the fact content itself.
  - If a section naturally relies on a suspicious claim mentioned above, mark it in the description as [NEEDS VERIFICATION]. If the claim is irrelevant to "${topic}", ignore it.
  
  Language: ${getLangName(language)}. Return JSON Array.`;

  const config = {
      thinkingConfig: modelName.includes('pro') ? { thinkingBudget: 2048 } : undefined,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sectionTitle: { type: Type.STRING }, 
            description: { type: Type.STRING },
            estimatedDuration: { type: Type.NUMBER }, 
            targetWordCount: { type: Type.NUMBER },
            factReferences: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["sectionTitle", "description", "estimatedDuration", "targetWordCount"]
        }
      }
  };

  try {
      const response = await withQuotaFallback(
          (model) => ai.generateText(model, prompt, {
              ...config,
              thinkingConfig: model.includes('pro') ? config.thinkingConfig : undefined
          }),
          modelName,
          undefined,
          "Narrative Map"
      );

      const parsed = JSON.parse(cleanJson(response.text));
      
      if (!validateNarrativeMap(parsed, targetDuration)) {
          throw new Error("Narrative Map generation failed: Structure invalid or duration mismatch.");
      }

      return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
      console.error("Narrative Map Error", e);
      throw e;
  }
};

export const evaluateStyleConsistency = async (
    scriptText: string,
    referenceTranscript: string,
    styleProfile: StyleProfile,
    modelName: string = ModelType.SCRIPTING
): Promise<StyleConsistency & { status: 'pass' | 'warn' | 'fail' }> => {
    const provider = providerFromModelName(modelName);
    const ai = getAIAdapter(provider);

    const prompt = `Evaluate the style consistency of the following generated script against a reference transcript and style profile.
    
    Reference Transcript:
    """${referenceTranscript.substring(0, 3000)}"""
    
    Target Style Profile:
    - Tone: ${styleProfile.track_a_script?.emotional_tone_arc || styleProfile.tone}
    - Script Style: ${styleProfile.scriptStyle}
    - Audience: ${styleProfile.targetAudience}
    
    Generated Script:
    """${scriptText.substring(0, 3000)}"""
    
    Analyze:
    1. Vocabulary and sentence structure similarity.
    2. Tone and emotional resonance.
    3. Pacing and rhetorical devices.
    4. Compare against expected Style Fingerprint: "${styleProfile.styleFingerprint || 'N/A'}"
    
    Return JSON:
    {
      "score": number (0.0 to 1.0),
      "feedback": "Concise explanation of style match or mismatch",
      "styleFingerprint": "A short string representing the detected style (e.g. 'high-energy-tech-vlog')"
    }`;

    const config = {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                score: { type: Type.NUMBER },
                feedback: { type: Type.STRING },
                styleFingerprint: { type: Type.STRING }
            },
            required: ["score", "feedback"]
        }
    };

    try {
        const response = await withQuotaFallback(
            (model) => ai.generateText(model, prompt, config),
            modelName,
            undefined,
            "Style Evaluation"
        );
        const result = JSON.parse(cleanJson(response.text));
        const score = result.score || 0;
        
        let status: 'pass' | 'warn' | 'fail' = 'fail';
        if (score >= 0.78) status = 'pass';
        else if (score >= 0.65) status = 'warn';

        return { 
            ...result, 
            score,
            status,
            isDeviation: status === 'fail'
        };
    } catch (e) {
        console.error("Style Evaluation Error", e);
        return { score: 1.0, isDeviation: false, feedback: "Evaluation failed", status: 'pass' };
    }
};

export const countWords = (text: string): number => {
    if (!text) return 0;
    // For CJK-heavy text, LLMs typically count all non-whitespace characters (including punctuation).
    // To align our manual count with the LLM's self-reported length, we count all non-whitespace characters
    // if the text contains any CJK characters. Otherwise, we count alphanumeric words.
    if (/[\u4e00-\u9fa5]/.test(text)) {
        const nonWhitespace = text.match(/\S/g);
        return nonWhitespace ? nonWhitespace.length : 0;
    }
    const matches = text.match(/[a-zA-Z0-9_]+/g);
    return matches ? matches.length : 0;
};

export const performScriptVerification = (
    scriptOutput: ScriptOutput,
    narrativeMap: NarrativeMap,
    styleProfile: StyleProfile,
    minFactRequired: number = 1
) => {
    let beatDeviations: number[] = [];
    let unverifiedCount = 0;
    
    if (scriptOutput.scenes && scriptOutput.scenes.length > 0) {
        beatDeviations = scriptOutput.scenes.map((scene, i) => {
            const target = narrativeMap[i]?.targetWordCount || 0;
            if (target === 0) return 0;
            const actual = countWords(scene.script_text);
            return Math.abs(actual - target) / target;
        });
        unverifiedCount = scriptOutput.scenes.reduce((acc, scene) => acc + (scene.script_text.match(/UNVERIFIED/g) || []).length, 0);
    } else {
        const beats = scriptOutput.scriptText.split(/##\s+/).filter(b => b.trim().length > 0);
        beatDeviations = beats.map((beatText, i) => {
            const target = narrativeMap[i]?.targetWordCount || 0;
            if (target === 0) return 0;
            const actual = countWords(beatText);
            return Math.abs(actual - target) / target;
        });
        unverifiedCount = (scriptOutput.scriptText.match(/UNVERIFIED/g) || []).length;
    }
    
    const maxDeviation = Math.max(...beatDeviations, 0);
    let durationStatus: 'pass' | 'warn' | 'fail' = 'pass';
    if (maxDeviation > 0.3) durationStatus = 'fail';
    else if (maxDeviation > 0.15) durationStatus = 'warn';

    // 2. Total Duration
    const totalTargetWords = narrativeMap.reduce((acc, s) => acc + (s.targetWordCount || 0), 0);
    const actualTotalWords = countWords(scriptOutput.scriptText);
    const totalDeviation = Math.abs(actualTotalWords - totalTargetWords) / totalTargetWords;

    // 3. Fact Coverage
    const factsPerBeat = narrativeMap.map(b => b.factReferences?.length || 0);
    const coverageIssues = factsPerBeat.filter(count => count < minFactRequired).length;
    const factCoverageScore = 1 - (coverageIssues / narrativeMap.length);

    // 4. Fact Usage Valid
    const factCheckPassed = unverifiedCount === 0;

    return {
        durationStatus,
        durationDeviation: totalDeviation,
        factCoverageScore,
        factCheckPassed,
        maxBeatDeviation: maxDeviation
    };
};





// --- New 3-Step Script Generation Workflow ---

interface Step2aOutput {
  calibration: {
    reference_total_words: number;
    reference_duration_sec: number;
    actual_speech_rate: string;
    new_video_target_duration_sec: number;
    target_word_count: number;
    target_word_count_min: string;
    target_word_count_max: string;
  };
  verified_facts: {
    fact_id: number;
    content: string;
    source_marker: string;
    visual_potential: string;
    recommended_stage: string;
  }[];
  narrative_map: {
    stage_index: number;
    stage_title: string;
    description: string;
    estimated_duration_sec: number;
    target_word_count: number;
    fact_references: number[];
  }[];
}

interface Step2bOutput {
  script: string;
  sentence_list: any[];
  total_length: number;
  metaphors_identified: string[];
  hook_text: string;
  cta_text: string;
  stage_breakdown: Record<string, string>;
  constraint_compliance: {
    avg_sentence_length: number;
    max_sentence_length: number;
    max_sentence_stage: string;
    sentences_exceeding_normal_limit: number;
    sentences_exceeding_absolute_limit: number;
    metaphor_count: number;
    interaction_cues_count: number;
    total_length: number;
    within_target_range: boolean;
  };
}

interface Step3Output {
  audit_1_compliance: {
    status: "PASS" | "WARNING" | "BLOCK";
    issues: any[];
  };
  audit_2_contamination: {
    status: "CLEAN" | "FLAGGED";
    flagged_sentences: any[];
  };
  audit_3_style: {
    overall_status: "PASS" | "PARTIAL" | "FAIL";
    stage_ratings: any[];
  };
  final_verdict: "APPROVED" | "NEEDS_REVISION";
  revision_instructions?: string;
  approved_script?: string;
}

const executeStep2a = async (
  ai: any,
  modelName: string,
  topic: string,
  styleProfile: StyleProfile,
  language: string,
  actualDurationSec: number
): Promise<Step2aOutput> => {
  const narrativeArc = (styleProfile.track_a_script?.narrative_arc || []).join(', ');
  const hookStrategy = styleProfile.track_a_script?.hook_strategy || 'Standard';
  // Extract structural pattern from cta_structure, not the literal sentence
  const ctaPattern = styleProfile.track_a_script?.cta_structure
    ? `Pattern from source: 「${styleProfile.track_a_script.cta_structure}」— use this as STRUCTURAL TEMPLATE only, do NOT copy the words`
    : 'imperative verb + 因为 + comparative closing';

  const prompt = STEP_2A_PROMPT
    .replace(/\{video_duration_sec\}/g, String(actualDurationSec))
    .replace(/\{total_words\}/g, String(styleProfile.track_a_script?.total_words || 150))
    .replace(/\{video_language\}/g, styleProfile.meta?.video_language || (language === 'zh' ? 'Chinese' : 'English'))
    .replace(/\{topic\}/g, topic)
    .replace(/\{narrative_arc\}/g, narrativeArc)
    .replace(/\{hook_strategy\}/g, hookStrategy)
    .replace(/\{cta_pattern\}/g, ctaPattern);

  let attempts = 0;
  while (attempts < 3) {
    try {
      const response = await withQuotaFallback(
        (model) => ai.generateText(model, prompt, {
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }]
        }),
        modelName,
        undefined,
        "Step 2a: Calibration, Facts & Narrative Map"
      ) as GenerationResult;

      const parsed = JSON.parse(cleanJson(response.text || "{}"));
      // Ensure narrative_map always exists as array
      if (!Array.isArray(parsed.narrative_map)) parsed.narrative_map = [];
      return parsed;
    } catch (e) {
      attempts++;
      console.warn(`[Step 2a] Attempt ${attempts} failed:`, e);
      if (attempts >= 3) throw e;
    }
  }
  throw new Error("Step 2a failed after 3 attempts");
};

const executeStep2b = async (
  ai: any,
  modelName: string,
  topic: string,
  styleProfile: StyleProfile,
  step2aOutput: Step2aOutput,
  language: string,
  revisionInstructions?: string
): Promise<Step2bOutput> => {
  const systemPrompt = STEP_2B_SYSTEM_PROMPT.replace(/\{video_language\}/g, language === 'zh' ? 'Chinese' : 'English');
  
  let userPrompt = STEP_2B_USER_PROMPT
    .replace(/\{source_video_name\}/g, 'Reference Video') // We might not have the name, generic is fine
    .replace(/\{hook_strategy\}/g, styleProfile.track_a_script?.hook_strategy || 'Standard')
    .replace(/\{hook_strategy_note\}/g, styleProfile.track_a_script?.hook_strategy_note || 'None')
    .replace(/\{hook_example\}/g, styleProfile.track_a_script?.hook_example || 'None')
    .replace(/\{narrative_arc_expanded\}/g, (() => {
      // Prefer dynamic narrative_map from Step 2a if available
      if (step2aOutput.narrative_map && step2aOutput.narrative_map.length > 0) {
        return step2aOutput.narrative_map.map(s =>
          `Stage ${s.stage_index}: ${s.stage_title}\n  → ${s.description}\n  → Target: ~${s.target_word_count} characters / ${s.estimated_duration_sec}s`
        ).join('\n\n');
      }
      // Fallback to static arc from StyleDNA
      return (styleProfile.track_a_script?.narrative_arc || []).map((s, i) => `Stage ${i+1}: ${s}`).join('\n');
    })())
    .replace(/\{rhetorical_core_expanded\}/g, (styleProfile.track_a_script?.rhetorical_core || []).map(r => `- ${r}`).join('\n'))
    .replace(/\{sentence_length_unit\}/g, styleProfile.track_a_script?.sentence_length?.unit || 'words')
    .replace(/\{sentence_length_avg\}/g, String(styleProfile.track_a_script?.sentence_length?.avg || 15))
    .replace(/\{sentence_length_max\}/g, String(styleProfile.track_a_script?.sentence_length?.max || 30))
    .replace(/\{sentence_length_max_context\}/g, styleProfile.track_a_script?.sentence_length?.max_context || 'None')
    .replace(/\{sentence_length_per_scene_range\}/g, styleProfile.track_a_script?.sentence_length?.per_scene_range || '10-20')
    .replace(/\{emotional_tone_arc\}/g, styleProfile.track_a_script?.emotional_tone_arc || 'None')
    .replace(/\{metaphor_count\}/g, String(styleProfile.track_a_script?.metaphor_count || 3))
    .replace(/\{visual_metaphor_mapping_rule\}/g, styleProfile.track_b_visual?.visual_metaphor_mapping?.rule || 'None')
    .replace(/\{visual_metaphor_mapping_examples\}/g, (styleProfile.track_b_visual?.visual_metaphor_mapping?.examples || []).map(e => `- ${e.concept} -> ${e.metaphor_visual}`).join('\n'))
    .replace(/\{jargon_treatment\}/g, styleProfile.track_a_script?.jargon_treatment || 'plain-language-only')
    .replace(/\{interaction_cues_count\}/g, String(styleProfile.track_a_script?.interaction_cues_count || 0))
    .replace(/\{interaction_cues_note\}/g, styleProfile.track_a_script?.interaction_cues_note || '')
    .replace(/\{target_word_count\}/g, String(step2aOutput.calibration.target_word_count))
    .replace(/\{target_word_count_min\}/g, step2aOutput.calibration.target_word_count_min)
    .replace(/\{target_word_count_max\}/g, step2aOutput.calibration.target_word_count_max)
    .replace(/\{topic\}/g, topic)
    .replace(/\{verified_facts_list\}/g, step2aOutput.verified_facts.map(f => `- [${f.source_marker}] ${f.content} (Recommended Stage: ${f.recommended_stage})`).join('\n'));

  if (revisionInstructions) {
    userPrompt += `\n\n════════════════════════════════════════════════════════════════\nREVISION INSTRUCTIONS\n════════════════════════════════════════════════════════════════\n${revisionInstructions}`;
  }

  const response = await withQuotaFallback(
    (model) => ai.generateText(model, [
      { text: systemPrompt },
      { text: userPrompt }
    ], { responseMimeType: "application/json" }),
    modelName,
    undefined,
    "Step 2b: Script Generation"
  ) as GenerationResult;

  return JSON.parse(cleanJson(response.text || "{}"));
};

const executeStep3 = async (
  ai: any,
  modelName: string,
  styleProfile: StyleProfile,
  generatedScript: string,
  originalTranscript: string
): Promise<Step3Output> => {
  const userPrompt = STEP_3_USER_PROMPT
    .replace(/\{original_transcript\}/g, originalTranscript.substring(0, 5000)) // Truncate if too long
    .replace(/\{generated_script\}/g, generatedScript)
    .replace(/\{emotional_tone_arc\}/g, styleProfile.track_a_script?.emotional_tone_arc || 'None')
    .replace(/\{narrative_arc\}/g, (styleProfile.track_a_script?.narrative_arc || []).join(' -> '))
    .replace(/\{rhetorical_core\}/g, (styleProfile.track_a_script?.rhetorical_core || []).join(', '));

  const response = await withQuotaFallback(
    (model) => ai.generateText(model, [
      { text: STEP_3_SYSTEM_PROMPT },
      { text: userPrompt }
    ], { responseMimeType: "application/json" }),
    modelName,
    undefined,
    "Step 3: Quality Audit"
  ) as GenerationResult;

  return JSON.parse(cleanJson(response.text || "{}"));
};

export const generateScriptThreeStep = async (
  topic: string,
  styleProfile: StyleProfile,
  language: string = 'en',
  modelName: string = ModelType.SCRIPTING
): Promise<ScriptOutput> => {
  const provider = providerFromModelName(modelName);
  const ai = getAIAdapter(provider);

  // Determine actual duration from styleProfile
  const actualDurationSec = styleProfile.meta?.video_duration_sec || (styleProfile as any).sourceDuration || 60;

  // Step 2a
  const step2aOutput = await executeStep2a(ai, modelName, topic, styleProfile, language, actualDurationSec);

  let step2bOutput: Step2bOutput | null = null;
  let step3Output: Step3Output | null = null;
  let revisionInstructions = "";
  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  while (attempts < MAX_ATTEMPTS) {
    try {
      // Step 2b
      const newStep2bOutput = await executeStep2b(ai, modelName, topic, styleProfile, step2aOutput, language, revisionInstructions);
      step2bOutput = newStep2bOutput; // only update if successful

      // Manually validate constraints (don't trust LLM boolean entirely, but use it as a signal)
      const minWords = parseInt(step2aOutput.calibration.target_word_count_min, 10);
      const maxWords = parseInt(step2aOutput.calibration.target_word_count_max, 10);
      
      // Use manual count for reliability
      const actualWords = countWords(step2bOutput.script);
      const llmReportedLength = step2bOutput.total_length || step2bOutput.constraint_compliance?.total_length || 0;
      const llmWithinRange = step2bOutput.constraint_compliance?.within_target_range;

      const isManualWithinRange = actualWords >= minWords && actualWords <= maxWords;

      console.log(`[Step 2b Check] Manual Count: ${actualWords}, LLM Reported: ${llmReportedLength}, Target: ${minWords}-${maxWords}`);
      console.log(`[Step 2b Check] Manual Pass: ${isManualWithinRange}, LLM Pass: ${llmWithinRange}`);

      if (!isManualWithinRange) {
        console.log(`[Step 2b Check] Constraint failed (Manual count). Retrying...`);
        
        const diff = actualWords < minWords ? minWords - actualWords : actualWords - maxWords;
        const direction = actualWords < minWords ? "增加" : "减少";
        
        revisionInstructions = `当前总字数：${actualWords}，目标范围：${minWords}-${maxWords}
你需要${direction}约 ${diff + 10} 个字。
请在 Stage 2 和 Stage 3 各${direction} 1-2 句，不要改变其他已满足的约束。
注意：字数统计包含所有字符和标点。`;
        
        attempts++;
        continue; // Loop back to Step 2b
      }
      
      // Step 3
      const newStep3Output = await executeStep3(ai, modelName, styleProfile, step2bOutput.script, styleProfile.fullTranscript || "");
      step3Output = newStep3Output;

      if (step3Output.final_verdict === "APPROVED") {
        break;
      } else {
        revisionInstructions = step3Output.revision_instructions || "Please fix the identified issues.";
        attempts++;
      }
    } catch (e: any) {
      console.warn(`[Step 2b/3] Attempt ${attempts + 1} failed:`, e);
      if (step2bOutput) {
        console.warn(`[Step 2b/3] Falling back to previous successful output.`);
        break; // break out of the loop and use the previous step2bOutput
      } else {
        // First attempt failed, we must retry or throw
        attempts++;
        if (attempts >= MAX_ATTEMPTS) throw e;
        continue;
      }
    }
  }

  if (!step2bOutput) throw new Error("Script generation failed.");

  // Use approved script if available, otherwise fall back to step2b script
  const finalScriptText = step3Output?.approved_script || step2bOutput.script;

  /* ─────────────────────────────────────────────────────────────────
   * Fact-to-sentence mapping
   *
   * Each verified_fact from Step 2a carries:
   *   fact_id (number), content (string), source_marker (string),
   *   recommended_stage (string), visual_potential (string)
   *
   * Each sentence in sentence_list carries:
   *   index, text, length, stage, has_metaphor, visual_note
   *
   * Three-tier matching in descending confidence order:
   *
   *   Tier 1 — source_marker hit (VERBATIM)
   *     The sentence contains the fact's source_marker phrase
   *     (e.g. "研究显示", "据统计", "scientists found").
   *     Strongest signal: the sentence is directly citing that fact.
   *
   *   Tier 2 — content keyword hit (PARAPHRASE)
   *     Content-nouns extracted from fact.content appear in the sentence.
   *     Extracts tokens ≥ 4 chars (CJK 2-char threshold) to avoid
   *     stop-word false positives.
   *
   *   Tier 3 — stage recommendation match (REFERENCED)
   *     fact.recommended_stage matches sentence.stage exactly.
   *     Weakest signal — used only when no stronger match exists.
   *
   * A sentence may reference multiple facts (e.g. stage + keyword both
   * match different facts).  Each match is recorded separately.
   * ───────────────────────────────────────────────────────────────── */

  // Normalise fact IDs to strings for consistency with FactUsage.factId (string)
  type VerifiedFact = Step2aOutput['verified_facts'][number];
  const factById = new Map<string, VerifiedFact>();
  for (const fact of step2aOutput.verified_facts) {
    factById.set(String(fact.fact_id), fact);
  }

  /**
   * Extract content-keywords from a fact's content string.
   * For Chinese: tokens of ≥ 2 Han characters.
   * For Latin-script: tokens of ≥ 4 characters, lower-cased.
   */
  const extractKeywords = (content: string): string[] => {
    const hanTokens = content.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
    const latinTokens = content.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    return [...hanTokens, ...latinTokens];
  };

  /**
   * Match a single sentence against all verified_facts.
   * Returns an array of { factId, mode } pairs (may be empty).
   */
  const matchFactsForSentence = (
    sentenceText: string,
    sentenceStage: string,
  ): { factId: string; mode: 'verbatim' | 'paraphrase' | 'referenced' }[] => {
    const lower = sentenceText.toLowerCase();
    const results: { factId: string; mode: 'verbatim' | 'paraphrase' | 'referenced' }[] = [];

    for (const [fid, fact] of factById) {
      // Tier 1: source_marker hit
      if (fact.source_marker && sentenceText.includes(fact.source_marker)) {
        results.push({ factId: fid, mode: 'verbatim' });
        continue; // strongest match found — skip weaker tiers for this fact
      }

      // Tier 2: content-keyword hit
      const keywords = extractKeywords(fact.content);
      const hasKeyword = keywords.some(kw => lower.includes(kw.toLowerCase()));
      if (hasKeyword) {
        results.push({ factId: fid, mode: 'paraphrase' });
        continue;
      }

      // Tier 3: recommended_stage match (only if no stronger match already recorded)
      if (
        fact.recommended_stage &&
        sentenceStage &&
        fact.recommended_stage.trim().toLowerCase() === sentenceStage.trim().toLowerCase()
      ) {
        results.push({ factId: fid, mode: 'referenced' });
      }
    }

    return results;
  };

  // Build per-scene fact attribution
  const scenes = step2bOutput.sentence_list.map((s: any) => {
    const matches = matchFactsForSentence(s.text ?? '', s.stage ?? '');

    const assignedFactIDs = [...new Set(matches.map(m => m.factId))];
    const factUsage = matches.map(m => ({
      factId: m.factId,
      mode: m.mode,
      excerpt: s.text?.substring(0, 80) ?? '', // first 80 chars as excerpt for audit trail
      source: factById.get(m.factId)?.source_marker ?? '',
    }));

    return {
      beatId: `S${s.index}`,
      header: s.stage,
      script_text: s.text,
      word_count_estimate: s.length,
      assignedFactIDs,
      factUsage,
      inferredClaims: [],
      safetyFlag: false,
      status: 'pass',
      warnings: assignedFactIDs.length === 0 ? ['no_fact_attribution'] : [],
      visualPrompt: s.visual_note,
    };
  });

  // Roll up unique fact IDs and usage records to the top-level ScriptOutput
  const allFactUsageMap = new Map<string, { factId: string; usageType: 'verbatim' | 'paraphrase' | 'referenced'; sectionTitle: string }>();
  for (const scene of scenes) {
    for (const fu of scene.factUsage) {
      // Keep the strongest mode seen for each factId across all sentences
      const existing = allFactUsageMap.get(fu.factId);
      const modeRank = { verbatim: 0, paraphrase: 1, referenced: 2 };
      if (!existing || modeRank[fu.mode] < modeRank[existing.usageType]) {
        allFactUsageMap.set(fu.factId, {
          factId: fu.factId,
          usageType: fu.mode,
          sectionTitle: scene.header ?? '',
        });
      }
    }
  }

  const topLevelFactUsage = Array.from(allFactUsageMap.values());
  const topLevelUsedFactIDs = topLevelFactUsage.map(fu => fu.factId);

  // Build sourceMetadata from verified_facts for downstream audit
  const sourceMetadata: Record<string, { source: string; url?: string }> = {};
  for (const [fid, fact] of factById) {
    sourceMetadata[fid] = { source: fact.source_marker ?? 'unknown' };
  }

  return {
    scriptText: finalScriptText,
    scenes,
    totalWordCount: step2bOutput.total_length,
    totalEstimatedDuration: step2aOutput.calibration.new_video_target_duration_sec,
    styleConsistency: {
      score: step3Output?.audit_3_style.overall_status === 'PASS' ? 1.0 : 0.5,
      feedback: JSON.stringify(step3Output?.audit_3_style.stage_ratings),
      status: step3Output?.audit_3_style.overall_status === 'PASS' ? 'pass' : 'warn',
      isDeviation: step3Output?.audit_3_style.overall_status !== 'PASS'
    },
    requiresManualCorrection: step3Output?.final_verdict !== "APPROVED",
    pendingDiffs: [],
    _meta: { sanitizedMap: {} },
    _step2a: step2aOutput,
    _step2b: step2bOutput,
    usedFactIDs: topLevelUsedFactIDs,
    factUsage: topLevelFactUsage,
    inferredClaims: [],
    sourceMetadata,
    safetyMetadata: { isHighRisk: false, riskCategories: [], softenedWordingApplied: false, numericWarnings: [] },
    constraintCompliance: step2bOutput.constraint_compliance,
    auditResult: step3Output || undefined,
    calibration: step2aOutput.calibration
  };
};