// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { spawn } from 'node:child_process';
import { sanitizeFileSystemPath } from '@ai-video/lib/pathSafety.js';
import { execFileText, FFMPEG_BIN, FFPROBE_BIN } from './ffmpeg.js';

export async function isFFmpegAvailable(): Promise<boolean> {
  try {
    await execFileText(FFMPEG_BIN, ['-version'], 10_000);
    return true;
  } catch {
    return false;
  }
}

export async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const safeFilePath = sanitizeFileSystemPath(filePath, 'media file path');
    const { stdout } = await execFileText(
      FFPROBE_BIN,
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        safeFilePath,
      ],
      15_000,
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

export async function getAudioMeanVolume(filePath: string): Promise<number> {
  try {
    const safeFilePath = sanitizeFileSystemPath(filePath, 'audio file path');
    const { stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(FFMPEG_BIN, [
        '-i', safeFilePath,
        '-af', 'volumedetect',
        '-f', 'null',
        '-',
      ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
      child.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
      child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
      child.on('error', err => { clearTimeout(timer); reject(err); });
      child.on('close', () => { clearTimeout(timer); resolve({ stdout, stderr }); });
    });
    const match = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    return match ? parseFloat(match[1]) : -Infinity;
  } catch {
    return -Infinity;
  }
}

export async function getVideoInfo(filePath: string): Promise<{ duration: number; width: number; height: number } | undefined> {
  try {
    const safeFilePath = sanitizeFileSystemPath(filePath, 'video file path');
    const { stdout } = await execFileText(
      FFPROBE_BIN,
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-show_entries', 'format=duration',
        '-of', 'json',
        safeFilePath,
      ],
      15_000,
    );
    const data = JSON.parse(stdout);
    const duration = parseFloat(data.format?.duration) || 0;
    const stream = data.streams?.[0];
    const width = Number(stream?.width) || 0;
    const height = Number(stream?.height) || 0;
    return { duration, width, height };
  } catch {
    return undefined;
  }
}
