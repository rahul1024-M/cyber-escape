import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestHeaderMock, createClientMock, adminMock } = vi.hoisted(() => ({
  getRequestHeaderMock: vi.fn(),
  createClientMock: vi.fn(),
  adminMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: getRequestHeaderMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: adminMock,
}));

import {
  recordLeaderboardAttempt,
  startLeaderboardRun,
  submitLeaderboardRun,
} from "./leaderboardRuns.server";

const runId = "00000000-0000-4000-8000-000000000001";

function queryBuilder(result: { data: unknown; error: unknown | null }) {
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  return builder;
}

function authenticateAs(userId: string | null) {
  getRequestHeaderMock.mockReturnValue(userId ? "Bearer test-token" : null);
  createClientMock.mockReturnValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: userId ? { claims: { sub: userId } } : null,
        error: userId ? null : new Error("invalid token"),
      }),
    },
  });
}

function storedRun(userId: string) {
  const now = Date.now();
  return {
    user_id: userId,
    status: "active",
    level_id: 1,
    challenge_index: 0,
    score: 0,
    correct_count: 0,
    attempts_count: 0,
    streak: 0,
    health: 5,
    started_at: new Date(now - 60_000).toISOString(),
    challenge_started_at: new Date(now - 1_000).toISOString(),
    finished_at: null,
    version: 0,
    level_started: true,
    last_attempt_correct: null,
    expires_at: new Date(now + 60_000).toISOString(),
  };
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  getRequestHeaderMock.mockReset();
  createClientMock.mockReset();
  adminMock.from.mockReset();
  adminMock.rpc.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("leaderboard server authorization", () => {
  it("rejects unauthenticated submissions before accessing the admin client", async () => {
    authenticateAs(null);

    await expect(
      recordLeaderboardAttempt({
        runId,
        version: 0,
        levelId: 1,
        challengeIndex: 0,
        value: "D",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("does not let one user record an attempt against another user's run", async () => {
    authenticateAs("user-a");
    const ownedRunQuery = queryBuilder({ data: null, error: null });
    adminMock.from.mockReturnValue(ownedRunQuery);

    await expect(
      recordLeaderboardAttempt({
        runId,
        version: 0,
        levelId: 1,
        challengeIndex: 0,
        value: "D",
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });

    expect(ownedRunQuery.eq).toHaveBeenNthCalledWith(1, "id", runId);
    expect(ownedRunQuery.eq).toHaveBeenNthCalledWith(2, "user_id", "user-a");
    expect(ownedRunQuery.update).not.toHaveBeenCalled();
  });

  it("rejects client-supplied score, accuracy, or elapsed-time fields", async () => {
    authenticateAs("user-a");

    await expect(
      recordLeaderboardAttempt({
        runId,
        version: 0,
        levelId: 1,
        challengeIndex: 0,
        value: "D",
        score: 20_000,
        accuracy: 100,
        elapsedTime: 60,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_request" });
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("rejects incorrect challenge ordering without updating the run", async () => {
    authenticateAs("user-a");
    const ownedRunQuery = queryBuilder({ data: storedRun("user-a"), error: null });
    adminMock.from.mockReturnValue(ownedRunQuery);

    await expect(
      recordLeaderboardAttempt({
        runId,
        version: 0,
        levelId: 1,
        challengeIndex: 1,
        value: "D",
      }),
    ).resolves.toEqual({ ok: false, error: "conflict" });
    expect(ownedRunQuery.update).not.toHaveBeenCalled();
  });

  it("keeps ranked run creation and submission disabled at the server boundary", async () => {
    authenticateAs("user-a");

    await expect(startLeaderboardRun()).resolves.toEqual({
      ok: false,
      error: "unavailable",
    });
    await expect(submitLeaderboardRun(runId)).resolves.toEqual({
      ok: false,
      error: "unavailable",
    });
    await expect(submitLeaderboardRun(runId)).resolves.toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(adminMock.from).not.toHaveBeenCalled();
    expect(adminMock.rpc).not.toHaveBeenCalled();
  });

  it("surfaces database failures without making a leaderboard success-shaped response", async () => {
    authenticateAs("user-a");
    const providerError = new Error("test database unavailable");
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    adminMock.from.mockReturnValue(queryBuilder({ data: null, error: providerError }));

    await expect(
      recordLeaderboardAttempt({
        runId,
        version: 0,
        levelId: 1,
        challengeIndex: 0,
        value: "D",
      }),
    ).resolves.toEqual({ ok: false, error: "unavailable" });
    expect(logError).toHaveBeenCalledWith(
      "[Leaderboard] Server validation request failed.",
      providerError,
    );
    logError.mockRestore();
  });
  it("rejects level IDs outside the supported range", async () => {
  authenticateAs("user-a");

  for (const levelId of [0, 7, -1, 1.5]) {
    await expect(
      recordLeaderboardAttempt({
        runId,
        version: 0,
        levelId,
        challengeIndex: 0,
        value: "verify",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_request",
    });
  }

  expect(adminMock.from).not.toHaveBeenCalled();
});
});
