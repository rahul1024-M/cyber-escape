import { describe, expect, it } from "vitest";
import { LEVELS } from "./levels";
import { isFinalSectorCompletion } from "./missionCompletion";
import type { LevelRecord } from "./types";

function completedLevels(...ids: number[]): Record<number, LevelRecord> {
  return Object.fromEntries(
    ids.map((id) => [id, { completed: true, bestScore: 0, perfect: false }]),
  );
}

describe("final sector completion", () => {
  it("does not end the game when Sector 05 completes", () => {
    expect(isFinalSectorCompletion(5, LEVELS, completedLevels(1, 2, 3, 4))).toBe(false);
  });

  it("ends the game when Sector 06 completes after Sectors 01–05", () => {
    expect(isFinalSectorCompletion(6, LEVELS, completedLevels(1, 2, 3, 4, 5))).toBe(true);
  });

  it("does not end the game if an earlier sector is incomplete", () => {
    expect(isFinalSectorCompletion(6, LEVELS, completedLevels(1, 2, 4, 5))).toBe(false);
  });

  it("does not end the game when replaying a completed earlier sector", () => {
    expect(isFinalSectorCompletion(3, LEVELS, completedLevels(1, 2, 4, 5, 6))).toBe(false);
  });
});
