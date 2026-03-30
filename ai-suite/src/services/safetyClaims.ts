// 更智能的数字/可疑声明检测与标注
// Replace previous markSuspiciousClaimsInText with this implementation.

type ClaimType = 'numeric' | 'range' | 'percentage' | 'comparison' | 'probability' | 'semantic';
type Severity = 'low' | 'medium' | 'high';

export type SuspiciousClaim = {
  raw: string;
  normalizedNumber?: number | null; // best-effort normalization (e.g., 1_000_000)
  unit?: string | null;             // e.g., '%', 'kg', '万', '亿', '次/天'
  type: ClaimType;
  start: number;
  end: number;
  severity: Severity;
  reason?: string;
};

/**
 * Heuristic numeric normalizer for Chinese/English numeric tokens.
 * Supports commas, decimals, suffixes like k/m/b, 万/亿, and Chinese words like "几十万".
 */
const normalizeNumericToken = (raw: string): number | null => {
  try {
    // remove spaces
    let s = raw.trim().toLowerCase();

    // handle percentages separately outside if desired
    // Translate Chinese multipliers
    const chineseMultipliers: Record<string, number> = { '万': 1e4, '亿': 1e8, '兆': 1e12 };

    // common suffix multipliers (k, m, b)
    const suffixMap: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

    // remove commas
    s = s.replace(/,/g, '');

    // match formats like "1.2k", "3m", "2 billion"
    const suffixMatch = s.match(/^([\d.]+)\s*(k|m|b|t)$/i);
    if (suffixMatch) {
      const num = parseFloat(suffixMatch[1]);
      const mul = suffixMap[suffixMatch[2].toLowerCase()] || 1;
      return num * mul;
    }

    // Chinese like "3万", "几十万" (approximate)
    const chineseNumMatch = s.match(/^([\d.]+)\s*(万|亿|兆)$/);
    if (chineseNumMatch) {
      const num = parseFloat(chineseNumMatch[1]);
      return num * (chineseMultipliers[chineseNumMatch[2]] || 1);
    }

    // phrases like "几十万", "数百万" -> best-effort mapping
    if (/几十万/.test(s)) return 5 * 1e4;
    if (/数十万/.test(s)) return 5 * 1e5;
    if (/数百万|几百万/.test(s)) return 5 * 1e6;
    if (/数十亿|几十亿/.test(s)) return 5 * 1e9;

    // plain number
    const plainNum = parseFloat(s.replace(/[^\d.]/g, ''));
    if (!isNaN(plainNum)) return plainNum;

    return null;
  } catch (e) {
    return null;
  }
};

/**
 * Detect suspicious numeric/semantic claims in the given text.
 * Returns structured claims array.
 */
export const detectNumericClaims = (text: string): SuspiciousClaim[] => {
  if (!text) return [];

  const claims: SuspiciousClaim[] = [];
  const lowered = text;

  // Patterns to find:
  // 1) explicit numbers with units (English/Chinese): 1,234 ; 1.2k ; 3万 ; 5亿 ; 10%
  const numberWithUnitRegex = /(?:(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?)(?:\s?(?:%|percent|kg|g|mg|ml|l|liters|tons|ton|吨|公斤|万|亿|千|k|m|b|billion|million|次|分钟|小时|天|年|\/day|per day|每分钟|每小时|每天|每年))/gi;

  // 2) standalone percents (50%, 0.1%)
  const percentRegex = /(\d+(?:\.\d+)?)\s?%/g;

  // 3) ranges: "1-5", "1 to 5", "1 至 5"
  const rangeRegex = /(\d+(?:\.\d+)?)\s?(?:-|\–|to|~|至)\s?(\d+(?:\.\d+)?)(\s?(?:%|万|亿|kg|mg|ml|次)?)?/gi;

  // 4) comparison statements: "比...多", "more than 200", "less than 10"
  const comparisonRegex = /\b(more than|less than|greater than|fewer than|at least|at most|超过|多于|少于|比).*?(?:\d{1,3}(?:,\d{3})*|\d+)/gi;
  const chineseComparisonRegex = /比[^，。.]{0,20}多|比[^，。.]{0,20}少/gi;

  // 5) probability keywords combined with numbers: "概率", "几率", "chance", "risk"
  const probabilityRegex = /(\d+(?:\.\d+)?)\s?(%|percent)|概率|几率|chance|risk|probability/gi;

  // 6) semantic exaggeration triggers (e.g., "银河", "宇宙", "无限")
  const semanticTriggers = [/银河系|银河/i, /宇宙/i, /无限(的)?数量/i];

  // utility to push claim with computed severity heuristics
  const pushClaim = (raw: string, start: number, end: number, type: ClaimType, unit?: string | null) => {
    const normalized = normalizeNumericToken(raw);
    // simple severity heuristics
    let severity: Severity = 'low';
    if (type === 'percentage') {
      if (normalized !== null && normalized > 50) severity = 'high';
      else if (normalized !== null && normalized > 20) severity = 'medium';
    } else if (type === 'numeric' || type === 'range') {
      if (normalized !== null && normalized >= 1e12) severity = 'high';
      else if (normalized !== null && normalized >= 1e8) severity = 'medium';
    } else if (type === 'probability') {
      severity = 'high';
    } else if (type === 'semantic') {
      severity = 'high';
    } else if (type === 'comparison') {
      severity = 'medium';
    }

    claims.push({
      raw,
      normalizedNumber: normalized,
      unit: unit || null,
      type,
      start,
      end,
      severity,
      reason: `${type} detected`
    });
  };

  // 1) match numberWithUnitRegex
  let m;
  while ((m = numberWithUnitRegex.exec(lowered)) !== null) {
    const raw = m[0];
    pushClaim(raw, m.index, m.index + raw.length, 'numeric', null);
  }

  // 2) percentages (additional)
  while ((m = percentRegex.exec(lowered)) !== null) {
    const raw = m[0];
    pushClaim(raw, m.index, m.index + raw.length, 'percentage', '%');
  }

  // 3) ranges
  while ((m = rangeRegex.exec(lowered)) !== null) {
    const raw = m[0];
    pushClaim(raw, m.index, m.index + raw.length, 'range', m[3] || null);
  }

  // 4) comparisons
  while ((m = comparisonRegex.exec(lowered)) !== null) {
    const raw = m[0];
    pushClaim(raw, m.index, m.index + raw.length, 'comparison', null);
  }
  // include chinese variant
  while ((m = chineseComparisonRegex.exec(lowered)) !== null) {
    const raw = m[0];
    pushClaim(raw, m.index, m.index + raw.length, 'comparison', null);
  }

  // 5) probability keywords (if appear standalone)
  while ((m = probabilityRegex.exec(lowered)) !== null) {
    const raw = m[0];
    // avoid duplicating percentages caught above (simple guard)
    if (!claims.some(c => c.start <= m.index && c.end >= m.index + raw.length)) {
      pushClaim(raw, m.index, m.index + raw.length, 'probability', null);
    }
  }

  // 6) semantic triggers
  for (const trig of semanticTriggers) {
    const sm = lowered.match(trig);
    if (sm) {
      const idx = lowered.search(trig);
      if (idx >= 0) pushClaim(sm[0], idx, idx + sm[0].length, 'semantic', null);
    }
  }

  // De-duplicate claims by overlapping spans (merge if needed)
  const merged: SuspiciousClaim[] = [];
  claims.sort((a, b) => a.start - b.start);
  for (const c of claims) {
    const last = merged[merged.length - 1];
    if (!last || c.start > last.end + 2) {
      merged.push({ ...c });
    } else {
      // overlap: extend end and choose higher severity
      last.end = Math.max(last.end, c.end);
      last.raw = text.slice(last.start, last.end);
      if (c.severity === 'high') last.severity = 'high';
      else if (c.severity === 'medium' && last.severity !== 'high') last.severity = 'medium';
    }
  }

  return merged;
};

/**
 * markSuspiciousClaimsInText: annotate text with [NEEDS VERIFICATION] tags.
 * - produces stable annotation by building the output string from slices using claim spans.
 * - returns { text: annotatedText, applied: [rawMatches], details: SuspiciousClaim[] }
 */
export const markSuspiciousClaimsInText = (text: string, extraClaims: string[] = []) : { text: string; applied: string[]; details: SuspiciousClaim[] } => {
  if (!text) return { text, applied: [], details: [] };

  // 1) detect claims via regex heuristics
  const detected = detectNumericClaims(text);

  // 2) also detect extraClaims (literal substrings) and add as low-severity if not overlapping
  const normalizedExtra: SuspiciousClaim[] = [];
  for (const ex of (extraClaims || [])) {
    if (!ex || typeof ex !== 'string') continue;
    const idx = text.toLowerCase().indexOf(ex.toLowerCase());
    if (idx >= 0) {
      normalizedExtra.push({
        raw: ex,
        normalizedNumber: null,
        unit: null,
        type: 'semantic',
        start: idx,
        end: idx + ex.length,
        severity: 'medium',
        reason: 'user-provided suspicious literal'
      });
    }
  }

  // merge detected + extras, avoid duplicates by span
  const all = [...detected, ...normalizedExtra].sort((a,b) => a.start - b.start);
  const merged: SuspiciousClaim[] = [];
  for (const c of all) {
    const last = merged[merged.length - 1];
    if (!last || c.start > last.end + 2) merged.push({ ...c });
    else {
      last.end = Math.max(last.end, c.end);
      last.raw = text.slice(last.start, last.end);
      if (c.severity === 'high') last.severity = 'high';
    }
  }

  if (merged.length === 0) return { text, applied: [], details: [] };

  // 3) Build annotated text by slicing to avoid messing indexes
  let out = '';
  let cursor = 0;
  const applied: string[] = [];

  for (const claim of merged) {
    // safety: clamp indices
    const s = Math.max(0, Math.min(text.length, claim.start));
    const e = Math.max(0, Math.min(text.length, claim.end));
    if (cursor < s) out += text.slice(cursor, s);
    const original = text.slice(s, e);
    // apply annotation; keep original then append marker
    out += `${original} [NEEDS VERIFICATION]`;
    applied.push(original);
    cursor = e;
  }
  // append remainder
  if (cursor < text.length) out += text.slice(cursor);

  return { text: out, applied: Array.from(new Set(applied)), details: merged };
};