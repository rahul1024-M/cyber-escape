import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { advanceLeaderboardAfterWrongAttempt, evaluateLeaderboardAttempt } from "./leaderboardRun";

const attemptSchema = z
  .object({
    runId: z.string().uuid(),
    version: z.number().int().nonnegative(),
    levelId: z.number().int().min(1).max(5),
    challengeIndex: z.number().int().nonnegative(),
    value: z.string().max(4096),
    evidenceBoardState: z
      .object({
        openedEvidenceIds: z.array(z.string().max(100)).max(100),
        importantEvidenceIds: z.array(z.string().max(100)).max(100),
        selectedEvidenceIds: z.array(z.string().max(100)).max(100),
        connections: z
          .array(z.object({ from: z.string().max(100), to: z.string().max(100) }).strict())
          .max(100),
        conclusion: z.string().max(100),
      })
      .strict()
      .optional(),
    networkPathState: z
      .object({ path: z.array(z.string().max(100)).max(100) })
      .strict()
      .optional(),
  })
  .strict();

const advanceSchema = z
  .object({
    runId: z.string().uuid(),
    version: z.number().int().nonnegative(),
    levelId: z.number().int().min(1).max(5),
    challengeIndex: z.number().int().nonnegative(),
  })
  .strict();

type ServerResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "unauthorized" | "invalid_request" | "unavailable" | "conflict" };

function validateRunId(value: unknown): value is string {
  return typeof value === "string" && z.string().uuid().safeParse(value).success;
}

async function authenticate(): Promise<string | null> {
  const authorization = getRequestHeader("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const url = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !publishableKey) return null;

  const client = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: authorization! } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data || typeof data.claims?.sub !== "string") return null;
  return data.claims.sub;
}

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function responseError(error: unknown): ServerResult<never> {
  console.error("[Leaderboard] Server validation request failed.", error);
  return { ok: false, error: "unavailable" };
}

export async function startLeaderboardRun(): Promise<
  ServerResult<{ runId: string; version: number }>
> {
  return { ok: false, error: "unavailable" };
}

export async function beginLeaderboardLevel(input: {
  runId: string;
  levelId: number;
}): Promise<ServerResult<{ version: number }>> {
  if (
    !validateRunId(input.runId) ||
    !Number.isInteger(input.levelId) ||
    input.levelId < 1 ||
    input.levelId > 5
  ) {
    return { ok: false, error: "invalid_request" };
  }
  const userId = await authenticate();
  if (!userId) return { ok: false, error: "unauthorized" };
  try {
    const admin = await getAdminClient();
    const { data: run, error } = await admin
      .from("leaderboard_runs")
      .select("*")
      .eq("id", input.runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return responseError(error);
    if (!run || run.status !== "active" || run.level_id !== input.levelId) {
      return { ok: false, error: "conflict" };
    }
    if (Date.parse(run.expires_at) <= Date.now()) {
      const { error: expireError } = await admin
        .from("leaderboard_runs")
        .update({ status: "expired" })
        .eq("id", input.runId)
        .eq("user_id", userId)
        .eq("version", run.version);
      if (expireError) return responseError(expireError);
      return { ok: false, error: "conflict" };
    }
    if (run.level_started) return { ok: true, value: { version: run.version } };

    const startedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("leaderboard_runs")
      .update({
        level_started: true,
        started_at: input.levelId === 1 ? startedAt : run.started_at,
        challenge_started_at: startedAt,
        version: run.version + 1,
      })
      .eq("id", input.runId)
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("level_id", input.levelId)
      .eq("version", run.version)
      .select("version")
      .maybeSingle();
    if (updateError) return responseError(updateError);
    return updated
      ? { ok: true, value: { version: updated.version } }
      : { ok: false, error: "conflict" };
  } catch (error) {
    return responseError(error);
  }
}

export async function recordLeaderboardAttempt(
  value: unknown,
): Promise<ServerResult<{ correct: boolean; version: number }>> {
  const parsed = attemptSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: "invalid_request" };
  const input = parsed.data;
  const userId = await authenticate();
  if (!userId) return { ok: false, error: "unauthorized" };
  try {
    const admin = await getAdminClient();
    const { data: stored, error } = await admin
      .from("leaderboard_runs")
      .select("*")
      .eq("id", input.runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return responseError(error);
    if (!stored || stored.version !== input.version) {
      return { ok: false, error: "conflict" };
    }
    if (Date.parse(stored.expires_at) <= Date.now()) {
      const { error: expireError } = await admin
        .from("leaderboard_runs")
        .update({ status: "expired" })
        .eq("id", input.runId)
        .eq("user_id", userId)
        .eq("status", "active")
        .eq("version", input.version);
      if (expireError) return responseError(expireError);
      return { ok: false, error: "conflict" };
    }
    const result = evaluateLeaderboardAttempt(stored, {
      userId,
      levelId: input.levelId,
      challengeIndex: input.challengeIndex,
      value: input.value,
      ...(input.evidenceBoardState ? { evidenceBoardState: input.evidenceBoardState } : {}),
      ...(input.networkPathState ? { networkPathState: input.networkPathState } : {}),
      now: Date.now(),
    });
    if (!result) return { ok: false, error: "conflict" };

    const { data: updated, error: updateError } = await admin
      .from("leaderboard_runs")
      .update({
        status: result.run.status,
        level_id: result.run.level_id,
        challenge_index: result.run.challenge_index,
        score: result.run.score,
        correct_count: result.run.correct_count,
        attempts_count: result.run.attempts_count,
        streak: result.run.streak,
        health: result.run.health,
        challenge_started_at: result.run.challenge_started_at,
        finished_at: result.run.finished_at,
        version: result.run.version,
        level_started: result.run.level_started,
        last_attempt_correct: result.run.last_attempt_correct,
      })
      .eq("id", input.runId)
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("version", input.version)
      .select("version")
      .maybeSingle();
    if (updateError) return responseError(updateError);
    return updated
      ? { ok: true, value: { correct: result.correct, version: updated.version } }
      : { ok: false, error: "conflict" };
  } catch (error) {
    return responseError(error);
  }
}

export async function advanceLeaderboardAfterWrong(
  value: unknown,
): Promise<ServerResult<{ version: number }>> {
  const parsed = advanceSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: "invalid_request" };
  const input = parsed.data;
  const userId = await authenticate();
  if (!userId) return { ok: false, error: "unauthorized" };
  try {
    const admin = await getAdminClient();
    const { data: stored, error } = await admin
      .from("leaderboard_runs")
      .select("*")
      .eq("id", input.runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return responseError(error);
    if (!stored || stored.version !== input.version) {
      return { ok: false, error: "conflict" };
    }
    if (Date.parse(stored.expires_at) <= Date.now()) {
      const { error: expireError } = await admin
        .from("leaderboard_runs")
        .update({ status: "expired" })
        .eq("id", input.runId)
        .eq("user_id", userId)
        .eq("status", "active")
        .eq("version", input.version);
      if (expireError) return responseError(expireError);
      return { ok: false, error: "conflict" };
    }
    const nextRun = advanceLeaderboardAfterWrongAttempt(stored, {
      userId,
      levelId: input.levelId,
      challengeIndex: input.challengeIndex,
      now: Date.now(),
    });
    if (!nextRun) return { ok: false, error: "conflict" };

    const { data: updated, error: updateError } = await admin
      .from("leaderboard_runs")
      .update({
        status: nextRun.status,
        level_id: nextRun.level_id,
        challenge_index: nextRun.challenge_index,
        score: nextRun.score,
        health: nextRun.health,
        challenge_started_at: nextRun.challenge_started_at,
        finished_at: nextRun.finished_at,
        version: nextRun.version,
        level_started: nextRun.level_started,
        last_attempt_correct: null,
      })
      .eq("id", input.runId)
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("version", input.version)
      .select("version")
      .maybeSingle();
    if (updateError) return responseError(updateError);
    return updated
      ? { ok: true, value: { version: updated.version } }
      : { ok: false, error: "conflict" };
  } catch (error) {
    return responseError(error);
  }
}

export async function submitLeaderboardRun(
  runId: string,
): Promise<ServerResult<{ score: number; timeSeconds: number; accuracy: number }>> {
  if (!validateRunId(runId)) return { ok: false, error: "invalid_request" };
  return { ok: false, error: "unavailable" };
}
