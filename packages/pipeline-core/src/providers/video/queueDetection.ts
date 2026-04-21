/**
 * Port layer for queue-state detection helper.
 */
import { detectQueueStateFromText as defaultDetectQueueStateFromText } from './queueDetection.impl.js';

let activeQueueDetectionPort = {
  detectQueueStateFromText: defaultDetectQueueStateFromText,
};

export function setQueueDetectionPort(
  overrides: Partial<typeof activeQueueDetectionPort>,
): void {
  activeQueueDetectionPort = { ...activeQueueDetectionPort, ...overrides };
}

export function resetQueueDetectionPort(): void {
  activeQueueDetectionPort = {
    detectQueueStateFromText: defaultDetectQueueStateFromText,
  };
}

export const detectQueueStateFromText = (
  ...args: Parameters<typeof defaultDetectQueueStateFromText>
): ReturnType<typeof defaultDetectQueueStateFromText> => activeQueueDetectionPort.detectQueueStateFromText(...args);
