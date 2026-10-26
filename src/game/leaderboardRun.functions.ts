import { createServerFn } from "@tanstack/react-start";
import type { EvidenceBoardState, NetworkPathState } from "./types";

interface AttemptRequest {
  runId: string;
  version: number;
  levelId: number;
  challengeIndex: number;
  value: string;
  evidenceBoardState?: EvidenceBoardState;
  networkPathState?: NetworkPathState;
}

const startRunFn = createServerFn({ method: "POST" })
  .validator((data: null) => data)
  .handler(async () => {
    const { startLeaderboardRun } = await import("./leaderboardRuns.server");
    return startLeaderboardRun();
  });

const beginLevelFn = createServerFn({ method: "POST" })
  .validator((data: { runId: string; levelId: number }) => data)
  .handler(async ({ data }) => {
    const { beginLeaderboardLevel } = await import("./leaderboardRuns.server");
    return beginLeaderboardLevel(data);
  });

const recordAttemptFn = createServerFn({ method: "POST" })
  .validator((data: AttemptRequest) => data)
  .handler(async ({ data }) => {
    const { recordLeaderboardAttempt } = await import("./leaderboardRuns.server");
    return recordLeaderboardAttempt(data);
  });

const advanceAfterWrongFn = createServerFn({ method: "POST" })
  .validator(
    (data: { runId: string; version: number; levelId: number; challengeIndex: number }) => data,
  )
  .handler(async ({ data }) => {
    const { advanceLeaderboardAfterWrong } = await import("./leaderboardRuns.server");
    return advanceLeaderboardAfterWrong(data);
  });

const submitRunFn = createServerFn({ method: "POST" })
  .validator((data: { runId: string }) => data)
  .handler(async ({ data }) => {
    const { submitLeaderboardRun } = await import("./leaderboardRuns.server");
    return submitLeaderboardRun(data.runId);
  });

export function startTrackedLeaderboardRun() {
  return startRunFn({ data: null });
}

export function beginTrackedLeaderboardLevel(runId: string, levelId: number) {
  return beginLevelFn({ data: { runId, levelId } });
}

export function recordTrackedLeaderboardAttempt(request: AttemptRequest) {
  return recordAttemptFn({ data: request });
}

export function advanceTrackedLeaderboardAfterWrong(request: {
  runId: string;
  version: number;
  levelId: number;
  challengeIndex: number;
}) {
  return advanceAfterWrongFn({ data: request });
}

export function submitTrackedLeaderboardRun(runId: string) {
  return submitRunFn({ data: { runId } });
}
