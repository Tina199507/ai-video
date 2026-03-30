import { Scene } from "../types";
import { Logger } from "../lib/logger";
import { runSafetyMiddleware } from "./safety";

export const validateAsset = async (assetUrl: string, type: 'image' | 'video'): Promise<boolean> => {
    try {
        const res = await fetch(assetUrl, { method: 'HEAD' });
        if (!res.ok) {
            Logger.warn(`Asset Validation Failed: HTTP ${res.status} for ${assetUrl}`);
            return false;
        }
        return true;
    } catch (e) {
        Logger.warn(`Asset Validation Error for ${assetUrl}`, e);
        return false;
    }
};

/**
 * Final risk gate applied to all generated scenes before the workflow is marked complete.
 *
 * Checks performed (client-side, no extra API call required):
 *  1. Scene error status  — any scene that failed generation is flagged.
 *  2. Missing assets      — scenes without an asset URL (neither image nor video).
 *  3. Placeholder assets  — asset URLs that are clearly stub/placeholder values.
 *  4. Script text safety  — runs each scene's narrative text through the safety
 *                           middleware to catch late-stage injection of unsafe content.
 *
 * NOTE: Visual-content safety (detecting NSFW imagery, violence in generated frames)
 * requires a dedicated vision model call and should be added as a server-side step
 * once a moderation API (e.g., Gemini safety filters, Google Cloud Vision SafeSearch)
 * is wired into the production pipeline.
 */
export const finalRiskGate = async (
    scenes: Scene[]
): Promise<{ isSafe: boolean; issues: string[] }> => {
    Logger.info("[FINAL RISK GATE] Running scene-level safety validation...");

    const issues: string[] = [];

    // Placeholder patterns: data URIs that are clearly stubs, or well-known placeholder domains
    const PLACEHOLDER_PATTERNS = [
        /^https?:\/\/via\.placeholder/i,
        /^https?:\/\/placehold\.it/i,
        /^https?:\/\/dummyimage/i,
        /^data:image\/gif;base64,R0lGOD/,   // 1×1 transparent GIF
        /placeholder/i,
    ];

    const isPlaceholder = (url: string) =>
        PLACEHOLDER_PATTERNS.some(p => p.test(url));

    for (const scene of scenes) {
        const sceneLabel = `Scene ${scene.number} (id: ${scene.id})`;

        // --- Check 1: Generation error ---
        if (scene.status === 'error') {
            issues.push(`${sceneLabel}: generation failed — asset may be missing or corrupt.`);
        }

        // --- Check 2: Missing asset ---
        if (!scene.assetUrl) {
            issues.push(`${sceneLabel}: no asset URL — scene will render as blank.`);
        } else if (isPlaceholder(scene.assetUrl)) {
            // --- Check 3: Placeholder asset ---
            issues.push(`${sceneLabel}: asset URL is a placeholder — real generation did not complete.`);
        }

        // --- Check 4: Script text safety ---
        const textToCheck = [scene.narrative, scene.visualPrompt]
            .filter(Boolean)
            .join(' ');

        if (textToCheck.trim().length > 0) {
            const safetyReport = runSafetyMiddleware(textToCheck);

            if (safetyReport.suicideDetected) {
                issues.push(
                    `${sceneLabel}: suicide/self-harm content detected in script text — ` +
                    `spans: ${safetyReport.excerptSpans
                        .filter(s => s.category === 'suicide')
                        .map(s => `"${s.text}"`)
                        .join(', ')}.`
                );
            }

            if (safetyReport.medicalClaimDetected) {
                issues.push(
                    `${sceneLabel}: unverified medical claim detected in script text — ` +
                    `spans: ${safetyReport.excerptSpans
                        .filter(s => s.category === 'medical_claim')
                        .map(s => `"${s.text}"`)
                        .join(', ')}.`
                );
            }

            if (safetyReport.numericIssues.length > 0) {
                issues.push(
                    `${sceneLabel}: suspicious numeric claim(s) — ${safetyReport.numericIssues.join('; ')}.`
                );
            }
        }
    }

    const isSafe = issues.length === 0;

    if (!isSafe) {
        Logger.warn(
            `[FINAL RISK GATE] ${issues.length} issue(s) found across ${scenes.length} scenes.`,
            issues
        );
    } else {
        Logger.info(`[FINAL RISK GATE] All ${scenes.length} scenes passed.`);
    }

    return { isSafe, issues };
};