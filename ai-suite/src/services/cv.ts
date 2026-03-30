/**
 * cv.ts — Client-side Computer Vision utilities
 *
 * extractDominantColors:
 *   Captures a frame from the video at ~10 % of its duration, draws it onto a
 *   hidden <canvas>, then runs a median-cut colour quantisation over a uniform
 *   grid of sample points to return the N most dominant hex colours.
 *
 * estimateFaceCloseupRatio:
 *   Samples five evenly-spaced frames and, for each frame, measures what
 *   fraction of the centre region contains skin-tone pixels.  The average
 *   across frames is returned as a 0–1 ratio.
 *   This is a heuristic — it works well for talking-head / explainer content
 *   but will over-report for warm-toned scenes that contain no faces.
 *   A dedicated ML face detector (e.g. MediaPipe Face Detection) can be
 *   substituted by injecting it via the globalThis hook below.
 */

import { Logger } from "../lib/logger";

/* ─────────────────────────────────────────────────────────── */
/*  Shared: capture a single video frame at a given time (s)  */
/* ─────────────────────────────────────────────────────────── */

const captureFrame = (
    video: HTMLVideoElement,
    timeSec: number,
    width = 320,
    height = 180,
): Promise<ImageData> =>
    new Promise((resolve, reject) => {
        const onSeeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('No 2d context')); return; }
                ctx.drawImage(video, 0, 0, width, height);
                resolve(ctx.getImageData(0, 0, width, height));
            } catch (e) {
                reject(e);
            }
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.currentTime = timeSec;
    });

const loadVideo = (file: File): Promise<HTMLVideoElement> =>
    new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const url = URL.createObjectURL(file);
        video.src = url;

        const cleanup = () => URL.revokeObjectURL(url);

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Video load timed out (8 s)'));
        }, 8000);

        video.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve(video);
            // Do not revoke here — callers still need to seek the video
        };
        video.onerror = (e) => {
            clearTimeout(timeout);
            cleanup();
            reject(new Error(`Video load error: ${String(e)}`));
        };
    });

/* ─────────────────────────────────────────────────────── */
/*  Median-cut colour quantisation (single-pass, simple)  */
/* ─────────────────────────────────────────────────────── */

/** Convert r,g,b (0–255 each) to a CSS hex string, e.g. "#1a2b3c". */
const toHex = (r: number, g: number, b: number): string =>
    '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Sample `imageData` at a uniform grid and return the `count` most
 * representative colours using a simplified median-cut approach.
 */
function quantiseColors(imageData: ImageData, count: number): string[] {
    const { data, width, height } = imageData;
    const GRID = 16; // sample every 16th pixel in each axis
    const buckets: [number, number, number][] = [];

    for (let y = 0; y < height; y += GRID) {
        for (let x = 0; x < width; x += GRID) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            // Skip transparent / near-black background pixels
            if (a < 128 || (r < 10 && g < 10 && b < 10)) continue;
            buckets.push([r, g, b]);
        }
    }

    if (buckets.length === 0) {
        return Array.from({ length: count }, () => '#808080');
    }

    // Sort by luminance and divide into `count` equal segments,
    // using the median pixel of each segment as the representative colour.
    buckets.sort(
        ([r1, g1, b1], [r2, g2, b2]) =>
            (0.299 * r1 + 0.587 * g1 + 0.114 * b1) -
            (0.299 * r2 + 0.587 * g2 + 0.114 * b2)
    );

    const segmentSize = Math.max(1, Math.floor(buckets.length / count));
    const result: string[] = [];

    for (let seg = 0; seg < count; seg++) {
        const start = seg * segmentSize;
        const end = Math.min(start + segmentSize, buckets.length);
        let rSum = 0, gSum = 0, bSum = 0, n = 0;
        for (let i = start; i < end; i++) {
            rSum += buckets[i][0]; gSum += buckets[i][1]; bSum += buckets[i][2]; n++;
        }
        if (n > 0) result.push(toHex(rSum / n, gSum / n, bSum / n));
    }

    // Pad if we got fewer than requested (very dark video, etc.)
    while (result.length < count) result.push('#808080');
    return result;
}

/* ─────────────────────────────────────────────── */
/*  Skin-tone heuristic for face-closeup ratio     */
/* ─────────────────────────────────────────────── */

/**
 * Returns the fraction of pixels in the centre 60 % × 60 % region that fall
 * within a broad skin-tone range in RGB-space.
 * Covers a wide range of skin tones (Fitzpatrick I–VI).
 */
function skinToneRatio(imageData: ImageData): number {
    const { data, width, height } = imageData;

    // Only look at the centre 60% crop
    const x0 = Math.floor(width * 0.20);
    const x1 = Math.floor(width * 0.80);
    const y0 = Math.floor(height * 0.20);
    const y1 = Math.floor(height * 0.80);

    let skinPixels = 0, totalPixels = 0;

    for (let y = y0; y < y1; y += 2) {       // stride 2 for performance
        for (let x = x0; x < x1; x += 2) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];

            totalPixels++;

            // Skin-tone heuristic in RGB (works across diverse skin tones):
            //   R > 60, G > 40, B > 20
            //   R > G > B (roughly)
            //   |R-G| <= 60 (prevents very saturated colours)
            //   R - B > 10
            const isSkin =
                r > 60 && g > 40 && b > 20 &&
                r > g && g > b &&
                Math.abs(r - g) <= 60 &&
                r - b > 10;

            if (isSkin) skinPixels++;
        }
    }

    return totalPixels > 0 ? skinPixels / totalPixels : 0;
}

/* ─────────────────────────────────────────────── */
/*  Public API                                     */
/* ─────────────────────────────────────────────── */

/**
 * Extract the `count` dominant colours from a video file.
 * Captures a frame at 10 % of video duration, then runs median-cut quantisation.
 * Falls back to a neutral grey palette on any error.
 */
export const extractDominantColors = async (
    videoFile: File,
    count: number = 5,
): Promise<string[]> => {
    // Allow an external implementation to override (e.g. in tests or native apps)
    if ((globalThis as any).extractDominantColors) {
        return (globalThis as any).extractDominantColors(videoFile, count);
    }

    try {
        const video = await loadVideo(videoFile);
        const sampleTime = Math.max(0.5, (video.duration || 5) * 0.10);
        const frame = await captureFrame(video, sampleTime);
        URL.revokeObjectURL(video.src);
        const colors = quantiseColors(frame, count);
        Logger.info(`[CV] Extracted ${colors.length} dominant colors from "${videoFile.name}"`);
        return colors;
    } catch (e) {
        Logger.warn('[CV] extractDominantColors failed, returning neutral fallback', e);
        // Return a neutral greyscale ramp so downstream systems always get valid data
        return Array.from({ length: count }, (_, i) => {
            const v = Math.round(255 * (i / Math.max(1, count - 1)));
            return toHex(v, v, v);
        });
    }
};

/**
 * Estimate what fraction of the video features a face in close-up.
 * Samples 5 evenly-spaced frames and averages the skin-tone ratio of each
 * centre-crop region.  Returns a value in [0, 1].
 *
 * Typical values:
 *  - Talking-head / interview:  0.30 – 0.60
 *  - Mixed b-roll:              0.10 – 0.25
 *  - Pure landscape / abstract: 0.00 – 0.10
 */
export const estimateFaceCloseupRatio = async (videoFile: File): Promise<number> => {
    // Allow an external implementation to override
    if ((globalThis as any).estimateFaceCloseupRatio) {
        return (globalThis as any).estimateFaceCloseupRatio(videoFile);
    }

    try {
        const video = await loadVideo(videoFile);
        const duration = video.duration || 10;
        const NUM_SAMPLES = 5;
        let totalRatio = 0;

        for (let s = 0; s < NUM_SAMPLES; s++) {
            // Spread samples between 5 % and 95 % of duration to avoid black frames
            const t = duration * (0.05 + (0.90 * s) / Math.max(1, NUM_SAMPLES - 1));
            const frame = await captureFrame(video, t);
            totalRatio += skinToneRatio(frame);
        }

        URL.revokeObjectURL(video.src);
        const ratio = totalRatio / NUM_SAMPLES;
        Logger.info(`[CV] Face closeup ratio for "${videoFile.name}": ${ratio.toFixed(3)}`);
        return ratio;
    } catch (e) {
        Logger.warn('[CV] estimateFaceCloseupRatio failed, returning conservative default 0.2', e);
        return 0.2; // Conservative mid-range default — won't skew StyleDNA heavily
    }
};