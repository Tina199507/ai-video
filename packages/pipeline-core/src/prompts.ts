/* ------------------------------------------------------------------ */
/*  Prompt templates — compiler frontend instruction set               */
/*                                                                     */
/*  Actual prompt bodies live under `data/prompts/*.md` and are loaded */
/*  at runtime via `promptsLoader`.  This file still exists so the     */
/*  downstream call-sites (and their tests) keep their static imports  */
/*  —  `import { STYLE_EXTRACTION_PROMPT } from './prompts.js'` — and  */
/*  so does `fillTemplate` since every caller relies on it.            */
/*                                                                     */
/*  Users can shadow any bundled prompt by writing                     */
/*  `<data-dir>/prompts/<name>.md`.  See `src/pipeline/promptsLoader`. */
/* ------------------------------------------------------------------ */

import { getPrompt } from './promptsLoader.js';

/**
 * Template substitution helper.
 * Replaces {key} placeholders with values from the vars object.
 */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{${k}}`, String(v));
  }
  return result;
}

/* ---- Re-exports ---- */
/* Each constant resolves lazily via getPrompt(name), so overrides +   */
/* cache invalidation always take effect.                              */

export const ANALYSIS_SELF_ASSESSMENT_PROMPT = /* @__PURE__ */ getPrompt('analysis-self-assessment');
export const STYLE_EXTRACTION_PROMPT = /* @__PURE__ */ getPrompt('style-extraction');
export const RESEARCH_PROMPT = /* @__PURE__ */ getPrompt('research');
export const CALIBRATION_PROMPT = /* @__PURE__ */ getPrompt('calibration');
export const SCRIPT_SYSTEM_PROMPT = /* @__PURE__ */ getPrompt('script-system');
export const SCRIPT_USER_PROMPT = /* @__PURE__ */ getPrompt('script-user');
export const SKELETON_SYSTEM_PROMPT = /* @__PURE__ */ getPrompt('skeleton-system');
export const SKELETON_USER_PROMPT = /* @__PURE__ */ getPrompt('skeleton-user');
export const WRITING_SYSTEM_PROMPT = /* @__PURE__ */ getPrompt('writing-system');
export const WRITING_USER_PROMPT = /* @__PURE__ */ getPrompt('writing-user');
export const STORYBOARD_PROMPT = /* @__PURE__ */ getPrompt('storyboard');
export const REFERENCE_SHEET_PROMPT = /* @__PURE__ */ getPrompt('reference-sheet');
export const IMAGE_GEN_PROMPT = /* @__PURE__ */ getPrompt('image-gen');
export const VIDEO_GEN_PROMPT = /* @__PURE__ */ getPrompt('video-gen');
export const SAFETY_PRE_CHECK_PROMPT = /* @__PURE__ */ getPrompt('safety-pre-check');
export const QA_REVIEW_PROMPT = /* @__PURE__ */ getPrompt('qa-review');
export const FORMAT_SIGNATURE_PROMPT = /* @__PURE__ */ getPrompt('format-signature');

export { getPromptMeta, invalidatePromptCache } from './promptsLoader.js';
