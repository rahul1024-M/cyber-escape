import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayer, loadGame, loadStoredGame, resetGame, saveGame } from "./storage";
import type { ActiveMissionSave } from "./types";
import {
  createEmptyCyberRangeProgress,
  startLab,
  type CyberRangeProgress,
} from "./cyberRange";

const PLAYER_KEY = "cyber-escape:player:v1";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

function createActiveMission(
  changes: Partial<ActiveMissionSave> = {},
): ActiveMissionSave {
  return {
    version: 1,
    screen: "play",
    run: {
      runId: "test-run",
      levelId: 2,
      index: 2,
      health: 3,
      wrongInLevel: 2,
      hintsInLevel: 1,
      xpInLevel: 100,
      coinsInLevel: 40,
      scoreInLevel: 250,
      correctInLevel: 1,
      runStreak: 0,
      bestStreakInLevel: 1,
      speedBonus: 20,
      streakBonus: 10,
      skillXp: { networking: 25 },
      startedAt: 1_800_000_000_000,
    },
    answered: null,
    hintShown: false,
    timeLeft: 17,
    runSeconds: 38,
    ...changes,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("active mission storage", () => {
  it("saves and restores the active sector, challenge, health, and remaining state", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = {
      ...createPlayer("AGENT"),
      xp: 425,
      coins: 230,
      achievements: { first_blood: "2026-10-22T00:00:00.000Z" },
      levels: { 1: { completed: true, bestScore: 500, perfect: true } },
    };
    const activeMission = createActiveMission({
      run: { ...createActiveMission().run, levelId: 2, index: 0 },
      answered: { correct: true, chosen: "C" },
      hintShown: true,
    });

    saveGame(player, activeMission);
    const restored = loadStoredGame();

    expect(restored).toEqual({ player, activeMission, cyberRange: createEmptyCyberRangeProgress() });
    expect(restored?.activeMission?.run.levelId).toBe(2);
    expect(restored?.activeMission?.run.index).toBe(0);
    expect(restored?.activeMission?.run.health).toBe(3);
    expect(restored?.activeMission?.answered).toEqual({ correct: true, chosen: "C" });
    expect(restored?.activeMission?.hintShown).toBe(true);
    expect(restored?.activeMission?.timeLeft).toBe(17);
    expect(restored?.player.xp).toBe(425);
    expect(restored?.player.coins).toBe(230);
    expect(restored?.player.achievements).toEqual(player.achievements);
    expect(restored?.player.levels).toEqual(player.levels);
  });

  it("preserves legacy player-only saves and safely ignores missing or malformed active state", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = createPlayer("AGENT");
    expect(loadStoredGame()).toBeNull();
    localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
    expect(loadStoredGame()).toEqual({ player, activeMission: null, cyberRange: createEmptyCyberRangeProgress() });

    localStorage.setItem(PLAYER_KEY, "{invalid");
    expect(loadStoredGame()).toBeNull();
    expect(localStorage.removeItem).toHaveBeenCalledWith(PLAYER_KEY);

    localStorage.setItem(PLAYER_KEY, JSON.stringify({
      player,
      activeMission: { ...createActiveMission(), version: 2 },
    }));
    expect(loadStoredGame()?.activeMission).toBeNull();
  });

  it("does not restore completed mission state or retain it after reset", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = {
      ...createPlayer("AGENT"),
      levels: { 2: { completed: true, bestScore: 1000, perfect: true } },
    };
    saveGame(player, null);
    expect(loadStoredGame()?.activeMission).toBeNull();
    expect(loadGame()).toEqual(player);

    localStorage.setItem(PLAYER_KEY, JSON.stringify({
      player: { ...player, completedMissionRuns: ["test-run"] },
      activeMission: createActiveMission(),
    }));
    expect(loadStoredGame()?.activeMission).toBeNull();

    localStorage.setItem(PLAYER_KEY, JSON.stringify({
      player,
      activeMission: { ...createActiveMission(), screen: "levelComplete" },
    }));
    expect(loadStoredGame()?.activeMission).toBeNull();

    saveGame(player, null);
    expect(loadStoredGame()?.activeMission).toBeNull();
    resetGame();
    expect(loadStoredGame()).toBeNull();
  });

  it("rejects invalid challenge positions, health, and timer values", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = createPlayer("AGENT");

    for (const activeMission of [
      createActiveMission({ run: { ...createActiveMission().run, index: 99 } }),
      createActiveMission({ run: { ...createActiveMission().run, health: 0 } }),
      createActiveMission({ timeLeft: 999 }),
    ]) {
      saveGame(player, activeMission);
      expect(loadStoredGame()?.activeMission).toBeNull();
    }
  });

  it("restores validated evidence-board review, links, and selected conclusion", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = createPlayer("AGENT");
    const activeMission = createActiveMission({
      run: {
        ...createActiveMission().run,
        levelId: 3,
        index: 2,
        evidenceBoardState: {
          openedEvidenceIds: ["mail"],
          importantEvidenceIds: ["mail", "auth"],
          selectedEvidenceIds: ["access"],
          connections: [{ from: "mail", to: "auth" }],
          conclusion: "credential-theft",
        },
      },
      timeLeft: null,
    });

    saveGame(player, activeMission);
    expect(loadStoredGame()?.activeMission).toEqual(activeMission);
  });

  it("discards malformed evidence-board progress without discarding player progress", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = createPlayer("AGENT");
    const activeMission = createActiveMission({
      run: {
        ...createActiveMission().run,
        levelId: 3,
        index: 2,
        evidenceBoardState: {
          openedEvidenceIds: ["not-in-case"],
          importantEvidenceIds: [],
          selectedEvidenceIds: [],
          connections: [],
          conclusion: "",
        },
      },
      timeLeft: null,
    });

    saveGame(player, activeMission);
    const restored = loadStoredGame();
    expect(restored?.player).toEqual(player);
    expect(restored?.activeMission).toBeNull();
  });

  it("restores a selected network route and its current challenge state", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = {
      ...createPlayer("AGENT"),
      xp: 640,
      coins: 190,
      achievements: { network_ghost: "2026-10-22T00:00:00.000Z" },
    };
    const activeMission = createActiveMission({
      run: {
        ...createActiveMission().run,
        levelId: 2,
        index: 2,
        health: 4,
        networkPathState: { path: ["workstation", "gateway"] },
      },
      answered: null,
      timeLeft: null,
    });

    saveGame(player, activeMission);
    const restored = loadStoredGame();

    expect(restored?.activeMission?.run.networkPathState).toEqual({
      path: ["workstation", "gateway"],
    });
    expect(restored?.activeMission?.run.index).toBe(2);
    expect(restored?.activeMission?.run.health).toBe(4);
    expect(restored?.player.xp).toBe(640);
    expect(restored?.player.coins).toBe(190);
    expect(restored?.player.achievements).toEqual(player.achievements);
  });

  it("discards a malformed network route without discarding player progress", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = { ...createPlayer("AGENT"), xp: 275 };
    const activeMission = createActiveMission({
      run: {
        ...createActiveMission().run,
        levelId: 2,
        index: 2,
        networkPathState: { path: ["workstation", "unknown-node"] },
      },
      timeLeft: null,
    });

    saveGame(player, activeMission);
    const restored = loadStoredGame();
    expect(restored?.player).toEqual(player);
    expect(restored?.activeMission).toBeNull();
  });

  it("restores a missing route field as the safe start node for older active saves", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = createPlayer("AGENT");
    const activeMission = createActiveMission({
      run: { ...createActiveMission().run, levelId: 2, index: 2 },
      timeLeft: null,
    });

    saveGame(player, activeMission);
    expect(loadStoredGame()?.activeMission?.run.networkPathState).toEqual({
      path: ["workstation"],
    });
  });

  it("restores the NEXUS phase, boss integrity, player health, and current decision", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = {
      ...createPlayer("AGENT"),
      xp: 980,
      coins: 140,
      achievements: { forensic_detective: "2026-10-22T00:00:00.000Z" },
    };
    const activeMission = createActiveMission({
      run: {
        ...createActiveMission().run,
        levelId: 5,
        index: 3,
        health: 4,
        wrongInLevel: 1,
        hintsInLevel: 2,
        bossEncounterState: { phase: "containment", bossHealth: 3 },
      },
      answered: null,
      hintShown: false,
      timeLeft: null,
    });

    saveGame(player, activeMission);
    const restored = loadStoredGame();
    expect(restored?.activeMission).toEqual(activeMission);
    expect(restored?.activeMission?.run.bossEncounterState).toEqual({
      phase: "containment",
      bossHealth: 3,
    });
    expect(restored?.activeMission?.run.health).toBe(4);
    expect(restored?.player.xp).toBe(player.xp);
    expect(restored?.player.coins).toBe(player.coins);
    expect(restored?.player.achievements).toEqual(player.achievements);
  });

  it("drops malformed or outdated NEXUS state without losing player progress", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = { ...createPlayer("AGENT"), xp: 555 };
    const activeMission = createActiveMission({
      run: {
        ...createActiveMission().run,
        levelId: 5,
        index: 4,
        bossEncounterState: { phase: "containment", bossHealth: 3 },
      },
      timeLeft: null,
    });
    saveGame(player, activeMission);
    expect(loadStoredGame()?.player).toEqual(player);
    expect(loadStoredGame()?.activeMission).toBeNull();

    const outdatedSave = createActiveMission({
      run: { ...createActiveMission().run, levelId: 5, index: 0 },
      timeLeft: null,
    });
    saveGame(player, outdatedSave);
    expect(loadStoredGame()?.activeMission).toBeNull();
  });

  it("restores integrity after a completed decision without allowing duplicate rewards", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = createPlayer("AGENT");
    const activeMission = createActiveMission({
      run: {
        ...createActiveMission().run,
        levelId: 5,
        index: 0,
        correctInLevel: 1,
        bossEncounterState: { phase: "reconnaissance", bossHealth: 5 },
      },
      answered: { correct: true, chosen: "C" },
      timeLeft: null,
    });

    saveGame(player, activeMission);
    expect(loadStoredGame()?.activeMission?.run.bossEncounterState?.bossHealth).toBe(5);
  });

  it("persists and restores active lab interactions and completed lab score", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = createPlayer("AGENT");
    const range: CyberRangeProgress = {
      version: 1,
      active: {
        ...startLab("log-investigation")!,
        taskIndex: 0,
        inspectedArtifactIds: ["auth-anomaly", "new-session"],
        selectedIds: ["auth-anomaly", "new-session"],
        filter: "auth",
        lastEvaluation: {
          taskId: "identify-events",
          correct: false,
          feedback: "Review the selected records again.",
        },
      },
      completions: {
        "crypto-fundamentals": {
          score: 385,
          completedAt: "2026-10-22T00:00:00.000Z",
          hintsUsed: 1,
        },
      },
      totalScore: 385,
    };
    saveGame(player, null, range);
    expect(loadStoredGame()?.cyberRange).toEqual(range);

    saveGame({ ...player, xp: 100 }, null);
    expect(loadStoredGame()?.cyberRange).toEqual(range);
    expect(loadStoredGame()?.player.xp).toBe(100);
  });

  it("preserves older active lab saves that predate persisted task feedback", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = createPlayer("AGENT");
    const range: CyberRangeProgress = {
      version: 1,
      active: startLab("log-investigation"),
      completions: {},
      totalScore: 0,
    };
    saveGame(player, null, range);
    const saved = JSON.parse(localStorage.getItem(PLAYER_KEY)!) as {
      cyberRange: { active: Record<string, unknown> };
    };
    delete saved.cyberRange.active["lastEvaluation"];
    localStorage.setItem(PLAYER_KEY, JSON.stringify(saved));

    const restored = loadStoredGame();
    expect(restored?.cyberRange.active?.labId).toBe("log-investigation");
    expect(restored?.cyberRange.active?.taskIndex).toBe(0);
  });

  it("ignores malformed Cyber Range saves while preserving the base player save", () => {
    const localStorage = createStorage();
    vi.stubGlobal("window", { localStorage });
    const player = { ...createPlayer("AGENT"), xp: 345 };
    saveGame(player, null);
    localStorage.setItem(PLAYER_KEY, JSON.stringify({
      player,
      activeMission: null,
      cyberRange: {
        version: 1,
        active: { ...startLab("log-investigation"), taskIndex: 100 },
        completions: {},
        totalScore: 100,
      },
    }));
    const restored = loadStoredGame();
    expect(restored?.player).toEqual(player);
    expect(restored?.cyberRange).toEqual(createEmptyCyberRangeProgress());
  });
});
