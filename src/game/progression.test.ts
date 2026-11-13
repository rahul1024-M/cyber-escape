import { describe, expect, it } from "vitest";
import { LEVELS, getLevel } from "./levels";
import { BRIEFINGS } from "./progression";
import { getMission, missionIdFor } from "./missions";

describe("sector mission startup data", () => {
  it("resolves every sector-map entry to a level, mission, and briefing", () => {
    expect(LEVELS.map((level) => level.id)).toEqual([1, 2, 3, 4, 5, 6]);

    for (const level of LEVELS) {
      expect(getLevel(level.id)).toBe(level);
      expect(BRIEFINGS[level.id]).toBeDefined();
      expect(getMission(missionIdFor(level.id))).toMatchObject({
        levelId: level.id,
        challenges: level.challenges,
      });
    }
  });

  it("provides Sector 06 with a complete briefing for its three challenges", () => {
    const level = getLevel(6);

    expect(level).toMatchObject({ code: "06", title: "THREAT HUNTER" });
    expect(level?.challenges).toHaveLength(3);
    expect(BRIEFINGS[6]).toMatchObject({
      threat: "SEVERE",
      objectives: expect.arrayContaining([
        "Verify the suspicious login",
        "Check the warning through a trusted channel",
        "Contain and report the incident",
      ]),
    });
  });
});
