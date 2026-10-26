import { afterEach, describe, expect, it, vi } from "vitest";
import { aiService } from "./services/aiService";
import { LEVELS } from "./levels";
import { requestMentorResponse } from "@/components/game/nexusMentorPanelLogic";
import { buildBreakdown } from "./progression";
import {
  buildMissionDebriefRequest,
  clearMissionAttempts,
  type MissionAttempt,
  getScriptedMissionDebrief,
  recordMissionAttempt,
} from "./missionDebrief";
import type { NexusMentorRequest, NexusMentorResponse } from "./nexusMentor";

const challenge = LEVELS[0]!.challenges[0]!;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mission learning debrief", () => {
  it("tracks only each submitted challenge topic and its outcome", () => {
    const attempts: MissionAttempt[] = [];
    const afterIncorrect = recordMissionAttempt(attempts, challenge, false);
    const afterCorrect = recordMissionAttempt(afterIncorrect, challenge, true);

    expect(afterIncorrect).toEqual([{ topic: "security", outcome: "incorrect" }]);
    expect(afterCorrect).toEqual([
      { topic: "security", outcome: "incorrect" },
      { topic: "security", outcome: "correct" },
    ]);
    expect(afterCorrect[0]).not.toHaveProperty("answer");
    expect(afterCorrect[0]).not.toHaveProperty("challenge");
    expect(attempts).toEqual([]);
  });

  it("starts each run with a fresh transient attempt history", () => {
    const previousRun = recordMissionAttempt([], challenge, false);
    const newRun = clearMissionAttempts();

    expect(previousRun).toEqual([{ topic: "security", outcome: "incorrect" }]);
    expect(newRun).toEqual([]);
  });

  it("builds a post-mission request from topic outcomes and allowlisted mission metadata only", () => {
    const attempts = [
      { topic: "security", outcome: "incorrect" },
      { topic: "security", outcome: "correct" },
      { topic: "forensics", outcome: "correct" },
    ] as const;
    const request = buildMissionDebriefRequest(
      1,
      "A fictional mission with safe metadata.",
      attempts,
    );

    expect(request).toEqual({
      sectorId: "sector-01",
      missionDescription: "A fictional mission with safe metadata.",
      stage: "post_mission",
      question: expect.stringContaining(
        "Observed topic outcomes: forensics: 1 correct, 0 incorrect; security: 1 correct, 1 incorrect",
      ),
      mode: "debrief",
    });
    expect(JSON.stringify(request)).not.toContain("correctAnswer");
    expect(JSON.stringify(request)).not.toContain("savedGame");
    expect(JSON.stringify(request)).not.toContain("unrelated");
    expect(buildMissionDebriefRequest(6, "Fictional mission", attempts)).toBeNull();
    expect(buildMissionDebriefRequest(1, "Fictional mission", [])).toBeNull();
  });

  it("uses existing scripted performance feedback and provides defensive concept practice", async () => {
    const performance = vi
      .spyOn(aiService, "analyzePerformance")
      .mockResolvedValue("Review the evidence carefully.");
    const text = await getScriptedMissionDebrief([
      { topic: "forensics", outcome: "incorrect" },
      { topic: "security", outcome: "correct" },
    ]);

    expect(performance).toHaveBeenCalledWith({
      accuracy: 50,
      avgResponseMs: 0,
      mistakes: 1,
      hintsUsed: 0,
      streak: 0,
      missionsCompleted: 0,
    });
    expect(text).toContain("SCRIPTED");
    expect(text).toContain("preserving evidence");
    expect(text).toContain("least privilege");
    expect(text).toContain("next, build a timeline from fictional logs");
    expect(text).toContain("Suggested review focus: forensics (1 incorrect attempt).");
    expect(text).toContain("Suggested practice: build a timeline from fictional logs");
  });

  it("recommends every topic tied for the most incorrect attempts", async () => {
    vi.spyOn(aiService, "analyzePerformance").mockResolvedValue("Keep practising.");
    const text = await getScriptedMissionDebrief([
      { topic: "security", outcome: "incorrect" },
      { topic: "forensics", outcome: "incorrect" },
      { topic: "security", outcome: "correct" },
    ]);

    expect(text).toContain(
      "Suggested review focus: forensics (1 incorrect attempt), security (1 incorrect attempt).",
    );
    expect(text).toContain(
      "Suggested practice: build a timeline from fictional logs before drawing a conclusion; review a fictional configuration and justify each defensive control.",
    );
  });

  it("builds on the most-practised topic when there were no incorrect attempts", async () => {
    vi.spyOn(aiService, "analyzePerformance").mockResolvedValue("Strong work.");
    const text = await getScriptedMissionDebrief([
      { topic: "security", outcome: "correct" },
      { topic: "forensics", outcome: "correct" },
      { topic: "forensics", outcome: "correct" },
    ]);

    expect(text).toContain("Build on your correct outcomes: forensics (2 correct attempts).");
    expect(text).toContain(
      "Suggested practice: build a timeline from fictional logs before drawing a conclusion.",
    );
  });

  it("omits a topic recommendation when there are no recorded attempts", async () => {
    vi.spyOn(aiService, "analyzePerformance").mockResolvedValue("Keep practising.");
    const text = await getScriptedMissionDebrief([]);

    expect(text).toContain("SCRIPTED NEXUS DEBRIEF");
    expect(text).not.toContain("Suggested review focus");
    expect(text).not.toContain("Build on your correct outcomes");
  });

  it("uses a labelled scripted debrief without calling the server when AI is disabled", async () => {
    vi.spyOn(aiService, "analyzePerformance").mockResolvedValue("Practice the defensive basics.");
    const attempts: MissionAttempt[] = [{ topic: "security", outcome: "incorrect" }];
    const request = buildMissionDebriefRequest(1, "Fictional mission.", attempts);
    const sendRequest = vi.fn();
    const setState = vi.fn();

    if (!request) throw new Error("Expected an allowlisted mission debrief request.");
    await requestMentorResponse({
      aiEnabled: false,
      request,
      fallback: () => getScriptedMissionDebrief(attempts),
      sendRequest,
      inFlight: { current: false },
      setState,
    });

    expect(sendRequest).not.toHaveBeenCalled();
    expect(setState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "response",
        source: "scripted",
        text: expect.stringContaining("SCRIPTED NEXUS DEBRIEF"),
      }),
    );
  });

  it("keeps a provider failure recoverable and does not reject mission completion", async () => {
    const request: NexusMentorRequest = {
      sectorId: "sector-01",
      missionDescription: "Fictional mission description.",
      stage: "post_mission",
      question: "Observed topic outcomes: security: 0 correct, 1 incorrect.",
      mode: "debrief",
    };
    const setState = vi.fn();

    await expect(
      requestMentorResponse({
        aiEnabled: true,
        request,
        fallback: async () => "Scripted defensive practice guidance.",
        sendRequest: vi
          .fn<() => Promise<NexusMentorResponse>>()
          .mockRejectedValue(new Error("provider unavailable")),
        inFlight: { current: false },
        setState,
      }),
    ).resolves.toBeUndefined();

    expect(setState).toHaveBeenLastCalledWith({
      status: "error",
      source: "scripted",
      text: "Scripted defensive practice guidance.",
      error: "NEXUS could not be reached. Your mission can continue without the mentor.",
    });
  });

  it("keeps the established scoring breakdown independent of debrief data", () => {
    expect(
      buildBreakdown({
        correct: 3,
        speed: 20,
        streak: 10,
        hints: 1,
        wrong: 2,
        completion: 150,
      }),
    ).toEqual({
      base: 300,
      speed: 20,
      streak: 10,
      hints: 15,
      wrong: 50,
      completion: 150,
      final: 415,
    });
  });
});
