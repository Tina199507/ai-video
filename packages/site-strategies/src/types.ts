/* ------------------------------------------------------------------ */
/*  SiteStrategy — per-provider behaviour knobs for videoProvider      */
/* ------------------------------------------------------------------ */

export type VideoProviderKind = 'jimeng' | 'kling';

/** A plain-text probe run inside `page.evaluate`. */
export interface TextProbe {
  /** All substrings that must appear on the page for the probe to fire. */
  readonly anyOf: readonly string[];
  /** Optional secondary constraint: at least one of these must also appear. */
  readonly allOfAtLeastOne?: readonly string[];
}

export interface SiteStrategy {
  /** Machine-readable provider kind. */
  readonly kind: VideoProviderKind;
  /** Short human-facing label used in log lines (e.g. "即梦", "可灵"). */
  readonly providerLabel: string;
  /** Hostnames/paths that indicate this provider. Used for URL detection. */
  readonly urlMatchers: readonly string[];
  /** Default hydration delay after `goto` before interacting with the page. */
  readonly hydrationDelayMs: number;

  /** Selector for the hidden `<input type=file>` that receives uploads. */
  readonly fileInputSelector: string;
  /** Ordered list of selectors for the prompt editor/textarea. */
  readonly promptSelectors: readonly string[];
  /** Ordered list of selectors for the "Generate" button. */
  readonly generateButtonSelectors: readonly string[];
  /** CSS class that indicates the generate button is disabled. */
  readonly disabledClassName: string;
  /** Hostnames to whitelist when sniffing provider API responses (upload). */
  readonly uploadApiHosts: readonly string[];
  /** Hostnames to whitelist when sniffing generation API responses. */
  readonly generationApiHosts: readonly string[];

  /** Kind of quota event to emit to the unified quotaBus. */
  readonly quotaProviderId: string;

  /**
   * Text-substring probes for common page states. Evaluated in the browser
   * via `document.body.innerText` matching, so no runtime dependency here.
   */
  readonly pagePatterns: {
    /** Text that means the account is logged out. */
    readonly notLoggedIn: readonly TextProbe[];
    /** Text that means the quota / subscription paywall has appeared. */
    readonly paywall: readonly TextProbe[];
    /** Text that indicates credits are exhausted mid-wait. */
    readonly creditExhausted: readonly TextProbe[];
    /** Text that indicates a content-moderation rejection. */
    readonly complianceRejected: readonly TextProbe[];
  };

  /** If the current URL contains any of these, the user is logged out. */
  readonly loggedOutUrlFragments: readonly string[];

  /** Whether the provider shows Element UI popovers that must be dismissed. */
  readonly dismissPopovers: boolean;

  /**
   * Provider-specific late-retry strategy. When `true`, on a compliance
   * rejection the caller is allowed to rewrite the prompt and retry once.
   */
  readonly allowComplianceRetry: boolean;

  /** Whether to inspect captured API responses for a CDN video URL. */
  readonly extractVideoUrlFromApi: boolean;
}
