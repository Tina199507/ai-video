// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import type { SubtitleStyle } from '@ai-video/shared/types.js';
import type { SceneInput } from './types.js';

export function generateSRT(scenes: SceneInput[]): string {
  const lines: string[] = [];
  let cumulative = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const duration = scene.audioDuration ?? scene.estimatedDuration ?? 5;
    const start = formatSRT(cumulative);
    const end = formatSRT(cumulative + duration);

    lines.push(`${i + 1}`);
    lines.push(`${start} --> ${end}`);
    lines.push(scene.narrative);
    lines.push('');

    cumulative += duration;
  }
  return lines.join('\n');
}

export function formatSRT(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

export function hexToAssColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '&HFFFFFF&';
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
}

export function buildSubtitleForceStyle(style: SubtitleStyle): string {
  const parts: string[] = [
    `Fontname=${style.fontName}`,
    `FontSize=${style.fontSize}`,
    `PrimaryColour=${hexToAssColor(style.primaryColor)}`,
    `OutlineColour=${hexToAssColor(style.outlineColor)}`,
    `Outline=${style.outlineWidth}`,
    `Shadow=${style.shadowEnabled ? 1 : 0}`,
    `MarginV=${style.marginV}`,
  ];

  if (style.backdropEnabled && style.backdropOpacity > 0) {
    const alpha = Math.round((1 - style.backdropOpacity) * 255).toString(16).padStart(2, '0').toUpperCase();
    parts.push(`BackColour=&H${alpha}000000&`);
    parts.push('BorderStyle=4');
  } else {
    parts.push('BackColour=&H00000000&');
  }

  return parts.join(',');
}
