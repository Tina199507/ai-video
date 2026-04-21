import { describe, it, expect } from 'vitest';
import {
  resolveSiteStrategy,
  jimengStrategy,
  klingStrategy,
  probeMatchExpr,
} from './index.js';

describe('resolveSiteStrategy', () => {
  it('returns jimeng for jimeng host', () => {
    const s = resolveSiteStrategy('https://jimeng.jianying.com/ai-tool/video/generate');
    expect(s.kind).toBe('jimeng');
    expect(s.providerLabel).toBe('即梦');
  });

  it('returns kling for klingai.com host', () => {
    const s = resolveSiteStrategy('https://klingai.com/video');
    expect(s.kind).toBe('kling');
    expect(s.providerLabel).toBe('可灵');
  });

  it('returns kling for klingai.kuaishou.com host', () => {
    const s = resolveSiteStrategy('https://klingai.kuaishou.com/gen');
    expect(s.kind).toBe('kling');
  });

  it('defaults to jimeng for unknown hosts', () => {
    const s = resolveSiteStrategy('https://unknown.example.com/');
    expect(s.kind).toBe('jimeng');
  });

  it('respects explicit provider override over URL heuristic', () => {
    const s = resolveSiteStrategy('https://unknown.example.com/', 'kling');
    expect(s.kind).toBe('kling');
    const s2 = resolveSiteStrategy('https://klingai.com/', 'jimeng');
    expect(s2.kind).toBe('jimeng');
  });
});

describe('SiteStrategy descriptors', () => {
  it('jimeng exposes expected selectors and patterns', () => {
    expect(jimengStrategy.fileInputSelector).toBe('input[type="file"]');
    expect(jimengStrategy.disabledClassName).toBe('lv-btn-disabled');
    expect(jimengStrategy.uploadApiHosts).toContain('jimeng.jianying.com');
    expect(jimengStrategy.quotaProviderId).toBe('seedance');
    expect(jimengStrategy.allowComplianceRetry).toBe(false);
    expect(jimengStrategy.extractVideoUrlFromApi).toBe(false);
  });

  it('kling exposes expected selectors and patterns', () => {
    expect(klingStrategy.fileInputSelector).toBe('input.el-upload__input');
    expect(klingStrategy.disabledClassName).toBe('is-disabled');
    expect(klingStrategy.uploadApiHosts).toContain('klingai.com');
    expect(klingStrategy.quotaProviderId).toBe('kling');
    expect(klingStrategy.dismissPopovers).toBe(true);
    expect(klingStrategy.allowComplianceRetry).toBe(true);
    expect(klingStrategy.extractVideoUrlFromApi).toBe(true);
  });

  it('both strategies are keyed on distinct URL hosts', () => {
    const jimengMatches = jimengStrategy.urlMatchers;
    const klingMatches = klingStrategy.urlMatchers;
    for (const m of jimengMatches) expect(klingMatches).not.toContain(m);
  });
});

describe('probeMatchExpr', () => {
  it('returns "false" for an empty probe list', () => {
    expect(probeMatchExpr([])).toBe('false');
  });

  it('compiles a single anyOf probe to a disjunction', () => {
    const expr = probeMatchExpr([{ anyOf: ['foo', 'bar'] }]);
    const fn = new Function('t', `return ${expr};`) as (t: string) => boolean;
    expect(fn('some foo text')).toBe(true);
    expect(fn('no match here')).toBe(false);
  });

  it('enforces the allOfAtLeastOne secondary constraint', () => {
    const expr = probeMatchExpr([
      { anyOf: ['登录'], allOfAtLeastOne: ['手机号', '扫码'] },
    ]);
    const fn = new Function('t', `return ${expr};`) as (t: string) => boolean;
    expect(fn('登录')).toBe(false);
    expect(fn('登录 手机号')).toBe(true);
    expect(fn('登录 扫码')).toBe(true);
    expect(fn('hello world')).toBe(false);
  });

  it('ors multiple probes together', () => {
    const expr = probeMatchExpr([{ anyOf: ['a'] }, { anyOf: ['b'] }]);
    const fn = new Function('t', `return ${expr};`) as (t: string) => boolean;
    expect(fn('a')).toBe(true);
    expect(fn('b')).toBe(true);
    expect(fn('c')).toBe(false);
  });
});
