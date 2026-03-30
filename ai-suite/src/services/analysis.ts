// src/services/analysis.ts
import { Type } from "@google/genai";
import { StyleProfile, ModelType, AIProvider } from "../types";
import { getAIAdapter } from "./core";
import { withRetry, withFallback, withQuotaFallback, fileToGenerativePart, generateVideoThumbnail } from "../lib/utils";
import { Logger } from "../lib/logger";

/**
 * NOTE:
 * This file improves style analysis with:
 * - safety precheck
 * - transcript extracted directly by multimodal LLM (no separate ASR step)
 * - CV fallbacks for color palette & face ratio
 * - evidenceized prompt (timestamps, excerpts, confidence)
 * - extended, strict response schema (keyMoments, suspiciousNumericClaims, nodeConfidence, styleFingerprint, profileVersion)
 * - improved caching with TTL and versioning
 *
 * Dependencies (utils):
 * - extractDominantColors(videoFile, n): Promise<string[]> // returns hex strings
 * - estimateFaceCloseupRatio(videoFile): Promise<number> // 0..1
 *
 * If your project doesn't have these utilities, implement minimal versions or route to a backend service.
 */

const PROFILE_VERSION = "v1.2";
const PROFILE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days TTL

const getLangName = (lang: string) => lang === 'zh' ? 'Chinese (Simplified)' : 'English';

const safeModelKey = (modelName: string) => modelName ? modelName.replace(/[^a-zA-Z0-9]/g, '') : "model";

export const getFileSignature = (file: File, modelName: string): string => {
  const safeModel = safeModelKey(modelName);
  return `style_cache_${PROFILE_VERSION}_${safeModel}_${file.name}_${file.size}_${file.lastModified}`;
};

const now = () => (new Date()).getTime();

/* ---------------------------
   Helper: Cache helpers
   --------------------------- */

export function readCachedProfile(key: string): StyleProfile | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (!doc || !doc.profile || !doc.meta) return null;
    const age = now() - (doc.meta.createdAt || 0);
    if (age > PROFILE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    if (doc.meta.profileVersion !== PROFILE_VERSION) {
      // version mismatch: invalidate
      localStorage.removeItem(key);
      return null;
    }
    return doc.profile as StyleProfile;
  } catch (e) {
    Logger.warn("Cache read error", e);
    return null;
  }
}

export function writeCachedProfile(key: string, profile: StyleProfile, modelName: string) {
  try {
    const doc = {
      profile,
      meta: {
        createdAt: now(),
        profileVersion: PROFILE_VERSION,
        modelName: safeModelKey(modelName)
      }
    };
    localStorage.setItem(key, JSON.stringify(doc));
  } catch (e) {
    Logger.warn("Cache write error", e);
  }
}

/* ---------------------------
   Safety precheck (uses performSafetyCheck below)
   --------------------------- */

export const performSafetyCheck = async (topicOrFilename: string, modelName: string = ModelType.SAFETY): Promise<{ isMedical: boolean; reason: string }> => {
  try {
    const ai = getAIAdapter(AIProvider.GEMINI);
    const response = await withQuotaFallback(
      (model) => ai.generateText(
        model,
        `Is the topic "${topicOrFilename}" related to medical advice, self-harm, or other high-risk personal-health advice? Return EXACT JSON: { "isMedical": boolean, "isSelfHarm": boolean, "reason": string }`,
        { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 512 } }
      ),
      modelName,
      undefined,
      "Safety"
    );
    const parsed = JSON.parse(response.text);
    return { isMedical: !!parsed.isMedical || !!parsed.isSelfHarm, reason: parsed.reason || "" };
  } catch (e) {
    Logger.warn("performSafetyCheck failed, defaulting to non-medical", e);
    return { isMedical: false, reason: "safety check failed" };
  }
};

/* ---------------------------
   Helper: Inference Logic
   --------------------------- */

function inferHookTypeFromKeyMoments(profile: StyleProfile): string | null {
  try {
    const kms = (profile as any).keyMoments || [];
    if (kms.length === 0 && profile.fullTranscript) {
      const firstLine = profile.fullTranscript.split(/\n/).find((l: string) => l.trim().length > 10) || "";
      if (/你.*知道|你可能不知道|你是否知道|Did you know/i.test(firstLine)) return "Question";
      if (/\d+.*(次|%|kg|吨|mL|升|million|billion)/i.test(firstLine)) return "ShockingStat";
      if (firstLine.length > 60) return "Story";
      return null;
    }
    // Use first keyMoment excerpt heuristic
    const first = kms[0];
    if (!first || !first.excerpt) return null;
    const e = first.excerpt;
    if (/你|我们|大家|是否|你知道/i.test(e)) return "Question";
    if (/\d+/.test(e) && /次|%|吨|升|ml|mL|million|billion/i.test(e)) return "ShockingStat";
    if (/哭|医院|濒临|死亡|告别|回光返照/i.test(e)) return "EmotionalScene";
    if (/3D|动画|镜头|特写|close[- ]?up/i.test(e)) return "VisualHook";
    return "Story";
  } catch (err) { return null; }
}

function detectCTAFromTranscript(transcript: string | undefined): string | null {
  if (!transcript) return null;
  const t = transcript.toLowerCase();
  if (/(subscribe|关注|点赞|订阅|follow us|关注我们)/i.test(t)) return "Subscribe";
  if (/(learn more|了解更多|visit|访问|查看链接)/i.test(t)) return "LearnMore";
  if (/(remember|reflect|think about|反思|记住)/i.test(t)) return "Reflect";
  return "None";
}

/* ---------------------------
   Main: analyzeStyle
   --------------------------- */

export const extractStyleWithLLM = async (
  videoFile: File | undefined,
  cvResult: { cvPalette: string[], faceRatio: number },
  language: string = 'en',
  modelName: string = ModelType.ANALYSIS,
  onProgress?: (msg: string) => void
): Promise<StyleProfile> => {
  const provider = AIProvider.GEMINI;
  const ai = getAIAdapter(provider);
  const targetLang = getLangName(language);
  const { cvPalette, faceRatio } = cvResult;

  // 3) Prepare videoPart for multimodal LLM input
  onProgress?.("📤 Preparing multimodal input for analysis...");
  let videoPart: any = null;
  if (videoFile) {
      try {
        const uploaded = await ai.uploadFile?.(videoFile).catch(() => null);
        if (uploaded && uploaded.uri) {
          videoPart = { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } };
        } else if (videoFile.size < 20 * 1024 * 1024) {
          const inline = await fileToGenerativePart(videoFile);
          videoPart = inline;
        } else {
          const thumb = await generateVideoThumbnail(videoFile);
          const base64 = thumb.thumbnail.split(',')[1];
          videoPart = { inlineData: { data: base64, mimeType: 'image/jpeg' } };
        }
      } catch (e) {
        Logger.warn("Video part preparation failed, attempting thumbnail fallback", e);
        const thumb = await generateVideoThumbnail(videoFile);
        const base64 = thumb.thumbnail.split(',')[1];
        videoPart = { inlineData: { data: base64, mimeType: 'image/jpeg' } };
      }
  }

  // --- STAGE 1: SELF-ASSESSMENT (text-only, no video needed) ---
  onProgress?.("🤔 Running capability self-assessment...");
  let assessmentText = "";
  try {
    const { ANALYSIS_SELF_ASSESSMENT_PROMPT } = await import("../config/prompts");
    const assessmentResp = await withQuotaFallback(
      (model) => ai.generateText(model, ANALYSIS_SELF_ASSESSMENT_PROMPT, {
        thinkingConfig: model.includes('pro') ? { thinkingBudget: 1024 } : undefined,
      }),
      modelName,
      undefined,
      "Analysis Self-Assessment"
    );
    assessmentText = assessmentResp.text || "";
    Logger.info("Self-Assessment Result:", assessmentText);
  } catch (e) {
    Logger.warn("Self-assessment failed, proceeding to direct extraction", e);
  }

  // 4) Build recommended, strict responseSchema (merged & structured)
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      meta: {
        type: Type.OBJECT,
        properties: {
          video_language: { type: Type.STRING },
          video_duration_sec: { type: Type.NUMBER },
          video_type: { type: Type.STRING }
        }
      },
      track_a_script: {
        type: Type.OBJECT,
        properties: {
          _purpose: { type: Type.STRING },
          hook_strategy: { type: Type.STRING },
          hook_strategy_note: { type: Type.STRING },
          hook_example: { type: Type.STRING },
          narrative_arc: { type: Type.ARRAY, items: { type: Type.STRING } },
          rhetorical_core: { type: Type.ARRAY, items: { type: Type.STRING } },
          sentence_length: {
            type: Type.OBJECT,
            properties: {
              unit: { type: Type.STRING },
              avg: { type: Type.NUMBER },
              max: { type: Type.NUMBER },
              max_context: { type: Type.STRING },
              per_scene_range: { type: Type.STRING }
            }
          },
          emotional_tone_arc: { type: Type.STRING },
          metaphor_count: { type: Type.NUMBER },
          jargon_treatment: { type: Type.STRING },
          interaction_cues_count: { type: Type.NUMBER },
          interaction_cues_note: { type: Type.STRING },
          cta_structure: { type: Type.STRING },
          total_words: { type: Type.NUMBER }
        }
      },
      track_b_visual: {
        type: Type.OBJECT,
        properties: {
          _purpose: { type: Type.STRING },
          base_medium: { type: Type.STRING },
          color_grading: { type: Type.STRING },
          lighting_style: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              confidence: { type: Type.STRING }
            }
          },
          camera_motion: {
            type: Type.OBJECT,
            properties: {
              dominant: { type: Type.STRING },
              prompt_keywords: { type: Type.STRING },
              confidence: { type: Type.STRING }
            }
          },
          composition: { type: Type.STRING },
          scene_avg_duration_sec: { type: Type.NUMBER },
          estimated_total_scenes: { type: Type.NUMBER },
          visual_cue_trigger: { type: Type.ARRAY, items: { type: Type.STRING } },
          visual_metaphor_mapping: {
            type: Type.OBJECT,
            properties: {
              _importance: { type: Type.STRING },
              rule: { type: Type.STRING },
              examples: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    concept: { type: Type.STRING },
                    metaphor_visual: { type: Type.STRING }
                  }
                }
              }
            }
          },
          b_roll_integration: {
            type: Type.OBJECT,
            properties: {
              has_live_action: { type: Type.BOOLEAN },
              ratio: {
                type: Type.OBJECT,
                properties: {
                  "3d_animation_pct": { type: Type.NUMBER },
                  live_action_pct: { type: Type.NUMBER }
                }
              },
              live_action_trigger: { type: Type.STRING },
              live_action_style: { type: Type.STRING }
            }
          }
        }
      },
      track_c_audio: {
        type: Type.OBJECT,
        properties: {
          _purpose: { type: Type.STRING },
          genre: { type: Type.STRING },
          instrumentation: { type: Type.STRING },
          tempo_dynamics: { type: Type.STRING },
          mood: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              confidence: { type: Type.STRING }
            }
          },
          bgm_relative_volume: {
            type: Type.OBJECT,
            properties: {
              _purpose: { type: Type.STRING },
              hook_stage: { type: Type.STRING },
              body_stage: { type: Type.STRING },
              climax_stage: { type: Type.STRING },
              cta_stage: { type: Type.STRING }
            }
          },
          audio_visual_sync_points: {
            type: Type.OBJECT,
            properties: {
              _purpose: { type: Type.STRING },
              climax_timestamp_ratio: { type: Type.NUMBER },
              transition_points: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timestamp_ratio: { type: Type.NUMBER },
                    description: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      },
      // New: Capture overall confidence map
      nodeConfidence: {
        type: Type.OBJECT,
        additionalProperties: { type: Type.STRING }, // Map<string, 'confident'|'inferred'|'guess'>
        description: "Map of field names to confidence levels based on self-assessment"
      },
      // Full verbatim transcript extracted directly from video audio
      full_transcript: { type: Type.STRING }
    }
  };

  // 5) Build improved prompt for evidenceized extraction

  const evidencePrompt = `
You are a StyleDNA extractor for a 3D animated science explainer video
replication system.

Your extracted parameters will be consumed by FOUR downstream tools:
- A text LLM (script generation)
- An image generation model + a video generation model (3D animation)
- A music generation model (background music)
- FFmpeg (final assembly and sync)

All visual and audio field values must be written as English prompt
keywords directly usable by these generation models.

Analyze this video and extract ALL fields below with maximum precision.

CRITICAL RULES:
1. Output strictly valid JSON only. No markdown, no explanation, no preamble.
   First character must be { and last character must be }
2. For fields you are confident about: extract precisely
3. For fields that require inference: extract your best estimate and add
   "confidence": "inferred" to that object
4. Language unit rule:
   - Chinese video → count characters (字) for all length measurements
   - English video → count words for all length measurements
5. hook_strategy must be exactly ONE value from the enum list.
   If the hook combines two strategies, pick the dominant one and
   describe the secondary in hook_strategy_note.
6. For total_words: DO NOT estimate. Listen to the full video and count
   every spoken character or word in the actual transcript, including
   all filler phrases, transitional words, and repeated structures.
   The number must reflect what is actually spoken, not a condensed version.

${assessmentText ? `
─────────────────────────────────────────────────────────────
YOUR SELF-ASSESSMENT
─────────────────────────────────────────────────────────────
You previously assessed your own capabilities for this video:
${assessmentText}

INSTRUCTION:
Reflect on your assessment above.
- If you marked a field as "inferred" or "guess", explicitly mark it as such in the output JSON.
- If you identified any BLIND SPOTS in Q5 that map to the schema, ensure they are captured in the relevant open fields (e.g. notes).
` : ''}

─────────────────────────────────────────────────────────────
OUTPUT JSON SCHEMA
─────────────────────────────────────────────────────────────

{
  "meta": {
    "video_language": "Chinese or English",
    "video_duration_sec": integer,
    "video_type": "3D-animation-only or mixed-3D-and-liveaction"
  },

  "track_a_script": {
    "_purpose": "Hard constraints for script generation LLM",

    "hook_strategy": "Pick EXACTLY ONE: counter-intuitive / data-shock /
                      pain-point / scenario-immersion / humor-narrative /
                      other:[describe in one phrase]",

    "hook_strategy_note": "Optional. If hook combines multiple strategies,
                           describe the secondary strategy here.",

    "hook_example": "Exact first 3 sentences from video in original language",

    "narrative_arc": [
      "stage 1 name",
      "stage 2 name",
      "stage 3 name",
      "stage 4 name",
      "stage 5 name if applicable"
    ],

    "rhetorical_core": [
      "rhetorical device 1 e.g. second-person address (你)",
      "rhetorical device 2 e.g. extreme data contrast",
      "rhetorical device 3 e.g. radical personification"
    ],

    "sentence_length": {
      "unit": "characters or words",
      "avg": integer,
      "max": integer,
      "max_context": "Describe which narrative stage allows the max length.
                      e.g. max 35 only in stage 4 tragic climax,
                      all other stages max 25",
      "per_scene_range": "normal scene range e.g. 10-25 characters"
    },

    "emotional_tone_arc": "Map emotions to narrative_arc stages using →
                           e.g. solemn-scientific → epic-struggle →
                           tragic-grand → warm-healing",

    "metaphor_count": integer,

    "jargon_treatment": "Pick one: plain-language-only /
                         keep-key-terms-with-explanation / jargon-heavy",

    "interaction_cues_count": integer,

    "interaction_cues_note": "If count is 0, state whether this is
                              intentional to the original video style.
                              e.g. original video has no interaction cues,
                              override with 1 cue before CTA when publishing
                              to algorithm-driven platforms such as
                              Douyin or WeChat Channels",

    "cta_structure": "Exact sentence pattern of ending call-to-action
                      in original language",

    "total_words": "integer. COUNT every spoken character or word in the
                   actual transcript. Do not estimate from duration.
                   Include all transitional phrases and filler words."
  },

  "track_b_visual": {
    "_purpose": "Hard constraints for image and video generation models",

    "base_medium": "3-5 English keywords defining the fundamental visual
                    medium. Directly usable as image generation prompt prefix.
                    e.g. 3D medical animation, high-fidelity CGI,
                    macro photography aesthetic",

    "color_grading": "English keywords for color palette and grading.
                      Appended to EVERY image and video generation prompt
                      as style lock. e.g. dark background, glowing red
                      and electric blue, high contrast,
                      cinematic color grading",

    "lighting_style": {
      "description": "English keywords for lighting setup.
                      Directly usable in image generation prompt.
                      e.g. dramatic volumetric light, rim lighting,
                      glowing subsurface scattering",
      "confidence": "observed or inferred"
    },

    "camera_motion": {
      "dominant": "Pick one: push-in / pull-out / orbit / static / mixed",
      "prompt_keywords": "English motion keywords for video generation prompt.
                          e.g. slow cinematic push-in, subtle rotation,
                          smooth depth-of-field transition",
      "confidence": "observed or inferred"
    },

    "composition": "English keywords for subject framing.
                    Directly usable in image generation prompt.
                    e.g. center-focused, extreme macro close-up,
                    microscopic scale",

    "scene_avg_duration_sec": integer,

    "estimated_total_scenes": "integer. Calculate as:
                               video_duration_sec divided by
                               scene_avg_duration_sec",

    "visual_cue_trigger": [
      "condition 1 e.g. whenever a specific statistic is stated",
      "condition 2 e.g. at each narrative stage transition",
      "condition 3 if applicable"
    ],

    "visual_metaphor_mapping": {
      "_importance": "CRITICAL. This field will be inserted verbatim
                      into the scene decomposition system prompt",
      "rule": "One sentence describing the metaphor logic.
               e.g. abstract biological processes are always visualized
               as glowing cosmic entities or epic battlefields,
               never as literal gross anatomy",
      "examples": [
        {
          "concept": "original concept from the video",
          "metaphor_visual": "how it was actually visualized"
        },
        {
          "concept": "concept 2",
          "metaphor_visual": "visualization 2"
        }
      ]
    },

    "b_roll_integration": {
      "has_live_action": "true or false",
      "ratio": {
        "3d_animation_pct": integer,
        "live_action_pct": integer
      },
      "live_action_trigger": "Describe which narrative moments trigger
                              live-action footage instead of 3D animation.",
      "live_action_style": "Describe the visual style of live-action segments.
                            e.g. desaturated, slow motion,
                            close-up human reactions, dramatic shadows"
    }
  },

  "track_c_audio": {
    "_purpose": "Hard constraints for music generation model and FFmpeg",

    "genre": "English genre keywords directly usable in music generation prompt.
              e.g. cinematic orchestral, epic documentary soundtrack",

    "instrumentation": "English instrument keywords directly usable in
                        music generation prompt. e.g. deep sub-bass,
                        slow string swells, ambient synth pads,
                        distant choir, solo piano",

    "tempo_dynamics": "English dynamic arc keywords for music generation prompt.
                       e.g. slow build-up, steady rhythmic pulse,
                       grand climax, abrupt pause, gentle piano resolution",

    "mood": {
      "description": "English mood keywords for music generation prompt.
                      e.g. solemn, awe-inspiring, tragic yet hopeful",
      "confidence": "observed or inferred"
    },

    "intensity": "Integer 1-5. 1 is very calm/ambient, 5 is extremely intense/epic.",

    "bgm_relative_volume": {
      "_purpose": "FFmpeg audio mixing levels per narrative stage",
      "hook_stage": "percentage e.g. 30%",
      "body_stage": "percentage e.g. 50%",
      "climax_stage": "percentage e.g. 80%",
      "cta_stage": "percentage e.g. 20%"
    },

    "audio_visual_sync_points": {
      "_purpose": "FFmpeg BGM alignment with video emotional peaks",
      "climax_timestamp_ratio": "Float 0-1. Where the emotional peak occurs
                                  as a ratio of total duration.",
      "transition_points": [
        {
          "timestamp_ratio": "Float 0-1",
          "description": "what happens at this point musically"
        }
      ]
    }
  },

  "nodeConfidence": {
    "visualStyle": "confident or inferred",
    "tone": "confident or inferred",
    "pacing": "confident or inferred",
    "audioStyle": "confident or inferred",
    "scriptStyle": "confident or inferred"
  }

}

Return EXACTLY one JSON object that matches the schema. Output Language: ${targetLang}.
CV Metadata (if available): ${JSON.stringify({ faceRatio })}

IMPORTANT: For the "full_transcript" field, listen to the entire video audio and output the
complete verbatim transcript of all spoken words. Do NOT summarize. Do NOT truncate.
  `.trim();

  // 6) Call the model (with fallback)
  onProgress?.("🤖 Running multimodal LLM analysis (Stage 2)...");
  let responseText: string | null = null;
  try {
    const response = await withQuotaFallback(
      (model) => ai.generateText(model, [videoPart, { text: evidencePrompt }], {
        responseMimeType: "application/json",
        thinkingConfig: model.includes('pro') ? { thinkingBudget: 2048 } : undefined,
        responseSchema
      }),
      modelName,
      undefined,
      "Analysis"
    );
    responseText = response.text;
  } catch (e) {
    Logger.warn("LLM analysis failed, trying simplified prompt", e);
    // Try a safer fallback prompt without heavy schema constraints
    const fallbackResp = await withQuotaFallback(
      (model) => ai.generateText(model, `Analyze video style briefly and return JSON with meta, track_a_script, track_b_visual, and track_c_audio. Output Language: ${targetLang}.`, { responseMimeType: "application/json" }),
      modelName,
      undefined,
      "Analysis Fallback"
    );
    responseText = fallbackResp.text;
  }

  // 7) Parse and postprocess result
  let profile: StyleProfile;
  try {
    const parsed = JSON.parse(responseText || "{}");
    const fullTranscript = parsed.full_transcript || "";
    
    // Map the new schema back to the old StyleProfile fields to prevent breaking downstream code
    profile = {
      // Keep the new tracks
      meta: parsed.meta,
      track_a_script: parsed.track_a_script,
      track_b_visual: parsed.track_b_visual,
      track_c_audio: parsed.track_c_audio,
      
      // Map to old fields
      visualStyle: parsed.track_b_visual?.base_medium || "unspecified",
      pacing: parsed.track_a_script?.sentence_length?.avg < 15 ? "fast" : "medium",
      tone: parsed.track_a_script?.emotional_tone_arc || "neutral",
      colorPalette: parsed.track_b_visual?.color_grading ? parsed.track_b_visual.color_grading.split(',').map((s: string) => s.trim()) : [],
      targetAudience: "general_adult",
      keyElements: [],
      pedagogicalApproach: "informal",
      narrativeStructure: parsed.track_a_script?.narrative_arc || ["Hook","Body","Conclusion"],
      scriptStyle: parsed.track_a_script?.jargon_treatment || "conversational",
      fullTranscript: fullTranscript,
      wordCount: parsed.track_a_script?.total_words || (fullTranscript ? fullTranscript.split(/\s+/).length : 0),
      wordsPerMinute: parsed.track_a_script?.total_words && parsed.meta?.video_duration_sec ? Math.round((parsed.track_a_script.total_words / parsed.meta.video_duration_sec) * 60) : 160,
      sourceFactCount: 0,
      hookType: parsed.track_a_script?.hook_strategy || "Unknown",
      callToActionType: parsed.track_a_script?.cta_structure ? "Other" : "None",
      narrativeArchetype: "unknown",
      emotionalIntensity: 3,
      keyMoments: [],
      nodeConfidence: {},
      suspiciousNumericClaims: [],
      styleFingerprint: "unknown",
      profileVersion: PROFILE_VERSION,
      audioStyle: {
        genre: parsed.track_c_audio?.genre || "",
        mood: parsed.track_c_audio?.mood?.description || "",
        tempo: parsed.track_c_audio?.tempo_dynamics || "",
        intensity: parsed.track_c_audio?.intensity || 3,
        instrumentation: parsed.track_c_audio?.instrumentation ? parsed.track_c_audio.instrumentation.split(',').map((s: string) => s.trim()) : []
      }
    } as unknown as StyleProfile;
  } catch (e) {
    Logger.error("Failed to parse analysis JSON", e);
    // Minimal fallback to ensure downstream continues
    profile = {
      visualStyle: "unspecified",
      pacing: "medium",
      tone: "neutral",
      colorPalette: ['#000000','#333333','#666666','#999999','#CCCCCC'],
      targetAudience: "general_adult",
      keyElements: [],
      pedagogicalApproach: "informal",
      narrativeStructure: ["Hook","Body","Conclusion"],
      scriptStyle: "conversational",
      fullTranscript: "",
      wordCount: 0,
      wordsPerMinute: 160,
      sourceFactCount: 0,
      hookType: "Unknown",
      callToActionType: "None",
      narrativeArchetype: "unknown",
      emotionalIntensity: 3,
      keyMoments: [],
      nodeConfidence: {},
      suspiciousNumericClaims: [],
      styleFingerprint: "unknown",
      profileVersion: PROFILE_VERSION
    } as unknown as StyleProfile;
  }

  // --- Postprocessing inference for hookType and callToActionType (fallbacks) ---
  if (!(profile as any).hookType || (profile as any).hookType === "N/A" || (profile as any).hookType === "") {
    const inferred = inferHookTypeFromKeyMoments(profile);
    (profile as any).hookType = inferred || "Unknown";
    (profile as any).nodeConfidence = (profile as any).nodeConfidence || {};
    (profile as any).nodeConfidence.hookType = inferred ? 0.6 : 0.2; // mark low/medium confidence
  }

  if (!(profile as any).callToActionType || (profile as any).callToActionType === "N/A" || (profile as any).callToActionType === "") {
    const inferredCTA = detectCTAFromTranscript((profile as any).fullTranscript);
    (profile as any).callToActionType = inferredCTA || "None";
    (profile as any).nodeConfidence = (profile as any).nodeConfidence || {};
    (profile as any).nodeConfidence.callToActionType = inferredCTA === "None" ? 0.9 : 0.5;
  }

  // ensure arrays and defaults
  profile.colorPalette = Array.isArray(profile.colorPalette) && profile.colorPalette.length > 0
    ? profile.colorPalette
    : ['#000000','#333333','#666666','#999999','#CCCCCC'];

  profile.keyElements = Array.isArray(profile.keyElements) ? profile.keyElements : [];
  profile.narrativeStructure = Array.isArray(profile.narrativeStructure) ? profile.narrativeStructure : [];
  profile.keyMoments = Array.isArray((profile as any).keyMoments) ? (profile as any).keyMoments : [];
  (profile as any).nodeConfidence = (profile as any).nodeConfidence || {};
  (profile as any).suspiciousNumericClaims = Array.isArray((profile as any).suspiciousNumericClaims) ? (profile as any).suspiciousNumericClaims : [];

  // Attach Input Quality metadata
  // Removed inputQuality as requested
  
  // If styleFingerprint not provided, synthesize one
  if (!profile.styleFingerprint) {
    const fpBase = `${(profile.visualStyle || "vs").slice(0,12)}-${(profile.tone || "t").slice(0,6)}-${(profile.pacing || "p").slice(0,6)}`;
    profile.styleFingerprint = `${fpBase}-${PROFILE_VERSION}`;
  }

  profile.profileVersion = PROFILE_VERSION;

  // write cache
  // writeCachedProfile(cacheKey, profile, modelName);

  onProgress?.("✅ Style analysis complete.");
  return profile;
};