import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import {
  sanitizeError,
  readBody,
  parseJsonBody,
  BodyTooLargeError,
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_SIZE,
  MAX_SINGLE_FILE_BYTES,
} from '../helpers.js';

function fakeReq(body: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(body)]);
  return stream as unknown as IncomingMessage;
}

function fakeRequest(body: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(body)]);
  return stream as unknown as IncomingMessage;
}

function fakeChunkedRequest(chunks: string[]): IncomingMessage {
  const stream = Readable.from(chunks.map((c) => Buffer.from(c)));
  return stream as unknown as IncomingMessage;
}

describe('sanitizeError', () => {
  it('passes through safe patterns', () => {
    expect(sanitizeError(new Error('Project not found'))).toBe('Project not found');
    expect(sanitizeError(new Error('Pipeline already running'))).toBe('Pipeline already running');
    expect(sanitizeError(new Error('topic is required'))).toBe('topic is required');
    expect(sanitizeError(new Error('Safety block detected'))).toBe('Safety block detected');
  });

  it('truncates long unknown errors', () => {
    const long = 'x'.repeat(300);
    expect(sanitizeError(new Error(long))).toBe('操作失败，请稍后重试');
  });

  it('returns first line of multi-line errors', () => {
    expect(sanitizeError(new Error('First line\nSecond line\nThird'))).toBe('First line');
  });

  it('handles non-Error values', () => {
    expect(sanitizeError('string error')).toBe('string error');
    expect(sanitizeError(42)).toBe('42');
  });
});

describe('readBody', () => {
  it('reads body from stream', async () => {
    const body = await readBody(fakeReq('{"hello":"world"}'));
    expect(body).toBe('{"hello":"world"}');
  });

  it('throws BodyTooLargeError when body exceeds maxSize', async () => {
    const largeBody = 'x'.repeat(200);
    await expect(readBody(fakeReq(largeBody), 100)).rejects.toThrow(BodyTooLargeError);
  });

  it('reads empty body', async () => {
    const body = await readBody(fakeReq(''));
    expect(body).toBe('');
  });

  it('reads a normal body', async () => {
    const result = await readBody(fakeRequest('hello world'));
    expect(result).toBe('hello world');
  });

  it('concatenates multiple chunks', async () => {
    const result = await readBody(fakeChunkedRequest(['hello', ' ', 'world']));
    expect(result).toBe('hello world');
  });

  it('throws BodyTooLargeError when body exceeds limit (alias)', async () => {
    const bigBody = 'x'.repeat(200);
    await expect(readBody(fakeRequest(bigBody), 100)).rejects.toThrow(BodyTooLargeError);
  });

  it('accepts body within limit', async () => {
    const result = await readBody(fakeRequest('ok'), 1024);
    expect(result).toBe('ok');
  });
});

describe('parseJsonBody', () => {
  it('parses valid JSON', async () => {
    const result = await parseJsonBody<{ key: string }>(fakeReq('{"key":"value"}'));
    expect(result.key).toBe('value');
  });

  it('throws SyntaxError on invalid JSON', async () => {
    await expect(parseJsonBody(fakeReq('not json'))).rejects.toThrow(SyntaxError);
  });

  it('parses valid JSON (request helper)', async () => {
    const result = await parseJsonBody<{ name: string }>(fakeRequest('{"name":"test"}'));
    expect(result.name).toBe('test');
  });

  it('throws SyntaxError for invalid JSON (request helper)', async () => {
    await expect(parseJsonBody(fakeRequest('not json'))).rejects.toThrow(SyntaxError);
  });

  it('throws SyntaxError for empty body', async () => {
    await expect(parseJsonBody(fakeRequest(''))).rejects.toThrow(SyntaxError);
  });

  it('respects maxSize parameter', async () => {
    const bigJson = JSON.stringify({ data: 'x'.repeat(200) });
    await expect(parseJsonBody(fakeRequest(bigJson), 100)).rejects.toThrow(BodyTooLargeError);
  });
});

describe('constants', () => {
  it('ALLOWED_UPLOAD_EXTENSIONS includes common formats', () => {
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('.mp4')).toBe(true);
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('.png')).toBe(true);
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('.json')).toBe(true);
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('.exe')).toBe(false);
  });

  it('MAX_UPLOAD_SIZE is reasonable', () => {
    expect(MAX_UPLOAD_SIZE).toBeGreaterThan(0);
    expect(MAX_UPLOAD_SIZE).toBe(800 * 1024 * 1024);
  });

  it('MAX_SINGLE_FILE_BYTES is 500 MB', () => {
    expect(MAX_SINGLE_FILE_BYTES).toBe(500 * 1024 * 1024);
  });
});
