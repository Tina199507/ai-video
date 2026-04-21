import { tmpdir } from 'node:os';

/** Mirrors `TEMP_DIR` in the host `src/constants.ts` without importing application code. */
export const TEMP_DIR = tmpdir();

/** Mirrors `FILE_UPLOAD_MAX_RETRIES` in the host `src/constants.ts`. */
export const FILE_UPLOAD_MAX_RETRIES = Number(process.env.FILE_UPLOAD_MAX_RETRIES ?? 3);
