# @ai-video/site-strategies

Playwright-based automation strategies for AI video-generation websites. This package defines the `SiteStrategy` interface and provides implementations for each supported provider.

---

## Overview

| Strategy | Provider | Kind |
|----------|----------|------|
| `jimengStrategy` | 即梦 (Jimeng) | `jimeng` |
| `klingStrategy` | 可灵 (Kling) | `kling` |

Each strategy is a plain data object describing the CSS selectors, URL patterns, text probes, and timing constants for one website. No Playwright types are imported here — the strategies are consumed by the `VideoProvider` runner in `pipeline-core`, which owns the browser context.

---

## `SiteStrategy` Interface

```typescript
interface SiteStrategy {
  kind: VideoProviderKind;          // 'jimeng' | 'kling'
  providerLabel: string;            // display name for logs
  urlMatchers: readonly string[];   // hostname fragments for URL detection

  // Selectors
  fileInputSelector: string;
  promptSelectors: readonly string[];
  generateButtonSelectors: readonly string[];
  disabledClassName: string;

  // API sniffing hosts
  uploadApiHosts: readonly string[];
  generationApiHosts: readonly string[];

  // Page state probes (run via document.body.innerText matching)
  pagePatterns: {
    notLoggedIn:        readonly TextProbe[];
    paywall:            readonly TextProbe[];
    creditExhausted:    readonly TextProbe[];
    complianceRejected: readonly TextProbe[];
  };

  loggedOutUrlFragments: readonly string[];
  hydrationDelayMs: number;
  dismissPopovers: boolean;
  allowComplianceRetry: boolean;
  extractVideoUrlFromApi: boolean;
}
```

---

## Resolving a Strategy

```typescript
import { resolveSiteStrategy } from '@ai-video/site-strategies';

// Auto-detect from URL
const strategy = resolveSiteStrategy('https://jimeng.jianying.com/ai-tool/video/generate');
// → jimengStrategy

// Explicit override
const klingStrat = resolveSiteStrategy(url, 'kling');
```

---

## Adding a New Site Strategy

See [`docs/extending.md`](../../docs/extending.md#3-adding-a-new-site-strategy) for the full step-by-step guide. At a high level:

1. Create `packages/site-strategies/src/mySite.ts` implementing `SiteStrategy`.
2. Add `'my-site'` to the `VideoProviderKind` union in `types.ts`.
3. Register the strategy in `videoSites.ts` (both `ALL_STRATEGIES` array and `BY_KIND` map).
4. Export from `index.ts` if direct imports are needed.

---

## Chat Automation Helpers

In addition to video-site strategies, this package exports helpers for the generic chat-automation workbench:

| Export | Description |
|--------|-------------|
| `chatAutomation` | High-level functions for navigating to a chat site, submitting prompts, and extracting responses |
| `videoOptionSelector` | Detects and selects video quality/resolution options in provider UIs |

---

## Testing

```bash
npx vitest run packages/site-strategies/src
```

Selector probes are covered by the nightly `selector-probe.yml` workflow (see [`docs/ci-cd.md`](../../docs/ci-cd.md#selector-probe-selector-probeyml)).
