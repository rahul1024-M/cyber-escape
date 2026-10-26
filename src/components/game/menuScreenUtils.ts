import type { LeaderboardEntry } from "@/game/types";

type FocusTarget = Pick<HTMLElement, "focus">;

export type LeaderboardLoadStatus = "loading" | "loaded" | "error";

export interface LeaderboardLoadState {
  status: LeaderboardLoadStatus;
  rows: LeaderboardEntry[];
}

export function getDialogTabStopTarget(
  key: string,
  shiftKey: boolean,
  focusable: readonly FocusTarget[],
  activeElement: FocusTarget | null,
  dialog: FocusTarget | null,
): FocusTarget | null {
  if (key !== "Tab") return null;
  if (!focusable.length) return dialog;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return dialog;
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

export function getLeaderboardEmptyMessage(scope: "local" | "global"): string {
  return scope === "local"
    ? "No local scores have been recorded on this device yet."
    : "No global scores yet. Sign in and finish the game to post one.";
}

export async function loadLeaderboard(
  scope: "local" | "global",
  fetchLocal: () => Promise<LeaderboardEntry[]>,
  fetchGlobal: () => Promise<LeaderboardEntry[]>,
  onStateChange: (state: LeaderboardLoadState) => void,
): Promise<void> {
  onStateChange({ status: "loading", rows: [] });
  try {
    const rows = await (scope === "local" ? fetchLocal() : fetchGlobal());
    onStateChange({ status: "loaded", rows });
  } catch {
    onStateChange({ status: "error", rows: [] });
  }
}
