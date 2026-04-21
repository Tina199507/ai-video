/* ------------------------------------------------------------------ */
/*  ResponseParser – extracts structured CIR data from backend output */
/* ------------------------------------------------------------------ */

import {
  extractJSON,
  isTruncated,
  mergeContinuation,
} from './ports/responseParserPort.js';
import { Schema, validateSchema, ValidationResult } from './schemaValidator.js';

/**
 * Extract JSON from text and validate against a schema.
 * Returns validated (and possibly auto-repaired) data, or null if
 * extraction or critical validation fails.
 */
export function extractAndValidateJSON<T>(
  text: string,
  schema: Schema,
  label = 'unknown',
): T | null {
  const raw = extractJSON<T>(text);
  if (raw === null) return null;

  const result: ValidationResult<T> = validateSchema<T>(raw, schema, label);

  if (result.repaired.length > 0) {
    console.log(`[responseParser] schema auto-repaired fields for "${label}": ${result.repaired.join(', ')}`);
  }
  if (!result.valid) {
    console.warn(`[responseParser] schema validation errors for "${label}": ${result.errors.join('; ')}`);
  }

  // Return repaired data even when there are non-critical errors –
  // the pipeline stages already have fallback logic.
  return result.data;
}
export {
  extractJSON,
  isTruncated,
  mergeContinuation,
};
