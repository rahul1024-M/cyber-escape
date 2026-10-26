export type ChallengeType =
  | "mcq"
  | "email"
  | "hash"
  | "path"
  | "config"
  | "input"
  | "terminal"
  | "evidence-board";

export interface ChallengeOption {
  id: string;
  label: string;
  sub?: string;
  body?: string;
}

export interface ConfigOption {
  id: string;
  label: string;
  description: string;
  /** Whether enabling this is the secure choice */
  secure: boolean;
}

export interface EmailPart {
  id: string;
  text: string;
  /** Suspicious clue the player should flag */
  clue?: boolean;
  why?: string;
  /** Render on its own line with a label */
  field?: "From" | "Reply-To" | "Subject" | "Link" | "Attachment";
}

export interface InspectEmail {
  parts: EmailPart[];
}

export interface NetworkNode {
  id: string;
  label: string;
  role: string;
}

export interface NetworkConnection {
  from: string;
  to: string;
  safe: boolean;
  reason: string;
}

export interface NetworkPathPuzzle {
  nodes: NetworkNode[];
  connections: NetworkConnection[];
  start: string;
  destination: string;
  validPath: string[];
}

export interface NetworkPathState {
  path: string[];
}

export type BossPhaseId = "reconnaissance" | "containment" | "recovery";

export interface BossEncounterState {
  phase: BossPhaseId;
  bossHealth: number;
}

export interface EvidenceItem {
  id: string;
  label: string;
  kind: string;
  timestamp: string;
  summary: string;
  details: string;
  relevant: boolean;
}

export interface EvidenceLink {
  from: string;
  to: string;
}

export interface EvidenceConclusion {
  id: string;
  label: string;
}

export interface EvidenceBoardData {
  items: EvidenceItem[];
  expectedConnections: EvidenceLink[];
  conclusions: EvidenceConclusion[];
  correctConclusion: string;
}

export interface EvidenceBoardState {
  openedEvidenceIds: string[];
  importantEvidenceIds: string[];
  selectedEvidenceIds: string[];
  connections: EvidenceLink[];
  conclusion: string;
}

export interface Challenge {
  id: string;
  levelId: number;
  type: ChallengeType;
  title: string;
  description: string;
  question: string;
  options?: ChallengeOption[];
  /** For config challenges */
  configOptions?: ConfigOption[];
  /** For input / terminal challenges: accepted answers (lowercased) */
  accepted?: string[];
  correctAnswer?: string;
  explanation: string;
  hint: string;
  xpReward: number;
  coinReward: number;
  timeLimit?: number;
  terminalLines?: string[];
  /** Interactive phishing inspector: flag every clue, nothing else */
  inspect?: InspectEmail;
  evidenceBoard?: EvidenceBoardData;
  networkPath?: NetworkPathPuzzle;
  bossPhase?: BossPhaseId;
}

export type Difficulty = "ROOKIE" | "AGENT" | "ANALYST" | "EXPERT" | "LEGEND";

export interface Level {
  id: number;
  code: string;
  title: string;
  tagline: string;
  description: string;
  difficulty: Difficulty;
  xpReward: number;
  coinReward: number;
  challenges: Challenge[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
}

export type Skill = "networking" | "forensics" | "security" | "logic";

export interface LevelRecord {
  completed: boolean;
  bestScore: number;
  perfect: boolean;
  bestTime?: number;
  bestAccuracy?: number;
  fewestHints?: number;
  bestStreak?: number;
}

export interface PlayerState {
  id: string;
  name: string;
  level: number;
  xp: number;
  coins: number;
  score: number;
  streak: number;
  highestStreak: number;
  totalCorrect: number;
  totalAnswers: number;
  hintsUsed: number;
  challengesCompleted: number;
  levels: Record<number, LevelRecord>;
  achievements: Record<string, string>; // id -> ISO unlock date
  settings: Settings;
  cosmetic: string;
  ownedCosmetics: string[];
  skills: Record<Skill, number>;
  createdAt: string;
  completedMissionRuns: string[];
}

export interface MissionRunState {
  runId: string;
  levelId: number;
  index: number;
  health: number;
  wrongInLevel: number;
  hintsInLevel: number;
  xpInLevel: number;
  coinsInLevel: number;
  scoreInLevel: number;
  correctInLevel: number;
  runStreak: number;
  bestStreakInLevel: number;
  speedBonus: number;
  streakBonus: number;
  skillXp: Partial<Record<Skill, number>>;
  startedAt: number;
  evidenceBoardState?: EvidenceBoardState;
  networkPathState?: NetworkPathState;
  bossEncounterState?: BossEncounterState;
}

export interface ActiveMissionSave {
  version: 1;
  screen: "briefing" | "play";
  run: MissionRunState;
  answered: { correct: boolean; chosen: string } | null;
  hintShown: boolean;
  timeLeft: number | null;
  runSeconds: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  timeSeconds: number;
  accuracy: number;
  date: string;
  demo?: boolean;
}
