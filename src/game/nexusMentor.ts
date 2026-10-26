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

export interface NexusMentorDependencies {
  provider: NexusMentorProvider | null;
  authenticate: () => Promise<string | null>;
  allowRequest: (userId: string) => Promise<boolean>;
  timeoutMs?: number;
}

const MAX_REQUEST_BYTES = 4096;
const MAX_DESCRIPTION_CHARS = 240;
const MAX_QUESTION_CHARS = 400;
const MAX_RESPONSE_CHARS = 1600;
const MAX_OUTPUT_TOKENS = 384;
const DEFAULT_TIMEOUT_MS = 8000;
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

function validateProviderResponse(value: unknown): string | null {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "text")) {
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
  if (!dependencies.provider) return { ok: false, error: "not_configured" };

  let userId: string | null;
  try {
    userId = await dependencies.authenticate();
  } catch {
    return { ok: false, error: "unauthorized" };
  }
  if (!userId) return { ok: false, error: "unauthorized" };

  let allowed: boolean;
  try {
    allowed = await dependencies.allowRequest(userId);
  } catch {
    return { ok: false, error: "rate_limited" };
  }
  if (!allowed) return { ok: false, error: "rate_limited" };

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const providerResponse = await Promise.race([
      dependencies.provider.generate(request, {
        signal: controller.signal,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      }),
    ]);
    const text = validateProviderResponse(providerResponse);
    return text ? { ok: true, text } : { ok: false, error: "invalid_provider_response" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message === "timeout" ? "timeout" : "provider_error",
    };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
