import { LEVELS } from "./levels";
import { SCORE } from "./progression";
import { isChallengeAnswerCorrect } from "./challengeAnswer";
import type { EvidenceBoardState, NetworkPathState } from "./types";

export interface LeaderboardRunState {
  user_id: string;
  status: "active" | "failed" | "completed" | "submitted" | "abandoned" | "expired";
  level_id: number;
  challenge_index: number;
  score: number;
  correct_count: number;
  attempts_count: number;
  streak: number;
  health: number;
  started_at: string;
  challenge_started_at: string;
  finished_at: string | null;
  version: number;
  level_started: boolean;
  last_attempt_correct: boolean | null;
  expires_at: string;
}

export interface LeaderboardAttemptInput {
  userId: string;
  levelId: number;
  challengeIndex: number;
  value: string;
  evidenceBoardState?: EvidenceBoardState;
  networkPathState?: NetworkPathState;
  now: number;
}

export interface LeaderboardAttemptResult {
  run: LeaderboardRunState;
  correct: boolean;
}

export function evaluateLeaderboardAttempt(
  run: LeaderboardRunState,
  input: LeaderboardAttemptInput,
): LeaderboardAttemptResult | null {
  if (
    run.status !== "active" ||
    !run.level_started ||
    run.user_id !== input.userId ||
    run.level_id !== input.levelId ||
    run.challenge_index !== input.challengeIndex
  ) {
    return null;
  }
  const level = LEVELS.find((item) => item.id === run.level_id);
  const challenge = level?.challenges[run.challenge_index];
  if (!level || !challenge) return null;

  if (input.now >= Date.parse(run.expires_at)) return null;
  const elapsed = Math.max(0, input.now - Date.parse(run.challenge_started_at));
  const correct =
    (!challenge.timeLimit || elapsed < challenge.timeLimit * 1000) &&
    isChallengeAnswerCorrect(challenge, input.value, input);
  const remaining = challenge.timeLimit ? Math.max(0, challenge.timeLimit * 1000 - elapsed) : 0;
  const speedBonus =
    correct && challenge.timeLimit
      ? Math.round((remaining / (challenge.timeLimit * 1000)) * SCORE.speedMax)
      : 0;
  const streak = correct ? run.streak + 1 : 0;
  const scoreDelta = correct
    ? SCORE.base + speedBonus + streak * SCORE.streakPer
    : -SCORE.wrongPenalty;
  const health = correct ? run.health : Math.max(0, run.health - 1);
  const nextScore = Math.max(0, run.score + scoreDelta);
  const correctCount = run.correct_count + (correct ? 1 : 0);
  const attemptsCount = run.attempts_count + 1;
  const isLastChallenge = run.challenge_index === level.challenges.length - 1;
  const levelComplete = correct && isLastChallenge;
  const runComplete = levelComplete && run.level_id === LEVELS.length;

  const nextRun: LeaderboardRunState = {
    ...run,
    status: health === 0 ? "failed" : runComplete ? "completed" : "active",
    level_id: levelComplete && !runComplete ? run.level_id + 1 : run.level_id,
    challenge_index: correct ? (levelComplete ? 0 : run.challenge_index + 1) : run.challenge_index,
    score: nextScore + (levelComplete ? level.xpReward : 0),
    correct_count: correctCount,
    attempts_count: attemptsCount,
    streak,
    health: levelComplete && !runComplete ? 5 : health,
    challenge_started_at: levelComplete
      ? new Date(input.now).toISOString()
      : run.challenge_started_at,
    finished_at: health === 0 || runComplete ? new Date(input.now).toISOString() : null,
    version: run.version + 1,
    level_started: levelComplete ? false : run.level_started,
    last_attempt_correct: correct,
  };
  return { run: nextRun, correct };
}

export function advanceLeaderboardAfterWrongAttempt(
  run: LeaderboardRunState,
  input: { userId: string; levelId: number; challengeIndex: number; now: number },
): LeaderboardRunState | null {
  if (
    run.status !== "active" ||
    run.last_attempt_correct !== false ||
    run.user_id !== input.userId ||
    run.level_id !== input.levelId ||
    run.challenge_index !== input.challengeIndex ||
    input.now >= Date.parse(run.expires_at)
  ) {
    return null;
  }
  const level = LEVELS.find((item) => item.id === run.level_id);
  const challenge = level?.challenges[run.challenge_index];
  if (!level || !challenge || challenge.type === "path" || challenge.bossPhase) return null;

  const levelComplete = run.challenge_index === level.challenges.length - 1;
  const runComplete = levelComplete && run.level_id === LEVELS.length;
  return {
    ...run,
    status: runComplete ? "completed" : "active",
    level_id: levelComplete && !runComplete ? run.level_id + 1 : run.level_id,
    challenge_index: levelComplete ? 0 : run.challenge_index + 1,
    score: run.score + (levelComplete ? level.xpReward : 0),
    health: levelComplete && !runComplete ? 5 : run.health,
    challenge_started_at: new Date(input.now).toISOString(),
    finished_at: runComplete ? new Date(input.now).toISOString() : null,
    version: run.version + 1,
    level_started: !levelComplete,
    last_attempt_correct: null,
  };
}

export function leaderboardAccuracy(run: LeaderboardRunState): number {
  return run.attempts_count ? Math.round((run.correct_count / run.attempts_count) * 100) : 0;
}

export function leaderboardTimeSeconds(run: LeaderboardRunState): number {
  if (!run.finished_at) return 0;
  return Math.floor((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000);
}
