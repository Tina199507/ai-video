export const CONFIDENCE = {
  HARD: 0.75,   // >= HARD -> safe to force
  SOFT: 0.6     // >= SOFT -> usable but annotate
};

export const DEFAULTS = {
  RECOMMENDED_WPM: 160,
  DEFAULT_DURATION_SEC: 60,
  DEFAULT_PALETTE: ['#000000','#333333','#CCCCCC','#999999','#FFFFFF'],
  DEFAULT_VISUAL_STYLE: 'cinematic',
  DEFAULT_TONE: 'neutral',
  DEFAULT_PACING: 'medium',
  DEFAULT_HOOK: 'StandardHook',
  DEFAULT_CTA: 'None',
  DEFAULT_EMOTIONAL_INTENSITY: 3
};

export const POLICY = {
  // fields treated as MUST in downstream; validate presence/thresholds
  requiredHighConfidenceFields: [
    'visualStyle', 'tone', 'colorPalette', 'narrativeStructure', 'fullTranscript'
  ],
  keyMomentMinConfidence: 0.7,
  faceRatioCloseupThreshold: 0.6,
  faceRatioMidThreshold: 0.2
};
