import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiService } from "@/game/services/aiService";
import type { Challenge } from "@/game/types";
import type { NexusMentorRequest, NexusMentorResponse } from "@/game/nexusMentor";
import { NexusMentorPanel } from "./nexusMentorPanel";
import {
  createMentorRequest,
  EMPTY_MENTOR_STATE,
  getScriptedMentorText,
  requestMentorResponse,
  type MentorRequestState,
} from "./nexusMentorPanelLogic";
import { MentorTextResponse } from "./nexusMentorPanelResponse";

const challenge: Challenge = {
  id: "l1c1",
  levelId: 1,
  type: "mcq",
  title: "TRAINING CHALLENGE",
  description: "A fictional defensive-security exercise.",
  question: "Which control best protects the account?",
  correctAnswer: "B",
  explanation: "Layered controls reduce account takeover risk.",
  hint: "Think about a second independent authentication factor.",
  xpReward: 50,
  coinReward: 20,
};

const request: NexusMentorRequest = {
  sectorId: "sector-01",
  missionDescription: "The first firewall stands between you and the network.",
  stage: "in_mission",
  question: "Explain the defensive concept.",
  mode: "explanation",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NEXUS Mentor panel", () => {
  it("renders the optional NEXUS panel and accessible question controls", () => {
    const html = renderToStaticMarkup(
      <NexusMentorPanel
        levelId={1}
        missionDescription={request.missionDescription}
        challenge={challenge}
        answeredCorrect={null}
        health={5}
        correctAnswers={0}
        mistakes={0}
        hintsUsed={0}
        streak={0}
        missionsCompleted={0}
        aiEnabled={false}
      />,
    );

    expect(html).toContain("NEXUS MENTOR · OPTIONAL");
    expect(html).toContain('aria-label="NEXUS Mentor"');
    expect(html).toContain("RESPONSE MODE");
    expect(html).toContain("YOUR QUESTION");
    expect(html).toContain("Teaching hint");
  });

  it("builds only the allowlisted sector context and maps mission questions to explanation mode", () => {
    expect(
      createMentorRequest(1, `  ${request.missionDescription}  `, "  Help?  ", "mission_question"),
    ).toEqual({ ...request, question: "Help?", mode: "explanation" });
    expect(createMentorRequest(6, "Fictional description", "Question", "explanation")).toBeNull();
    expect(createMentorRequest(1, "Fictional description", "", "explanation")).toBeNull();
  });
});

describe("NEXUS Mentor request behavior", () => {
  it("uses the existing scripted hint and explanation methods for fallback", async () => {
    const hintSpy = vi.spyOn(aiService, "generateHint").mockResolvedValue("Use the second factor.");
    const explanationSpy = vi
      .spyOn(aiService, "explainAnswer")
      .mockResolvedValue("Multiple independent clues indicate compromise.");

    await expect(
      getScriptedMentorText(
        "teaching_hint",
        challenge,
        {
          levelId: 1,
          health: 5,
          answeredCorrect: null,
          correctAnswers: 0,
          mistakes: 0,
          hintsUsed: 0,
          streak: 0,
          missionsCompleted: 0,
        },
        1,
      ),
    ).resolves.toBe("Use the second factor.");
    await expect(
      getScriptedMentorText(
        "explanation",
        challenge,
        {
          levelId: 1,
          health: 5,
          answeredCorrect: null,
          correctAnswers: 0,
          mistakes: 0,
          hintsUsed: 0,
          streak: 0,
          missionsCompleted: 0,
        },
        1,
      ),
    ).resolves.toBe("Multiple independent clues indicate compromise.");
    await expect(
      getScriptedMentorText(
        "mission_question",
        challenge,
        {
          levelId: 1,
          health: 5,
          answeredCorrect: null,
          correctAnswers: 0,
          mistakes: 0,
          hintsUsed: 0,
          streak: 0,
          missionsCompleted: 0,
        },
        1,
      ),
    ).resolves.toBe("Multiple independent clues indicate compromise.");

    expect(hintSpy).toHaveBeenCalledWith(challenge);
    expect(explanationSpy).toHaveBeenCalledTimes(2);
    expect(explanationSpy).toHaveBeenCalledWith(challenge);
  });

  it("uses an explicitly scripted fallback without calling the server when AI is disabled", async () => {
    const sendRequest = vi.fn();
    const setState = vi.fn();

    await requestMentorResponse({
      aiEnabled: false,
      request,
      fallback: async () => "Scripted NEXUS dialogue.",
      sendRequest,
      inFlight: { current: false },
      setState,
    });

    expect(sendRequest).not.toHaveBeenCalled();
    expect(setState).toHaveBeenLastCalledWith({
      status: "response",
      source: "scripted",
      text: "Scripted NEXUS dialogue.",
      error: "",
    });
  });

  it.each(["not_configured", "unauthorized"] as const)(
    "uses a labelled scripted response for %s",
    async (error) => {
      const setState = vi.fn();
      await requestMentorResponse({
        aiEnabled: true,
        request,
        fallback: async () => "Existing scripted NEXUS hint.",
        sendRequest: vi.fn().mockResolvedValue({ ok: false, error } satisfies NexusMentorResponse),
        inFlight: { current: false },
        setState,
      });

      expect(setState).toHaveBeenLastCalledWith({
        status: "response",
        source: "scripted",
        text: "Existing scripted NEXUS hint.",
        error: "",
      });
    },
  );

  it("shows loading and prevents duplicate submissions until the request settles", async () => {
    let resolveRequest!: (response: NexusMentorResponse) => void;
    const sendRequest = vi.fn(
      () =>
        new Promise<NexusMentorResponse>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const setState = vi.fn();
    const inFlight = { current: false };
    const options = {
      aiEnabled: true,
      request,
      fallback: async () => "Scripted fallback.",
      sendRequest,
      inFlight,
      setState,
    };

    const pending = requestMentorResponse(options);
    const duplicate = requestMentorResponse(options);
    expect(setState).toHaveBeenCalledWith({
      status: "loading",
      source: null,
      text: "",
      error: "",
    });
    expect(sendRequest).toHaveBeenCalledOnce();

    resolveRequest({ ok: true, text: "Use defense in depth." });
    await Promise.all([pending, duplicate]);

    expect(setState).toHaveBeenLastCalledWith({
      status: "response",
      source: "live",
      text: "Use defense in depth.",
      error: "",
    });
    expect(inFlight.current).toBe(false);
  });

  it("shows a recoverable error with scripted guidance and can retry successfully", async () => {
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "provider_error" } satisfies NexusMentorResponse)
      .mockResolvedValueOnce({
        ok: true,
        text: "Preserve evidence before cleanup.",
      } satisfies NexusMentorResponse);
    const setState = vi.fn();
    const options = {
      aiEnabled: true,
      request,
      fallback: async () => "Scripted defensive guidance.",
      sendRequest,
      inFlight: { current: false },
      setState,
    };

    await requestMentorResponse(options);
    expect(setState).toHaveBeenLastCalledWith({
      status: "error",
      source: "scripted",
      text: "Scripted defensive guidance.",
      error: "The mentor service is temporarily unavailable.",
    });

    await requestMentorResponse(options);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    expect(setState).toHaveBeenLastCalledWith({
      status: "response",
      source: "live",
      text: "Preserve evidence before cleanup.",
      error: "",
    });
  });

  it("renders response strings as text rather than interpreting HTML", () => {
    const html = renderToStaticMarkup(
      <MentorTextResponse source="live" text={'<script>alert("no")</script>'} />,
    );

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders scripted provenance separately from the NEXUS response text", () => {
    const html = renderToStaticMarkup(
      <>
        <p>AI DISABLED · SCRIPTED MODE</p>
        <MentorTextResponse source="scripted" text="NEXUS is observing." />
      </>,
    );

    expect(html).toContain("AI DISABLED · SCRIPTED MODE");
    expect(html).toContain("SCRIPTED NEXUS RESPONSE");
  });

  it("keeps teaching guidance independent from the paid hint and scoring state", async () => {
    const initialState: MentorRequestState = EMPTY_MENTOR_STATE;
    const setState = vi.fn();
    const sendRequest = vi.fn();

    await requestMentorResponse({
      aiEnabled: false,
      request: { ...request, mode: "teaching_hint" },
      fallback: async () => challenge.hint,
      sendRequest,
      inFlight: { current: false },
      setState,
    });

    expect(setState).toHaveBeenLastCalledWith({
      status: "response",
      source: "scripted",
      text: challenge.hint,
      error: "",
    });
    expect(initialState).toEqual(EMPTY_MENTOR_STATE);
    expect(sendRequest).not.toHaveBeenCalled();
  });
});
