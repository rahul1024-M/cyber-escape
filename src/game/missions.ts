/**
 * Mission library. Built from the structured level data + briefings, so new
 * missions are added as data — the UI reads Missions, never hard-coded content.
 */
import { LEVELS } from "./levels";
import { BRIEFINGS, SKILL_MAX } from "./progression";
import type { DailyChallenge, DifficultyMode, Mission, PerformanceProfile, SkillInfo } from "./platform";
import type { PlayerState, Skill } from "./types";

export const missionIdFor = (levelId: number) => `mission-${levelId}`;

export const MISSIONS: Mission[] = LEVELS.map((l) => {
  const b = BRIEFINGS[l.id];
  return {
    id: missionIdFor(l.id),
    type: "main",
    title: l.title,
    description: l.description,
    sector: l.id,
    difficulty: l.difficulty,
    story: b?.mission ?? l.description,
    threat: b?.threat ?? "UNKNOWN",
    objectives: b?.objectives ?? [],
    challenges: l.challenges,
    xpReward: l.xpReward,
    coinReward: l.coinReward,
    unlockRequirement: l.id === 1 ? {} : { missions: [missionIdFor(l.id - 1)] },
    levelId: l.id,
  };
});

export function getMission(id: string): Mission | null {
  return MISSIONS.find((m) => m.id === id) ?? null;
}

export function isMissionUnlocked(m: Mission, p: PlayerState): boolean {
  const req = m.unlockRequirement;
  if (req.minLevel && p.level < req.minLevel) return false;
  return (req.missions ?? []).every((id) => {
    const dep = getMission(id);
    return dep ? Boolean(p.levels[dep.levelId]?.completed) : false;
  });
}

/* ---------- skills ---------- */
const SKILL_NAMES: Record<Skill, string> = {
  networking: "NETWORKING",
  forensics: "FORENSICS",
  security: "SECURITY",
  logic: "LOGIC",
};
export function skillInfo(p: PlayerState): SkillInfo[] {
  return (Object.keys(SKILL_NAMES) as Skill[]).map((id) => ({
    id,
    name: SKILL_NAMES[id],
    xp: p.skills[id],
    level: Math.min(5, 1 + Math.floor((p.skills[id] / SKILL_MAX) * 5)),
  }));
}

/* ---------- daily challenge (deterministic, local) ---------- */
export function getDailyChallenge(date = new Date()): DailyChallenge {
  const day = date.toISOString().slice(0, 10);
  const all = MISSIONS.flatMap((m) => m.challenges);
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const challenge = all[h % all.length]!;
  return {
    id: `daily-${day}`,
    date: day,
    challenge,
    reward: { xp: challenge.xpReward * 2, coins: challenge.coinReward * 2 },
    completed: false,
    score: 0,
  };
}

/* ---------- adaptive difficulty (recommendation only; not applied yet) ---------- */
export function recommendDifficulty(p: PerformanceProfile): DifficultyMode {
  if (p.missionsCompleted < 1) return "NORMAL";
  if (p.accuracy >= 90 && p.hintsUsed === 0 && p.streak >= 5) return "EXPERT";
  if (p.accuracy >= 75) return "HARD";
  if (p.accuracy < 50 || p.mistakes > 10) return "EASY";
  return "NORMAL";
}
