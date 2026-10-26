import { describe, expect, it } from "vitest";
import { LEVELS } from "./levels";
import { isChallengeAnswerCorrect } from "./challengeAnswer";
import type { Challenge } from "./types";

describe("isChallengeAnswerCorrect", () => {
  it("checks a normal challenge against its canonical answer", () => {
    const challenge = LEVELS[0]!.challenges[0]!;
    expect(isChallengeAnswerCorrect(challenge, "D")).toBe(true);
    expect(isChallengeAnswerCorrect(challenge, "A")).toBe(false);
  });

  it("normalizes accepted text answers the same way as gameplay", () => {
    const challenge: Challenge = {
      id: "normalized-input",
      levelId: 1,
      type: "input",
      title: "INPUT",
      description: "Test accepted input",
      question: "Enter the accepted phrase.",
      accepted: ["two words"],
      explanation: "",
      hint: "",
      xpReward: 0,
      coinReward: 0,
    };
    expect(isChallengeAnswerCorrect(challenge, "  TWO   WORDS  ")).toBe(true);
    expect(isChallengeAnswerCorrect(challenge, "not-the-answer")).toBe(false);
  });

  it("does not accept puzzle answers without the correct interactive state", () => {
    const challenge = LEVELS.flatMap((level) => level.challenges).find(
      (item) => item.type === "path",
    )!;
    expect(isChallengeAnswerCorrect(challenge, "")).toBe(false);
  });

  it("recomputes interactive evidence, route, inspection, and configuration answers", () => {
    const challenges = LEVELS.flatMap((level) => level.challenges);
    const inspect = challenges.find((item) => item.inspect)!;
    const config = challenges.find((item) => item.configOptions)!;
    const evidence = challenges.find((item) => item.evidenceBoard)!;
    const path = challenges.find((item) => item.networkPath)!;

    expect(
      isChallengeAnswerCorrect(
        inspect,
        inspect
          .inspect!.parts.filter((part) => part.clue)
          .map((part) => part.id)
          .join("|"),
      ),
    ).toBe(true);
    expect(
      isChallengeAnswerCorrect(
        config,
        config
          .configOptions!.filter((option) => option.secure)
          .map((option) => option.id)
          .join("|"),
      ),
    ).toBe(true);
    expect(
      isChallengeAnswerCorrect(evidence, evidence.evidenceBoard!.correctConclusion, {
        evidenceBoardState: {
          openedEvidenceIds: evidence.evidenceBoard!.items.map((item) => item.id),
          importantEvidenceIds: evidence
            .evidenceBoard!.items.filter((item) => item.relevant)
            .map((item) => item.id),
          selectedEvidenceIds: [],
          connections: evidence.evidenceBoard!.expectedConnections,
          conclusion: evidence.evidenceBoard!.correctConclusion,
        },
      }),
    ).toBe(true);
    expect(
      isChallengeAnswerCorrect(path, "", {
        networkPathState: { path: path.networkPath!.validPath },
      }),
    ).toBe(true);
  });
});
