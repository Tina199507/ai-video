/**
 * @ai-video/shared — public surface.
 *
 * Cross-process types shared by the backend (`src/`), the React UI
 * (`apps/ui-shell/`), and the Electron desktop shell
 * (`apps/desktop/`).  Sources live alongside this barrel under
 * `packages/shared/src/`; the legacy top-level `shared/` directory
 * was retired in direction A-1.
 */

export const PACKAGE_VERSION = '0.0.0';

export * from './types.js';
export * from './dashboardStatus.js';
export * from './bootPhase.js';
