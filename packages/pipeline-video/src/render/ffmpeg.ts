// @ts-nocheck -- preserve current ffmpeg assembler strictness while physically moving code
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { sanitizeFileSystemPath } from '@ai-video/lib/pathSafety.js';

export const TIMEOUT = 3_600_000; // 60 min per ffmpeg command

export class FFmpegCommandError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'FFmpegCommandError';
  }
}

function resolvePreferredBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const brewedBinary = `/opt/homebrew/opt/ffmpeg-full/bin/${name}`;
  return existsSync(brewedBinary) ? brewedBinary : name;
}

export const FFMPEG_BIN = resolvePreferredBinary('ffmpeg');
export const FFPROBE_BIN = resolvePreferredBinary('ffprobe');

export function execFileText(
  binary: string,
  args: readonly string[],
  timeout: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, [...args], { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stderr: stderr ?? '' }));
        return;
      }
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

export function formatCommandForLog(binary: string, args: readonly string[]): string {
  return [binary, ...args.map(arg => (/\s/.test(arg) ? JSON.stringify(arg) : arg))].join(' ');
}

export async function ffmpeg(args: readonly string[], cwd: string): Promise<string> {
  const safeCwd = sanitizeFileSystemPath(cwd, 'ffmpeg cwd');
  const command = formatCommandForLog(FFMPEG_BIN, args);
  try {
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(FFMPEG_BIN, [...args], {
        cwd: safeCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let didTimeout = false;

      const timer = setTimeout(() => {
        didTimeout = true;
        child.kill('SIGKILL');
      }, TIMEOUT);

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        const suffix = didTimeout
          ? `timed out after ${TIMEOUT}ms`
          : `exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`;
        reject(new FFmpegCommandError(`FFmpeg error: ${(stderr || suffix).slice(-400)}`, command, stderr || suffix));
      });
    });
    return stdout;
  } catch (err) {
    const stderr = err instanceof FFmpegCommandError
      ? err.stderr
      : (err instanceof Error ? err.message : String(err));
    console.error(`[ffmpeg] Command failed: ${command.slice(0, 200)}...`);
    console.error(`[ffmpeg] stderr: ${stderr.slice(-500)}`);
    if (err instanceof FFmpegCommandError) {
      throw err;
    }
    throw new FFmpegCommandError(`FFmpeg error: ${stderr.slice(-400)}`, command, stderr);
  }
}
