const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

export interface VoiceMapping {
  defaultVoice: string;
  en: { female: string; maleDeep: string; male: string };
  zh: { femaleWarm: string; female: string; maleDeep: string; male: string };
}

export const DEFAULT_VOICE_MAPPING: Readonly<VoiceMapping> = Object.freeze({
  defaultVoice: DEFAULT_VOICE,
  en: Object.freeze({ female: 'en-US-JennyNeural', maleDeep: 'en-US-GuyNeural', male: 'en-US-ChristopherNeural' }),
  zh: Object.freeze({ femaleWarm: 'zh-CN-XiaoyiNeural', female: 'zh-CN-XiaoxiaoNeural', maleDeep: 'zh-CN-YunjianNeural', male: 'zh-CN-YunxiNeural' }),
});

/**
 * Auto-select an edge-tts voice based on a natural-language voice_style description.
 */
export function resolveVoiceFromStyle(
  voiceStyle?: string,
  language?: string,
  mapping: VoiceMapping = DEFAULT_VOICE_MAPPING,
): string {
  if (!voiceStyle) return mapping.defaultVoice;
  const s = voiceStyle.toLowerCase();
  const isEnglish = language?.toLowerCase().includes('english');

  if (isEnglish) {
    if (s.includes('female') || s.includes('woman')) {
      return mapping.en.female;
    }
    if (s.includes('male') || s.includes('man')) {
      if (s.includes('deep') || s.includes('calm')) return mapping.en.maleDeep;
      return mapping.en.male;
    }
    return mapping.en.female;
  }

  if (s.includes('female') || s.includes('woman') || s.includes('女')) {
    if (s.includes('warm') || s.includes('gentle') || s.includes('温暖')) return mapping.zh.femaleWarm;
    return mapping.zh.female;
  }
  if (s.includes('male') || s.includes('man') || s.includes('男')) {
    if (s.includes('deep') || s.includes('calm') || s.includes('低沉') || s.includes('沉稳')) {
      return mapping.zh.maleDeep;
    }
    return mapping.zh.male;
  }
  return mapping.defaultVoice;
}
