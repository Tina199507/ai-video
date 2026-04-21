/* ------------------------------------------------------------------ */
/*  ResponseParserCore – shared text/JSON parsing helpers             */
/* ------------------------------------------------------------------ */

/**
 * Attempt to extract a JSON object from an AI chat response.
 *
 * Strategies (in order):
 * 1. Detect ```json ... ``` or ``` ... ``` fenced code block
 * 2. Detect raw JSON (first { to last })
 * 3. Detect raw JSON array (first [ to last ])
 * 4. Return null if no JSON found
 */
export function extractJSON<T = any>(text: string): T | null {
  if (!text) {
    console.warn('[responseParser] extractJSON called with empty text');
    return null;
  }

  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse((fenceMatch[1] ?? '').trim()) as T;
      console.log('[responseParser] extractJSON: matched via fenced code block');
      return parsed;
    } catch {
      console.log('[responseParser] extractJSON: fenced block found but JSON.parse failed, trying next strategy');
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate) as T;
      console.log('[responseParser] extractJSON: matched via raw JSON braces');
      return parsed;
    } catch {
      try {
        const fixed = candidate
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/'/g, '"');
        const parsed = JSON.parse(fixed) as T;
        console.log('[responseParser] extractJSON: matched via fixed JSON (trailing commas / quotes)');
        return parsed;
      } catch {
        console.warn(`[responseParser] extractJSON: raw JSON braces found but parse failed. Candidate: ${candidate.slice(0, 200)}`);
      }
    }
  }

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = text.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(candidate) as T;
      console.log('[responseParser] extractJSON: matched via array brackets');
      return parsed;
    } catch {
      console.warn('[responseParser] extractJSON: array brackets found but parse failed');
    }
  }

  console.warn(`[responseParser] extractJSON: no JSON found in text (${text.length} chars): ${text.slice(0, 150)}`);
  return null;
}

/**
 * Check if a response appears truncated (cut off mid-sentence/JSON).
 * Useful for deciding whether to send a "continue" follow-up.
 */
export function isTruncated(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trimEnd();

  const opens = (trimmed.match(/{/g) || []).length;
  const closes = (trimmed.match(/}/g) || []).length;
  if (opens > closes) return true;

  const openBrackets = (trimmed.match(/\[/g) || []).length;
  const closeBrackets = (trimmed.match(/]/g) || []).length;
  if (openBrackets > closeBrackets) return true;

  if (/[,:]\s*$/.test(trimmed)) return true;
  if (/\.\.\.\s*$/.test(trimmed)) return true;

  return false;
}

/**
 * Merge a "continuation" response with the original.
 * The continuation may repeat some overlap text.
 */
export function mergeContinuation(original: string, continuation: string): string {
  if (!continuation) return original;

  const overlapSearch = original.slice(-100);
  for (let len = Math.min(50, overlapSearch.length); len >= 10; len--) {
    const tail = overlapSearch.slice(-len);
    const idx = continuation.indexOf(tail);
    if (idx !== -1 && idx < 50) {
      return original + continuation.slice(idx + tail.length);
    }
  }

  return original + continuation;
}
