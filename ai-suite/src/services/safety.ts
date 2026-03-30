/**
 * safety.ts
 * --------------------------------------------
 * Lightweight content-safety & expression-control middleware.
 * Fully bilingual: all keyword lists cover both Chinese and English.
 *
 * Sections:
 *  1. Numeric magnitude validation
 *  2. Absolute-statement detection + softening
 *  3. Suicide / self-harm risk detection
 *  4. Medical-claim risk detection
 *  5. Main entry point
 * --------------------------------------------
 */

export interface ExcerptSpan {
  text: string;
  start: number;
  end: number;
  category: string;
}

export interface SafetyReport {
  numericIssues: string[];
  absoluteIssues: string[];
  suicideDetected: boolean;
  medicalClaimDetected: boolean;
  softened: boolean;
  requiresManualReview: boolean;
  categories: string[];
  excerptSpans: ExcerptSpan[];
  finalText: string;
}

const MAX_REASONABLE_NUMBER = 1e14;

/* ─────────────────────────────────────────── */
/* 1️⃣  Numeric magnitude validation            */
/* ─────────────────────────────────────────── */

function detectNumericIssues(text: string): { issues: string[]; spans: ExcerptSpan[] } {
  const numberRegex = /(\d+(\.\d+)?)(\s?(亿|万亿|吨|升|次|%|kg|g|ml|L)?)?/g;
  const issues: string[] = [];
  const spans: ExcerptSpan[] = [];

  for (const match of Array.from(text.matchAll(numberRegex))) {
    const raw = match[1];
    const value = parseFloat(raw);
    if (!isNaN(value) && value > MAX_REASONABLE_NUMBER) {
      issues.push(`Unrealistic magnitude detected: ${raw}`);
      spans.push({
        text: raw,
        start: match.index ?? 0,
        end: (match.index ?? 0) + raw.length,
        category: 'numeric_exaggeration',
      });
    }
  }

  // Semantic exaggeration triggers — Chinese and English
  const semanticTriggers: string[] = [
    // Chinese
    "比银河系的星星还多",
    "超过宇宙的数量",
    "无限数量",
    // English
    "more than stars in the galaxy",
    "more than stars in the universe",
    "infinite number of",
    "countless billions of",
    "beyond counting",
  ];

  for (const trigger of semanticTriggers) {
    const index = text.toLowerCase().indexOf(trigger.toLowerCase());
    if (index !== -1) {
      // Use the original-case slice for the span text
      const originalSlice = text.slice(index, index + trigger.length);
      issues.push(`Semantic exaggeration detected: "${originalSlice}"`);
      spans.push({
        text: originalSlice,
        start: index,
        end: index + trigger.length,
        category: 'semantic_exaggeration',
      });
    }
  }

  return { issues, spans };
}

/* ─────────────────────────────────────────── */
/* 2️⃣  Absolute-statement detection + softening */
/* ─────────────────────────────────────────── */

/**
 * Each entry maps a trigger phrase to its softened replacement.
 * Both languages are handled so that English-language content is
 * softened with an English replacement and vice-versa.
 */
const ABSOLUTE_REPLACEMENTS: { trigger: string; replacement: string }[] = [
  // Chinese → Chinese replacement
  { trigger: "一定",     replacement: "在大多数情况下" },
  { trigger: "永远",     replacement: "在大多数情况下" },
  { trigger: "绝对",     replacement: "在大多数情况下" },
  { trigger: "从来不会", replacement: "在大多数情况下不会" },
  { trigger: "根本无法", replacement: "通常难以" },
  { trigger: "完全",     replacement: "在很大程度上" },
  { trigger: "必然",     replacement: "很可能" },
  // English → English replacement
  { trigger: "always",      replacement: "in most cases" },
  { trigger: "never",       replacement: "rarely" },
  { trigger: "absolutely",  replacement: "generally" },
  { trigger: "impossible",  replacement: "very difficult" },
  { trigger: "guaranteed",  replacement: "likely" },
  { trigger: "certainly",   replacement: "probably" },
  { trigger: "definitively",replacement: "generally" },
  { trigger: "100% certain",replacement: "highly likely" },
];

function softenAbsoluteStatements(text: string): {
  softenedText: string;
  issues: string[];
  softened: boolean;
} {
  let softenedText = text;
  const issues: string[] = [];
  let softened = false;

  for (const { trigger, replacement } of ABSOLUTE_REPLACEMENTS) {
    // Case-insensitive search, preserve surrounding text
    const regex = new RegExp(trigger, "gi");
    if (regex.test(softenedText)) {
      issues.push(trigger);
      softened = true;
      softenedText = softenedText.replace(regex, replacement);
    }
  }

  return { softenedText, issues, softened };
}

/* ─────────────────────────────────────────── */
/* 3️⃣  Suicide / self-harm detection           */
/* ─────────────────────────────────────────── */

/** All entries are matched case-insensitively via detectRisk(). */
const SUICIDE_KEYWORDS: string[] = [
  // Chinese
  "杀死自己",
  "自杀",
  "自残",
  "自我毁灭",
  "无法活下去",
  "了结生命",
  "结束自己的生命",
  // English
  "kill myself",
  "kill yourself",
  "take my own life",
  "take their own life",
  "end my life",
  "end their life",
  "commit suicide",
  "want to die",
  "can't go on living",
  "self-harm",
  "self harm",
  "cutting myself",
  "hurting myself",
];

/* ─────────────────────────────────────────── */
/* 4️⃣  Medical-claim detection                 */
/* ─────────────────────────────────────────── */

const MEDICAL_CLAIM_PATTERNS: string[] = [
  // Chinese
  "可以治愈",
  "保证治好",
  "100%恢复",
  "完全治愈",
  "包治",
  "根治",
  "永久治愈",
  // English
  "guaranteed cure",
  "100% cure",
  "guaranteed to cure",
  "guaranteed to heal",
  "guaranteed recovery",
  "clinically proven to cure",
  "will definitely cure",
  "permanently cures",
  "complete cure",
  "miracle cure",
  "instant cure",
];

/* ─────────────────────────────────────────── */
/* Shared detection helper                     */
/* ─────────────────────────────────────────── */

function detectRisk(
  text: string,
  keywords: string[],
  category: string,
): { detected: boolean; spans: ExcerptSpan[] } {
  let detected = false;
  const spans: ExcerptSpan[] = [];
  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    let searchFrom = 0;
    while (true) {
      const index = lowerText.indexOf(lowerKeyword, searchFrom);
      if (index === -1) break;
      detected = true;
      spans.push({
        text: text.slice(index, index + keyword.length),
        start: index,
        end: index + keyword.length,
        category,
      });
      // Advance past this match to catch repeated occurrences
      searchFrom = index + keyword.length;
    }
  }

  return { detected, spans };
}

/* ─────────────────────────────────────────── */
/* 5️⃣  Main entry point                        */
/* ─────────────────────────────────────────── */

export function runSafetyMiddleware(originalText: string): SafetyReport {
  let workingText = originalText;
  const allSpans: ExcerptSpan[] = [];
  const categories: Set<string> = new Set();

  // 1. Numeric magnitude check
  const { issues: numericIssues, spans: numericSpans } = detectNumericIssues(workingText);
  allSpans.push(...numericSpans);
  if (numericIssues.length > 0) categories.add('numeric_exaggeration');

  // 2. Absolute-statement softening (mutates workingText)
  const absoluteResult = softenAbsoluteStatements(workingText);
  workingText = absoluteResult.softenedText;

  // 3. Suicide / self-harm risk
  const suicideResult = detectRisk(workingText, SUICIDE_KEYWORDS, 'suicide');
  allSpans.push(...suicideResult.spans);
  if (suicideResult.detected) categories.add('suicide');

  // 4. Medical-claim risk
  const medicalResult = detectRisk(workingText, MEDICAL_CLAIM_PATTERNS, 'medical_claim');
  allSpans.push(...medicalResult.spans);
  if (medicalResult.detected) categories.add('medical_claim');

  const requiresManualReview =
    suicideResult.detected ||
    medicalResult.detected ||
    numericIssues.length > 0;

  return {
    numericIssues,
    absoluteIssues: absoluteResult.issues,
    suicideDetected: suicideResult.detected,
    medicalClaimDetected: medicalResult.detected,
    softened: absoluteResult.softened,
    requiresManualReview,
    categories: Array.from(categories),
    excerptSpans: allSpans,
    finalText: workingText,
  };
}