export const NEXUS_SECTOR_IDS = [
  "sector-01",
  "sector-02",
  "sector-03",
  "sector-04",
  "sector-05",
] as const;

export const NEXUS_MENTOR_MODES = ["explanation", "teaching_hint", "debrief"] as const;

export const NEXUS_MENTOR_STAGES = ["briefing", "in_mission", "post_mission"] as const;

export type NexusSectorId = (typeof NEXUS_SECTOR_IDS)[number];
export type NexusMentorMode = (typeof NEXUS_MENTOR_MODES)[number];
export type NexusMentorStage = (typeof NEXUS_MENTOR_STAGES)[number];

export interface NexusMentorIdentity {
  identity: `guest:${string}` | `user:${string}`;
  identityType: "guest" | "user";
}

export interface NexusMentorRequest {
  sectorId: NexusSectorId;
  missionDescription: string;
  stage: NexusMentorStage;
  question: string;
  mode: NexusMentorMode;
}

export type NexusMentorErrorCode =
  | "invalid_request"
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "invalid_provider_response";

export type NexusMentorResponse =
  { ok: true; text: string } | { ok: false; error: NexusMentorErrorCode };

export interface NexusMentorProvider {
  generate(
    request: NexusMentorRequest,
    options: { signal: AbortSignal; maxOutputTokens: number },
  ): Promise<unknown>;
}

export interface NexusMentorQuotaReservation {
  reservationId: string;
  expiresAt: number;
  reservedCostUsd: number;
}

export type NexusMentorQuotaReservationResult =
  | ({ status: "ok" } & NexusMentorQuotaReservation)
  | { status: "denied" }
  | { status: "retry_later" };

export interface NexusMentorQuotaOperations {
  reserve: (identity: NexusMentorIdentity) => Promise<NexusMentorQuotaReservationResult>;
  settle: (
    identity: NexusMentorIdentity,
    reservationId: string,
    actualCostUsd: number,
  ) => Promise<boolean>;
  release: (identity: NexusMentorIdentity, reservationId: string) => Promise<boolean>;
}

export interface NexusMentorDependencies {
  provider: NexusMentorProvider | null;
  isAiEnabled: () => boolean;
  resolveIdentity: () => Promise<NexusMentorIdentity | null>;
  quota: NexusMentorQuotaOperations;
  authorizeRequest: (identity: NexusMentorIdentity) => Promise<boolean>;
  timeoutMs?: number;
}

const MAX_REQUEST_BYTES = 4096;
const MAX_DESCRIPTION_CHARS = 240;
const MAX_QUESTION_CHARS = 400;
const MAX_RESPONSE_CHARS = 1600;
const MAX_OUTPUT_TOKENS = 384;
const MAX_PROMPT_TOKENS = 8192;
const GEMINI_INPUT_PRICE_PER_MILLION = 0.25;
const GEMINI_OUTPUT_PRICE_PER_MILLION = 1.5;
const DEFAULT_TIMEOUT_MS = 8000;
const RESERVATION_EXPIRY_SAFETY_MS = 1000;
const REQUEST_KEYS = ["sectorId", "missionDescription", "stage", "question", "mode"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeText(value: string): string {
  return Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character;
    })
    .join("")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateNexusMentorRequest(value: unknown): NexusMentorRequest | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).length !== REQUEST_KEYS.length) return null;
  if (!REQUEST_KEYS.every((key) => Object.hasOwn(value, key))) return null;
  if (!NEXUS_SECTOR_IDS.includes(value["sectorId"] as NexusSectorId)) return null;
  if (!NEXUS_MENTOR_STAGES.includes(value["stage"] as NexusMentorStage)) return null;
  if (!NEXUS_MENTOR_MODES.includes(value["mode"] as NexusMentorMode)) return null;
  if (
    typeof value["missionDescription"] !== "string" ||
    value["missionDescription"].length > MAX_DESCRIPTION_CHARS
  ) {
    return null;
  }
  if (typeof value["question"] !== "string" || value["question"].length > MAX_QUESTION_CHARS) {
    return null;
  }

  const missionDescription = sanitizeText(value["missionDescription"]);
  const question = sanitizeText(value["question"]);
  if (!missionDescription || !question) return null;

  return {
    sectorId: value["sectorId"] as NexusSectorId,
    missionDescription,
    stage: value["stage"] as NexusMentorStage,
    question,
    mode: value["mode"] as NexusMentorMode,
  };
}


function getProviderActualCostUsd(value: unknown): number | null {
  if (!isRecord(value) || !isRecord(value["usage"])) return null;

  const usage = value["usage"];
  const allowedKeys = [
    "promptTokenCount",
    "candidatesTokenCount",
    "thoughtsTokenCount",
    "cachedContentTokenCount",
    "totalTokenCount",
  ];

  if (Object.keys(usage).some((key) => !allowedKeys.includes(key))) {
    return null;
  }

  const promptTokens = usage["promptTokenCount"];
  const candidateTokens = usage["candidatesTokenCount"];
  const thoughtsTokens = usage["thoughtsTokenCount"] ?? 0;
  const cachedTokens = usage["cachedContentTokenCount"] ?? 0;
  const totalTokens = usage["totalTokenCount"];

  const counts = [
    promptTokens,
    candidateTokens,
    thoughtsTokens,
    cachedTokens,
    totalTokens,
  ];

  if (!counts.every(
    (count) =>
      typeof count === "number" &&
      Number.isSafeInteger(count) &&
      count >= 0,
  )) {
    return null;
  }

  if (
    (promptTokens as number) > MAX_PROMPT_TOKENS ||
    (candidateTokens as number) + (thoughtsTokens as number) >
      MAX_OUTPUT_TOKENS ||
    (cachedTokens as number) !== 0 ||
    (totalTokens as number) !==
      (promptTokens as number) +
        (candidateTokens as number) +
        (thoughtsTokens as number)
  ) {
    return null;
  }

  const inputCost =
    (promptTokens as number) * GEMINI_INPUT_PRICE_PER_MILLION;
  const outputCost =
    ((candidateTokens as number) + (thoughtsTokens as number)) *
    GEMINI_OUTPUT_PRICE_PER_MILLION;

  const cost = (inputCost + outputCost) / 1_000_000;

  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

function validateProviderResponse(value: unknown): string | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "text") ||
    !Object.hasOwn(value, "usage") ||
    getProviderActualCostUsd(value) === null
  ) {
    return null;
  }

  if (
    typeof value["text"] !== "string" ||
    value["text"].length > MAX_RESPONSE_CHARS ||
    new TextEncoder().encode(value["text"]).byteLength > 4096
  ) {
    return null;
  }

  const text = sanitizeText(value["text"]);
  return text ? text.slice(0, MAX_RESPONSE_CHARS) : null;
}

export async function handleNexusMentorJson(
  raw: unknown,
  dependencies: NexusMentorDependencies,
  requestContentLength?: string | null,
): Promise<NexusMentorResponse> {
  if (
    requestContentLength !== undefined &&
    requestContentLength !== null &&
    (!/^\d+$/.test(requestContentLength) || Number(requestContentLength) > MAX_REQUEST_BYTES + 1024)
  ) {
    return { ok: false, error: "invalid_request" };
  }
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return { ok: false, error: "invalid_request" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid_request" };
  }
  const request = validateNexusMentorRequest(parsed);
  if (!request) return { ok: false, error: "invalid_request" };
  const provider = dependencies.provider;
  if (!provider) return { ok: false, error: "not_configured" };
  let aiEnabled = false;
  try {
    aiEnabled = dependencies.isAiEnabled();
  } catch {
    return { ok: false, error: "not_configured" };
  }
  if (!aiEnabled) {
    return { ok: false, error: "not_configured" };
  }

  let identity: NexusMentorIdentity | null;
  try {
    identity = await dependencies.resolveIdentity();
  } catch {
    return { ok: false, error: "unauthorized" };
  }
  if (!identity) return { ok: false, error: "unauthorized" };

  let reservationResult: NexusMentorQuotaReservationResult;
  try {
    reservationResult = await dependencies.quota.reserve(identity);
  } catch {
    return { ok: false, error: "rate_limited" };
  }
  if (reservationResult.status !== "ok") {
    return { ok: false, error: "rate_limited" };
  }
  if (!isValidReservation(reservationResult)) {
    if (/^[A-Za-z0-9_-]{16,128}$/.test(reservationResult.reservationId)) {
      try {
        await dependencies.quota.release(identity, reservationResult.reservationId);
      } catch {
        return { ok: false, error: "rate_limited" };
      }
    }
    return { ok: false, error: "rate_limited" };
  }
  const reservation: NexusMentorQuotaReservation = {
    reservationId: reservationResult.reservationId,
    expiresAt: reservationResult.expiresAt,
    reservedCostUsd: reservationResult.reservedCostUsd,
  };
  let cleanupStarted = false;
  const releaseBeforeProvider = async (): Promise<boolean> => {
    if (cleanupStarted) return false;
    cleanupStarted = true;
    try {
      return await dependencies.quota.release(identity, reservation.reservationId);
    } catch {
      return false;
    }
  };
const settleAfterProvider = async (
  actualCostUsd = reservation.reservedCostUsd,
): Promise<boolean> => {
  if (cleanupStarted) return false;
  cleanupStarted = true;

  try {
    return await dependencies.quota.settle(
      identity,
      reservation.reservationId,
      actualCostUsd,
    );
  } catch {
    return false;
  }
};

  let authorized: boolean;
  try {
    authorized = await dependencies.authorizeRequest(identity);
  } catch {
    await releaseBeforeProvider();
    return { ok: false, error: "rate_limited" };
  }
  if (!authorized) {
    await releaseBeforeProvider();
    return { ok: false, error: "rate_limited" };
  }

  const reservationTimeRemainingMs =
    reservation.expiresAt - Date.now() - RESERVATION_EXPIRY_SAFETY_MS;
  const providerTimeoutMs = Math.min(
    dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    reservationTimeRemainingMs,
  );
  if (!Number.isFinite(providerTimeoutMs) || providerTimeoutMs <= 0) {
    await releaseBeforeProvider();
    return { ok: false, error: "rate_limited" };
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let providerResponse: unknown;
  let providerFailed = false;
  let providerTimedOut = false;
  const providerPromise = Promise.resolve().then(() =>
    provider.generate(request, {
      signal: controller.signal,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    }),
  );
  try {
    providerResponse = await Promise.race([
      providerPromise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          providerTimedOut = true;
          controller.abort();
          reject(new Error("timeout"));
        }, providerTimeoutMs);
      }),
    ]);
  } catch {
    providerFailed = true;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }

 if (providerTimedOut) return { ok: false, error: "timeout" };

const actualCostUsd = providerFailed
  ? reservation.reservedCostUsd
  : getProviderActualCostUsd(providerResponse) ??
    reservation.reservedCostUsd;

const settled = await settleAfterProvider(actualCostUsd);
if (!settled) return { ok: false, error: "rate_limited" };
if (providerFailed) return { ok: false, error: "provider_error" };

  const text = validateProviderResponse(providerResponse);
  return text ? { ok: true, text } : { ok: false, error: "invalid_provider_response" };
}

function isValidReservation(value: { status: "ok" } & NexusMentorQuotaReservation): boolean {
  return (
    value.status === "ok" &&
    typeof value.reservationId === "string" &&
    /^[A-Za-z0-9_-]{16,128}$/.test(value.reservationId) &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > Date.now() &&
    typeof value.reservedCostUsd === "number" &&
    Number.isFinite(value.reservedCostUsd) &&
    value.reservedCostUsd > 0
  );
}
