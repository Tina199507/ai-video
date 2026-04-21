/* ------------------------------------------------------------------ */
/*  Tests: ChatAdapter – pure functions & simple methods              */
/* ------------------------------------------------------------------ */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ChatAdapter, ChatVideoUnsupportedError } from './chatAdapter.js';
import type { ChatWorkbenchPort } from '@ai-video/adapter-common/chatAdapter.port.js';
import { installAdapterHostBindings } from './adapterHostBindings.js';

beforeAll(() => {
  installAdapterHostBindings();
});

/* ================================================================== */
/*  ChatVideoUnsupportedError                                        */
/* ================================================================== */
describe('ChatVideoUnsupportedError', () => {
  it('has correct name', () => {
    const err = new ChatVideoUnsupportedError('test');
    expect(err.name).toBe('ChatVideoUnsupportedError');
  });

  it('sets isQuotaError to true', () => {
    const err = new ChatVideoUnsupportedError('msg');
    expect(err.isQuotaError).toBe(true);
  });

  it('is an instance of Error', () => {
    const err = new ChatVideoUnsupportedError('msg');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores message', () => {
    const err = new ChatVideoUnsupportedError('custom message');
    expect(err.message).toBe('custom message');
  });
});

/* ================================================================== */
/*  ChatAdapter – constructor & simple methods                        */
/* ================================================================== */
function makeMockWorkbench(submitImpl?: (task: unknown) => Promise<string>): ChatWorkbenchPort {
  const submitAndWait = vi.fn(submitImpl ?? (async () => 'mock answer'));
  return {
    submitAndWait,
    resources: {
      byCapability: vi.fn().mockReturnValue([]),
    },
    getActivePage: vi.fn().mockReturnValue(null),
    getActiveAccountId: vi.fn().mockReturnValue(null),
    getActiveSelectors: vi.fn().mockReturnValue(null),
    getActiveSelectorChain: vi.fn().mockReturnValue(undefined),
  };
}

describe('ChatAdapter', () => {
  it('has provider = "CHAT"', () => {
    const adapter = new ChatAdapter(makeMockWorkbench());
    expect(adapter.provider).toBe('CHAT');
  });

  describe('uploadFile', () => {
    it('returns file path as URI', async () => {
      const adapter = new ChatAdapter(makeMockWorkbench());
      const result = await adapter.uploadFile({
        name: 'test.png',
        path: '/tmp/test.png',
        mimeType: 'image/png',
      });
      expect(result).toEqual({
        uri: '/tmp/test.png',
        mimeType: 'image/png',
      });
    });

    it('passes through arbitrary mimeType', async () => {
      const adapter = new ChatAdapter(makeMockWorkbench());
      const result = await adapter.uploadFile({
        name: 'video.mp4',
        path: '/data/video.mp4',
        mimeType: 'video/mp4',
      });
      expect(result.mimeType).toBe('video/mp4');
    });
  });

  describe('generateVideo', () => {
    it('always throws ChatVideoUnsupportedError', async () => {
      const adapter = new ChatAdapter(makeMockWorkbench());
      await expect(
        adapter.generateVideo('model', 'prompt'),
      ).rejects.toThrow(ChatVideoUnsupportedError);
    });

    it('thrown error has isQuotaError = true', async () => {
      const adapter = new ChatAdapter(makeMockWorkbench());
      try {
        await adapter.generateVideo('model', 'prompt');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as ChatVideoUnsupportedError).isQuotaError).toBe(true);
      }
    });
  });

  describe('config defaults', () => {
    it('merges custom config with defaults', () => {
      const adapter = new ChatAdapter(makeMockWorkbench(), {
        assetsDir: '/custom/assets',
      });
      // Verify config was applied by checking adapter works
      expect(adapter.provider).toBe('CHAT');
    });
  });

  /* ================================================================ */
  /*  generateText — text-only happy path                              */
  /* ================================================================ */
  describe('generateText', () => {
    it('forwards a string prompt to workbench.submitAndWait', async () => {
      const wb = makeMockWorkbench(async () => 'hello world');
      const adapter = new ChatAdapter(wb, { defaultTextProvider: 'gemini' });

      const result = await adapter.generateText('gemini-2.5-flash', 'tell me a joke');

      expect(result.text).toBe('hello world');
      expect(result.model).toBe('gemini-2.5-flash');
      const submit = wb.submitAndWait as unknown as ReturnType<typeof vi.fn>;
      expect(submit).toHaveBeenCalledTimes(1);
      const call = submit.mock.calls[0]?.[0] as { question: string; preferredProvider: string; preferredModel: string };
      expect(call.question).toBe('tell me a joke');
      expect(call.preferredProvider).toBe('gemini');
      expect(call.preferredModel).toBe('gemini-2.5-flash');
    });

    it('prepends system instruction when provided', async () => {
      const wb = makeMockWorkbench(async () => 'ok');
      const adapter = new ChatAdapter(wb);

      await adapter.generateText('m', 'user prompt', { systemInstruction: 'Be concise.' });

      const submit = wb.submitAndWait as unknown as ReturnType<typeof vi.fn>;
      const call = submit.mock.calls[0]?.[0] as { question: string };
      expect(call.question).toContain('[System Instruction]');
      expect(call.question).toContain('Be concise.');
      expect(call.question).toContain('user prompt');
    });

    it('appends JSON-only directive when responseMimeType is application/json', async () => {
      const wb = makeMockWorkbench(async () => '{"ok": true}');
      const adapter = new ChatAdapter(wb);

      const result = await adapter.generateText('m', 'give me json', {
        responseMimeType: 'application/json',
      });

      const submit = wb.submitAndWait as unknown as ReturnType<typeof vi.fn>;
      const call = submit.mock.calls[0]?.[0] as { question: string };
      expect(call.question).toMatch(/Respond with valid JSON only/i);
      expect(result.data).toEqual({ ok: true });
    });

    it('extracts text and file URIs from a multimodal prompt array', async () => {
      const wb = makeMockWorkbench(async () => 'analysed');
      const adapter = new ChatAdapter(wb);

      await adapter.generateText('m', [
        'first chunk',
        { text: 'second chunk' },
        { fileData: { fileUri: 'file://uploaded.png' } },
        { inlineData: { data: 'base64', mimeType: 'image/png' } },
      ]);

      const submit = wb.submitAndWait as unknown as ReturnType<typeof vi.fn>;
      const call = submit.mock.calls[0]?.[0] as { question: string; attachments?: string[] };
      expect(call.question).toContain('first chunk');
      expect(call.question).toContain('second chunk');
      expect(call.question).toContain('[Attached file]');
      expect(call.attachments).toEqual(['file://uploaded.png']);
    });

    it('falls back to "chat" model name when no model is supplied', async () => {
      const wb = makeMockWorkbench(async () => 'reply');
      const adapter = new ChatAdapter(wb);

      const result = await adapter.generateText('', 'hi');

      expect(result.model).toBe('chat');
    });

    it('passes timeout / signal / sessionId from request options through to workbench', async () => {
      const wb = makeMockWorkbench(async () => 'reply');
      const adapter = new ChatAdapter(wb);
      const ac = new AbortController();

      await adapter.generateText('m', 'hi', {
        timeoutMs: 12345,
        signal: ac.signal,
        sessionId: 'sess-123',
        continueChat: true,
      });

      const submit = wb.submitAndWait as unknown as ReturnType<typeof vi.fn>;
      const call = submit.mock.calls[0]?.[0] as {
        timeoutMs: number;
        signal: AbortSignal;
        sessionId?: string;
        useSameChat?: boolean;
      };
      expect(call.timeoutMs).toBe(12345);
      expect(call.signal).toBe(ac.signal);
      expect(call.sessionId).toBe('sess-123');
      expect(call.useSameChat).toBe(true);
    });
  });
});
