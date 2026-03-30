// src/services/production.ts
import { StyleProfile, ModelType } from "../types";
import { getAIAdapter } from "./core";
import { withRetry, wait, getBase64FromUrl, withQuotaFallback } from "../lib/utils";
import { IMAGE_NEBULA } from "../config/constants";
import { Logger } from "../lib/logger";

/**
 * Production helpers: generateReferenceSheet, generateSceneImage, generateSceneVideoWithKeyframe
 *
 * Goals:
 * - Use styleProfile.visualStyle, colorPalette and keyElements to build strong prompts
 * - Robust fallback on model/network failures
 * - Clear progress updates and logging
 * - Safe handling of base64 extraction and T2V fallback
 */

/* ----------------------
   Utility: validate/clean palette
   ---------------------- */
const isHex = (s: string) => /^#([0-9A-F]{6})$/i.test(s);
const cleanPalette = (palette: any): string[] => {
  if (!Array.isArray(palette)) return [];
  return palette.filter((c: any) => typeof c === 'string' && isHex(c)).slice(0, 8);
};

/* ----------------------
   generateReferenceSheet
   ---------------------- */
export const generateReferenceSheet = async (
  topic: string,
  styleProfile: StyleProfile,
  aspectRatio: string = "16:9",
  modelName: string = ModelType.IMAGE_GEN,
  onProgress?: (msg: string) => void
): Promise<string> => {
  const ai = getAIAdapter(); // adapter decides provider
  onProgress?.("Generating reference sheet...");

  const palette = cleanPalette(styleProfile?.track_b_visual?.color_grading?.split(',') || styleProfile?.colorPalette || []);
  const keyElements = Array.isArray(styleProfile?.keyElements) ? styleProfile.keyElements.join(', ') : '';
  const fp = styleProfile?.styleFingerprint || '';

  const promptParts: string[] = [];
  promptParts.push(`Character / Reference Sheet for "${topic}".`);
  if (styleProfile?.track_b_visual?.base_medium || styleProfile?.visualStyle) promptParts.push(`Visual style: ${styleProfile?.track_b_visual?.base_medium || styleProfile?.visualStyle}.`);
  if (palette.length) promptParts.push(`Palette: ${palette.join(', ')}.`);
  if (keyElements) promptParts.push(`Key elements: ${keyElements}.`);
  if (fp) promptParts.push(`Style fingerprint: ${fp}.`);
  promptParts.push(`Aspect ratio: ${aspectRatio}. Provide a single high-quality reference image URL as output.`);

  const prompt = promptParts.join(' ');

  // Try primary model with retry + fallback chain
  try {
    const result = await withQuotaFallback(
      (model) => ai.generateImage(model, prompt, aspectRatio),
      modelName,
      ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'],
      "RefSheet"
    );
    onProgress?.("Reference sheet generated.");
    return result.imageUrl || result.base64 || '';
  } catch (err) {
    Logger.warn("Reference sheet generation ultimately failed", err);
    onProgress?.("Reference sheet generation failed — using placeholder.");
    return IMAGE_NEBULA;
  }
};

/* ----------------------
   generateSceneImage
   ---------------------- */
export const generateSceneImage = async (
  visualPrompt: string,
  aspectRatio: string = "16:9",
  fastMode: boolean = false,
  referenceSheetUrl?: string,
  styleProfile?: StyleProfile,
  topic?: string,
  lowQualityMode: boolean = false,
  modelName: string = ModelType.IMAGE_GEN,
  onProgress?: (msg: string) => void
): Promise<string> => {
  const ai = getAIAdapter();
  onProgress?.("Generating scene image...");

  // Build enriched prompt
  const palette = cleanPalette(styleProfile?.track_b_visual?.color_grading?.split(',') || styleProfile?.colorPalette || []);
  const keyElements = Array.isArray(styleProfile?.keyElements) ? styleProfile.keyElements.join(', ') : '';
  const fingerprint = styleProfile?.styleFingerprint ? `Fingerprint: ${styleProfile.styleFingerprint}.` : '';
  const anchorNote = referenceSheetUrl ? `Use reference sheet as anchor: ${referenceSheetUrl}.` : '';
  const toneNote = styleProfile?.track_a_script?.emotional_tone_arc || styleProfile?.tone ? `Tone: ${styleProfile?.track_a_script?.emotional_tone_arc || styleProfile?.tone}.` : '';

  // Compose final prompt
  let fullPrompt = `${visualPrompt}\n${fingerprint}\n${toneNote}\n${anchorNote}\nStyle: ${styleProfile?.track_b_visual?.base_medium || styleProfile?.visualStyle || 'unspecified'}.\n`;
  if (styleProfile?.track_b_visual?.lighting_style?.description) fullPrompt += `Lighting: ${styleProfile.track_b_visual.lighting_style.description}.\n`;
  if (styleProfile?.track_b_visual?.composition) fullPrompt += `Composition: ${styleProfile.track_b_visual.composition}.\n`;
  if (palette.length) fullPrompt += `Palette: ${palette.join(', ')}.\n`;
  if (keyElements) fullPrompt += `Key Elements: ${keyElements}.\n`;
  if (topic) fullPrompt += `Topic: ${topic}.\n`;
  fullPrompt += `Aspect ratio: ${aspectRatio}. Produce a high-quality image matching the style and palette.`;

  // Choose model for speed/quality
  const primaryModel = (lowQualityMode || fastMode) ? 'gemini-2.5-flash-image' : modelName;

  try {
    const result = await withQuotaFallback(
      (model) => ai.generateImage(model, fullPrompt, aspectRatio),
      primaryModel,
      ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'],
      "SceneImage"
    );
    onProgress?.("Scene image generated.");
    return result.imageUrl || result.base64 || '';
  } catch (err) {
    Logger.error("All image generation attempts failed", err);
    onProgress?.("Image generation failed — using placeholder image.");
    return IMAGE_NEBULA;
  }
};

/* ----------------------
   generateSceneVideoWithKeyframe
   ---------------------- */
export const generateSceneVideoWithKeyframe = async (
  visualPrompt: string,
  existingKeyframeUrl?: string,
  referenceSheetUrl?: string,
  onProgress?: (status: string) => void,
  styleProfile?: StyleProfile,
  topic?: string,
  lowQualityMode: boolean = false,
  videoModelName: string = 'veo-3.1-fast-generate-preview',
  visualModelName: string = ModelType.IMAGE_GEN
): Promise<{ videoUrl: string; keyframeUrl: string }> => {

  const ai = getAIAdapter();
  onProgress?.("Preparing to generate scene video...");

  // 1) Ensure keyframe exists
  let keyframeUrl = existingKeyframeUrl;
  if (!keyframeUrl) {
    onProgress?.("Generating keyframe...");
    try {
      keyframeUrl = await generateSceneImage(visualPrompt, "16:9", false, referenceSheetUrl, styleProfile, topic, lowQualityMode, visualModelName, onProgress);
    } catch (e) {
      Logger.warn("Keyframe generation failed", e);
      keyframeUrl = IMAGE_NEBULA;
    }
  }

  // 2) Try to get base64 for image-to-video pipeline
  onProgress?.("Preparing keyframe for video synthesis...");
  let base64Image: string | undefined = undefined;
  if (keyframeUrl && keyframeUrl !== IMAGE_NEBULA) {
    try {
      base64Image = await getBase64FromUrl(keyframeUrl);
    } catch (e) {
      Logger.warn("Failed to extract base64 from keyframe URL", e);
      base64Image = undefined;
    }
  }

  // 3) Build video generation prompt/options
  const palette = cleanPalette(styleProfile?.track_b_visual?.color_grading?.split(',') || styleProfile?.colorPalette || []);
  const keyElements = Array.isArray(styleProfile?.keyElements) ? styleProfile.keyElements.join(', ') : '';
  const styleNote = styleProfile?.track_b_visual?.base_medium || styleProfile?.visualStyle ? `Style: ${styleProfile?.track_b_visual?.base_medium || styleProfile?.visualStyle}.` : '';
  const toneNote = styleProfile?.track_a_script?.emotional_tone_arc || styleProfile?.tone ? `Tone: ${styleProfile?.track_a_script?.emotional_tone_arc || styleProfile?.tone}.` : '';
  const cameraMotion = styleProfile?.track_b_visual?.camera_motion?.prompt_keywords ? `Camera Motion: ${styleProfile.track_b_visual.camera_motion.prompt_keywords}.` : '';
  const visualAnchor = referenceSheetUrl ? `ReferenceSheet: ${referenceSheetUrl}.` : '';
  const faceRatio = 0; // Defaulting to 0 since inputQuality is removed

  const videoOpts: any = {
    aspectRatio: "16:9",
    style: styleProfile?.track_b_visual?.base_medium || styleProfile?.visualStyle,
    palette,
    keyElements,
    faceRatio,
    topic,
    anchor: referenceSheetUrl
  };

  onProgress?.("Synthesizing motion...");

  // 4) Prefer image-to-video if base64 available; otherwise fallback to text-to-video using visualPrompt
  try {
    let videoUrl: string | undefined;
    if (base64Image) {
      // image-to-video
      const res = await withQuotaFallback(
        (model) => ai.generateVideo(model, `${visualPrompt}\n${cameraMotion}`, { ...videoOpts, image: base64Image }),
        videoModelName,
        ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'],
        "VideoGen-FromImage"
      );
      videoUrl = res.videoUrl || res.base64;
    } else {
      // fallback: use text-to-video path
      const t2vPrompt = `${visualPrompt}\n${cameraMotion}\n${visualAnchor}\n${styleNote}\n${toneNote}\n${keyElements ? `KeyElements: ${keyElements}.` : ''}\n${palette.length ? `Palette: ${palette.join(', ')}.` : ''}\nKeep motion natural and consistent with the reference style.`;
      const res = await withQuotaFallback(
        (model) => ai.generateVideo(model, t2vPrompt, { ...videoOpts }),
        videoModelName,
        ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'],
        "VideoGen-FromText"
      );
      videoUrl = res.videoUrl || res.base64;
    }

    if (!videoUrl) throw new Error("Video model returned empty URL");

    onProgress?.("Video generation complete.");
    return { videoUrl, keyframeUrl: keyframeUrl || "" };
  } catch (err) {
    Logger.error("Video generation failed", err);
    onProgress?.("Video generation failed — returning placeholder keyframe and empty video.");
    return { videoUrl: "", keyframeUrl: keyframeUrl || IMAGE_NEBULA };
  }
};