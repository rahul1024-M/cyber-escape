import { aiService } from "./services/aiService";
import { NEXUS_SECTOR_IDS, validateNexusMentorRequest } from "./nexusMentor";
import { SKILLS, skillFor } from "./progression";
import type { NexusMentorRequest } from "./nexusMentor";
import type { PerformanceProfile } from "./platform";
import type { Challenge, Skill } from "./types";

export interface MissionAttempt {
  topic: Skill;
  outcome: "correct" | "incorrect";
}

export function clearMissionAttempts(): MissionAttempt[] {
  return [];
}

const SKILL_LEARNING: Record<Skill, { concept: string; practice: string }> = {
  networking: {
    concept: "network boundaries and safe, evidence-based traffic paths",
    practice: "map a fictional network and identify which connections should be restricted",
  },
  forensics: {
    concept: "preserving evidence and correlating independent indicators",
    practice: "build a timeline from fictional logs before drawing a conclusion",
  },
  security: {
    concept: "layered controls, identity verification, and least privilege",
    practice: "review a fictional configuration and justify each defensive control",
  },
  logic: {
    concept: "breaking a defensive problem into verifiable steps",
    practice: "write down the evidence that supports each step before acting",
  },
};

export function recordMissionAttempt(
  attempts: readonly MissionAttempt[],
  challenge: Challenge,
  correct: boolean,
): MissionAttempt[] {
  return [...attempts, { topic: skillFor(challenge), outcome: correct ? "correct" : "incorrect" }];
}

export function buildMissionDebriefRequest(
  levelId: number,
  missionDescription: string,
  attempts: readonly MissionAttempt[],
): NexusMentorRequest | null {
  const sectorId = NEXUS_SECTOR_IDS[levelId - 1];
  if (!sectorId || attempts.length === 0) return null;

  const outcomes = SKILLS.flatMap((topic) => {
    const topicAttempts = attempts.filter((attempt) => attempt.topic === topic);
    if (topicAttempts.length === 0) return [];
    const correct = topicAttempts.filter((attempt) => attempt.outcome === "correct").length;
    const incorrect = topicAttempts.length - correct;
    return [`${topic}: ${correct} correct, ${incorrect} incorrect`];
  });

  return validateNexusMentorRequest({
    sectorId,
    missionDescription: missionDescription.trim().slice(0, 240),
    stage: "post_mission",
    question: `Observed topic outcomes: ${outcomes.join("; ")}. Explain the defensive concepts and suggest a practice step without revealing future challenge answers.`,
    mode: "debrief",
  });
}

export async function getScriptedMissionDebrief(
  attempts: readonly MissionAttempt[],
): Promise<string> {
  const correct = attempts.filter((attempt) => attempt.outcome === "correct").length;
  const incorrect = attempts.length - correct;
  const profile: PerformanceProfile = {
    accuracy: attempts.length ? Math.round((correct / attempts.length) * 100) : 100,
    avgResponseMs: 0,
    mistakes: incorrect,
    hintsUsed: 0,
    streak: 0,
    missionsCompleted: 0,
  };
  const performance = await aiService.analyzePerformance(profile);
  const learnedTopics = SKILLS.filter((topic) =>
    attempts.some((attempt) => attempt.topic === topic),
  );
  const topicOutcomes = learnedTopics.map((topic) => {
    const topicAttempts = attempts.filter((attempt) => attempt.topic === topic);
    const topicCorrect = topicAttempts.filter((attempt) => attempt.outcome === "correct").length;
    return {
      topic,
      correct: topicCorrect,
      incorrect: topicAttempts.length - topicCorrect,
    };
  });
  const summary = learnedTopics
    .map((topic) => {
      const topicAttempts = attempts.filter((attempt) => attempt.topic === topic);
      const right = topicAttempts.filter((attempt) => attempt.outcome === "correct").length;
      const missed = topicAttempts.length - right;
      return `${topic}: ${right} correct and ${missed} incorrect attempt${missed === 1 ? "" : "s"}.`;
    })
    .join(" ");
  const concepts = learnedTopics
    .map((topic) => {
      const learning = SKILL_LEARNING[topic];
      return `${topic}: Review ${learning.concept}; next, ${learning.practice}.`;
    })
    .join("\n");
  const missedTopics = topicOutcomes.filter((result) => result.incorrect > 0);
  const shouldReviewMissedTopics = missedTopics.length > 0;
  const focusCandidates = shouldReviewMissedTopics ? missedTopics : topicOutcomes;
  const highestFocusCount = Math.max(
    0,
    ...focusCandidates.map((result) =>
      shouldReviewMissedTopics ? result.incorrect : result.correct,
    ),
  );
  const focusTopics = focusCandidates.filter(
    (result) =>
      (shouldReviewMissedTopics ? result.incorrect : result.correct) === highestFocusCount,
  );
  const suggestedPractice = focusTopics.length
    ? [
        `${shouldReviewMissedTopics ? "Suggested review focus" : "Build on your correct outcomes"}: ${focusTopics
          .map((result) => {
            const count = shouldReviewMissedTopics ? result.incorrect : result.correct;
            const outcome = shouldReviewMissedTopics ? "incorrect" : "correct";
            return `${result.topic} (${count} ${outcome} attempt${count === 1 ? "" : "s"})`;
          })
          .join(", ")}.`,
        `Suggested practice: ${focusTopics
          .map((result) => SKILL_LEARNING[result.topic].practice)
          .join("; ")}.`,
      ].join("\n")
    : "";

  return [
    "SCRIPTED NEXUS DEBRIEF · NO LIVE AI",
    `Recorded outcomes: ${summary}`,
    `Concept review and next practice:\n${concepts}`,
    ...(suggestedPractice ? [suggestedPractice] : []),
    `NEXUS coaching: ${performance}`,
  ].join("\n\n");
}
