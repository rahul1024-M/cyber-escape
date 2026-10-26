import { describe, expect, it, vi } from "vitest";
import {
  getDialogTabStopTarget,
  getLeaderboardEmptyMessage,
  loadLeaderboard,
  type LeaderboardLoadState,
} from "./menuScreenUtils";

function focusTarget() {
  return { focus: vi.fn() };
}

describe("dialog keyboard focus", () => {
  it("wraps forward from the last focusable control to the first", () => {
    const first = focusTarget();
    const last = focusTarget();

    expect(getDialogTabStopTarget("Tab", false, [first, last], last, null)).toBe(first);
  });

  it("wraps backward from the first focusable control to the last", () => {
    const first = focusTarget();
    const last = focusTarget();

    expect(getDialogTabStopTarget("Tab", true, [first, last], first, null)).toBe(last);
  });

  it("focuses the dialog when no controls are available and leaves other keys alone", () => {
    const dialog = focusTarget();

    expect(getDialogTabStopTarget("Tab", false, [], null, dialog)).toBe(dialog);
    expect(getDialogTabStopTarget("Escape", false, [dialog], dialog, dialog)).toBeNull();
  });
});

describe("leaderboard empty states", () => {
  it("distinguishes a local empty leaderboard from a global one", () => {
    expect(getLeaderboardEmptyMessage("local")).toBe(
      "No local scores have been recorded on this device yet.",
    );
    expect(getLeaderboardEmptyMessage("global")).toBe(
      "No global scores yet. Sign in and finish the game to post one.",
    );
  });
});

describe("leaderboard loading", () => {
  it("reports loading before a genuine empty response", async () => {
    const states: LeaderboardLoadState[] = [];
    const fetchLocal = vi.fn().mockResolvedValue([]);

    await loadLeaderboard("local", fetchLocal, vi.fn(), (state) => states.push(state));

    expect(states).toEqual([
      { status: "loading", rows: [] },
      { status: "loaded", rows: [] },
    ]);
    expect(fetchLocal).toHaveBeenCalledOnce();
  });

  it("reports request failures as errors rather than empty results", async () => {
    const states: LeaderboardLoadState[] = [];

    await loadLeaderboard(
      "global",
      vi.fn(),
      vi.fn().mockRejectedValue(new Error("mock backend unavailable")),
      (state) => states.push(state),
    );

    expect(states).toEqual([
      { status: "loading", rows: [] },
      { status: "error", rows: [] },
    ]);
  });

  it("can retry a failed request and then display returned scores", async () => {
    const states: LeaderboardLoadState[] = [];
    const fetchGlobal = vi
      .fn()
      .mockRejectedValueOnce(new Error("mock backend unavailable"))
      .mockResolvedValueOnce([
        { name: "TEST", score: 10, timeSeconds: 30, accuracy: 100, date: "2026-10-22" },
      ]);

    await loadLeaderboard("global", vi.fn(), fetchGlobal, (state) => states.push(state));
    await loadLeaderboard("global", vi.fn(), fetchGlobal, (state) => states.push(state));

    expect(fetchGlobal).toHaveBeenCalledTimes(2);
    expect(states.map(({ status }) => status)).toEqual(["loading", "error", "loading", "loaded"]);
    expect(states[3]?.rows[0]?.name).toBe("TEST");
  });
});
