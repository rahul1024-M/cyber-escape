import type { Challenge, Skill } from "./types";

export const SKILLS: Skill[] = ["networking", "forensics", "security", "logic"];
export const SKILL_MAX = 300;

const LEVEL_SKILL: Record<number, Skill> = {
  1: "security",
  2: "networking",
  3: "forensics",
  4: "security",
  5: "logic",
};

/** Which skill a challenge trains. */
export function skillFor(c: Challenge): Skill {
  if (c.type === "evidence-board") return "forensics";
  if (c.type === "path") return "networking";
  if (c.type === "hash") return "forensics";
  if (c.type === "config" || c.type === "email") return "security";
  if (c.type === "input") return "logic";
  return LEVEL_SKILL[c.levelId] ?? "logic";
}

export function streakBonusXp(streak: number) {
  if (streak >= 10) return 40;
  if (streak >= 5) return 25;
  if (streak === 3) return 10;
  if (streak === 2) return 5;
  return 0;
}

export function canBuyHint(coins: number, hintShown: boolean) {
  return !hintShown && coins >= 10;
}

export const SCORE = {
  base: 100,
  streakPer: 10,
  speedMax: 50,
  hintPenalty: 15,
  wrongPenalty: 25,
};

export interface ScoreBreakdown {
  base: number;
  speed: number;
  streak: number;
  hints: number;
  wrong: number;
  completion: number;
  final: number;
}

export function buildBreakdown(p: {
  correct: number;
  speed: number;
  streak: number;
  hints: number;
  wrong: number;
  completion: number;
}): ScoreBreakdown {
  const base = p.correct * SCORE.base;
  const hints = p.hints * SCORE.hintPenalty;
  const wrong = p.wrong * SCORE.wrongPenalty;
  const final = Math.max(0, base + p.speed + p.streak + p.completion - hints - wrong);
  return { base, speed: p.speed, streak: p.streak, hints, wrong, completion: p.completion, final };
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export interface Briefing {
  threat: "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "CRITICAL";
  mission: string;
  objectives: string[];
}

export const BRIEFINGS: Record<number, Briefing> = {
  1: {
    threat: "LOW",
    mission: "Penetrate the first security layer.",
    objectives: ["Identify secure credentials", "Detect phishing attempts", "Verify data integrity"],
  },
  2: {
    threat: "MODERATE",
    mission: "Slip through the NEXUS network perimeter undetected.",
    objectives: ["Read the port scan", "Harden the firewall", "Choose a safe route"],
  },
  3: {
    threat: "HIGH",
    mission: "Reconstruct what the intruder did before NEXUS erases the logs.",
    objectives: ["Correlate log evidence", "Check file integrity", "Name the attack"],
  },
  4: {
    threat: "SEVERE",
    mission: "Lock down the control systems before NEXUS turns them on you.",
    objectives: ["Deploy a secure configuration", "Apply least privilege", "Decode the override key"],
  },
  5: {
    threat: "CRITICAL",
    mission: "Confront NEXUS AI at its core and force an escape.",
    objectives: ["Survive the NEXUS interrogation", "Break its logic", "Execute the override"],
  },
};
