import { aiService, nexusStateFor } from "@/game/services/aiService";
import type { NexusMentorMode, NexusMentorRequest, NexusMentorResponse } from "@/game/nexusMentor";
import { NEXUS_SECTOR_IDS } from "@/game/nexusMentor";
import type { PerformanceProfile } from "@/game/platform";
import type { Challenge } from "@/game/types";

export type MentorPanelMode = NexusMentorMode | "mission_question";

export interface MentorPanelContext {
  levelId: number;
  health: number;
  answeredCorrect: boolean | null;
  correctAnswers: number;
  mistakes: number;
  hintsUsed: number;
  streak: number;
  missionsCompleted: number;
}

export interface MentorRequestState {
  status: "idle" | "loading" | "response" | "error";
  source: "scripted" | "live" | null;
  text: string;
  error: string;
}

export const EMPTY_MENTOR_STATE: MentorRequestState = {
  status: "idle",
  source: null,
  text: "",
  error: "",
};

const ERROR_COPY: Record<string, string> = {
  invalid_request: "The request could not be validated.",
  rate_limited: "NEXUS is temporarily busy. Try again in a moment.",
  timeout: "NEXUS did not respond in time.",
  provider_error: "The mentor service is temporarily unavailable.",
  invalid_provider_response: "NEXUS returned a response that could not be displayed.",
};

export function createMentorRequest(
  levelId: number,
  missionDescription: string,
  question: string,
  mode: MentorPanelMode,
): NexusMentorRequest | null {
  const sectorId = NEXUS_SECTOR_IDS[levelId - 1];
  const safeQuestion = question.trim().slice(0, 400);
  const safeDescription = missionDescription.trim().slice(0, 240);
  if (!sectorId || !safeQuestion || !safeDescription) return null;
  return {
    sectorId,
    missionDescription: safeDescription,
    stage: "in_mission",
    question: safeQuestion,
    mode: mode === "mission_question" ? "explanation" : mode,
  };
}

export async function getScriptedMentorText(
  mode: MentorPanelMode,
  challenge: Challenge,
  context: MentorPanelContext,
  seed: number,
): Promise<string> {
  const attempts = context.correctAnswers + context.mistakes;
  const profile: PerformanceProfile = {
    accuracy: attempts > 0 ? Math.round((context.correctAnswers / attempts) * 100) : 100,
    avgResponseMs: 0,
    mistakes: context.mistakes,
    hintsUsed: context.hintsUsed,
    streak: context.streak,
    missionsCompleted: context.missionsCompleted,
  };

  if (mode === "teaching_hint") return aiService.generateHint(challenge);
  if (mode === "debrief") return aiService.analyzePerformance(profile);
  if (mode === "explanation" || mode === "mission_question" || context.answeredCorrect !== null) {
    return aiService.explainAnswer(challenge);
  }
  return aiService.generateMissionDialogue(
    nexusStateFor({
      levelId: context.levelId,
      health: context.health,
      answeredWrong: context.answeredCorrect === false,
      completed: false,
    }),
    seed,
  );
}

export async function requestMentorResponse(options: {
  aiEnabled: boolean;
  request: NexusMentorRequest;
  fallback: () => Promise<string>;
  sendRequest: (request: NexusMentorRequest) => Promise<NexusMentorResponse>;
  inFlight: { current: boolean };
  setState: (state: MentorRequestState) => void;
}): Promise<void> {
  if (options.inFlight.current) return;
  options.inFlight.current = true;
  options.setState({ status: "loading", source: null, text: "", error: "" });

  const getFallback = async () => {
    try {
      return await options.fallback();
    } catch {
      return "NEXUS is unavailable. Review the fictional mission evidence and its explanation.";
    }
  };

  try {
    if (!options.aiEnabled) {
      options.setState({
        status: "response",
        source: "scripted",
        text: await getFallback(),
        error: "",
      });
      return;
    }

    const response = await options.sendRequest(options.request);
    if (response.ok) {
      options.setState({ status: "response", source: "live", text: response.text, error: "" });
      return;
    }

    if (response.error === "not_configured" || response.error === "unauthorized") {
      options.setState({
        status: "response",
        source: "scripted",
        text: await getFallback(),
        error: "",
      });
      return;
    }

    options.setState({
      status: "error",
      source: "scripted",
      text: await getFallback(),
      error: ERROR_COPY[response.error] ?? "NEXUS could not complete the request.",
    });
  } catch {
    options.setState({
      status: "error",
      source: "scripted",
      text: await getFallback(),
      error: "NEXUS could not be reached. Your mission can continue without the mentor.",
    });
  } finally {
    options.inFlight.current = false;
  }
}
