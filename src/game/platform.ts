/**
 * Platform-level data models. These describe systems the game is prepared for
 * (missions library, cyber range, accounts, multiplayer, NEXUS AI, adaptive
 * difficulty, daily challenges). Shapes map 1:1 to future backend tables.
 */
import type { Challenge, Difficulty, Skill } from "./types";

/* ---------- missions ---------- */
export type MissionType = "main" | "side" | "secret" | "training" | "daily" | "multiplayer";

export interface UnlockRequirement {
  /** Mission ids that must be completed first */
  missions?: string[];
  minLevel?: number;
}

export interface Mission {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  sector: number;
  difficulty: Difficulty;
  story: string;
  threat: string;
  objectives: string[];
  challenges: Challenge[];
  xpReward: number;
  coinReward: number;
  timeLimit?: number;
  unlockRequirement: UnlockRequirement;
  /** Bridge to the legacy level id the engine still plays */
  levelId: number;
}

export interface PersonalBest {
  missionId: string;
  score: number;
  time?: number;
  accuracy?: number;
  hintsUsed?: number;
  highestStreak?: number;
}

/* ---------- cyber range (fictional, isolated simulations only) ---------- */
export type RangeChallengeKind =
  | "terminal"
  | "log_investigation"
  | "file_integrity"
  | "network_analysis"
  | "incident_response"
  | "security_config"
  | "flag_discovery"
  | "pattern_analysis"
  | "forensics";

export interface CyberRangeMission extends Omit<Mission, "type"> {
  type: "training";
  environment: string; // e.g. "NEXUS TRAINING LAB"
  authorization: "AUTHORIZED SIMULATION";
  kinds: RangeChallengeKind[];
}

/* ---------- simulated terminal ---------- */
export interface TerminalFile {
  name: string;
  content: string;
}
export interface TerminalState {
  currentDirectory: string;
  visibleFiles: TerminalFile[];
  history: string[];
  output: string[];
  prompt: string;
  missionContext?: string;
}
export type TerminalCommand = (args: string[], state: TerminalState) => string[];

/* ---------- accounts / multiplayer ---------- */
export interface AuthUser {
  id: string;
  codename: string;
  guest: boolean;
  email?: string;
}
export interface PlayerSession {
  sessionId: string;
  playerId: string;
  startedAt: string;
  missionId?: string;
}
export interface TeamMember {
  playerId: string;
  codename: string;
  role: "leader" | "member";
}
export interface Team {
  id: string;
  name: string;
  members: TeamMember[];
}
export interface SharedObjective {
  id: string;
  label: string;
  completedBy?: string;
}
export interface SharedMission {
  missionId: string;
  teamId: string;
  players: string[];
  objectives: SharedObjective[];
  status: "waiting" | "active" | "complete" | "failed";
  startedAt?: string;
  completedAt?: string;
}
export interface PlayerAction {
  playerId: string;
  action: string;
  payload?: Record<string, unknown>;
  at: number;
}

/* ---------- NEXUS AI ---------- */
export type NexusState = "IDLE" | "OBSERVING" | "WARNING" | "CHALLENGING" | "ATTACKING" | "DEFEATED";

/* ---------- adaptive difficulty ---------- */
export type DifficultyMode = "EASY" | "NORMAL" | "HARD" | "EXPERT";
export interface PerformanceProfile {
  accuracy: number;
  avgResponseMs: number;
  mistakes: number;
  hintsUsed: number;
  streak: number;
  missionsCompleted: number;
}

/* ---------- daily challenge ---------- */
export interface DailyChallenge {
  id: string;
  date: string;
  challenge: Challenge;
  reward: { xp: number; coins: number };
  completed: boolean;
  score: number;
}

export interface SkillInfo {
  id: Skill;
  name: string;
  level: number;
  xp: number;
}
