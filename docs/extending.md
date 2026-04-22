# Extension Guide

This document is the primary reference for adding new capabilities to AI Video without modifying the core pipeline. It covers four extension surfaces: AI adapters, pipeline stages, site strategies, and out-of-tree plugins.

---

## Table of Contents

1. [Adding a New AI Adapter](#1-adding-a-new-ai-adapter)
2. [Adding a New Pipeline Stage](#2-adding-a-new-pipeline-stage)
3. [Adding a New Site Strategy](#3-adding-a-new-site-strategy)
4. [Out-of-Tree Plugins](#4-out-of-tree-plugins)
5. [Port System — Capability Injection](#5-port-system--capability-injection)
6. [Testing Your Extension](#6-testing-your-extension)

---

## 1. Adding a New AI Adapter

All AI interactions pass through the `AIAdapter` interface defined in `packages/pipeline-core/src/types/adapter.ts`. A new adapter must implement this interface and be registered with `AdapterResolver`.

### Step 1 — Implement the interface

Create `packages/adapter-common/src/myProviderAdapter.ts`:

```typescript
import type { AIAdapter, AIRequestOptions, GenerationResult } from '@ai-video/pipeline-core/types/adapter.js';
import { withRetry } from '@ai-video/lib/retry.js';

export class MyProviderAdapter implements AIAdapter {
  readonly provider = 'my-provider';

  constructor(private readonly apiKey: string) {}

  async generateText(
    model: string,
    prompt: string,
    options?: AIRequestOptions,
  ): Promise<GenerationResult> {
    return withRetry(async () => {
      // Call your provider API here
      const response = await fetch('https://api.myprovider.com/v1/chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model, prompt }),
        signal: options?.signal,
      });
      const data = await response.json();
      return { text: data.output };
    }, { label: 'MyProvider API request' });
  }

  // Implement only the capabilities your provider supports.
  // The AIAdapter interface requires generateText; all other methods are optional.
  async generateImage(
    model: string,
    prompt: string,
    aspectRatio?: string,
    negativePrompt?: string,
    options?: AIRequestOptions,
  ): Promise<GenerationResult> {
    // ... or throw if unsupported
    throw new Error('generateImage not supported by MyProviderAdapter');
  }

  async generateVideo(
    model: string,
    prompt: string,
    options?: AIRequestOptions,
  ): Promise<GenerationResult> {
    throw new Error('generateVideo not supported by MyProviderAdapter');
  }
}
```

### Step 2 — Export from the package

Add to `packages/adapter-common/src/index.ts`:

```typescript
export { MyProviderAdapter } from './myProviderAdapter.js';
```

### Step 3 — Register with AdapterResolver

In `packages/pipeline-core/src/adapterResolver.ts`, add a case for your provider ID so the resolver can instantiate your adapter when a resource of type `api` with `provider: 'my-provider'` is configured.

### Step 4 — Document the new variable

Add the API-key environment variable to `.env.example` and `docs/deployment.md` (Environment Variables → AI providers).

---

## 2. Adding a New Pipeline Stage

Stages are registered with the `StageRegistry` in `pipeline-core`. Built-in video stages live in `packages/pipeline-video/src/stages/defs/`.

### Step 1 — Define the stage ID

Add the new stage name to the `PipelineStage` union in `packages/pipeline-core/src/sharedTypes.ts`:

```typescript
export type PipelineStage =
  | 'CAPABILITY_ASSESSMENT'
  | 'STYLE_EXTRACTION'
  // ... existing stages ...
  | 'MY_CUSTOM_STAGE';     // ← add here
```

### Step 2 — Create the stage module

Create `packages/pipeline-video/src/stages/defs/myCustomStage.ts`:

```typescript
import { registerStage } from '@ai-video/pipeline-core/index.js';
import type { StageRunContext } from '@ai-video/pipeline-core/index.js';

registerStage({
  stage: 'MY_CUSTOM_STAGE',

  // Optional ordering constraints:
  after: 'RESEARCH',     // run after RESEARCH completes
  before: 'NARRATIVE_MAP', // run before NARRATIVE_MAP starts

  async execute(ctx: StageRunContext): Promise<void> {
    const { project, projectId, assetsDir, getAdapter, saveArtifact, addLog } = ctx;

    addLog({ level: 'info', stage: 'MY_CUSTOM_STAGE', message: 'Starting custom stage' });

    const adapter = getAdapter('MY_CUSTOM_STAGE', 'text');
    const result = await adapter.generateText('gemini-2.0-flash', `Analyze: ${project.topic}`);

    saveArtifact('my-custom-output.json', { analysis: result.text });
  },
});
```

### Step 3 — Register the module

Import your file in `packages/pipeline-video/src/stages/defs/index.ts`:

```typescript
import './myCustomStage.js';
```

### Step 4 — Add the artifact filename constant

If your stage produces a named artifact, add it to the `ARTIFACT` constant map in `packages/pipeline-core/src/constants.ts`:

```typescript
export const ARTIFACT = {
  // ... existing entries ...
  MY_CUSTOM_OUTPUT: 'my-custom-output.json',
} as const;
```

### Step 5 — Update documentation

Add a row to the stage table in `docs/architecture.md` (The 15-Pass Compilation Pipeline section).

---

## 3. Adding a New Site Strategy

Site strategies define how Playwright interacts with a specific video-generation website. They implement the `SiteStrategy` interface in `packages/site-strategies/src/types.ts`.

### Step 1 — Create the strategy file

Create `packages/site-strategies/src/mySite.ts`:

```typescript
import type { SiteStrategy } from './types.js';

export const mySiteStrategy: SiteStrategy = {
  kind: 'my-site' as any, // add 'my-site' to VideoProviderKind first (Step 2)
  providerLabel: 'My Site',
  urlMatchers: ['mysite.com/video'],
  hydrationDelayMs: 2000,

  fileInputSelector: 'input[type=file]',
  promptSelectors: ['textarea.prompt', '#prompt-input'],
  generateButtonSelectors: ['button.generate', 'button[data-action=generate]'],
  disabledClassName: 'disabled',
  uploadApiHosts: ['api.mysite.com'],
  generationApiHosts: ['api.mysite.com'],

  quotaProviderId: 'my-site',
  loggedOutUrlFragments: ['/login', '/signup'],
  dismissPopovers: false,
  allowComplianceRetry: false,
  extractVideoUrlFromApi: true,

  pagePatterns: {
    notLoggedIn: [{ anyOf: ['Sign in', 'Log in'] }],
    paywall: [{ anyOf: ['Upgrade', 'Subscribe'] }],
    creditExhausted: [{ anyOf: ['No credits'] }],
    complianceRejected: [{ anyOf: ['Content policy', 'Rejected'] }],
  },
};
```

### Step 2 — Extend the `VideoProviderKind` union

In `packages/site-strategies/src/types.ts`:

```typescript
export type VideoProviderKind = 'jimeng' | 'kling' | 'my-site';
```

### Step 3 — Register the strategy

In `packages/site-strategies/src/videoSites.ts`:

```typescript
import { mySiteStrategy } from './mySite.js';

const ALL_STRATEGIES: readonly SiteStrategy[] = Object.freeze([
  jimengStrategy,
  klingStrategy,
  mySiteStrategy, // ← add here
]);

const BY_KIND: Record<VideoProviderKind, SiteStrategy> = {
  jimeng: jimengStrategy,
  kling: klingStrategy,
  'my-site': mySiteStrategy, // ← add here
};
```

Export the strategy from the package index (`packages/site-strategies/src/index.ts`) if it needs to be referenced directly.

---

## 4. Out-of-Tree Plugins

The plugin system lets you extend the pipeline without modifying the monorepo. Plugins are loaded at startup from `PLUGINS_DIR` when `ENABLE_PLUGINS=1`.

### Plugin structure

A plugin bundle is a single `.mjs` (or `.js`) file that exports:

```typescript
import type { PluginManifest } from '@ai-video/pipeline-core';

export const manifest: PluginManifest = {
  id: 'com.example.my-plugin',
  version: '1.0.0',
  name: 'My Plugin',
  description: 'Adds a custom text-enrichment stage',
  kind: 'stage',        // 'stage' | 'provider' | 'strategy'
  permissions: [],       // declare required permissions
  signature: undefined,  // optional HMAC signature for integrity checking
};

// Side-effect: register your stage/adapter/strategy
import { registerStage } from '@ai-video/pipeline-core';
registerStage({ stage: 'MY_ENRICHMENT', execute: async (ctx) => { /* … */ } });
```

### Trust file

Add your plugin ID to `<DATA_DIR>/trusted-plugins.json`:

```json
["com.example.my-plugin"]
```

Then restart the server. If `PLUGIN_STRICT=1` is set, the server aborts on any load failure.

### Security considerations

- Plugins run in the same Node.js process with full access to the runtime. Only load plugins from trusted sources.
- Use `permissions` in the manifest to declare what the plugin accesses — this is informational today but will be enforced by future permission guards.
- Enable `PLUGIN_STRICT=1` in production to catch misconfigured plugins early.

---

## 5. Port System — Capability Injection

`pipeline-core` exposes six **capability ports** that decouple the compilation engine from its concrete implementations. This allows the same engine to run in different contexts (server, Electron, test) with different implementations wired at startup.

```typescript
type PipelineCorePorts = {
  adapterHostBindingsPort: AdapterHostBindingsPort;
  chatAutomationPort:      ChatAutomationPort;
  ffmpegAssemblerPort:     FFmpegAssemblerPort;
  responseParserPort:      ResponseParserPort;
  videoProviderPort:       VideoProviderPort;
  voiceStylePort:          VoiceStylePort;
};
```

### Port lifecycle

```
1. Configure (once, at startup):  configurePipelineCorePorts({ ... })
2. Freeze (once, after configure): freezePipelineCorePorts()
3. Runtime: any attempted port mutation throws
```

The freeze prevents accidental hot-swap after the server starts. To replace a port implementation (e.g. in tests), call `resetPipelineCorePorts()` first — this is only available in non-production builds.

### Custom port implementation example

To swap in a no-op FFmpeg assembler for testing:

```typescript
import { configurePipelineCorePorts, freezePipelineCorePorts } from '@ai-video/pipeline-core';

configurePipelineCorePorts({
  ffmpegAssemblerPort: {
    assemble: async (ctx) => ({ outputPath: '/dev/null' }),
    assembleWithTransitions: async (ctx) => ({ outputPath: '/dev/null' }),
  },
  // ... other ports from their real implementations
});
freezePipelineCorePorts();
```

---

## 6. Testing Your Extension

### Unit test your adapter

Place your test in the same package as the adapter:

```
packages/adapter-common/src/myProviderAdapter.test.ts
```

Mock the external API using `vi.fn()` or `vi.mock()`. Never make real network calls in unit tests.

### Unit test your stage

```
packages/pipeline-video/src/stages/defs/myCustomStage.test.ts
```

Pass a minimal `StageRunContext` stub:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('myCustomStage', () => {
  it('saves the analysis artifact', async () => {
    const saveArtifact = vi.fn();
    const getAdapter = vi.fn().mockReturnValue({
      generateText: vi.fn().mockResolvedValue({ text: 'result' }),
    });

    const ctx = {
      project: { topic: 'test topic' },
      projectId: 'proj_1',
      assetsDir: '/tmp',
      getAdapter,
      saveArtifact,
      addLog: vi.fn(),
      isAborted: () => false,
      config: { productionConcurrency: 1 },
      emitEvent: vi.fn(),
      providerRegistry: {} as any,
      regenerateScene: vi.fn(),
    };

    // Import triggers the registerStage side-effect
    await import('./myCustomStage.js');

    // Get the registered definition and call execute
    const { getStageDefinitions } = await import('@ai-video/pipeline-core');
    const def = getStageDefinitions().find(d => d.stage === 'MY_CUSTOM_STAGE')!;
    await def.execute(ctx as any);

    expect(saveArtifact).toHaveBeenCalledWith('my-custom-output.json', expect.any(Object));
  });
});
```

### Run only your new tests

```bash
npx vitest run packages/adapter-common/src/myProviderAdapter.test.ts
npx vitest run packages/pipeline-video/src/stages/defs/myCustomStage.test.ts
```
