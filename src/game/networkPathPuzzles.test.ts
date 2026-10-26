import { describe, expect, it } from "vitest";
import { canBuyHint } from "./progression";
import { claimMissionRun } from "./missionCompletion";
import {
  evaluateNetworkPath,
  initialNetworkPathState,
  isNetworkPathPuzzleValid,
  outgoingNetworkConnections,
  resetNetworkPath,
  selectNetworkPathNode,
  NETWORK_PATH_PUZZLES,
} from "./networkPathPuzzles";

describe("network path puzzles", () => {
  it("provides three distinct, valid fictional route layouts", () => {
    const puzzles = Object.values(NETWORK_PATH_PUZZLES);
    expect(puzzles).toHaveLength(3);
    expect(puzzles.every(isNetworkPathPuzzleValid)).toBe(true);
    expect(new Set(puzzles.map((puzzle) => puzzle.nodes.map((node) => node.id).join(","))).size).toBe(3);
    expect(new Set(puzzles.map((puzzle) => puzzle.validPath.join(","))).size).toBe(3);
  });

  it("rejects incomplete or malformed puzzle data safely", () => {
    expect(isNetworkPathPuzzleValid({ nodes: [null], connections: [], validPath: [] })).toBe(false);
    expect(isNetworkPathPuzzleValid({
      ...NETWORK_PATH_PUZZLES["sector-2-route-1"],
      connections: [null],
    })).toBe(false);
  });

  it("selects connected nodes, rejects disconnected selections, and validates a correct route", () => {
    const puzzle = NETWORK_PATH_PUZZLES["sector-2-route-1"];
    const start = initialNetworkPathState(puzzle);
    expect(outgoingNetworkConnections(puzzle, start).map((edge) => edge.to)).toContain("gateway");
    expect(selectNetworkPathNode(puzzle, start, "training-server")).toBe(start);

    const route = puzzle.validPath.slice(1).reduce(
      (state, nodeId) => selectNetworkPathNode(puzzle, state, nodeId),
      start,
    );
    expect(route.path).toEqual(puzzle.validPath);
    expect(evaluateNetworkPath(puzzle, route.path)).toEqual({
      correct: true,
      feedback: "Correct route. Each hop follows the approved, monitored training path.",
    });
  });

  it("explains an untrusted route and lets the player reset and retry", () => {
    const puzzle = NETWORK_PATH_PUZZLES["sector-2-route-1"];
    const start = initialNetworkPathState(puzzle);
    const unsafeRoute = selectNetworkPathNode(puzzle, start, "relay");
    expect(evaluateNetworkPath(puzzle, [...unsafeRoute.path, "training-server"])).toEqual({
      correct: false,
      feedback: "The relay is unverified and bypasses the managed gateway.",
    });
    expect(resetNetworkPath(puzzle)).toEqual(start);
    expect(selectNetworkPathNode(puzzle, resetNetworkPath(puzzle), "gateway").path).toEqual([
      "workstation",
      "gateway",
    ]);
  });

  it("keeps hints under the established one-time coin rule", () => {
    expect(canBuyHint(9, false)).toBe(false);
    expect(canBuyHint(10, false)).toBe(true);
    expect(canBuyHint(100, true)).toBe(false);
  });

  it("does not claim a completed mission run twice", () => {
    expect(claimMissionRun(["run-1"], "run-1")).toBeNull();
    expect(claimMissionRun(["run-1"], "run-2")).toEqual(["run-1", "run-2"]);
  });
});
