import { describe, expect, it } from "vitest";
import { LEVELS } from "./levels";
import {
  evaluateLeaderboardAttempt,
  advanceLeaderboardAfterWrongAttempt,
  leaderboardAccuracy,
  leaderboardTimeSeconds,
  type LeaderboardRunState,
} from "./leaderboardRun";

function activeRun(): LeaderboardRunState {
  return {
    user_id: "user-1",
    status: "active",
    level_id: 1,
    challenge_index: 0,
    score: 0,
    correct_count: 0,
    attempts_count: 0,
    streak: 0,
    health: 5,
    started_at: "2025-01-01T00:00:00.000Z",
    challenge_started_at: "2025-01-01T00:00:00.000Z",
    finished_at: null,
    version: 0,
    level_started: true,
    last_attempt_correct: null,
    expires_at: "2025-01-02T00:00:00.000Z",
  };
}

describe("server leaderboard run scoring", () => {
  it("derives correctness and score from the canonical challenge answer", () => {
    const result = evaluateLeaderboardAttempt(activeRun(), {
      userId: "user-1",
      levelId: 1,
      challengeIndex: 0,
      value: "D",
      now: Date.parse("2025-01-01T00:00:01.000Z"),
    });

    expect(result?.correct).toBe(true);
    expect(result?.run.correct_count).toBe(1);
    expect(result?.run.attempts_count).toBe(1);
    expect(result?.run.challenge_index).toBe(1);
    expect(result?.run.score).toBeGreaterThan(0);
  });

  it("rejects stale, out-of-order, and wrong-user attempts", () => {
    const run = activeRun();
    expect(
      evaluateLeaderboardAttempt(run, {
        userId: "user-2",
        levelId: 1,
        challengeIndex: 0,
        value: "D",
        now: Date.now(),
      }),
    ).toBeNull();
    expect(
      evaluateLeaderboardAttempt(run, {
        userId: "user-1",
        levelId: 2,
        challengeIndex: 0,
        value: "D",
        now: Date.now(),
      }),
    ).toBeNull();
  });

  it("requires the server to have started the level before accepting answers", () => {
    const run = { ...activeRun(), level_started: false };
    expect(
      evaluateLeaderboardAttempt(run, {
        userId: "user-1",
        levelId: 1,
        challengeIndex: 0,
        value: "D",
        now: Date.now(),
      }),
    ).toBeNull();
  });

  it("counts a wrong response, applies the existing penalty, and keeps the challenge active", () => {
    const run = { ...activeRun(), score: 100, streak: 2 };
    const result = evaluateLeaderboardAttempt(run, {
      userId: "user-1",
      levelId: 1,
      challengeIndex: 0,
      value: "A",
      now: Date.parse("2025-01-01T00:00:05.000Z"),
    });

    expect(result?.correct).toBe(false);
    expect(result?.run.score).toBe(75);
    expect(result?.run.streak).toBe(0);
    expect(result?.run.health).toBe(4);
    expect(result?.run.challenge_index).toBe(0);
    expect(result?.run.last_attempt_correct).toBe(false);
    expect(leaderboardAccuracy(result!.run)).toBe(0);
  });

  it("advances after a recorded wrong answer without counting it as correct", () => {
    const run = { ...activeRun(), last_attempt_correct: false, attempts_count: 1 };
    const nextRun = advanceLeaderboardAfterWrongAttempt(run, {
      userId: "user-1",
      levelId: 1,
      challengeIndex: 0,
      now: Date.parse("2025-01-01T00:00:06.000Z"),
    });

    expect(nextRun?.challenge_index).toBe(1);
    expect(nextRun?.attempts_count).toBe(1);
    expect(nextRun?.correct_count).toBe(0);
    expect(nextRun?.last_attempt_correct).toBeNull();
    expect(
      advanceLeaderboardAfterWrongAttempt(activeRun(), {
        userId: "user-1",
        levelId: 1,
        challengeIndex: 0,
        now: Date.parse("2025-01-01T00:00:06.000Z"),
      }),
    ).toBeNull();
  });

  it("does not skip network-path or boss challenges after a wrong answer", () => {
    for (const level of LEVELS) {
      for (const [challengeIndex, challenge] of level.challenges.entries()) {
        if (challenge.type !== "path" && !challenge.bossPhase) continue;
        expect(
          advanceLeaderboardAfterWrongAttempt(
            {
              ...activeRun(),
              level_id: level.id,
              challenge_index: challengeIndex,
              last_attempt_correct: false,
            },
            {
              userId: "user-1",
              levelId: level.id,
              challengeIndex,
              now: Date.parse("2025-01-01T00:00:06.000Z"),
            },
          ),
        ).toBeNull();
      }
    }
  });

  it("completes a mission after its final skippable wrong answer", () => {
    const level = LEVELS[0]!;
    const challengeIndex = level.challenges.length - 1;
    const run = {
      ...activeRun(),
      challenge_index: challengeIndex,
      last_attempt_correct: false,
      attempts_count: 1,
    };
    const nextRun = advanceLeaderboardAfterWrongAttempt(run, {
      userId: "user-1",
      levelId: level.id,
      challengeIndex,
      now: Date.parse("2025-01-01T00:00:06.000Z"),
    });

    expect(nextRun?.level_id).toBe(2);
    expect(nextRun?.challenge_index).toBe(0);
    expect(nextRun?.level_started).toBe(false);
    expect(nextRun?.score).toBe(level.xpReward);
    expect(nextRun?.correct_count).toBe(0);
    expect(nextRun?.attempts_count).toBe(1);
  });

  it("rejects a correct answer submitted after the challenge timer expires", () => {
    const level = LEVELS[0]!;
    const challengeIndex = level.challenges.findIndex((item) => item.timeLimit);
    const challenge = level.challenges[challengeIndex]!;
    const run = { ...activeRun(), challenge_index: challengeIndex };
    const result = evaluateLeaderboardAttempt(run, {
      userId: "user-1",
      levelId: 1,
      challengeIndex,
      value: challenge.correctAnswer ?? challenge.accepted?.[0] ?? "",
      now: Date.parse(run.challenge_started_at) + challenge.timeLimit! * 1000 + 1,
    });

    expect(result?.correct).toBe(false);
    expect(result?.run.last_attempt_correct).toBe(false);
  });

  it("rejects attempts and skips after the run expiry", () => {
    const run = {
      ...activeRun(),
      last_attempt_correct: false,
      expires_at: "2025-01-01T00:00:05.000Z",
    };
    const now = Date.parse("2025-01-01T00:00:05.000Z");

    expect(
      evaluateLeaderboardAttempt(run, {
        userId: "user-1",
        levelId: 1,
        challengeIndex: 0,
        value: "D",
        now,
      }),
    ).toBeNull();
    expect(
      advanceLeaderboardAfterWrongAttempt(run, {
        userId: "user-1",
        levelId: 1,
        challengeIndex: 0,
        now,
      }),
    ).toBeNull();
  });

  it("rejects additional challenge attempts after the run is complete", () => {
    expect(
      evaluateLeaderboardAttempt(
        { ...activeRun(), status: "completed" },
        {
          userId: "user-1",
          levelId: 1,
          challengeIndex: 0,
          value: "D",
          now: Date.parse("2025-01-01T00:00:01.000Z"),
        },
      ),
    ).toBeNull();
  });

  it("marks a run ineligible after its final health penalty", () => {
    const run = { ...activeRun(), health: 1, score: 10 };
    const result = evaluateLeaderboardAttempt(run, {
      userId: "user-1",
      levelId: 1,
      challengeIndex: 0,
      value: "A",
      now: Date.parse("2025-01-01T00:00:05.000Z"),
    });

    expect(result?.run.status).toBe("failed");
    expect(result?.run.health).toBe(0);
    expect(result?.run.finished_at).not.toBeNull();
  });

  it("increments the level only after its final correct challenge", () => {
    const lastIndex = LEVELS[0]!.challenges.length - 1;
    const run = {
      ...activeRun(),
      challenge_index: lastIndex,
    };
    const challenge = LEVELS[0]!.challenges[lastIndex]!;
    const value = challenge.inspect
      ? challenge.inspect.parts
          .filter((part) => part.clue)
          .map((part) => part.id)
          .join("|")
      : challenge.type === "config"
        ? challenge
            .configOptions!.filter((option) => option.secure)
            .map((option) => option.id)
            .join("|")
        : (challenge.correctAnswer ?? challenge.accepted?.[0] ?? "");
    const result = evaluateLeaderboardAttempt(run, {
      userId: "user-1",
      levelId: 1,
      challengeIndex: lastIndex,
      value,
      now: Date.parse("2025-01-01T00:00:05.000Z"),
    });

    expect(result?.correct).toBe(true);
    expect(result?.run.level_id).toBe(2);
    expect(result?.run.challenge_index).toBe(0);
    expect(result?.run.level_started).toBe(false);
  });

  it("completes and times the leaderboard run only after the final validated challenge", () => {
    const finalLevel = LEVELS.at(-1)!;
    const challengeIndex = finalLevel.challenges.length - 1;
    const challenge = finalLevel.challenges[challengeIndex]!;
    const value = challenge
      .configOptions!.filter((option) => option.secure)
      .map((option) => option.id)
      .join("|");
    const run = {
      ...activeRun(),
      level_id: finalLevel.id,
      challenge_index: challengeIndex,
      started_at: "2025-01-01T00:00:00.000Z",
      challenge_started_at: "2025-01-01T00:04:00.000Z",
    };
    const result = evaluateLeaderboardAttempt(run, {
      userId: "user-1",
      levelId: finalLevel.id,
      challengeIndex,
      value,
      now: Date.parse("2025-01-01T00:05:00.000Z"),
    });

    expect(result?.correct).toBe(true);
    expect(result?.run.status).toBe("completed");
    expect(result?.run.finished_at).toBe("2025-01-01T00:05:00.000Z");
    expect(leaderboardTimeSeconds(result!.run)).toBe(300);
    expect(result!.run.score).toBeLessThanOrEqual(20_000);
  });
});
