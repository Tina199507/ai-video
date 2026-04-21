/* ------------------------------------------------------------------ */
/*  SessionManager – compiler backend session pooling                 */
/* ------------------------------------------------------------------ */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { PipelineStage } from './pipelineTypes.js';

export type SessionGroup = 'analysis' | 'creation' | 'visual' | 'production';

export interface SessionInfo {
  group: SessionGroup;
  sessionId: string;
  stages: PipelineStage[];
  useSameChat: boolean;
  messageCount: number;
  createdAt: string;
}

const SESSION_GROUP_MAP: Record<PipelineStage, SessionGroup> = {
  CAPABILITY_ASSESSMENT: 'analysis',
  STYLE_EXTRACTION: 'analysis',
  RESEARCH: 'analysis',
  NARRATIVE_MAP: 'creation',
  SCRIPT_GENERATION: 'creation',
  QA_REVIEW: 'creation',
  TEMPORAL_PLANNING: 'creation',
  STORYBOARD: 'visual',
  VIDEO_IR_COMPILE: 'visual',
  REFERENCE_IMAGE: 'visual',
  KEYFRAME_GEN: 'visual',
  VIDEO_GEN: 'production',
  TTS: 'production',
  ASSEMBLY: 'production',
  REFINEMENT: 'production',
};

const GROUP_STAGES: Record<SessionGroup, PipelineStage[]> = {
  analysis: ['CAPABILITY_ASSESSMENT', 'STYLE_EXTRACTION', 'RESEARCH'],
  creation: ['NARRATIVE_MAP', 'SCRIPT_GENERATION', 'QA_REVIEW', 'TEMPORAL_PLANNING'],
  visual: ['STORYBOARD', 'VIDEO_IR_COMPILE', 'REFERENCE_IMAGE', 'KEYFRAME_GEN'],
  production: ['VIDEO_GEN', 'TTS', 'ASSEMBLY', 'REFINEMENT'],
};

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private static readonly SESSIONS_FILE = 'sessions.json';

  getSession(projectId: string, stage: PipelineStage): SessionInfo {
    const group = SESSION_GROUP_MAP[stage];
    const key = `${projectId}:${group}`;

    let session = this.sessions.get(key);
    if (!session) {
      session = {
        group,
        sessionId: `session_${projectId}_${group}_${Date.now()}`,
        stages: GROUP_STAGES[group],
        useSameChat: false,
        messageCount: 0,
        createdAt: new Date().toISOString(),
      };
      this.sessions.set(key, session);
    }
    return session;
  }

  shouldContinueChat(projectId: string, stage: PipelineStage): boolean {
    const group = SESSION_GROUP_MAP[stage];
    const key = `${projectId}:${group}`;
    const session = this.sessions.get(key);
    return !!session && session.messageCount > 0;
  }

  recordMessage(projectId: string, stage: PipelineStage): void {
    const group = SESSION_GROUP_MAP[stage];
    const key = `${projectId}:${group}`;
    const session = this.sessions.get(key);
    if (session) {
      session.messageCount++;
      session.useSameChat = true;
    }
  }

  clearProject(projectId: string): void {
    for (const key of this.sessions.keys()) {
      if (key.startsWith(`${projectId}:`)) this.sessions.delete(key);
    }
  }

  clearGroup(projectId: string, stage: PipelineStage): void {
    const group = SESSION_GROUP_MAP[stage];
    this.sessions.delete(`${projectId}:${group}`);
  }

  getGroupForStage(stage: PipelineStage): SessionGroup {
    return SESSION_GROUP_MAP[stage];
  }

  getAllSessions(): SessionInfo[] {
    return [...this.sessions.values()];
  }

  saveTo(projectDir: string): void {
    const entries: Array<{ key: string; value: SessionInfo }> = [];
    for (const [key, value] of this.sessions) entries.push({ key, value });
    if (entries.length === 0) return;
    const filePath = join(projectDir, SessionManager.SESSIONS_FILE);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(entries, null, 2));
    renameSync(tmpPath, filePath);
  }

  loadFrom(projectDir: string): void {
    const filePath = join(projectDir, SessionManager.SESSIONS_FILE);
    if (!existsSync(filePath)) return;
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Array<{ key: string; value: SessionInfo }>;
      for (const { key, value } of data) {
        if (!this.sessions.has(key)) this.sessions.set(key, value);
      }
    } catch {
      // ignore corrupt file
    }
  }
}
