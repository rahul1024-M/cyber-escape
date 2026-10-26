import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LEVELS, TOTAL_CHALLENGES, XP_THRESHOLDS, getLevel } from "./levels";
import { ACHIEVEMENTS } from "./achievements";
import {
  COSMETICS,
  createPlayer,
  loadGame,
  loadStoredGame,
  resetGame as clearStorage,
  saveGame,
} from "./storage";
import { playSound, setSoundEnabled, type SoundName } from "./sound";
import { submitScore } from "./apiService";
import {
  advanceTrackedLeaderboardAfterWrong,
  beginTrackedLeaderboardLevel,
  recordTrackedLeaderboardAttempt,
  startTrackedLeaderboardRun,
  submitTrackedLeaderboardRun,
} from "./leaderboardRun.functions";
import {
  CloudSaveSync,
  fetchCloudSave,
  pushCloudSave,
  useAuthUser,
  type SyncStatus,
} from "./cloud";
import type { User } from "@supabase/supabase-js";
import { emit } from "./events";
import { startAnalytics } from "./analytics";
import {
  buildBreakdown,
  canBuyHint,
  SCORE,
  skillFor,
  streakBonusXp,
  type ScoreBreakdown,
} from "./progression";
import {
  EMPTY_EVIDENCE_BOARD_STATE,
  isEvidenceBoardDataValid,
  updateEvidenceBoard,
  type EvidenceBoardAction,
} from "./evidenceBoard";
import {
  initialNetworkPathState,
  isNetworkPathPuzzleValid,
  resetNetworkPath as resetNetworkPathState,
  selectNetworkPathNode as selectPathNode,
} from "./networkPathPuzzles";
import { isChallengeAnswerCorrect } from "./challengeAnswer";
import { claimMissionRun } from "./missionCompletion";
import { isEnabled } from "./flags";
import { clearMissionAttempts, recordMissionAttempt, type MissionAttempt } from "./missionDebrief";
import {
  appendLabSequence,
  CYBER_RANGE_LABS,
  inspectLabArtifact,
  purchaseLabHint,
  resetLabSequence as clearLabSequence,
  startLab as createLabRun,
  submitLabTask,
  toggleLabSelection,
  updateLabRun,
  type ActiveLabRun,
  type CyberRangeProgress,
  type LabEvaluation,
} from "./cyberRange";
import {
  applyHealthPenalty,
  canBuyNexusHint,
  createInitialBossState,
  recordBossDecision,
  transitionBossPhase,
} from "./nexusEncounter";
import type { ActiveMissionSave, Challenge, MissionRunState, PlayerState, Skill } from "./types";

export type Screen =
  | "boot"
  | "codename"
  | "menu"
  | "levels"
  | "briefing"
  | "play"
  | "levelComplete"
  | "victory"
  | "failure"
  | "cyberRange"
  | "cyberLab";

export interface Toast {
  id: number;
  text: string;
  tone: "xp" | "coin" | "achievement" | "info" | "bad";
}

type RunState = MissionRunState;

export interface MissionReport {
  levelId: number;
  breakdown: ScoreBreakdown;
  xp: number;
  coins: number;
  accuracy: number;
  seconds: number;
  hints: number;
  bestStreak: number;
  skillXp: Partial<Record<Skill, number>>;
  newBests: string[];
  attempts: MissionAttempt[];
}

interface Answered {
  correct: boolean;
  chosen: string;
}

type LeaderboardRunResponse = {
  ok: boolean;
  error?: string;
  value?: { version?: number };
};

interface GameContextValue {
  player: PlayerState;
  screen: Screen;
  run: RunState | null;
  challenge: Challenge | null;
  answered: Answered | null;
  hintShown: boolean;
  timeLeft: number | null;
  toasts: Toast[];
  levelUpTo: number | null;
  levelUpFrom: number | null;
  report: MissionReport | null;
  beginMission: () => void;
  shake: number;
  runSeconds: number;
  hasSave: boolean;
  xpForNext: number;
  accuracy: number;
  go: (s: Screen) => void;
  setName: (name: string) => void;
  startNewGame: () => void;
  continueGame: () => void;
  startLevel: (levelId: number) => void;
  answer: (value: string) => void;
  updateEvidenceBoard: (action: EvidenceBoardAction) => void;
  selectNetworkPathNode: (nodeId: string) => void;
  resetNetworkPath: () => void;
  retryNetworkPath: () => void;
  retryBossDecision: () => void;
  cyberRangeProgress: CyberRangeProgress;
  selectedCyberRangeLabId: string | null;
  openCyberRange: () => void;
  startCyberRangeLab: (labId: string) => void;
  reviewCyberRangeLab: (labId: string) => void;
  updateCyberRangeFilter: (filter: string) => void;
  inspectCyberRangeArtifact: (artifactId: string) => void;
  toggleCyberRangeSelection: (id: string) => void;
  setCyberRangeDraft: (draft: string) => void;
  appendCyberRangeSequence: (id: string) => void;
  resetCyberRangeSequence: () => void;
  buyCyberRangeHint: () => void;
  submitCyberRangeTask: () => LabEvaluation | null;
  exitCyberRangeLab: () => void;
  nextChallenge: () => void;
  buyHint: () => void;
  retryLevel: () => void;
  updateSettings: (patch: Partial<PlayerState["settings"]>) => void;
  buyCosmetic: (id: string) => void;
  equipCosmetic: (id: string) => void;
  resetProgress: () => void;
  isUnlocked: (levelId: number) => boolean;
  sfx: (n: SoundName) => void;
  dismissLevelUp: () => void;
  user: User | null;
  syncStatus: SyncStatus;
  retrySync: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside GameProvider");
  return ctx;
}

const START_HEALTH = 5;

function clearEvidenceBoardState(run: RunState): RunState {
  const next = { ...run };
  delete next.evidenceBoardState;
  return next;
}

function clearChallengeState(run: RunState): RunState {
  const next = clearEvidenceBoardState(run);
  delete next.networkPathState;
  return next;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<PlayerState>(() => createPlayer(""));
  const [screen, setScreen] = useState<Screen>("boot");
  const [run, setRun] = useState<RunState | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);
  const [levelUpFrom, setLevelUpFrom] = useState<number | null>(null);
  const [report, setReport] = useState<MissionReport | null>(null);
  const missionAttemptsRef = useRef<MissionAttempt[]>([]);
  const [shake, setShake] = useState(0);
  const [runSeconds, setRunSeconds] = useState(0);
  const [hasSave, setHasSave] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [cyberRangeProgress, setCyberRangeProgress] = useState<CyberRangeProgress>(() => ({
    version: 1,
    active: null,
    completions: {},
    totalScore: 0,
  }));
  const [selectedCyberRangeLabId, setSelectedCyberRangeLabId] = useState<string | null>(null);
  const cyberRangeProgressRef = useRef(cyberRangeProgress);
  cyberRangeProgressRef.current = cyberRangeProgress;
  const toastId = useRef(0);
  const playerRef = useRef(player);
  playerRef.current = player;
  const completedRunRef = useRef<RunState | null>(null);
  const submittedAnswerRef = useRef<string | null>(null);
  const activeMission = useMemo<ActiveMissionSave | null>(
    () =>
      run && (screen === "briefing" || screen === "play")
        ? {
            version: 1,
            screen,
            run,
            answered,
            hintShown,
            timeLeft,
            runSeconds,
          }
        : null,
    [run, screen, answered, hintShown, timeLeft, runSeconds],
  );
  /* ---------- hydration ---------- */
  useEffect(() => {
    const saved = loadStoredGame();
    if (saved) {
      setPlayer(saved.player);
      setHasSave(true);
      setCyberRangeProgress(saved.cyberRange);
      setSelectedCyberRangeLabId(
        saved.cyberRange.active?.labId ??
          Object.entries(saved.cyberRange.completions).sort(([, a], [, b]) =>
            b.completedAt.localeCompare(a.completedAt),
          )[0]?.[0] ??
          null,
      );
      if (saved.activeMission) {
        setRun(saved.activeMission.run);
        setAnswered(saved.activeMission.answered);
        setHintShown(saved.activeMission.hintShown);
        setTimeLeft(saved.activeMission.timeLeft);
        setRunSeconds(saved.activeMission.runSeconds);
        setScreen(saved.activeMission.screen);
      } else {
        setScreen("menu");
      }
    } else {
      setScreen("codename");
    }
    setHydrated(true);
  }, []);

  useEffect(() => startAnalytics(), []);

  /* ---------- persistence ---------- */
  useEffect(() => {
    if (!hydrated || !player.name) return;
    saveGame(player, activeMission, cyberRangeProgress);
    setHasSave(true);
  }, [player, activeMission, cyberRangeProgress, hydrated]);

  /* ---------- optional cloud sync (never blocks play) ---------- */
  const { user, authUnavailable } = useAuthUser();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("guest");
  const cloudSyncRef = useRef<CloudSaveSync | null>(null);
  const leaderboardRunRef = useRef<{ runId: string; version: number } | null>(null);
  const leaderboardRunStartRef = useRef<Promise<string | null> | null>(null);
  const leaderboardQueueRef = useRef<Promise<void>>(Promise.resolve());
  const leaderboardFailedRef = useRef(false);
  const leaderboardRunGenerationRef = useRef(0);
  if (!cloudSyncRef.current) {
    cloudSyncRef.current = new CloudSaveSync({
      fetchSave: fetchCloudSave,
      pushSave: pushCloudSave,
      getLocalSave: () => (playerRef.current.name ? playerRef.current : loadGame()),
      applyCloudSave: (cloud) => {
        setPlayer({
          ...createPlayer(cloud.name),
          ...cloud,
          completedMissionRuns: cloud.completedMissionRuns ?? [],
        });
        setHasSave(true);
        setScreen((s) => (s === "codename" ? "menu" : s));
      },
      onStatus: setSyncStatus,
      isOnline: () => typeof navigator === "undefined" || navigator.onLine,
    });
  }
  const cloudSync = cloudSyncRef.current;

  useEffect(() => {
    const onOnline = () => cloudSync.setOnline();
    const onOffline = () => cloudSync.setOffline();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      cloudSync.dispose();
    };
  }, [cloudSync]);

  useEffect(() => {
    if (!hydrated) return;
    cloudSync.setUser(user?.id ?? null);
    if (authUnavailable) setSyncStatus("error");
  }, [cloudSync, hydrated, user, authUnavailable]);

  useEffect(() => {
    if (hydrated) cloudSync.updatePlayer(player);
  }, [cloudSync, hydrated, player]);

  const retrySync = useCallback(() => cloudSync.retry(), [cloudSync]);

  /* ---------- settings side-effects ---------- */
  useEffect(() => {
    setSoundEnabled(player.settings.sound);
  }, [player.settings.sound]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("reduce-motion", player.settings.reducedMotion);
    document.documentElement.dataset["cosmetic"] = player.cosmetic as string;
  }, [player.settings.reducedMotion, player.cosmetic]);

  const sfx = useCallback((n: SoundName) => playSound(n), []);

  const recentToasts = useRef(new Map<string, number>());
  const pushToast = useCallback((text: string, tone: Toast["tone"]) => {
    // State updaters can run twice in dev; ignore identical toasts fired within 300ms.
    const now = Date.now();
    const last = recentToasts.current.get(text);
    if (last && now - last < 300) return;
    recentToasts.current.set(text, now);
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const failLeaderboardTracking = useCallback(
    (error: unknown) => {
      if (leaderboardFailedRef.current) return;
      leaderboardFailedRef.current = true;
      leaderboardRunRef.current = null;
      console.error("[Leaderboard] This run cannot be submitted.", error);
      pushToast("VERIFIED LEADERBOARD DISABLED · LOCAL PLAY CONTINUES", "info");
    },
    [pushToast],
  );

  const queueLeaderboardOperation = useCallback(
    (operation: (runId: string, version: number) => Promise<LeaderboardRunResponse>) => {
      if (leaderboardFailedRef.current) return;
      const pendingStart = leaderboardRunStartRef.current;
      if (!pendingStart && !leaderboardRunRef.current) return;
      leaderboardQueueRef.current = leaderboardQueueRef.current
        .then(async () => {
          if (leaderboardFailedRef.current) return;
          const runId =
            leaderboardRunRef.current?.runId ?? (pendingStart ? await pendingStart : null);
          if (!runId || leaderboardFailedRef.current) return;
          const version = leaderboardRunRef.current?.version ?? 0;
          const result = await operation(runId, version);
          if (!result.ok) throw new Error(result.error ?? "Leaderboard request failed.");
          if (typeof result.value?.version === "number") {
            leaderboardRunRef.current = { runId, version: result.value.version };
          }
        })
        .catch(failLeaderboardTracking);
    },
    [failLeaderboardTracking],
  );

  const challenge = useMemo(() => {
    if (!run) return null;
    const level = getLevel(run.levelId);
    return level?.challenges[run.index] ?? null;
  }, [run]);

  /* ---------- achievements ---------- */
  const unlock = useCallback(
    (p: PlayerState, ids: string[]): PlayerState => {
      const newly = ids.filter((id) => !p.achievements[id]);
      if (!newly.length) return p;
      const achievements = { ...p.achievements };
      newly.forEach((id) => {
        achievements[id] = new Date().toISOString();
        const def = ACHIEVEMENTS.find((a) => a.id === id);
        pushToast(`ACHIEVEMENT: ${def?.title ?? id}`, "achievement");
      });
      playSound("achievement");
      return { ...p, achievements };
    },
    [pushToast],
  );

  /* ---------- run timer ---------- */
  useEffect(() => {
    if (screen !== "play" || !run) return;
    const t = window.setInterval(() => {
      setRunSeconds(Math.floor((Date.now() - run.startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [screen, run]);

  const failRun = useCallback(() => {
    missionAttemptsRef.current = clearMissionAttempts();
    setScreen("failure");
    emit("MISSION_FAILED");
    setAnswered(null);
    setTimeLeft(null);
    playSound("wrong");
  }, []);

  /* ---------- handle a wrong/timeout result ---------- */
  const applyWrong = useCallback(
    (reason: "wrong" | "timeout") => {
      setShake((s) => s + 1);
      playSound("wrong");
      pushToast(reason === "timeout" ? "TIME EXPIRED −1 HP" : "INCORRECT −1 HP", "bad");
      setPlayer((p) => ({
        ...p,
        streak: 0,
        totalAnswers: p.totalAnswers + 1,
        score: Math.max(0, p.score - 25),
      }));
      setRun((r) => {
        if (!r) return r;
        const health = applyHealthPenalty(r.health);
        if (health <= 0) {
          window.setTimeout(failRun, 450);
        }
        return {
          ...r,
          health,
          wrongInLevel: r.wrongInLevel + 1,
          runStreak: 0,
          scoreInLevel: Math.max(0, r.scoreInLevel - 25),
        };
      });
    },
    [failRun, pushToast],
  );

  /* ---------- challenge countdown ---------- */
  useEffect(() => {
    if (screen !== "play" || !run || !challenge?.timeLimit || answered) return;
    if (timeLeft === null) setTimeLeft(challenge.timeLimit);
    const t = window.setInterval(() => {
      setTimeLeft((v) => {
        if (v === null) return v;
        if (v <= 1) {
          window.clearInterval(t);
          const submissionId = `${run.runId}:${run.index}`;
          if (submittedAnswerRef.current === submissionId) return 0;
          submittedAnswerRef.current = submissionId;
          queueLeaderboardOperation((trackedRunId, version) =>
            recordTrackedLeaderboardAttempt({
              runId: trackedRunId,
              version,
              levelId: run.levelId,
              challengeIndex: run.index,
              value: "__timeout__",
              ...(run.evidenceBoardState ? { evidenceBoardState: run.evidenceBoardState } : {}),
              ...(run.networkPathState ? { networkPathState: run.networkPathState } : {}),
            }),
          );
          missionAttemptsRef.current = recordMissionAttempt(
            missionAttemptsRef.current,
            challenge,
            false,
          );
          setAnswered({ correct: false, chosen: "__timeout__" });
          applyWrong("timeout");
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.id, screen, queueLeaderboardOperation]);

  /* ---------- navigation ---------- */
  const go = useCallback((s: Screen) => {
    if ((s === "cyberRange" || s === "cyberLab") && !isEnabled("ENABLE_CYBER_RANGE")) return;
    if (s !== "levelComplete" && s !== "victory") {
      missionAttemptsRef.current = clearMissionAttempts();
      setReport(null);
    }
    playSound("click");
    setScreen(s);
  }, []);

  const setName = useCallback((name: string) => {
    setPlayer((p) => ({ ...p, name: name.trim().slice(0, 18) || "AGENT" }));
    setScreen("menu");
    playSound("click");
  }, []);

  const startLevel = useCallback(
    (levelId: number) => {
      completedRunRef.current = null;
      missionAttemptsRef.current = clearMissionAttempts();
      setReport(null);
      if (levelId === 1) {
        const previousStart = leaderboardRunStartRef.current;
        const generation = ++leaderboardRunGenerationRef.current;
        leaderboardFailedRef.current = false;
        leaderboardRunRef.current = null;
        leaderboardRunStartRef.current = null;
        leaderboardQueueRef.current = Promise.resolve();
        if (user) {
          const startPromise = (previousStart ?? Promise.resolve(null))
            .then(() => startTrackedLeaderboardRun())
            .then((result) => {
              if (generation !== leaderboardRunGenerationRef.current) return null;
              if (!result.ok) throw new Error(result.error);
              leaderboardRunRef.current = {
                runId: result.value.runId,
                version: result.value.version,
              };
              return result.value.runId;
            })
            .catch((error) => {
              if (generation === leaderboardRunGenerationRef.current) {
                failLeaderboardTracking(error);
              }
              return null;
            });
          leaderboardRunStartRef.current = startPromise;
        }
      }
      playSound(levelId === 5 ? "boss" : "click");
      setRun({
        runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        levelId,
        index: 0,
        health: START_HEALTH,
        wrongInLevel: 0,
        hintsInLevel: 0,
        xpInLevel: 0,
        coinsInLevel: 0,
        scoreInLevel: 0,
        correctInLevel: 0,
        runStreak: 0,
        bestStreakInLevel: 0,
        speedBonus: 0,
        streakBonus: 0,
        skillXp: {},
        startedAt: Date.now(),
        ...(levelId === 5 ? { bossEncounterState: createInitialBossState() } : {}),
      });
      setRunSeconds(0);
      setAnswered(null);
      setHintShown(false);
      setTimeLeft(null);
      setScreen("briefing");
    },
    [failLeaderboardTracking, user],
  );

  const beginMission = useCallback(() => {
    playSound("click");
    const currentLevelId = run?.levelId;
    if (currentLevelId) {
      queueLeaderboardOperation((trackedRunId) =>
        beginTrackedLeaderboardLevel(trackedRunId, currentLevelId),
      );
    }
    setRun((r) => (r ? { ...r, startedAt: Date.now() } : r));
    setRunSeconds(0);
    setScreen("play");
    setRun((r) => {
      if (r) emit("MISSION_STARTED", { missionId: `mission-${r.levelId}` });
      return r;
    });
  }, [queueLeaderboardOperation, run?.levelId]);

  const isUnlocked = useCallback(
    (levelId: number) => levelId === 1 || Boolean(player.levels[levelId - 1]?.completed),
    [player.levels],
  );

  const startNewGame = useCallback(() => {
    startLevel(1);
  }, [startLevel]);

  const continueGame = useCallback(() => {
    const next = LEVELS.find((l) => !player.levels[l.id]?.completed);
    startLevel(next ? next.id : 1);
  }, [player.levels, startLevel]);

  /* ---------- answering ---------- */
  const answer = useCallback(
    (value: string) => {
      if (!challenge || !run || answered) return;
      const submissionId = `${run.runId}:${run.index}`;
      if (submittedAnswerRef.current === submissionId) return;
      submittedAnswerRef.current = submissionId;
      const correct = isChallengeAnswerCorrect(challenge, value, run);

      queueLeaderboardOperation((trackedRunId, version) =>
        recordTrackedLeaderboardAttempt({
          runId: trackedRunId,
          version,
          levelId: run.levelId,
          challengeIndex: run.index,
          value,
          ...(run.evidenceBoardState ? { evidenceBoardState: run.evidenceBoardState } : {}),
          ...(run.networkPathState ? { networkPathState: run.networkPathState } : {}),
        }),
      );

      missionAttemptsRef.current = recordMissionAttempt(
        missionAttemptsRef.current,
        challenge,
        correct,
      );
      setAnswered({ correct, chosen: value });

      if (!correct) {
        emit("CHALLENGE_FAILED", { challengeId: challenge.id });
        applyWrong("wrong");
        return;
      }

      playSound("correct");
      emit("CHALLENGE_COMPLETED", { challengeId: challenge.id });
      const remaining = timeLeft;
      const speedBonus =
        challenge.timeLimit && remaining !== null
          ? Math.round((remaining / challenge.timeLimit) * 50)
          : 0;

      const streak = player.streak + 1;
      const bonusXp = streakBonusXp(streak);
      const gainedXp = challenge.xpReward + bonusXp;
      const gainedCoins = challenge.coinReward;
      const streakScore = streak * SCORE.streakPer;
      const skill = skillFor(challenge);
      const skillGain = Math.round(challenge.xpReward / 2);

      pushToast(`✓ +${gainedXp} XP · +${gainedCoins} COINS`, "xp");
      if ([3, 5, 10].includes(streak) || (streak > 10 && streak % 5 === 0)) {
        pushToast(`STREAK ×${streak} · +${bonusXp} BONUS XP`, "info");
        playSound("streak");
      }

      setPlayer((p) => {
        const s = p.streak + 1;
        let next: PlayerState = {
          ...p,
          xp: p.xp + gainedXp,
          coins: p.coins + gainedCoins,
          score: p.score + SCORE.base + speedBonus + streakScore,
          streak: s,
          highestStreak: Math.max(p.highestStreak, s),
          totalCorrect: p.totalCorrect + 1,
          totalAnswers: p.totalAnswers + 1,
          challengesCompleted: p.challengesCompleted + 1,
          skills: { ...p.skills, [skill]: (p.skills[skill] ?? 0) + skillGain },
        };
        const from = next.level;
        while (next.level < 5 && next.xp >= (XP_THRESHOLDS[next.level - 1] ?? Infinity)) {
          next = { ...next, level: next.level + 1, coins: next.coins + 50 };
        }
        if (next.level > from) {
          setLevelUpFrom(from);
          setLevelUpTo(next.level);
          playSound("levelUp");
        }
        const ids: string[] = ["first_blood"];
        if (s >= 5) ids.push("streak_master");
        if (s >= 10) ids.push("streak_legend");
        if (challenge.timeLimit && remaining !== null && remaining > 10) ids.push("speed_demon");
        return unlock(next, ids);
      });

      setRun((r) =>
        r
          ? {
              ...r,
              xpInLevel: r.xpInLevel + gainedXp,
              coinsInLevel: r.coinsInLevel + gainedCoins,
              scoreInLevel: r.scoreInLevel + SCORE.base + speedBonus + streakScore,
              correctInLevel: r.correctInLevel + 1,
              runStreak: r.runStreak + 1,
              bestStreakInLevel: Math.max(r.bestStreakInLevel, r.runStreak + 1),
              speedBonus: r.speedBonus + speedBonus,
              streakBonus: r.streakBonus + streakScore,
              skillXp: { ...r.skillXp, [skill]: (r.skillXp[skill] ?? 0) + skillGain },
              ...(r.levelId === 5 && challenge.bossPhase
                ? {
                    bossEncounterState: recordBossDecision(
                      r.bossEncounterState ?? createInitialBossState(),
                      true,
                    ),
                  }
                : {}),
            }
          : r,
      );
      setTimeLeft(null);
    },
    [
      answered,
      applyWrong,
      challenge,
      player.streak,
      pushToast,
      queueLeaderboardOperation,
      run,
      timeLeft,
      unlock,
    ],
  );

  const selectNetworkPathNode = useCallback(
    (nodeId: string) => {
      const puzzle = challenge?.networkPath;
      if (!puzzle || !isNetworkPathPuzzleValid(puzzle) || answered) return;
      setRun((current) => {
        if (!current) return current;
        const state = current.networkPathState ?? initialNetworkPathState(puzzle);
        const updated = selectPathNode(puzzle, state, nodeId);
        return updated === state ? current : { ...current, networkPathState: updated };
      });
    },
    [answered, challenge],
  );

  const resetNetworkPath = useCallback(() => {
    const puzzle = challenge?.networkPath;
    if (!puzzle || !isNetworkPathPuzzleValid(puzzle) || answered) return;
    setRun((current) =>
      current ? { ...current, networkPathState: resetNetworkPathState(puzzle) } : current,
    );
  }, [answered, challenge]);

  const retryNetworkPath = useCallback(() => {
    const puzzle = challenge?.networkPath;
    if (!puzzle || !isNetworkPathPuzzleValid(puzzle) || !answered || answered.correct) return;
    submittedAnswerRef.current = null;
    setAnswered(null);
    setRun((current) =>
      current ? { ...current, networkPathState: resetNetworkPathState(puzzle) } : current,
    );
  }, [answered, challenge]);

  const retryBossDecision = useCallback(() => {
    if (run?.levelId !== 5 || !answered || answered.correct || run.health < 1) return;
    submittedAnswerRef.current = null;
    setAnswered(null);
  }, [answered, run]);

  const updateActiveLab = useCallback((update: (active: ActiveLabRun) => ActiveLabRun) => {
    const current = cyberRangeProgressRef.current;
    if (!isEnabled("ENABLE_CYBER_RANGE") || !current.active) return;
    const next = { ...current, active: update(current.active) };
    cyberRangeProgressRef.current = next;
    setCyberRangeProgress(next);
  }, []);

  const openCyberRange = useCallback(() => {
    if (!isEnabled("ENABLE_CYBER_RANGE")) return;
    setScreen("cyberRange");
  }, []);

  const startCyberRangeLab = useCallback((labId: string) => {
    if (!isEnabled("ENABLE_CYBER_RANGE")) return;
    if (cyberRangeProgressRef.current.active) {
      setSelectedCyberRangeLabId(cyberRangeProgressRef.current.active.labId);
      setScreen("cyberLab");
      return;
    }
    const lab = CYBER_RANGE_LABS.find((item) => item.id === labId);
    const active = createLabRun(labId);
    if (!lab || !active || cyberRangeProgressRef.current.completions[labId]) return;
    const next = { ...cyberRangeProgressRef.current, active };
    cyberRangeProgressRef.current = next;
    setCyberRangeProgress(next);
    setSelectedCyberRangeLabId(labId);
    setScreen("cyberLab");
  }, []);

  const reviewCyberRangeLab = useCallback((labId: string) => {
    if (!isEnabled("ENABLE_CYBER_RANGE") || !cyberRangeProgressRef.current.completions[labId])
      return;
    setSelectedCyberRangeLabId(labId);
    setScreen("cyberLab");
  }, []);

  const updateCyberRangeFilter = useCallback(
    (filter: string) => {
      updateActiveLab((active) => updateLabRun(active, { filter: filter.slice(0, 100) }));
    },
    [updateActiveLab],
  );

  const inspectCyberRangeArtifact = useCallback(
    (artifactId: string) => {
      const active = cyberRangeProgressRef.current.active;
      const lab = CYBER_RANGE_LABS.find((item) => item.id === active?.labId);
      if (!active || !lab?.artifacts.some((artifact) => artifact.id === artifactId)) return;
      updateActiveLab((current) => inspectLabArtifact(current, artifactId));
    },
    [updateActiveLab],
  );

  const toggleCyberRangeSelection = useCallback(
    (id: string) => {
      const active = cyberRangeProgressRef.current.active;
      const lab = CYBER_RANGE_LABS.find((item) => item.id === active?.labId);
      const task = lab?.tasks[active?.taskIndex ?? -1];
      if (!active || task?.mode !== "select" || !task.options?.some((option) => option.id === id))
        return;
      if (!active.inspectedArtifactIds.includes(id)) {
        pushToast("INSPECT THIS EVIDENCE BEFORE SELECTING IT", "info");
        return;
      }
      updateActiveLab((current) => toggleLabSelection(current, id));
    },
    [pushToast, updateActiveLab],
  );

  const setCyberRangeDraft = useCallback(
    (draft: string) => {
      updateActiveLab((active) => updateLabRun(active, { draft: draft.slice(0, 200) }));
    },
    [updateActiveLab],
  );

  const appendCyberRangeSequence = useCallback(
    (id: string) => {
      const active = cyberRangeProgressRef.current.active;
      const lab = CYBER_RANGE_LABS.find((item) => item.id === active?.labId);
      const task = lab?.tasks[active?.taskIndex ?? -1];
      if (!active || task?.mode !== "sequence" || !task.options?.some((option) => option.id === id))
        return;
      updateActiveLab((current) => appendLabSequence(current, id));
    },
    [updateActiveLab],
  );

  const resetCyberRangeSequence = useCallback(() => {
    updateActiveLab((active) => clearLabSequence(active));
  }, [updateActiveLab]);

  const buyCyberRangeHint = useCallback(() => {
    const current = cyberRangeProgressRef.current;
    const active = current.active;
    const lab = CYBER_RANGE_LABS.find((item) => item.id === active?.labId);
    if (!isEnabled("ENABLE_CYBER_RANGE") || !active || !lab || active.hintShown) return;
    const purchase = purchaseLabHint(active, playerRef.current, lab);
    if (!purchase) {
      pushToast("NOT ENOUGH COINS", "bad");
      return;
    }
    const next = {
      ...current,
      active: purchase.run,
    };
    cyberRangeProgressRef.current = next;
    setCyberRangeProgress(next);
    setPlayer((player) => ({
      ...player,
      ...purchase.player,
    }));
    pushToast("−10 COINS · LAB HINT UNLOCKED", "info");
  }, [pushToast]);

  const submitCyberRangeTask = useCallback((): LabEvaluation | null => {
    if (!isEnabled("ENABLE_CYBER_RANGE")) return null;
    const current = cyberRangeProgressRef.current;
    const active = current.active;
    const lab = CYBER_RANGE_LABS.find((item) => item.id === active?.labId);
    if (!active || !lab || current.completions[lab.id]) return null;
    const submission = submitLabTask(current, lab, active, new Date().toISOString());
    const { evaluation, progress: nextProgress } = submission;
    if (nextProgress === current) return evaluation;
    if (!submission.completed) {
      cyberRangeProgressRef.current = nextProgress;
      setCyberRangeProgress(nextProgress);
      return evaluation;
    }
    setSelectedCyberRangeLabId(lab.id);
    const allComplete = CYBER_RANGE_LABS.every((item) => nextProgress.completions[item.id]);
    let nextPlayer: PlayerState = {
      ...playerRef.current,
      xp: playerRef.current.xp + lab.rewardXp,
      coins: playerRef.current.coins + lab.rewardCoins,
    };
    const from = nextPlayer.level;
    while (
      nextPlayer.level < 5 &&
      nextPlayer.xp >= (XP_THRESHOLDS[nextPlayer.level - 1] ?? Infinity)
    ) {
      nextPlayer = { ...nextPlayer, level: nextPlayer.level + 1, coins: nextPlayer.coins + 50 };
    }
    nextPlayer = unlock(nextPlayer, [
      "cyber_range_first_lab",
      ...(allComplete ? ["cyber_range_all_labs"] : []),
    ]);

    cyberRangeProgressRef.current = nextProgress;
    saveGame(nextPlayer, activeMission, nextProgress);
    playerRef.current = nextPlayer;
    setPlayer(nextPlayer);
    setCyberRangeProgress(nextProgress);
    if (nextPlayer.level > from) {
      setLevelUpFrom(from);
      setLevelUpTo(nextPlayer.level);
    }
    pushToast(`LAB COMPLETE · +${lab.rewardXp} XP · +${lab.rewardCoins} COINS`, "xp");
    return evaluation;
  }, [activeMission, unlock, pushToast]);

  const exitCyberRangeLab = useCallback(() => {
    setScreen("cyberRange");
  }, []);

  const updateEvidenceBoardState = useCallback(
    (action: EvidenceBoardAction) => {
      if (!challenge?.evidenceBoard || !isEvidenceBoardDataValid(challenge.evidenceBoard)) return;
      const data = challenge.evidenceBoard;
      setRun((current) =>
        current
          ? {
              ...current,
              evidenceBoardState: updateEvidenceBoard(
                current.evidenceBoardState ?? EMPTY_EVIDENCE_BOARD_STATE,
                action,
                data,
              ),
            }
          : current,
      );
    },
    [challenge],
  );

  /* ---------- finishing a level ---------- */
  const completeLevel = useCallback(() => {
    if (!run) return;
    if (completedRunRef.current === run) return;
    if (player.completedMissionRuns.includes(run.runId)) return;
    const level = getLevel(run.levelId);
    if (!level) return;
    completedRunRef.current = run;
    playSound("levelComplete");

    const seconds = Math.max(1, Math.floor((Date.now() - run.startedAt) / 1000));
    const attempts = run.correctInLevel + run.wrongInLevel;
    const accuracy = attempts ? Math.round((run.correctInLevel / attempts) * 100) : 100;
    const breakdown = buildBreakdown({
      correct: run.correctInLevel,
      speed: run.speedBonus,
      streak: run.streakBonus,
      hints: run.hintsInLevel,
      wrong: run.wrongInLevel,
      completion: level.xpReward,
    });
    const prev = player.levels[level.id];
    const newBests: string[] = [];
    if (!prev?.completed || breakdown.final > (prev.bestScore ?? 0)) newBests.push("score");
    if (prev?.bestTime === undefined || seconds < prev.bestTime) newBests.push("time");
    if (prev?.bestAccuracy === undefined || accuracy > prev.bestAccuracy) newBests.push("accuracy");
    if (prev?.fewestHints === undefined || run.hintsInLevel < prev.fewestHints)
      newBests.push("hints");
    if (prev?.bestStreak === undefined || run.bestStreakInLevel > prev.bestStreak)
      newBests.push("streak");

    setReport({
      levelId: level.id,
      breakdown,
      xp: run.xpInLevel + level.xpReward,
      coins: run.coinsInLevel + level.coinReward,
      accuracy,
      seconds,
      hints: run.hintsInLevel,
      bestStreak: run.bestStreakInLevel,
      skillXp: run.skillXp,
      newBests: prev?.completed ? newBests : [],
      attempts: missionAttemptsRef.current.slice(),
    });
    missionAttemptsRef.current = clearMissionAttempts();

    setPlayer((p) => {
      const completedMissionRuns = claimMissionRun(p.completedMissionRuns, run.runId);
      if (!completedMissionRuns) return p;
      const pr = p.levels[level.id];
      let next: PlayerState = {
        ...p,
        completedMissionRuns,
        coins: p.coins + level.coinReward,
        xp: p.xp + level.xpReward,
        score: p.score + level.xpReward,
        levels: {
          ...p.levels,
          [level.id]: {
            completed: true,
            bestScore: Math.max(pr?.bestScore ?? 0, breakdown.final),
            perfect: (pr?.perfect ?? false) || run.wrongInLevel === 0,
            bestTime: Math.min(pr?.bestTime ?? Infinity, seconds),
            bestAccuracy: Math.max(pr?.bestAccuracy ?? 0, accuracy),
            fewestHints: Math.min(pr?.fewestHints ?? Infinity, run.hintsInLevel),
            bestStreak: Math.max(pr?.bestStreak ?? 0, run.bestStreakInLevel),
          },
        },
      };
      const from = next.level;
      while (next.level < 5 && next.xp >= (XP_THRESHOLDS[next.level - 1] ?? Infinity)) {
        next = { ...next, level: next.level + 1, coins: next.coins + 50 };
      }
      if (next.level > from) {
        setLevelUpFrom(from);
        setLevelUpTo(next.level);
      }

      const ids: string[] = [];
      const byLevel: Record<number, string> = {
        1: "first_breach",
        2: "network_ghost",
        3: "forensic_detective",
        4: "security_expert",
        5: "core_breaker",
      };
      ids.push(byLevel[level.id] ?? "");
      if (level.id === 5) ids.push("boss_breaker");
      if (run.wrongInLevel === 0) {
        ids.push("perfect_run");
        if (level.id === 3) ids.push("forensic_master");
        if (level.id === 4) ids.push("security_architect");
      }
      if (run.hintsInLevel === 0) ids.push("no_hints");
      if (run.health === 1) ids.push("survivor");
      if (seconds < 90) ids.push("speedrunner");
      if (LEVELS.every((l) => l.id === level.id || next.levels[l.id]?.completed))
        ids.push("digital_escape");
      return unlock(next, ids);
    });

    emit("MISSION_COMPLETED", {
      missionId: `mission-${level.id}`,
      value: seconds,
      data: { perfect: run.wrongInLevel === 0 },
    });
    pushToast(`SECTOR CLEARED +${level.coinReward} COINS`, "coin");
    setAnswered(null);
    setTimeLeft(null);
    setRun(null);
    setScreen(level.id === 5 ? "victory" : "levelComplete");
  }, [player.completedMissionRuns, player.levels, pushToast, run, unlock]);

  /* ---------- victory: record leaderboard entry ---------- */
  useEffect(() => {
    if (screen !== "victory") return;
    playSound("victory");
    const entry = {
      name: player.name || "AGENT",
      score: player.score,
      timeSeconds: runSeconds,
      accuracy:
        player.totalAnswers > 0
          ? Math.round((player.totalCorrect / player.totalAnswers) * 100)
          : 100,
      date: new Date().toISOString().slice(0, 10),
    };
    void submitScore(entry);
    if (user) {
      if (leaderboardRunStartRef.current || leaderboardRunRef.current) {
        queueLeaderboardOperation(async (trackedRunId) => {
          const result = await submitTrackedLeaderboardRun(trackedRunId);
          return result.ok ? { ok: true, value: {} } : result;
        });
      } else if (!leaderboardFailedRef.current) {
        pushToast("VERIFIED LEADERBOARD REQUIRES A NEW SECTOR 01 RUN", "info");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const nextChallenge = useCallback(() => {
    if (!run) return;
    const level = getLevel(run.levelId);
    if (!level) return;
    playSound("click");
    if (answered && !answered.correct && challenge?.type !== "path" && !challenge?.bossPhase) {
      queueLeaderboardOperation((trackedRunId, version) =>
        advanceTrackedLeaderboardAfterWrong({
          runId: trackedRunId,
          version,
          levelId: run.levelId,
          challengeIndex: run.index,
        }),
      );
    }
    if (run.index + 1 >= level.challenges.length) {
      completeLevel();
      return;
    }
    const nextIndex = run.index + 1;
    const nextChallenge = level.challenges[nextIndex];
    const bossEncounterState =
      run.levelId === 5 && run.bossEncounterState
        ? transitionBossPhase(run.bossEncounterState, nextChallenge)
        : run.bossEncounterState;
    setRun({
      ...clearChallengeState(run),
      index: nextIndex,
      ...(bossEncounterState ? { bossEncounterState } : {}),
    });
    setAnswered(null);
    setHintShown(false);
    setTimeLeft(null);
  }, [answered, challenge, completeLevel, queueLeaderboardOperation, run]);

  const buyHint = useCallback(() => {
    if (!challenge || hintShown) return;
    if (run?.levelId === 5 && !canBuyNexusHint(run.hintsInLevel)) {
      pushToast("NEXUS HINT LIMIT REACHED", "bad");
      return;
    }
    if (!canBuyHint(player.coins, hintShown)) {
      pushToast("NOT ENOUGH COINS", "bad");
      return;
    }
    playSound("click");
    setHintShown(true);
    setPlayer((p) => ({
      ...p,
      coins: p.coins - 10,
      hintsUsed: p.hintsUsed + 1,
      score: Math.max(0, p.score - 15),
    }));
    emit("HINT_USED", { challengeId: challenge.id });
    setRun((r) => (r ? { ...r, hintsInLevel: r.hintsInLevel + 1 } : r));
    pushToast("−10 COINS · HINT UNLOCKED", "info");
  }, [challenge, hintShown, player.coins, pushToast, run]);

  const retryLevel = useCallback(() => {
    if (!run) return;
    startLevel(run.levelId);
  }, [run, startLevel]);

  const updateSettings = useCallback((patch: Partial<PlayerState["settings"]>) => {
    playSound("click");
    setPlayer((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  }, []);

  const buyCosmetic = useCallback(
    (id: string) => {
      const item = COSMETICS.find((c) => c.id === id);
      if (!item) return;
      if (player.ownedCosmetics.includes(id)) return;
      if (player.coins < item.price) {
        pushToast("NOT ENOUGH COINS", "bad");
        return;
      }
      playSound("achievement");
      setPlayer((p) =>
        unlock(
          {
            ...p,
            coins: p.coins - item.price,
            ownedCosmetics: [...p.ownedCosmetics, id],
            cosmetic: id,
          },
          ["big_spender"],
        ),
      );
      pushToast(`${item.name} UNLOCKED`, "achievement");
    },
    [player.coins, player.ownedCosmetics, pushToast, unlock],
  );

  const equipCosmetic = useCallback((id: string) => {
    playSound("click");
    setPlayer((p) => (p.ownedCosmetics.includes(id) ? { ...p, cosmetic: id } : p));
  }, []);

  const resetProgress = useCallback(() => {
    clearStorage();
    missionAttemptsRef.current = clearMissionAttempts();
    setReport(null);
    const emptyRange = {
      version: 1 as const,
      active: null,
      completions: {},
      totalScore: 0,
    };
    cyberRangeProgressRef.current = emptyRange;
    setCyberRangeProgress(emptyRange);
    setSelectedCyberRangeLabId(null);
    setPlayer(createPlayer(""));
    setRun(null);
    setAnswered(null);
    setHasSave(false);
    setScreen("codename");
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      player,
      screen,
      run,
      challenge,
      answered,
      hintShown,
      timeLeft,
      toasts,
      levelUpTo,
      levelUpFrom,
      report,
      beginMission,
      shake,
      runSeconds,
      hasSave,
      xpForNext: XP_THRESHOLDS[Math.min(player.level - 1, 4)] ?? 1000,
      accuracy:
        player.totalAnswers > 0
          ? Math.round((player.totalCorrect / player.totalAnswers) * 100)
          : 100,
      go,
      setName,
      startNewGame,
      continueGame,
      startLevel,
      answer,
      updateEvidenceBoard: updateEvidenceBoardState,
      selectNetworkPathNode,
      resetNetworkPath,
      retryNetworkPath,
      retryBossDecision,
      cyberRangeProgress,
      selectedCyberRangeLabId,
      openCyberRange,
      startCyberRangeLab,
      reviewCyberRangeLab,
      updateCyberRangeFilter,
      inspectCyberRangeArtifact,
      toggleCyberRangeSelection,
      setCyberRangeDraft,
      appendCyberRangeSequence,
      resetCyberRangeSequence,
      buyCyberRangeHint,
      submitCyberRangeTask,
      exitCyberRangeLab,
      nextChallenge,
      buyHint,
      retryLevel,
      updateSettings,
      buyCosmetic,
      equipCosmetic,
      resetProgress,
      isUnlocked,
      sfx,
      dismissLevelUp: () => setLevelUpTo(null),
      user,
      syncStatus,
      retrySync,
    }),
    [
      user,
      syncStatus,
      retrySync,
      player,
      screen,
      run,
      challenge,
      answered,
      hintShown,
      timeLeft,
      toasts,
      levelUpTo,
      levelUpFrom,
      report,
      beginMission,
      shake,
      runSeconds,
      hasSave,
      go,
      setName,
      startNewGame,
      continueGame,
      startLevel,
      answer,
      updateEvidenceBoardState,
      selectNetworkPathNode,
      resetNetworkPath,
      retryNetworkPath,
      retryBossDecision,
      cyberRangeProgress,
      selectedCyberRangeLabId,
      openCyberRange,
      startCyberRangeLab,
      reviewCyberRangeLab,
      updateCyberRangeFilter,
      inspectCyberRangeArtifact,
      toggleCyberRangeSelection,
      setCyberRangeDraft,
      appendCyberRangeSequence,
      resetCyberRangeSequence,
      buyCyberRangeHint,
      submitCyberRangeTask,
      exitCyberRangeLab,
      nextChallenge,
      buyHint,
      retryLevel,
      updateSettings,
      buyCosmetic,
      equipCosmetic,
      resetProgress,
      isUnlocked,
      sfx,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export { TOTAL_CHALLENGES };
