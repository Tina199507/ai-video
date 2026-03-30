import { StyleProfile } from "../types";

export interface MusicTrack {
  id: string;
  url: string;
  genre: string;
  mood: string;
  tempo: "slow" | "medium" | "fast";
  intensity: number;
  instrumentation: string[];
}

export const MUSIC_LIBRARY: MusicTrack[] = [
  {
    id: "cinematic_hope_01",
    url: "/music/cinematic_hope_01.mp3",
    genre: "cinematic orchestral",
    mood: "inspirational",
    tempo: "medium",
    intensity: 4,
    instrumentation: ["strings", "piano", "choir"]
  },
  {
    id: "ambient_soft_01",
    url: "/music/ambient_soft_01.mp3",
    genre: "ambient",
    mood: "calm",
    tempo: "slow",
    intensity: 2,
    instrumentation: ["synth", "pad"]
  },
  {
    id: "upbeat_corporate_01",
    url: "/music/upbeat_corporate_01.mp3",
    genre: "corporate pop",
    mood: "upbeat",
    tempo: "fast",
    intensity: 3,
    instrumentation: ["guitar", "drums", "synth"]
  },
  {
    id: "lofi_chill_01",
    url: "/music/lofi_chill_01.mp3",
    genre: "lofi hip hop",
    mood: "chill",
    tempo: "slow",
    intensity: 2,
    instrumentation: ["beats", "piano", "vinyl"]
  },
  {
    id: "epic_action_01",
    url: "/music/epic_action_01.mp3",
    genre: "epic trailer",
    mood: "intense",
    tempo: "fast",
    intensity: 5,
    instrumentation: ["brass", "heavy percussion", "strings"]
  }
];

export function matchMusic(
  audioStyle?: StyleProfile["audioStyle"],
  library: MusicTrack[] = MUSIC_LIBRARY
): MusicTrack | null {
  if (!audioStyle) return null;

  let bestScore = -1;
  let bestTrack: MusicTrack | null = null;

  // Normalize inputs for better matching
  const targetGenre = audioStyle.genre?.toLowerCase() || "";
  const targetMood = audioStyle.mood?.toLowerCase() || "";

  for (const track of library) {
    let score = 0;

    // Strong match for genre and mood (Primary keys)
    if (targetGenre && track.genre.toLowerCase().includes(targetGenre)) score += 20;
    if (targetMood && track.mood.toLowerCase().includes(targetMood)) score += 20;
    
    // Tempo match
    if (track.tempo === audioStyle.tempo) score += 10;

    // Intensity match
    const intensityDiff = Math.abs(track.intensity - (audioStyle.intensity ?? 3));
    score += Math.max(0, 10 - intensityDiff * 2);

    // Instrumentation match
    if (audioStyle.instrumentation && audioStyle.instrumentation.length > 0) {
      const matchCount = track.instrumentation.filter(i => 
        audioStyle.instrumentation?.some(ai => ai.toLowerCase().includes(i.toLowerCase()))
      ).length;
      score += matchCount * 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTrack = track;
    }
  }

  return bestTrack;
}
