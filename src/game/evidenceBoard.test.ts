import { describe, expect, it } from "vitest";
import { LEVELS } from "./levels";
import {
  EMPTY_EVIDENCE_BOARD_STATE,
  evaluateEvidenceBoard,
  isEvidenceBoardDataValid,
  updateEvidenceBoard,
} from "./evidenceBoard";
import { claimMissionRun } from "./missionCompletion";
import { canBuyHint } from "./progression";

const challenge = LEVELS[2]!.challenges.find((item) => item.type === "evidence-board")!;
const data = challenge.evidenceBoard!;

describe("evidence board", () => {
  it("opens and marks evidence and selects two items for a connection", () => {
    const opened = updateEvidenceBoard(EMPTY_EVIDENCE_BOARD_STATE, { type: "toggle-open", id: "mail" }, data);
    const important = updateEvidenceBoard(opened, { type: "toggle-important", id: "mail" }, data);
    const first = updateEvidenceBoard(important, { type: "select", id: "mail" }, data);
    const second = updateEvidenceBoard(first, { type: "select", id: "auth" }, data);

    expect(second.openedEvidenceIds).toContain("mail");
    expect(second.importantEvidenceIds).toContain("mail");
    expect(second.selectedEvidenceIds).toEqual(["mail", "auth"]);
    expect(updateEvidenceBoard(second, { type: "toggle-important", id: "mail" }, data)
      .importantEvidenceIds).not.toContain("mail");
  });

  it("adds valid directed links and rejects invalid or duplicate link actions", () => {
    let state = updateEvidenceBoard(EMPTY_EVIDENCE_BOARD_STATE, { type: "select", id: "mail" }, data);
    state = updateEvidenceBoard(state, { type: "select", id: "auth" }, data);
    state = updateEvidenceBoard(state, { type: "connect" }, data);
    expect(state.connections).toEqual([{ from: "mail", to: "auth" }]);

    const duplicate = updateEvidenceBoard(state, { type: "connect" }, data);
    expect(duplicate.connections).toHaveLength(1);

    let wrong = updateEvidenceBoard(state, { type: "select", id: "auth" }, data);
    wrong = updateEvidenceBoard(wrong, { type: "select", id: "mail" }, data);
    wrong = updateEvidenceBoard(wrong, { type: "connect" }, data);
    expect(wrong.connections).toContainEqual({ from: "auth", to: "mail" });
    expect(evaluateEvidenceBoard(data, wrong, "").incorrectConnections)
      .toContainEqual({ from: "auth", to: "mail" });

    const removed = updateEvidenceBoard(wrong, {
      type: "remove-connection",
      from: "auth",
      to: "mail",
    }, data);
    expect(removed.connections).not.toContainEqual({ from: "auth", to: "mail" });
  });

  it("requires the correct evidence links, relevance markings, and conclusion", () => {
    let state = EMPTY_EVIDENCE_BOARD_STATE;
    for (const item of data.items.filter((entry) => entry.relevant)) {
      state = updateEvidenceBoard(state, { type: "toggle-important", id: item.id }, data);
    }
    for (const link of data.expectedConnections) {
      state = updateEvidenceBoard(state, { type: "select", id: link.from }, data);
      state = updateEvidenceBoard(state, { type: "select", id: link.to }, data);
      state = updateEvidenceBoard(state, { type: "connect" }, data);
    }
    state = updateEvidenceBoard(state, {
      type: "set-conclusion",
      id: data.correctConclusion,
    }, data);

    expect(evaluateEvidenceBoard(data, state, state.conclusion).correct).toBe(true);
    expect(evaluateEvidenceBoard(data, state, "routine-backup").conclusionCorrect).toBe(false);
    expect(evaluateEvidenceBoard(data, EMPTY_EVIDENCE_BOARD_STATE, data.correctConclusion).missingConnections)
      .toHaveLength(data.expectedConnections.length);
  });

  it("provides the existing in-game hint and safely rejects malformed case data", () => {
    expect(challenge.hint).toContain("Start with the message");
    expect(canBuyHint(10, false)).toBe(true);
    expect(canBuyHint(9, false)).toBe(false);
    expect(canBuyHint(100, true)).toBe(false);
    expect(isEvidenceBoardDataValid(data)).toBe(true);
    expect(isEvidenceBoardDataValid({
      ...data,
      expectedConnections: [{ from: "unknown", to: "auth" }],
    })).toBe(false);
    expect(updateEvidenceBoard(EMPTY_EVIDENCE_BOARD_STATE, { type: "connect" }, {
      ...data,
      items: [],
    })).toEqual(EMPTY_EVIDENCE_BOARD_STATE);
  });
});

describe("mission completion reward guard", () => {
  it("claims a run once and refuses duplicate completion", () => {
    const firstClaim = claimMissionRun([], "run-123");
    expect(firstClaim).toEqual(["run-123"]);
    expect(claimMissionRun(firstClaim ?? [], "run-123")).toBeNull();
  });
});
