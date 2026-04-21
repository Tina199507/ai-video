import {
  extractJSON,
  isTruncated,
  mergeContinuation,
} from '../responseParserCore.js';
import { assertPipelineCorePortsMutable } from './lifecycle.js';

export interface ResponseParserPort {
  extractJSON: typeof extractJSON;
  isTruncated: typeof isTruncated;
  mergeContinuation: typeof mergeContinuation;
}

export const defaultResponseParserPort: ResponseParserPort = {
  extractJSON,
  isTruncated,
  mergeContinuation,
};

let activeResponseParserPort: ResponseParserPort = defaultResponseParserPort;

export function setResponseParserPort(port: ResponseParserPort): void {
  assertPipelineCorePortsMutable('set responseParserPort');
  activeResponseParserPort = port;
}

export function resetResponseParserPort(): void {
  assertPipelineCorePortsMutable('reset responseParserPort');
  activeResponseParserPort = defaultResponseParserPort;
}

export function getResponseParserPort(): ResponseParserPort {
  return activeResponseParserPort;
}

export const extractJSONPort: typeof extractJSON = (...args) =>
  getResponseParserPort().extractJSON(...args);
export const isTruncatedPort: typeof isTruncated = (...args) =>
  getResponseParserPort().isTruncated(...args);
export const mergeContinuationPort: typeof mergeContinuation = (...args) =>
  getResponseParserPort().mergeContinuation(...args);

export {
  extractJSONPort as extractJSON,
  isTruncatedPort as isTruncated,
  mergeContinuationPort as mergeContinuation,
};
