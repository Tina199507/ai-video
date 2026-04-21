// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  ensurePathWithinBase,
  sanitizeFileName,
  sanitizeFileSystemPath,
  sanitizePathSegment,
} from '@ai-video/lib/pathSafety.js';

const dataUrlTempFiles: string[] = [];

export function resolveAssetPath(url: string | undefined, assetsDir: string): string | undefined {
  if (!url) return undefined;
  const safeAssetsDir = sanitizeFileSystemPath(assetsDir, 'assetsDir');
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const ext = match[1].includes('video') ? '.mp4' : match[1].includes('audio') ? '.wav' : '.png';
      const tempName = sanitizeFileName(`tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`, `tmp${ext}`);
      const tmpFile = ensurePathWithinBase(safeAssetsDir, join(safeAssetsDir, tempName), 'temporary asset file');
      writeFileSync(tmpFile, Buffer.from(match[2], 'base64'));
      dataUrlTempFiles.push(tmpFile);
      return tmpFile;
    }
  }
  if (/^[a-z]+:\/\//i.test(url)) return undefined;
  if (url.startsWith('/') || url.match(/^[A-Z]:\\/)) {
    const absolutePath = sanitizeFileSystemPath(url, 'asset path');
    return existsSync(absolutePath) ? absolutePath : undefined;
  }
  const relativeName = sanitizePathSegment(basename(url), 'asset filename');
  const relative = ensurePathWithinBase(safeAssetsDir, join(safeAssetsDir, relativeName), 'asset path');
  if (existsSync(relative)) return relative;
  try {
    const asIs = sanitizeFileSystemPath(url, 'asset path');
    if (existsSync(asIs)) return asIs;
  } catch {
    return undefined;
  }
  return undefined;
}

export function cleanupDataUrlTempFiles(): void {
  for (const f of dataUrlTempFiles.splice(0)) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // Best-effort cleanup
    }
  }
}
