/**
 * Lightweight local statistics for balancing and the player profile.
 * No personal data — only counters. Writes are debounced to avoid storage churn.
 */
import { onGameEvent } from "./events";
import { isEnabled } from "./flags";

export interface GameStats {
  missionStarts: number;
  missionCompletions: number;
  missionFailures: number;
  challengeAttempts: number;
  correctAnswers: number;
  wrongAnswers: number;
  hintsUsed: number;
  totalAnswerMs: number;
  totalPlaySeconds: number;
  bossAttempts: number;
  bossVictories: number;
  perfectMissions: number;
  fastestMission: number | null;
}

const KEY = "cyber-escape:stats:v1";

export const emptyStats = (): GameStats => ({
  missionStarts: 0,
  missionCompletions: 0,
  missionFailures: 0,
  challengeAttempts: 0,
  correctAnswers: 0,
  wrongAnswers: 0,
  hintsUsed: 0,
  totalAnswerMs: 0,
  totalPlaySeconds: 0,
  bossAttempts: 0,
  bossVictories: 0,
  perfectMissions: 0,
  fastestMission: null,
});

export function loadStats(): GameStats {
  if (typeof window === "undefined") return emptyStats();
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    const base = emptyStats();
    if (!raw || typeof raw !== "object") return base;
    for (const k of Object.keys(base) as (keyof GameStats)[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) (base[k] as number) = v;
    }
    return base;
  } catch {
    return emptyStats();
  }
}

let stats: GameStats | null = null;
let timer: number | undefined;
function persist() {
  if (typeof window === "undefined") return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(stats));
    } catch {
      /* ignore */
    }
  }, 400);
}

export function resetStats() {
  stats = emptyStats();
  persist();
}

let started = false;
/** Call once on the client. Returns an unsubscribe function. */
export function startAnalytics(): () => void {
  if (started || !isEnabled("ENABLE_LOCAL_ANALYTICS")) return () => {};
  started = true;
  stats = loadStats();
  const off = onGameEvent((e) => {
    const s = (stats ??= loadStats());
    const boss = e.missionId === "mission-5";
    switch (e.type) {
      case "MISSION_STARTED":
        s.missionStarts++;
        if (boss) s.bossAttempts++;
        break;
      case "MISSION_COMPLETED": {
        s.missionCompletions++;
        if (boss) s.bossVictories++;
        if (e.data?.["perfect"]) s.perfectMissions++;
        const secs = e.value ?? 0;
        s.totalPlaySeconds += secs;
        if (secs > 0 && (s.fastestMission === null || secs < s.fastestMission)) s.fastestMission = secs;
        break;
      }
      case "MISSION_FAILED":
        s.missionFailures++;
        s.totalPlaySeconds += e.value ?? 0;
        break;
      case "CHALLENGE_COMPLETED":
        s.challengeAttempts++;
        s.correctAnswers++;
        s.totalAnswerMs += e.value ?? 0;
        break;
      case "CHALLENGE_FAILED":
        s.challengeAttempts++;
        s.wrongAnswers++;
        break;
      case "HINT_USED":
        s.hintsUsed++;
        break;
      default:
        return;
    }
    persist();
  });
  return () => {
    off();
    started = false;
  };
}

export const getStats = (): GameStats => stats ?? loadStats();
