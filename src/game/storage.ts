import { getLevel } from "./levels";
import { EMPTY_EVIDENCE_BOARD_STATE, evaluateEvidenceBoard, isEvidenceBoardDataValid } from "./evidenceBoard";
import {
  evaluateNetworkPath,
  initialNetworkPathState,
  isNetworkPathPuzzleValid,
  isNetworkPathStateValid,
} from "./networkPathPuzzles";
import {
  isBossEncounterStateValid,
  isNexusHintCountValid,
  NEXUS_BOSS_HEALTH,
} from "./nexusEncounter";
import {
  createEmptyCyberRangeProgress,
  isCyberRangeProgressValid,
  type CyberRangeProgress,
} from "./cyberRange";
import type {
  ActiveMissionSave,
  BossEncounterState,
  Challenge,
  EvidenceBoardState,
  NetworkPathState,
  LeaderboardEntry,
  PlayerState,
  Skill,
} from "./types";

const PLAYER_KEY = "cyber-escape:player:v1";
const BOARD_KEY = "cyber-escape:leaderboard:v1";
const ACTIVE_MISSION_VERSION = 1;

export interface StoredGame {
  player: PlayerState;
  activeMission: ActiveMissionSave | null;
  cyberRange: CyberRangeProgress;
}

export const COSMETICS = [
  { id: "cyan", name: "CYAN TERMINAL", price: 0, description: "Default NEXUS interface." },
  { id: "neon", name: "NEON GRID", price: 150, description: "Violet grid overlay." },
  { id: "alert", name: "RED ALERT", price: 200, description: "Crimson intrusion palette." },
  { id: "rain", name: "DIGITAL RAIN", price: 250, description: "Emerald cascading code." },
];

export function createPlayer(name: string): PlayerState {
  return {
    id: `agent-${Date.now().toString(36)}`,
    name,
    level: 1,
    xp: 0,
    coins: 100,
    score: 0,
    streak: 0,
    highestStreak: 0,
    totalCorrect: 0,
    totalAnswers: 0,
    hintsUsed: 0,
    challengesCompleted: 0,
    levels: {},
    achievements: {},
    settings: { sound: true, music: false, reducedMotion: false },
    cosmetic: "cyan",
    ownedCosmetics: ["cyan"],
    skills: { networking: 0, forensics: 0, security: 0, logic: 0 },
    createdAt: new Date().toISOString(),
    completedMissionRuns: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Defensive merge so corrupted or partial saves can never crash the game. */
export function decodePlayerSave(raw: unknown): PlayerState | null {
  if (!isRecord(raw) || typeof raw["name"] !== "string" || !raw["name"].trim()) return null;

  const numericFields = [
    "xp",
    "coins",
    "score",
    "streak",
    "highestStreak",
    "totalCorrect",
    "totalAnswers",
    "hintsUsed",
    "challengesCompleted",
  ] as const;
  if (
    numericFields.some(
      (field) => raw[field] !== undefined && !isFiniteNonnegative(raw[field]),
    ) ||
    (raw["level"] !== undefined &&
      (!Number.isInteger(raw["level"]) ||
        typeof raw["level"] !== "number" ||
        raw["level"] < 1 ||
        raw["level"] > 5))
  ) return null;
  if (raw["id"] !== undefined && typeof raw["id"] !== "string") return null;
  if (raw["createdAt"] !== undefined && typeof raw["createdAt"] !== "string") return null;

  let levels: PlayerState["levels"] = {};
  if (raw["levels"] !== undefined) {
    if (!isRecord(raw["levels"])) return null;
    for (const [key, value] of Object.entries(raw["levels"])) {
      if (!Number.isInteger(Number(key)) || !getLevel(Number(key)) || !isRecord(value)) return null;
      const optionalNumbers = ["bestTime", "bestAccuracy", "fewestHints", "bestStreak"] as const;
      if (
        (value["completed"] !== undefined && typeof value["completed"] !== "boolean") ||
        (value["bestScore"] !== undefined && !isFiniteNonnegative(value["bestScore"])) ||
        (value["perfect"] !== undefined && typeof value["perfect"] !== "boolean") ||
        optionalNumbers.some(
          (field) => value[field] !== undefined && !isFiniteNonnegative(value[field]),
        )
      ) return null;
      levels[Number(key)] = {
        completed: value["completed"] === true,
        bestScore: typeof value["bestScore"] === "number" ? value["bestScore"] : 0,
        perfect: value["perfect"] === true,
        ...(typeof value["bestTime"] === "number" && { bestTime: value["bestTime"] }),
        ...(typeof value["bestAccuracy"] === "number" && {
          bestAccuracy: value["bestAccuracy"],
        }),
        ...(typeof value["fewestHints"] === "number" && {
          fewestHints: value["fewestHints"],
        }),
        ...(typeof value["bestStreak"] === "number" && {
          bestStreak: value["bestStreak"],
        }),
      };
    }
  }

  const achievements: PlayerState["achievements"] = {};
  if (raw["achievements"] !== undefined) {
    if (!isRecord(raw["achievements"])) return null;
    for (const [id, date] of Object.entries(raw["achievements"])) {
      if (typeof date !== "string") return null;
      achievements[id] = date;
    }
  }

  const rawSettings = raw["settings"];
  if (rawSettings !== undefined && !isRecord(rawSettings)) return null;
  const settings = isRecord(rawSettings) ? rawSettings : {};
  if (
    ["sound", "music", "reducedMotion"].some(
      (key) => settings[key] !== undefined && typeof settings[key] !== "boolean",
    )
  ) return null;

  if (raw["cosmetic"] !== undefined && typeof raw["cosmetic"] !== "string") return null;
  if (
    raw["ownedCosmetics"] !== undefined &&
    (!Array.isArray(raw["ownedCosmetics"]) ||
      !raw["ownedCosmetics"].every((cosmetic) => typeof cosmetic === "string"))
  ) return null;

  const rawSkills = raw["skills"];
  if (rawSkills !== undefined && !isRecord(rawSkills)) return null;
  const skills = isRecord(rawSkills) ? rawSkills : {};
  const skillNames = ["networking", "forensics", "security", "logic"] as const;
  if (
    skillNames.some(
      (skill) => skills[skill] !== undefined && !isFiniteNonnegative(skills[skill]),
    )
  ) return null;

  if (
    raw["completedMissionRuns"] !== undefined &&
    (!Array.isArray(raw["completedMissionRuns"]) ||
      !raw["completedMissionRuns"].every((id) => typeof id === "string"))
  ) return null;

  const name = raw["name"];
  const base = createPlayer(name);
  const num = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  return {
    ...base,
    id: typeof raw["id"] === "string" ? raw["id"] : base.id,
    level: Math.min(5, Math.max(1, num(raw["level"], 1))),
    xp: Math.max(0, num(raw["xp"], 0)),
    coins: Math.max(0, num(raw["coins"], 100)),
    score: Math.max(0, num(raw["score"], 0)),
    streak: Math.max(0, num(raw["streak"], 0)),
    highestStreak: Math.max(0, num(raw["highestStreak"], 0)),
    totalCorrect: Math.max(0, num(raw["totalCorrect"], 0)),
    totalAnswers: Math.max(0, num(raw["totalAnswers"], 0)),
    hintsUsed: Math.max(0, num(raw["hintsUsed"], 0)),
    challengesCompleted: Math.max(0, num(raw["challengesCompleted"], 0)),
    levels,
    achievements,
    settings: {
      sound: (settings["sound"] as boolean | undefined) ?? true,
      music: (settings["music"] as boolean | undefined) ?? false,
      reducedMotion: (settings["reducedMotion"] as boolean | undefined) ?? false,
    },
    cosmetic: typeof raw["cosmetic"] === "string" ? raw["cosmetic"] : "cyan",
    ownedCosmetics: Array.isArray(raw["ownedCosmetics"])
      ? Array.from(new Set(["cyan", ...raw["ownedCosmetics"]]))
      : ["cyan"],
    skills: {
      networking: Math.max(0, num(skills["networking"], 0)),
      forensics: Math.max(0, num(skills["forensics"], 0)),
      security: Math.max(0, num(skills["security"], 0)),
      logic: Math.max(0, num(skills["logic"], 0)),
    },
    createdAt: typeof raw["createdAt"] === "string" ? raw["createdAt"] : base.createdAt,
    completedMissionRuns: Array.isArray(raw["completedMissionRuns"])
      ? Array.from(new Set(raw["completedMissionRuns"])).slice(-100)
      : [],
  };
}

const sanitize = decodePlayerSave;

export function loadGame(): PlayerState | null {
  return loadStoredGame()?.player ?? null;
}

function finiteNumber(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function sanitizeEvidenceBoardState(
  raw: unknown,
  challenge: Challenge | undefined,
): EvidenceBoardState | null | undefined {
  if (raw === undefined) return undefined;
  const data = challenge?.evidenceBoard;
  if (!isEvidenceBoardDataValid(data) || !isRecord(raw)) return null;
  const validIds = new Set(data.items.map((item) => item.id));
  const readIds = (value: unknown, max: number): string[] | null => {
    if (!Array.isArray(value) || value.length > max) return null;
    if (!value.every((id) => typeof id === "string" && validIds.has(id))) return null;
    return Array.from(new Set(value));
  };
  const openedEvidenceIds = readIds(raw["openedEvidenceIds"], data.items.length);
  const importantEvidenceIds = readIds(raw["importantEvidenceIds"], data.items.length);
  const selectedEvidenceIds = readIds(raw["selectedEvidenceIds"], 2);
  const connections = raw["connections"];
  const conclusion = raw["conclusion"];
  if (
    !openedEvidenceIds ||
    !importantEvidenceIds ||
    !selectedEvidenceIds ||
    !Array.isArray(connections) ||
    typeof conclusion !== "string" ||
    (conclusion !== "" && !data.conclusions.some((item) => item.id === conclusion)) ||
    connections.length > data.items.length * (data.items.length - 1)
  ) return null;
  const seenConnections = new Set<string>();
  const safeConnections: EvidenceBoardState["connections"] = [];
  for (const link of connections) {
    if (!isRecord(link)) return null;
    const from = link["from"];
    const to = link["to"];
    if (
      typeof from !== "string" ||
      typeof to !== "string" ||
      from === to ||
      !validIds.has(from) ||
      !validIds.has(to)
    ) return null;
    const key = `${from}\u0000${to}`;
    if (seenConnections.has(key)) return null;
    seenConnections.add(key);
    safeConnections.push({ from, to });
  }
  return {
    openedEvidenceIds,
    importantEvidenceIds,
    selectedEvidenceIds,
    connections: safeConnections,
    conclusion,
  };
}

function sanitizeNetworkPathState(
  raw: unknown,
  challenge: Challenge | undefined,
): NetworkPathState | null {
  if (!challenge?.networkPath || !isNetworkPathPuzzleValid(challenge.networkPath)) return null;
  if (raw === undefined) return initialNetworkPathState(challenge.networkPath);
  return isNetworkPathStateValid(challenge.networkPath, raw) ? raw : null;
}

function sanitizeActiveMission(raw: unknown, player: PlayerState): ActiveMissionSave | null {
  if (!isRecord(raw) || raw["version"] !== ACTIVE_MISSION_VERSION) return null;
  if (raw["screen"] !== "briefing" && raw["screen"] !== "play") return null;
  if (!isRecord(raw["run"])) return null;

  const source = raw["run"];
  const levelId = source["levelId"];
  if (typeof levelId !== "number" || !Number.isFinite(levelId) || !Number.isInteger(levelId)) {
    return null;
  }
  const level = getLevel(levelId);
  if (!level) return null;
  const challengeIndex = source["index"];
  if (!finiteNumber(challengeIndex, 0, level.challenges.length - 1) || !Number.isInteger(challengeIndex)) return null;
  const challenge = level.challenges[challengeIndex];
  const rawBoardState = source["evidenceBoardState"];
  const evidenceBoardState = sanitizeEvidenceBoardState(rawBoardState, challenge);
  if (evidenceBoardState === null) return null;
  const rawNetworkPathState = source["networkPathState"];
  const networkPathState = rawNetworkPathState === undefined && !challenge?.networkPath
    ? undefined
    : sanitizeNetworkPathState(rawNetworkPathState, challenge);
  if (networkPathState === null) return null;
  const storedRunId = source["runId"];
  const runId =
    typeof storedRunId === "string" && storedRunId
      ? storedRunId
      : `legacy-${levelId}-${String(source["startedAt"] ?? "")}`;
  if (player.completedMissionRuns.includes(runId)) return null;
  const health = source["health"];
  if (!finiteNumber(health, 1, 5) || !Number.isInteger(health)) return null;

  const nonnegativeFields = [
    "wrongInLevel",
    "hintsInLevel",
    "xpInLevel",
    "coinsInLevel",
    "scoreInLevel",
    "correctInLevel",
    "runStreak",
    "bestStreakInLevel",
    "speedBonus",
    "streakBonus",
  ] as const;
  if (!nonnegativeFields.every((field) => finiteNumber(source[field], 0))) return null;
  if (levelId === 5 && !isNexusHintCountValid(source["hintsInLevel"])) return null;
  if (!finiteNumber(source["startedAt"], 0)) return null;
  if (!isRecord(source["skillXp"])) return null;
  const skills = ["networking", "forensics", "security", "logic"] as const satisfies readonly Skill[];
  const skillXp: Partial<Record<Skill, number>> = {};
  for (const skill of skills) {
    const value = source["skillXp"][skill];
    if (value !== undefined) {
      if (!finiteNumber(value, 0)) return null;
      skillXp[skill] = value;
    }
  }
  if (Object.keys(source["skillXp"]).some((key) => !skills.includes(key as Skill))) return null;

  const answered = raw["answered"];
  if (
    answered !== null &&
    (!isRecord(answered) ||
      typeof answered["correct"] !== "boolean" ||
      typeof answered["chosen"] !== "string")
  ) return null;
  if (typeof raw["hintShown"] !== "boolean") return null;
  const rawBossState = source["bossEncounterState"];
  let bossEncounterState: BossEncounterState | undefined;
  if (levelId === 5) {
    const successfulCurrentDecision = isRecord(answered) && answered["correct"] === true;
    const expectedBossHealth = NEXUS_BOSS_HEALTH - challengeIndex - Number(successfulCurrentDecision);
    if (!isBossEncounterStateValid(rawBossState, challenge, expectedBossHealth)) return null;
    bossEncounterState = rawBossState;
  } else if (rawBossState !== undefined) {
    return null;
  }
  if (challenge?.evidenceBoard && answered !== null) {
    if (!isEvidenceBoardDataValid(challenge.evidenceBoard)) return null;
    const chosen = (answered as Record<string, unknown>)["chosen"];
    if (typeof chosen !== "string") return null;
    if (!challenge.evidenceBoard.conclusions.some((item) => item.id === chosen)) return null;
    if (evidenceBoardState?.conclusion !== chosen) return null;
    const result = evaluateEvidenceBoard(
      challenge.evidenceBoard,
      evidenceBoardState ?? EMPTY_EVIDENCE_BOARD_STATE,
      chosen,
    );
    if (result.correct !== (answered as Record<string, unknown>)["correct"]) return null;
  }
  if (challenge?.networkPath && answered !== null) {
    if (!networkPathState || !isNetworkPathPuzzleValid(challenge.networkPath)) return null;
    const chosen = (answered as Record<string, unknown>)["chosen"];
    if (typeof chosen !== "string") return null;
    let submittedPath: unknown;
    try {
      submittedPath = JSON.parse(chosen);
    } catch {
      return null;
    }
    if (
      !Array.isArray(submittedPath) ||
      submittedPath.length !== networkPathState.path.length ||
      submittedPath.some((node, index) => node !== networkPathState.path[index])
    ) return null;
    const result = evaluateNetworkPath(challenge.networkPath, networkPathState.path);
    if (result.correct !== (answered as Record<string, unknown>)["correct"]) return null;
  }

  const timeLeft = raw["timeLeft"];
  if (
    timeLeft !== null &&
    (!challenge?.timeLimit ||
      !finiteNumber(timeLeft, 0, challenge.timeLimit))
  ) return null;
  if (!finiteNumber(raw["runSeconds"], 0)) return null;

  return {
    version: ACTIVE_MISSION_VERSION,
    screen: raw["screen"],
    run: {
      runId,
      levelId,
      index: challengeIndex,
      health,
      wrongInLevel: source["wrongInLevel"] as number,
      hintsInLevel: source["hintsInLevel"] as number,
      xpInLevel: source["xpInLevel"] as number,
      coinsInLevel: source["coinsInLevel"] as number,
      scoreInLevel: source["scoreInLevel"] as number,
      correctInLevel: source["correctInLevel"] as number,
      runStreak: source["runStreak"] as number,
      bestStreakInLevel: source["bestStreakInLevel"] as number,
      speedBonus: source["speedBonus"] as number,
      streakBonus: source["streakBonus"] as number,
      skillXp,
      startedAt: source["startedAt"],
      ...(evidenceBoardState ? { evidenceBoardState } : {}),
      ...(networkPathState ? { networkPathState } : {}),
      ...(bossEncounterState ? { bossEncounterState } : {}),
    },
    answered: answered as ActiveMissionSave["answered"],
    hintShown: raw["hintShown"],
    timeLeft,
    runSeconds: raw["runSeconds"],
  };
}

export function loadStoredGame(): StoredGame | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PLAYER_KEY);
  } catch (error) {
    console.error("[Storage] Could not read local game progress.", error);
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const hasEnvelope = Object.prototype.hasOwnProperty.call(parsed, "player");
    const player = sanitize(hasEnvelope ? parsed["player"] : parsed);
    if (!player) return null;
    const activeMission = hasEnvelope
      ? sanitizeActiveMission(parsed["activeMission"], player)
      : null;
    const cyberRange = hasEnvelope && isCyberRangeProgressValid(parsed["cyberRange"])
      ? parsed["cyberRange"]
      : createEmptyCyberRangeProgress();
    return { player, activeMission, cyberRange };
  } catch (error) {
    console.error("[Storage] Could not decode local game progress.", error);
    return null;
  }
}

export function saveGame(
  player: PlayerState,
  activeMission?: ActiveMissionSave | null,
  cyberRange?: CyberRangeProgress,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(PLAYER_KEY);
    const saved = stored === null ? null : loadStoredGame();
    if (stored !== null && !saved) {
      throw new Error("Existing local game progress could not be decoded; refusing to overwrite it.");
    }
    const savedMission =
      activeMission === undefined ? saved?.activeMission ?? null : activeMission;
    const savedCyberRange = cyberRange ?? saved?.cyberRange ?? createEmptyCyberRangeProgress();
    window.localStorage.setItem(
      PLAYER_KEY,
      JSON.stringify({ player, activeMission: savedMission, cyberRange: savedCyberRange }),
    );
    return true;
  } catch (error) {
    console.error("[Storage] Could not persist local game progress.", error);
    return false;
  }
}

export function resetGame() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PLAYER_KEY);
  } catch {
    /* ignore */
  }
}

const DEMO_BOARD: LeaderboardEntry[] = [
  { name: "V0ID (demo)", score: 4200, timeSeconds: 412, accuracy: 94, date: "2026-01-04", demo: true },
  { name: "N1GHTJAR (demo)", score: 3650, timeSeconds: 503, accuracy: 88, date: "2026-01-02", demo: true },
  { name: "SABLE (demo)", score: 2980, timeSeconds: 611, accuracy: 81, date: "2025-12-28", demo: true },
];

export function loadLeaderboard(): LeaderboardEntry[] {
  if (typeof window === "undefined") return DEMO_BOARD;
  try {
    const raw = window.localStorage.getItem(BOARD_KEY);
    const mine: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
    const safe = Array.isArray(mine)
      ? mine.filter((e) => e && typeof e.name === "string" && typeof e.score === "number")
      : [];
    return [...safe, ...DEMO_BOARD].sort((a, b) => b.score - a.score).slice(0, 10);
  } catch {
    return DEMO_BOARD;
  }
}

export function submitScore(entry: LeaderboardEntry) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(BOARD_KEY);
    const mine: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
    const next = [...(Array.isArray(mine) ? mine : []), entry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    window.localStorage.setItem(BOARD_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
