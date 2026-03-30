/**
 * feedback.ts
 * ------------------------------------------------------------------
 * Feedback persistence for the data flywheel / fine-tuning pipeline.
 *
 * Storage strategy (three tiers, in priority order):
 *
 *  Tier 1 — IndexedDB  (primary, survives page reloads, up to hundreds of MB)
 *            All entries are written here first.
 *
 *  Tier 2 — LocalStorage  (fallback when IndexedDB is unavailable, e.g. some
 *            private-browsing modes; limited to ~5 MB total)
 *
 *  Tier 3 — Backend HTTP POST  (async, best-effort, does not block the UI)
 *            Activated when VITE_FEEDBACK_ENDPOINT is set in the environment.
 *            If the request fails, the error is logged but not re-thrown — the
 *            entry is still persisted locally in Tier 1/2.
 *
 * Reading back feedback always checks IndexedDB first, then falls back to
 * LocalStorage so existing entries written by older builds are still visible.
 * ------------------------------------------------------------------
 */

import { ScriptOutput, StyleProfile } from "../types";
import { Logger } from "../lib/logger";

export interface FeedbackEntry {
  id: string;
  runId: string;
  timestamp: number;
  originalScript: string;
  editedScript: string;
  diffSummary?: string;
  styleProfile: StyleProfile;
  userRating?: number;   // 1–5
  userComments?: string;
}

/* ─────────────────────────── */
/*  IndexedDB helpers          */
/* ─────────────────────────── */

const IDB_NAME    = 'VideoStudioDB';
const IDB_STORE   = 'feedback';
const IDB_VERSION = 2;   // bump if schema changes

function openFeedbackDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);

        req.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

async function idbPut(entry: FeedbackEntry): Promise<void> {
    const db    = await openFeedbackDB();
    return new Promise((resolve, reject) => {
        const tx    = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req   = store.put(entry);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
        tx.oncomplete = () => db.close();
    });
}

async function idbGet(id: string): Promise<FeedbackEntry | null> {
    const db = await openFeedbackDB();
    return new Promise((resolve, reject) => {
        const tx    = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req   = store.get(id);
        req.onsuccess = () => { resolve(req.result ?? null); db.close(); };
        req.onerror   = () => { reject(req.error); db.close(); };
    });
}

async function idbGetAll(): Promise<FeedbackEntry[]> {
    const db = await openFeedbackDB();
    return new Promise((resolve, reject) => {
        const tx    = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req   = store.getAll();
        req.onsuccess = () => { resolve(req.result ?? []); db.close(); };
        req.onerror   = () => { reject(req.error); db.close(); };
    });
}

/* ─────────────────────────── */
/*  LocalStorage helpers       */
/* ─────────────────────────── */

const LS_KEY_PREFIX = 'feedback_';

function lsPut(entry: FeedbackEntry): void {
    localStorage.setItem(`${LS_KEY_PREFIX}${entry.id}`, JSON.stringify(entry));
}

function lsGet(id: string): FeedbackEntry | null {
    try {
        const raw = localStorage.getItem(`${LS_KEY_PREFIX}${id}`);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/* ─────────────────────────── */
/*  Backend POST (Tier 3)      */
/* ─────────────────────────── */

const getBackendEndpoint = (): string | null => {
    const env = (typeof window !== 'undefined'
        ? (window as any).process?.env
        : process.env) || {};
    return env.VITE_FEEDBACK_ENDPOINT || env.FEEDBACK_ENDPOINT || null;
};

async function postToBackend(entry: FeedbackEntry): Promise<void> {
    const endpoint = getBackendEndpoint();
    if (!endpoint) return;   // No endpoint configured — skip silently

    try {
        const res = await fetch(endpoint, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(entry),
        });
        if (!res.ok) {
            Logger.warn(`[FEEDBACK] Backend POST returned ${res.status} — entry is still persisted locally.`);
        } else {
            Logger.info(`[FEEDBACK] Entry ${entry.id} synced to backend.`);
        }
    } catch (e) {
        // Non-blocking — local persistence already succeeded
        Logger.warn('[FEEDBACK] Backend POST failed (network error). Entry persisted locally.', e);
    }
}

/* ─────────────────────────── */
/*  Public API                 */
/* ─────────────────────────── */

/**
 * Save user edits and feedback for the data-flywheel / fine-tuning pipeline.
 *
 * Write order:
 *   1. Attempt IndexedDB write (Tier 1).
 *   2. If that fails, fall back to LocalStorage (Tier 2).
 *   3. Kick off a best-effort backend POST (Tier 3) without blocking.
 */
export const saveScriptFeedback = async (
    runId:          string,
    originalScript: ScriptOutput,
    editedText:     string,
    styleProfile:   StyleProfile,
    rating?:        number,
    comments?:      string,
): Promise<void> => {
    const entry: FeedbackEntry = {
        id:             `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        runId,
        timestamp:      Date.now(),
        originalScript: originalScript.scriptText,
        editedScript:   editedText,
        styleProfile,
        userRating:     rating,
        userComments:   comments,
    };

    Logger.info('[FEEDBACK] Persisting user feedback', { runId, rating, entryId: entry.id });

    let usedIDB = false;
    try {
        await idbPut(entry);
        usedIDB = true;
        Logger.info(`[FEEDBACK] Saved to IndexedDB (id: ${entry.id})`);
    } catch (idbError) {
        Logger.warn('[FEEDBACK] IndexedDB write failed — falling back to LocalStorage', idbError);
        try {
            lsPut(entry);
            Logger.info(`[FEEDBACK] Saved to LocalStorage (id: ${entry.id})`);
        } catch (lsError) {
            Logger.error('[FEEDBACK] Both IndexedDB and LocalStorage writes failed', lsError);
        }
    }

    // Fire-and-forget backend sync — never blocks the UI regardless of outcome
    postToBackend(entry);
};

/**
 * Retrieve a single feedback entry by ID.
 * Checks IndexedDB first, then LocalStorage for backwards compatibility.
 */
export const getFeedback = async (id: string): Promise<FeedbackEntry | null> => {
    try {
        const idbEntry = await idbGet(id);
        if (idbEntry) return idbEntry;
    } catch {
        // IndexedDB unavailable
    }
    // Fallback: check LocalStorage (handles entries written by older builds)
    return lsGet(id);
};

/**
 * Retrieve all stored feedback entries (useful for bulk export / fine-tune jobs).
 * Merges IndexedDB and LocalStorage entries, de-duplicated by ID.
 */
export const getAllFeedback = async (): Promise<FeedbackEntry[]> => {
    const byId = new Map<string, FeedbackEntry>();

    // LocalStorage first (lower priority — may be older/incomplete)
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(LS_KEY_PREFIX)) {
                const raw = localStorage.getItem(key);
                if (raw) {
                    try {
                        const entry: FeedbackEntry = JSON.parse(raw);
                        byId.set(entry.id, entry);
                    } catch { /* malformed entry — skip */ }
                }
            }
        }
    } catch { /* localStorage unavailable */ }

    // IndexedDB overwrites LS entries with the same ID (more authoritative)
    try {
        const idbEntries = await idbGetAll();
        for (const entry of idbEntries) byId.set(entry.id, entry);
    } catch { /* IndexedDB unavailable */ }

    return Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
};