# @ai-video/adapter-common

AI provider adapter implementations for the AI Video pipeline. This package implements the `AIAdapter` interface from `@ai-video/pipeline-core` for each supported AI provider.

---

## Overview

| Adapter | Class | Description |
|---------|-------|-------------|
| Google Gemini | `GeminiAdapter` | Google GenAI SDK — text, image (Gemini native + Imagen 3), video (Veo 2), TTS, file upload |
| Browser automation | `ChatAdapter` | Playwright-driven automation for any AI chat site |
| AIVideoMaker | `AIVideoMakerAdapter` | REST API for text-to-video and image-to-video |
| Fallback chain | `FallbackAdapter` | Chains a primary adapter → fallback; auto-switches on quota errors |

---

## `AIAdapter` Interface

All adapters implement the contract from `packages/pipeline-core/src/types/adapter.ts`:

```typescript
interface AIAdapter {
  provider: string;
  keyFingerprint?: string;  // masked API key (last 4 chars) for audit logs
  generateText(model, prompt, options?): Promise<GenerationResult>;
  generateImage(model, prompt, aspectRatio?, negativePrompt?, options?): Promise<GenerationResult>;
  generateVideo(model, prompt, options?): Promise<GenerationResult>;
  uploadFile?(file): Promise<{ uri: string; mimeType: string }>;
  generateSpeech?(text, voice?, options?): Promise<GenerationResult>;
}
```

See [`docs/extending.md`](../../docs/extending.md) for a step-by-step guide to adding a new adapter.

---

## GeminiAdapter

Wraps `@google/genai` SDK. Supports all Gemini model families.

```typescript
import { GeminiAdapter } from '@ai-video/adapter-common';

const adapter = new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY! });

// Text generation
const result = await adapter.generateText('gemini-2.0-flash', 'Write a haiku about clouds');

// Image generation (Imagen 3)
const img = await adapter.generateImage('imagen-3.0-generate-002', 'A sunset over mountains');

// TTS
const audio = await adapter.generateSpeech('Hello world', 'en-US-Neural2-F');
```

---

## ChatAdapter

Drives any AI chat site via Playwright. Requires a browser context from `BrowserManager`.

```typescript
import { ChatAdapter } from '@ai-video/adapter-common';

const adapter = new ChatAdapter({
  provider: 'chatgpt',
  browserContext,
  siteUrl: 'https://chat.openai.com',
  selectors: { promptInput: 'textarea', sendButton: 'button[type=submit]' },
});

const result = await adapter.generateText('gpt-4o', 'Explain quantum computing');
```

---

## FallbackAdapter

Transparently wraps two adapters. If the primary throws a quota error, the fallback takes over for that request.

```typescript
import { FallbackAdapter, GeminiAdapter, ChatAdapter } from '@ai-video/adapter-common';

const adapter = new FallbackAdapter(
  new GeminiAdapter({ apiKey: '...' }),  // primary
  new ChatAdapter({ provider: 'gemini', … }),  // fallback
);
```

---

## Shared Helpers

### `resolveQueueDetection`

Determines whether a queued task is still waiting or has failed based on provider-specific text patterns.

### `VideoProviderHealthMonitor`

Tracks health state of a video generation provider — emits `healthy` / `degraded` / `failed` events based on consecutive success/failure counts.

### `sanitizePromptForJimeng` / `sanitizePromptForKling`

Rewrites prompts to comply with each platform's content policy before submission.

### `resolveVoiceFromStyle`

Maps a `StyleProfile.audioStyle` to an edge-tts voice name.

---

## Testing

```bash
npx vitest run packages/adapter-common/src
```

Coverage thresholds: 45% lines / 55% functions.

Tests use `vi.mock` to stub browser contexts and API responses — no real network calls are made in the test suite.
