import { describe, expect, it } from "vitest";
import { claimMissionRun } from "./missionCompletion";
import {
  applyHealthPenalty,
  canBuyNexusHint,
  createInitialBossState,
  NEXUS_BOSS_HEALTH,
  NEXUS_CHALLENGES,
  recordBossDecision,
  transitionBossPhase,
} from "./nexusEncounter";

describe("NEXUS multi-phase encounter", () => {
  it("contains two distinct challenges in each of the three phases", () => {
    expect(NEXUS_CHALLENGES).toHaveLength(6);
    expect(NEXUS_CHALLENGES.map((challenge) => challenge.bossPhase)).toEqual([
      "reconnaissance",
      "reconnaissance",
      "containment",
      "containment",
      "recovery",
      "recovery",
    ]);
  });

  it("transitions phases only when advancing to a challenge in the next phase", () => {
    const phaseOne = createInitialBossState();
    expect(transitionBossPhase(phaseOne, NEXUS_CHALLENGES[1])).toEqual(phaseOne);
    expect(transitionBossPhase(phaseOne, NEXUS_CHALLENGES[2])).toEqual({
      phase: "containment",
      bossHealth: NEXUS_BOSS_HEALTH,
    });
    expect(transitionBossPhase(phaseOne, NEXUS_CHALLENGES[4]).phase).toBe("recovery");
  });

  it("reduces boss integrity only after a correct decision", () => {
    const initial = createInitialBossState();
    expect(recordBossDecision(initial, false)).toEqual(initial);
    expect(recordBossDecision(initial, true)).toEqual({
      phase: "reconnaissance",
      bossHealth: NEXUS_BOSS_HEALTH - 1,
    });
  });

  it("uses the standard player health penalty and supports a fresh retry state", () => {
    expect(applyHealthPenalty(5)).toBe(4);
    expect(applyHealthPenalty(1)).toBe(0);
    expect(createInitialBossState()).toEqual({
      phase: "reconnaissance",
      bossHealth: NEXUS_BOSS_HEALTH,
    });
  });

  it("limits the encounter to three hints", () => {
    expect(canBuyNexusHint(0)).toBe(true);
    expect(canBuyNexusHint(2)).toBe(true);
    expect(canBuyNexusHint(3)).toBe(false);
    expect(canBuyNexusHint(-1)).toBe(false);
  });

  it("does not award boss completion twice for the same run", () => {
    const firstClaim = claimMissionRun([], "nexus-run");
    expect(firstClaim).toEqual(["nexus-run"]);
    expect(claimMissionRun(firstClaim ?? [], "nexus-run")).toBeNull();
  });
});
