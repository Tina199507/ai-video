import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type || 'video/mp4',
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const getBase64FromUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
       const res = reader.result as string;
       resolve(res.split(',')[1]); 
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
export const withRetry = async <T>(
  fn: () => Promise<T>, 
  retries = 3, 
  delay = 2000,
  operationName = "API Call"
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const msg = error.toString();
    const status = error.status || 0;

    if (status === 400) throw error; // Bad Request - never retry
    if (status === 403) throw error; // Permission Denied - never retry
    
    // Quota errors should not be retried as they require plan upgrade
    if (error.isQuotaError || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw error;
    }

    const isTransient = status === 429 || status === 503 || status === 500 ||
                        msg.includes('429') || msg.includes('503') || msg.includes('500');
    
    if (retries > 0 && isTransient) {
      console.warn(`[${operationName}] Error. Waiting ${delay}ms... (Retries left: ${retries})`);
      await wait(delay);
      return withRetry(fn, retries - 1, Math.min(delay * 2, 60000), operationName);
    }
    throw error;
  }
};

export const withFallback = async <T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  retries = 2,
  operationName = "Operation"
): Promise<T> => {
  try {
    return await withRetry(primaryFn, retries, 2000, operationName);
  } catch (error) {
    console.warn(`[${operationName}] Primary failed, attempting fallback...`, error);
    return await withRetry(fallbackFn, retries, 2000, `${operationName} Fallback`);
  }
};

/**
 * Execute `fn` against a chain of models, automatically advancing to the next
 * when a quota / rate-limit error is encountered.
 *
 * Design notes:
 * - `initialModel` is always tried first and deduplicated against `fallbackModels`.
 * - A short jitter delay is inserted between each fallback hop so that a burst of
 *   concurrent pipeline steps does not immediately exhaust every model in the chain.
 * - The default fallback chain is ordered cheapest-first after the primary model,
 *   so flash is tried as soon as the first pro hits quota — matching the observed
 *   behaviour in the logs where pro models exhaust RPM within seconds of each other.
 */
export const withQuotaFallback = async <T>(
  fn: (model: string) => Promise<T>,
  initialModel: string,
  fallbackModels: string[] = [
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
  ],
  operationName = "Operation"
): Promise<T> => {
  const modelsToTry = Array.from(new Set([initialModel, ...fallbackModels]));

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      return await withRetry(() => fn(model), 1, 1000, `${operationName} [${model}]`);
    } catch (error: any) {
      const msg = error.toString();
      const isQuotaError =
        error.isQuotaError ||
        msg.includes('quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('429');

      if (isQuotaError && i < modelsToTry.length - 1) {
        const nextModel = modelsToTry[i + 1];
        // Jitter delay: 800 ms base + up to 400 ms random offset.
        // This prevents concurrent pipeline steps from thundering into the
        // next model in lockstep and immediately exhausting its quota too.
        const jitter = 800 + Math.random() * 400;
        console.warn(
          `[${operationName}] Quota exceeded for ${model}. ` +
          `Waiting ${Math.round(jitter)}ms before falling back to ${nextModel}...`
        );
        await wait(jitter);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`[${operationName}] All models in fallback chain failed or exceeded quota.`);
};
export class PromisePool {
  private concurrency: number;
  private active: number = 0;
  private queue: (() => Promise<void>)[] = [];

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = async () => {
        this.active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.active--;
          this.next();
        }
      };

      if (this.active < this.concurrency) {
        task();
      } else {
        this.queue.push(task);
      }
    });
  }

  private next() {
    if (this.active < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      task?.();
    }
  }
}

// extractDominantColors and estimateFaceCloseupRatio have been moved to
// src/services/cv.ts where they are implemented using the Canvas API.
// Do NOT add mock versions here — any code that needs them should import
// directly from cv.ts to avoid accidentally shadowing the real implementations.

export const generateVideoThumbnail = async (videoFile: File): Promise<any> => {
    return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    
    // Safety Timeout
    const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        reject(new Error("Thumbnail generation timed out (5s). File might be corrupt or unsupported format."));
    }, 5000);

    video.onloadeddata = () => { video.currentTime = Math.min(1.0, video.duration * 0.1); };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6); 
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve({ thumbnail: dataUrl, width: video.videoWidth, height: video.videoHeight, duration: video.duration });
      } catch (e) { 
        clearTimeout(timeout);
        reject(e); 
      }
    };
    video.onerror = (e) => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject(e);
    };
  });
};