import { describe, expect, it } from 'vitest';
import {
  PACKAGE_VERSION,
  jimengStrategy,
  klingStrategy,
  resolveSiteStrategy,
  isKlingStrategy,
} from './index.js';

describe('@ai-video/site-strategies barrel', () => {
  it('exports a stable version constant', () => {
    expect(PACKAGE_VERSION).toBe('0.0.0');
  });

  it('re-exports the two built-in site strategies', () => {
    expect(jimengStrategy).toBeTruthy();
    expect(klingStrategy).toBeTruthy();
    expect(isKlingStrategy(klingStrategy)).toBe(true);
    expect(isKlingStrategy(jimengStrategy)).toBe(false);
  });

  it('resolveSiteStrategy is a function', () => {
    expect(typeof resolveSiteStrategy).toBe('function');
  });
});
