/* ------------------------------------------------------------------ */
/*  Site strategy registry (video provider sites)                      */
/* ------------------------------------------------------------------ */

import { jimengStrategy } from './jimeng.js';
import { klingStrategy } from './kling.js';
import type { SiteStrategy, VideoProviderKind } from './types.js';

export type { SiteStrategy, VideoProviderKind, TextProbe } from './types.js';
export { jimengStrategy } from './jimeng.js';
export { klingStrategy } from './kling.js';

const ALL_STRATEGIES: readonly SiteStrategy[] = Object.freeze([
  jimengStrategy,
  klingStrategy,
]);

const BY_KIND: Record<VideoProviderKind, SiteStrategy> = {
  jimeng: jimengStrategy,
  kling: klingStrategy,
};

export function resolveSiteStrategy(
  url: string,
  explicit?: VideoProviderKind,
): SiteStrategy {
  if (explicit) return BY_KIND[explicit];
  for (const s of ALL_STRATEGIES) {
    if (s.urlMatchers.some(m => url.includes(m))) return s;
  }
  return jimengStrategy;
}

export function isKlingStrategy(s: SiteStrategy): boolean {
  return s.kind === 'kling';
}

export function probeMatchExpr(
  probes: readonly import('./types.js').TextProbe[],
  textVar = 't',
): string {
  if (probes.length === 0) return 'false';
  const clauses = probes.map(p => {
    const anyOfClause = p.anyOf
      .map(kw => `${textVar}.indexOf(${JSON.stringify(kw)}) >= 0`)
      .join(' || ');
    const any = p.anyOf.length ? `(${anyOfClause})` : 'true';
    if (!p.allOfAtLeastOne || p.allOfAtLeastOne.length === 0) return any;
    const extra = p.allOfAtLeastOne
      .map(kw => `${textVar}.indexOf(${JSON.stringify(kw)}) >= 0`)
      .join(' || ');
    return `(${any} && (${extra}))`;
  });
  return `(${clauses.join(' || ')})`;
}
