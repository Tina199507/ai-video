// src/lib/sanitize.ts

export function sanitizeTranscriptForStyle(transcript: string | undefined, extraBlacklist: string[] = [], hookText?: string) {
  if (!transcript) return { sanitized: '', replaceMap: {} };

  const replaceMap: Record<string, string> = {};
  let sanitized = transcript;
  
  let prefix = "";
  let suffix = sanitized;

  // If hookText is provided, try to find it at the beginning to preserve it
  if (hookText) {
      const normHook = hookText.trim();
      const idx = sanitized.indexOf(normHook);
      
      if (idx !== -1) {
          // Found exact match
          prefix = sanitized.slice(0, idx + hookText.length);
          suffix = sanitized.slice(idx + hookText.length);
      } else if (normHook.length > 0 && sanitized.startsWith(normHook.substring(0, 10))) {
          // Fallback: loose match at start
          prefix = sanitized.slice(0, normHook.length);
          suffix = sanitized.slice(normHook.length);
      }
  }

  // 1) Mask numbers with placeholders <NUM_n> (Only in suffix)
  suffix = suffix.replace(/(\d+[\d.,]*\s*(?:kg|千克|克|吨|升|ml|mL|次|年|万|百万|billion|million)?)/gi, (m) => {
    const key = `<NUM_${Object.keys(replaceMap).length + 1}>`;
    replaceMap[key] = m;
    return key;
  });

  // 2) Simple organ/subject blacklist (extend with NER if available) (Only in suffix)
  const commonSubjects = ['心脏', '肾脏', '肝脏', '白细胞', '癌变', '癌细胞', '血液', '大脑', '神经', '细胞', '宇宙', '星尘', '心跳'];
  const blacklist = Array.from(new Set([...commonSubjects, ...extraBlacklist])).filter(Boolean);
  
  blacklist.forEach((w) => {
    const key = `<MASK_${Object.keys(replaceMap).length + 1}>`;
    // Escape special characters for regex
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (re.test(suffix)) {
      replaceMap[key] = w;
      suffix = suffix.replace(re, key);
    }
  });

  return { sanitized: prefix + suffix, replaceMap };
}

export function detectContentContamination(generatedText: string, sourceEntities: string[]) {
  if (!generatedText || !sourceEntities || sourceEntities.length === 0) return [];
  const lower = generatedText.toLowerCase();
  
  const found = sourceEntities.filter(e => {
    if (!e) return false;
    const eStr = String(e).toLowerCase();
    // Skip pure numbers without units if they are short, to avoid massive false positives
    if (/^\d+$/.test(eStr) && eStr.length < 4) return false;
    return lower.includes(eStr);
  });
  
  return Array.from(new Set(found));
}

export function maskPII(text: string): string {
  if (typeof text !== 'string') return text;
  // Mask emails
  return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_MASKED]');
}
