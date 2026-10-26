import {
  EMPTY_EVIDENCE_BOARD_STATE,
  evaluateEvidenceBoard,
  isEvidenceBoardDataValid,
} from "./evidenceBoard";
import {
  EMPTY_NETWORK_PATH_STATE,
  evaluateNetworkPath,
  initialNetworkPathState,
  isNetworkPathPuzzleValid,
} from "./networkPathPuzzles";
import type { Challenge, EvidenceBoardState, NetworkPathState } from "./types";

export function isChallengeAnswerCorrect(
  challenge: Challenge,
  value: string,
  state?: {
    evidenceBoardState?: EvidenceBoardState;
    networkPathState?: NetworkPathState;
  },
): boolean {
  if (challenge.inspect) {
    const picked = new Set(value.split("|").filter(Boolean));
    return challenge.inspect.parts.every((part) => picked.has(part.id) === Boolean(part.clue));
  }
  if (challenge.type === "config") {
    const picked = new Set(value.split("|").filter(Boolean));
    return (challenge.configOptions ?? []).every(
      (option) => picked.has(option.id) === option.secure,
    );
  }
  if (challenge.type === "evidence-board") {
    const data = challenge.evidenceBoard;
    return Boolean(
      data &&
      isEvidenceBoardDataValid(data) &&
      evaluateEvidenceBoard(data, state?.evidenceBoardState ?? EMPTY_EVIDENCE_BOARD_STATE, value)
        .correct,
    );
  }
  if (challenge.type === "path") {
    const puzzle = challenge.networkPath;
    const pathState =
      state?.networkPathState ??
      (puzzle ? initialNetworkPathState(puzzle) : EMPTY_NETWORK_PATH_STATE);
    return Boolean(
      puzzle &&
      isNetworkPathPuzzleValid(puzzle) &&
      evaluateNetworkPath(puzzle, pathState.path).correct,
    );
  }
  if (challenge.accepted) {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    return challenge.accepted.some(
      (answer) => answer.toLowerCase().replace(/\s+/g, " ") === normalized,
    );
  }
  return value === challenge.correctAnswer;
}
