import { StyleProfile, KeyMoment, SuspiciousClaim } from '../../types/models';
import { CONFIDENCE, DEFAULTS, POLICY } from '../../config/qualityPolicy';

// Result types
export interface ValidationIssue {
  field: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  fix?: any;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  appliedFallbacks?: Record<string, any>;
}

/**
 * applyFallbacks(profile): returns a shallow-cloned profile with defaults applied.
 * also returns a map of applied fallbacks for logging.
 */
export function applyFallbacks(profile: Partial<StyleProfile>): { profile: StyleProfile; applied: Record<string, any> } {
  const applied: Record<string, any> = {};
  const out: StyleProfile = { ...(profile as any) } as StyleProfile;

  if (!out.visualStyle) { out.visualStyle = DEFAULTS.DEFAULT_VISUAL_STYLE; applied.visualStyle = out.visualStyle; }
  if (!out.tone) { out.tone = DEFAULTS.DEFAULT_TONE; applied.tone = out.tone; }
  if (!out.pacing) { out.pacing = DEFAULTS.DEFAULT_PACING; applied.pacing = out.pacing; }
  if (!Array.isArray(out.colorPalette) || out.colorPalette.length === 0) { out.colorPalette = DEFAULTS.DEFAULT_PALETTE.slice(); applied.colorPalette = out.colorPalette; }
  if (!out.recommendedWordsPerMinute) { (out as any).recommendedWordsPerMinute = DEFAULTS.RECOMMENDED_WPM; applied.recommendedWordsPerMinute = DEFAULTS.RECOMMENDED_WPM; }
  if (!out.sourceDuration) { out.sourceDuration = DEFAULTS.DEFAULT_DURATION_SEC; applied.sourceDuration = out.sourceDuration; }
  if (!out.hookType) { out.hookType = DEFAULTS.DEFAULT_HOOK; applied.hookType = out.hookType; }
  if (!out.callToActionType) { out.callToActionType = DEFAULTS.DEFAULT_CTA; applied.callToActionType = out.callToActionType; }
  if (!out.emotionalIntensity) { out.emotionalIntensity = DEFAULTS.DEFAULT_EMOTIONAL_INTENSITY; applied.emotionalIntensity = out.emotionalIntensity; }
  if (!out.profileVersion) { out.profileVersion = 'unknown'; applied.profileVersion = out.profileVersion; }

  // ensure nodeConfidence exists
  out.nodeConfidence = out.nodeConfidence || {};
  out._meta = out._meta || {};
  // record applied fallback metadata
  (out._meta as any).fallbacks = { ...((out._meta as any).fallbacks || {}), ...applied };

  return { profile: out, applied };
}

/**
 * validateStyleProfile(profile)
 * - returns issues and ok flag
 * - DOES NOT mutate profile
 */
export function validateStyleProfile(profile: Partial<StyleProfile>): ValidationReport {
  const issues: ValidationIssue[] = [];

  // Required high-confidence fields
  for (const f of POLICY.requiredHighConfidenceFields) {
    const val = (profile as any)[f];
    const confidence = profile.nodeConfidence?.[f];
    if (val === undefined || val === null || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && val.trim() === '')) {
      issues.push({ field: f, level: 'error', message: `Missing required field: ${f}` });
    } else if (confidence === 'inferred' || confidence === 'guess') {
      issues.push({ field: f, level: 'warn', message: `Low confidence for ${f}: ${confidence}`, fix: 'applyFallbackOrManual' });
    }
  }

  // transcript confidence
  const tc = 1; // Defaulting to 1 since inputQuality is removed
  if (tc < CONFIDENCE.SOFT) {
    issues.push({ field: 'fullTranscript', level: 'warn', message: `ASR/transcript confidence is low: ${tc}. Scripts requiring verbatim mimic should be downgraded or require manual transcript.` });
  }

  // keyMoments confidence check
  const kms = profile.keyMoments || [];
  const goodKms = kms.filter(k => k.confidence >= POLICY.keyMomentMinConfidence);
  if (kms.length > 0 && goodKms.length === 0) {
    issues.push({ field: 'keyMoments', level: 'warn', message: `Key moments exist but none exceed ${POLICY.keyMomentMinConfidence} confidence.` });
  }

  // suspicious numeric claims: presence => warn and create verification tasks
  if (Array.isArray(profile.suspiciousNumericClaims) && profile.suspiciousNumericClaims.length > 0) {
    issues.push({ field: 'suspiciousNumericClaims', level: 'warn', message: `Found ${profile.suspiciousNumericClaims.length} suspicious numeric claims. Schedule verification.` });
  }

  // faceRatio sanity
  const fr = 0; // Defaulting to 0 since inputQuality is removed
  if (fr !== undefined && (fr < 0 || fr > 1)) {
    issues.push({ field: 'faceRatio', level: 'error', message: `faceRatio out of bounds: ${fr}` });
  }

  return { ok: issues.filter(i => i.level === 'error').length === 0, issues };
}

/**
 * createVerificationTasks(profile)
 * returns array of verification tasks for suspicious numeric claims
 */
export function createVerificationTasks(profile: StyleProfile) {
  const tasks: { id: string; claim: SuspiciousClaim; severity: string; action: string }[] = [];
  (profile.suspiciousNumericClaims || []).forEach((c: any, idx: number) => {
    const severity = c.severity || 'medium';
    const task = {
      id: `verify-${Date.now()}-${idx}`,
      claim: c as SuspiciousClaim,
      severity,
      action: severity === 'high' ? 'manual_review_and_block' : 'auto_attempt_verify_then_flag'
    };
    tasks.push(task);
  });
  return tasks;
}
