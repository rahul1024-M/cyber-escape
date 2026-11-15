const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_MAX_TOKEN_LENGTH = 2048;
export const TURNSTILE_TOKEN_VALIDITY_MS = 5 * 60 * 1000;
const TURNSTILE_CLOCK_SKEW_MS = 30 * 1000;
const TURNSTILE_REQUEST_TIMEOUT_MS = 5000;
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;
const ACTION_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const CHALLENGE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface TurnstileVerificationConfig {
  secretKey?: string | undefined;
  expectedHostname?: string | undefined;
  expectedAction?: string | undefined;
}

export interface ConfiguredTurnstileVerificationConfig {
  secretKey: string;
  expectedHostname: string;
  expectedAction: string;
}

export interface TurnstileSiteverifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
}

export function isTurnstileVerificationConfigured(
  config: TurnstileVerificationConfig,
): config is ConfiguredTurnstileVerificationConfig {
  return (
    typeof config.secretKey === "string" &&
    config.secretKey.length > 0 &&
    config.secretKey.length <= 512 &&
    typeof config.expectedHostname === "string" &&
    HOSTNAME_PATTERN.test(config.expectedHostname) &&
    typeof config.expectedAction === "string" &&
    ACTION_PATTERN.test(config.expectedAction)
  );
}

export async function verifyTurnstileToken(
  token: unknown,
  config: TurnstileVerificationConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<boolean> {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > TURNSTILE_MAX_TOKEN_LENGTH ||
    token.trim() !== token ||
    hasControlCharacters(token) ||
    !isTurnstileVerificationConfigured(config) ||
    !Number.isSafeInteger(now)
  ) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: config.secretKey,
        response: token,
        idempotency_key: crypto.randomUUID(),
      }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return false;

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      return false;
    }
    if (!isSiteverifySuccess(result)) return false;

    const challengeTime = parseChallengeTimestamp(result.challenge_ts);
    if (challengeTime === null) return false;
    if (challengeTime > now + TURNSTILE_CLOCK_SKEW_MS) return false;
    if (now - challengeTime >= TURNSTILE_TOKEN_VALIDITY_MS) return false;
    return (
      result.hostname.toLowerCase() === config.expectedHostname.toLowerCase() &&
      result.action === config.expectedAction
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function parseChallengeTimestamp(value: string): number | null {
  if (!CHALLENGE_TIMESTAMP_PATTERN.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  try {
    return new Date(timestamp).toISOString() === value ? timestamp : null;
  } catch {
    return null;
  }
}

function isSiteverifySuccess(value: unknown): value is TurnstileSiteverifyResponse & {
  success: true;
  challenge_ts: string;
  hostname: string;
  action: string;
} {
  if (!isRecord(value)) return false;
  return (
    value["success"] === true &&
    typeof value["challenge_ts"] === "string" &&
    typeof value["hostname"] === "string" &&
    typeof value["action"] === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}
