
import { AppState, StyleProfile, SavedTemplate, Scene, ScriptOutput } from "../types";
import { Logger } from "../lib/logger";

const STORAGE_KEY = 'video_studio_profiles';
const DB_NAME = 'VideoStudioDB';
const DB_STORE = 'project_checkpoint';
const DB_VERSIONS_STORE = 'project_versions';

// --- LOCAL STORAGE (Small Data: Profiles) ---

export const saveProfileToLibrary = (profile: StyleProfile, name?: string): SavedTemplate[] => {
  try {
    const existingStr = localStorage.getItem(STORAGE_KEY);
    const existing: SavedTemplate[] = existingStr ? JSON.parse(existingStr) : [];
    
    // Check for duplicates based on source title to avoid spamming
    const title = name || profile._meta?.sourceTitle || 'Untitled';
    
    // Create new entry
    const newEntry: SavedTemplate = {
      id: `profile-${Date.now()}`,
      savedAt: new Date().toISOString(),
      profile: {
          ...profile,
          _meta: {
              ...profile._meta,
              sourceTitle: title,
              sourceThumbnail: profile._meta?.sourceThumbnail || ''
          }
      }
    };

    existing.unshift(newEntry); // Add to top

    if (existing.length > 50) existing.pop(); // Keep last 50

    // Safety checks for LocalStorage limits
    let newStr = JSON.stringify(existing);
    const SAFETY_LIMIT = 4800000; 

    if (newStr.length > SAFETY_LIMIT) {
        Logger.warn("Storage quota approaching. Stripping thumbnail from new entry.");
        // Strip thumbnails from older entries to save space
        for(let i = existing.length - 1; i >= 0; i--) {
            if(existing[i].profile._meta?.sourceThumbnail) {
                existing[i].profile._meta!.sourceThumbnail = '';
                newStr = JSON.stringify(existing);
                if(newStr.length <= SAFETY_LIMIT) break;
            }
        }
    }

    if (newStr.length <= SAFETY_LIMIT) {
        localStorage.setItem(STORAGE_KEY, newStr);
        return existing;
    } else {
        Logger.error("Storage full even after optimization.");
        return existing;
    }
  } catch (e) {
    Logger.error("Failed to save profile", e);
    return [];
  }
};

export const getSavedProfiles = (): SavedTemplate[] => {
  try {
    const str = localStorage.getItem(STORAGE_KEY);
    return str ? JSON.parse(str) : [];
  } catch (e) { return []; }
};

export const deleteSavedProfile = (id: string): SavedTemplate[] => {
  try {
    const str = localStorage.getItem(STORAGE_KEY);
    const existing: SavedTemplate[] = str ? JSON.parse(str) : [];
    const updated = existing.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) { return []; }
};

export const renameSavedProfile = (id: string, newName: string): SavedTemplate[] => {
  try {
    const str = localStorage.getItem(STORAGE_KEY);
    const existing: SavedTemplate[] = str ? JSON.parse(str) : [];
    const index = existing.findIndex(p => p.id === id);
    if (index !== -1) {
        existing[index].profile._meta = {
            ...existing[index].profile._meta,
            sourceTitle: newName,
            sourceThumbnail: existing[index].profile._meta?.sourceThumbnail || ''
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }
    return existing;
  } catch (e) { return []; }
};

// --- INDEXED DB (Large Data: Auto-Save / Checkpoints) ---

// Simple Promise wrapper for IndexedDB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 5); // Bump version for workflow_states store
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('script_versions')) {
        const vStore = db.createObjectStore('script_versions', { keyPath: 'versionId' });
        vStore.createIndex('scriptId', 'scriptId', { unique: false });
      }
      if (!db.objectStoreNames.contains(DB_VERSIONS_STORE)) {
        const pvStore = db.createObjectStore(DB_VERSIONS_STORE, { keyPath: 'versionId' });
        pvStore.createIndex('projectId', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains('review_tickets')) {
        const rtStore = db.createObjectStore('review_tickets', { keyPath: 'ticketId' });
        rtStore.createIndex('status', 'status', { unique: false });
        rtStore.createIndex('projectId', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains('workflow_states')) {
        const wfStore = db.createObjectStore('workflow_states', { keyPath: 'runId' });
        wfStore.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// --- WORKFLOW STATE STORE ---

export interface WorkflowState {
  runId: string;
  projectId: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  currentStep: string;
  stepStates: Record<string, {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    result?: any;
    error?: any;
    attempts: number;
    startTime?: number;
    endTime?: number;
  }>;
  context: any;
  updatedAt: number;
}

export const saveWorkflowState = async (state: WorkflowState): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction('workflow_states', 'readwrite');
    const store = tx.objectStore('workflow_states');
    store.put(state);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    Logger.error("Failed to save workflow state", e);
  }
};

export const loadWorkflowState = async (runId: string): Promise<WorkflowState | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction('workflow_states', 'readonly');
    const store = tx.objectStore('workflow_states');
    const request = store.get(runId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    Logger.error("Failed to load workflow state", e);
    return null;
  }
};

/* -------------------------
   Review Ticket Support
   ------------------------- */

export interface ReviewTicket {
  ticketId: string;
  projectId: string;
  traceId: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'rejected';
  categories: string[];
  content: string;
  excerptSpans: any[];
  reviewerNotes?: string;
}

export const createReviewTicket = async (ticket: Omit<ReviewTicket, 'ticketId' | 'timestamp' | 'status'>): Promise<string> => {
  try {
    const db = await openDB();
    const tx = db.transaction('review_tickets', 'readwrite');
    const store = tx.objectStore('review_tickets');
    
    const ticketId = `ticket-${Date.now()}`;
    const record: ReviewTicket = {
      ...ticket,
      ticketId,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    store.put(record);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(ticketId);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    Logger.error("Failed to create review ticket", e);
    return "";
  }
};

export const getReviewTickets = async (status?: ReviewTicket['status']): Promise<ReviewTicket[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction('review_tickets', 'readonly');
    const store = tx.objectStore('review_tickets');
    
    let request;
    if (status) {
      const index = store.index('status');
      request = index.getAll(status);
    } else {
      request = store.getAll();
    }
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const res = request.result as ReviewTicket[];
        resolve(res.sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    Logger.error("Failed to get review tickets", e);
    return [];
  }
};

export const updateReviewTicketStatus = async (ticketId: string, status: ReviewTicket['status'], notes?: string): Promise<boolean> => {
  try {
    const db = await openDB();
    const tx = db.transaction('review_tickets', 'readwrite');
    const store = tx.objectStore('review_tickets');
    
    const getReq = store.get(ticketId);
    
    return new Promise((resolve, reject) => {
      getReq.onsuccess = () => {
        const ticket = getReq.result as ReviewTicket;
        if (!ticket) return resolve(false);
        
        ticket.status = status;
        if (notes) ticket.reviewerNotes = notes;
        
        const putReq = store.put(ticket);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (e) {
    Logger.error("Failed to update review ticket", e);
    return false;
  }
};

/* -------------------------
   Project Versioning Support
   ------------------------- */

export interface ProjectVersion {
  versionId: string;
  projectId: string;
  traceId?: string;
  timestamp: number;
  tag?: string;
  data: {
    prompts?: Record<string, string>;
    styleProfile?: StyleProfile;
    script?: ScriptOutput | string;
    assets?: Scene[];
    modelVersions?: Record<string, string>;
  };
}

export const saveVersionedProject = async (
  projectId: string, 
  data: ProjectVersion['data'], 
  traceId?: string, 
  tag?: string
): Promise<string> => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_VERSIONS_STORE, 'readwrite');
    const store = tx.objectStore(DB_VERSIONS_STORE);
    
    const versionId = `${projectId}_${Date.now()}`;
    const record: ProjectVersion = {
      versionId,
      projectId,
      traceId,
      timestamp: Date.now(),
      tag,
      data
    };
    
    store.put(record);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(versionId);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    Logger.error("Failed to save project version", e);
    return "";
  }
};

export const listVersions = async (projectId: string): Promise<ProjectVersion[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_VERSIONS_STORE, 'readonly');
    const store = tx.objectStore(DB_VERSIONS_STORE);
    const index = store.index('projectId');
    const request = index.getAll(projectId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const res = request.result as ProjectVersion[];
        resolve(res.sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    Logger.error("Failed to list project versions", e);
    return [];
  }
};

export const restoreVersion = async (versionId: string): Promise<ProjectVersion['data'] | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_VERSIONS_STORE, 'readonly');
    const store = tx.objectStore(DB_VERSIONS_STORE);
    const request = store.get(versionId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    Logger.error("Failed to restore project version", e);
    return null;
  }
};

/* -------------------------
   Legacy Script Versioning
   ------------------------- */

export interface ScriptVersion {
    versionId: string;
    scriptId: string;
    timestamp: number;
    content: any; // ScriptOutput
    tag?: string; // e.g., "v1.0", "post-refinement"
    author?: string;
}

export const saveVersionedScript = async (scriptId: string, content: any, tag?: string): Promise<string> => {
    try {
        const db = await openDB();
        const tx = db.transaction('script_versions', 'readwrite');
        const store = tx.objectStore('script_versions');
        
        const versionId = `${scriptId}_${Date.now()}`;
        const record: ScriptVersion = {
            versionId,
            scriptId,
            timestamp: Date.now(),
            content,
            tag
        };
        
        store.put(record);
        
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve(versionId);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        Logger.error("Failed to save script version", e);
        return "";
    }
};

export const getScriptHistory = async (scriptId: string): Promise<ScriptVersion[]> => {
    try {
        const db = await openDB();
        const tx = db.transaction('script_versions', 'readonly');
        const store = tx.objectStore('script_versions');
        const index = store.index('scriptId');
        const request = index.getAll(scriptId);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                // Sort by timestamp desc
                const res = request.result as ScriptVersion[];
                resolve(res.sort((a, b) => b.timestamp - a.timestamp));
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        Logger.error("Failed to get script history", e);
        return [];
    }
};

export const rollbackScript = async (versionId: string): Promise<any | null> => {
    try {
        const db = await openDB();
        const tx = db.transaction('script_versions', 'readonly');
        const store = tx.objectStore('script_versions');
        const request = store.get(versionId);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result?.content || null);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        Logger.error("Failed to rollback script", e);
        return null;
    }
};

export const saveProjectCheckpoint = async (state: AppState): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    
    // We save the entire state as a single object with id 'autosave'
    // IndexedDB handles large blobs (images) efficiently.
    const record = {
        id: 'autosave',
        timestamp: Date.now(),
        state: state
    };
    
    store.put(record);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    Logger.error("Auto-save failed:", e);
  }
};

export const loadProjectCheckpoint = async (): Promise<AppState | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const request = store.get('autosave');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        if (result && result.state) {
            // Check if autosave is too old (e.g., > 24 hours)? 
            // For now, we trust the user to clear it if they want.
            resolve(result.state);
        } else {
            resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    Logger.error("Load checkpoint failed:", e);
    return null;
  }
};

export const clearProjectCheckpoint = async (): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.delete('autosave');
    return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
    });
  } catch (e) {
    Logger.error("Clear checkpoint failed:", e);
  }
};
