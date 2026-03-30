export const Logger = {
  info: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[INFO]', ...args);
    }
  },
  warn: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[WARN]', ...args);
    }
  },
  error: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ERROR]', ...args);
    }
  },
  data: (label: string, data: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DATA] ${label}`, data);
    }
  },
  withContext: (traceId: string) => {
    return {
      info: (...args: any[]) => Logger.info(`[${traceId}]`, ...args),
      warn: (...args: any[]) => Logger.warn(`[${traceId}]`, ...args),
      error: (...args: any[]) => Logger.error(`[${traceId}]`, ...args),
      data: (label: string, data: any) => Logger.data(`${label} [${traceId}]`, data),
    };
  },
};
