/* ------------------------------------------------------------------ */
/*  Shared types — used by both backend (src/) and frontend (ui/) */
/* ------------------------------------------------------------------ */
/* ---- Pipeline events (SSE) ---- */
/** Centralised SSE event type constants — use these instead of inline strings. */
export const SSE_EVENT = {
    CREATED: 'pipeline_created',
    STAGE: 'pipeline_stage',
    ARTIFACT: 'pipeline_artifact',
    LOG: 'pipeline_log',
    ERROR: 'pipeline_error',
    COMPLETE: 'pipeline_complete',
    PAUSED: 'pipeline_paused',
    RESUMED: 'pipeline_resumed',
    SCENE_REVIEW: 'pipeline_scene_review',
    ASSEMBLY_PROGRESS: 'pipeline_assembly_progress',
    WARNING: 'pipeline_warning',
};
/* ---- Workbench SSE events ---- */
/** Centralised workbench event type constants — use these instead of inline strings. */
export const WB_EVENT = {
    STATE: 'state',
    TASK_STARTED: 'task_started',
    TASK_DONE: 'task_done',
    TASK_FAILED: 'task_failed',
    QUOTA_EXHAUSTED: 'quota_exhausted',
    ACCOUNT_SWITCHED: 'account_switched',
    LOGIN_BROWSER_OPENED: 'login_browser_opened',
    LOGIN_BROWSER_CLOSED: 'login_browser_closed',
    MODELS_DETECTED: 'models_detected',
    STOPPED: 'stopped',
    ACTIVE_PAGE_CRASHED: 'active_page_crashed',
    SELECTOR_HEALTH_WARNING: 'selector_health_warning',
    SELECTORS_UPDATED: 'selectors_updated',
    BGM_DOWNLOAD_READY: 'bgm_download_ready',
};
/** Default subtitle style presets. */
export const SUBTITLE_PRESETS = {
    classic_white: {
        fontName: 'Arial',
        fontSize: 20,
        primaryColor: '#FFFFFF',
        outlineColor: '#000000',
        outlineWidth: 2,
        shadowEnabled: true,
        marginV: 35,
        backdropEnabled: false,
        backdropOpacity: 0,
    },
    backdrop_black: {
        fontName: 'Arial',
        fontSize: 20,
        primaryColor: '#FFFFFF',
        outlineColor: '#000000',
        outlineWidth: 0,
        shadowEnabled: false,
        marginV: 35,
        backdropEnabled: true,
        backdropOpacity: 0.6,
    },
    cinematic: {
        fontName: 'Georgia',
        fontSize: 22,
        primaryColor: '#FFFDE7',
        outlineColor: '#1A1A1A',
        outlineWidth: 1,
        shadowEnabled: true,
        marginV: 50,
        backdropEnabled: false,
        backdropOpacity: 0,
    },
    top_hint: {
        fontName: 'Arial',
        fontSize: 16,
        primaryColor: '#FFFFFF',
        outlineColor: '#333333',
        outlineWidth: 1,
        shadowEnabled: false,
        marginV: 20,
        backdropEnabled: true,
        backdropOpacity: 0.5,
    },
    custom: {
        fontName: 'Arial',
        fontSize: 20,
        primaryColor: '#FFFFFF',
        outlineColor: '#000000',
        outlineWidth: 2,
        shadowEnabled: true,
        marginV: 35,
        backdropEnabled: false,
        backdropOpacity: 0,
    },
};
/** Default refine options. */
export const DEFAULT_REFINE_OPTIONS = {
    bgmPath: undefined,
    bgmVolume: 0.15,
    bgmFadeIn: 0,
    bgmFadeOut: 0,
    subtitlePreset: 'classic_white',
    subtitleStyle: SUBTITLE_PRESETS.classic_white,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    titleCard: null,
    qualityPreset: 'medium',
    speedPreset: 'balanced',
    transitionDuration: 0.5,
};
/**
 * Map a PackagingTrack (from StyleAnalysisCIR) to smart RefineOptions defaults.
 * Also returns a provenance set indicating which fields were derived.
 * Only maps fields where the confidence map indicates ≥ 'inferred'.
 */
export function packagingStyleToRefineOptions(pkg, confidence, bgmRelativeVolume) {
    const provenance = new Set();
    if (!pkg)
        return { options: {}, provenance };
    const ok = (field) => {
        const c = confidence?.[field];
        return c === 'confident' || c === 'inferred' || c === 'computed';
    };
    const opts = {};
    // --- Subtitle style ---
    const fontCategoryMap = {
        'sans-serif': 'classic_white',
        'serif': 'cinematic',
        'handwritten': 'cinematic',
        'monospace': 'classic_white',
    };
    const fontNameMap = {
        'sans-serif': 'Arial',
        'serif': 'Georgia',
        'handwritten': 'Georgia',
        'monospace': 'Courier New',
    };
    const fontSizeMap = { small: 16, medium: 20, large: 24 };
    const marginVMap = { bottom: 35, top: 20, center: 50 };
    // Apply subtitle preset based on font category + backdrop
    if (pkg.subtitleHasBackdrop) {
        opts.subtitlePreset = 'backdrop_black';
        opts.subtitleStyle = { ...SUBTITLE_PRESETS.backdrop_black };
        provenance.add('subtitlePreset');
        provenance.add('subtitleStyle');
    }
    else {
        const preset = fontCategoryMap[pkg.subtitleFontCategory] ?? 'classic_white';
        opts.subtitlePreset = preset;
        opts.subtitleStyle = { ...SUBTITLE_PRESETS[preset] };
        provenance.add('subtitlePreset');
        provenance.add('subtitleStyle');
    }
    // Override specific subtitle fields from packaging analysis
    if (ok('subtitle_primary_color')) {
        opts.subtitleStyle.primaryColor = pkg.subtitlePrimaryColor;
    }
    if (ok('subtitle_outline_color')) {
        opts.subtitleStyle.outlineColor = pkg.subtitleOutlineColor;
    }
    if (ok('subtitle_font_size')) {
        opts.subtitleStyle.fontSize = fontSizeMap[pkg.subtitleFontSize] ?? 20;
    }
    opts.subtitleStyle.fontName = fontNameMap[pkg.subtitleFontCategory] ?? 'Arial';
    opts.subtitleStyle.shadowEnabled = pkg.subtitleHasShadow;
    opts.subtitleStyle.marginV = marginVMap[pkg.subtitlePosition] ?? 35;
    opts.subtitleStyle.backdropEnabled = pkg.subtitleHasBackdrop;
    opts.subtitleStyle.backdropOpacity = pkg.subtitleHasBackdrop ? 0.6 : 0;
    // If any custom color/size differs from preset, switch to custom preset
    const presetKey = opts.subtitlePreset;
    const presetRef = SUBTITLE_PRESETS[presetKey];
    if (opts.subtitleStyle.primaryColor !== presetRef.primaryColor ||
        opts.subtitleStyle.outlineColor !== presetRef.outlineColor ||
        opts.subtitleStyle.fontSize !== presetRef.fontSize) {
        opts.subtitlePreset = 'custom';
    }
    // --- Transition ---
    if (ok('transition_estimated_duration_sec') && pkg.transitionEstimatedDurationSec > 0) {
        opts.transitionDuration = pkg.transitionEstimatedDurationSec;
        provenance.add('transitionDuration');
    }
    // --- Fade in/out ---
    if (pkg.hasFadeIn && pkg.fadeInDurationSec > 0) {
        opts.fadeInDuration = pkg.fadeInDurationSec;
        provenance.add('fadeInDuration');
    }
    if (pkg.hasFadeOut && pkg.fadeOutDurationSec > 0) {
        opts.fadeOutDuration = pkg.fadeOutDurationSec;
        provenance.add('fadeOutDuration');
    }
    // --- Title card from intro card ---
    if (pkg.hasIntroCard && pkg.introCardDurationSec > 0) {
        opts.titleCard = {
            fontSize: 64,
            fontColor: pkg.subtitlePrimaryColor || '#ffffff',
            duration: pkg.introCardDurationSec,
        };
        provenance.add('titleCard');
    }
    // --- BGM volume from StyleAnalysisCIR.audioTrack ---
    if (bgmRelativeVolume !== undefined && bgmRelativeVolume > 0) {
        opts.bgmVolume = bgmRelativeVolume;
        provenance.add('bgmVolume');
    }
    return { options: opts, provenance };
}
