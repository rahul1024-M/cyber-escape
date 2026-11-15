import { describe, expect, it, vi } from "vitest";
import {
  TURNSTILE_MAX_TOKEN_LENGTH,
  TURNSTILE_TOKEN_VALIDITY_MS,
  isTurnstileVerificationConfigured,
  verifyTurnstileToken,
  type TurnstileVerificationConfig,
} from "./turnstile.server";

const NOW = Date.UTC(2026, 10, 15, 12);
const CONFIG: TurnstileVerificationConfig = {
  secretKey: "test-only-turnstile-secret",
  expectedHostname: "mentor.example.test",
  expectedAction: "guest_session_create",
};

function response(overrides: Record<string, unknown> = {}, status = 200): Response {
  return new Response(
    JSON.stringify({
      success: true,
      challenge_ts: new Date(NOW - 1000).toISOString(),
      hostname: "mentor.example.test",
      action: "guest_session_create",
      ...overrides,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("Turnstile Siteverify", () => {
  it("verifies the token, hostname, action, and recent challenge timestamp", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());

    await expect(verifyTurnstileToken("challenge-token", CONFIG, fetcher, NOW)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      redirect: "error",
    });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      secret: CONFIG.secretKey,
      response: "challenge-token",
    });
    expect(body["idempotency_key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("rejects unsuccessful and duplicate Siteverify responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ success: false, "error-codes": ["timeout-or-duplicate"] }));

    await expect(verifyTurnstileToken("reused-token", CONFIG, fetcher, NOW)).resolves.toBe(true);
    await expect(verifyTurnstileToken("reused-token", CONFIG, fetcher, NOW)).resolves.toBe(false);
  });

  it("rejects expired or implausibly future challenge timestamps", async () => {
    const expired = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ challenge_ts: new Date(NOW - TURNSTILE_TOKEN_VALIDITY_MS).toISOString() }),
      );
    const future = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ challenge_ts: new Date(NOW + 31_000).toISOString() }));

    await expect(verifyTurnstileToken("expired-token", CONFIG, expired, NOW)).resolves.toBe(false);
    await expect(verifyTurnstileToken("future-token", CONFIG, future, NOW)).resolves.toBe(false);
  });

  it("rejects parseable timestamps that are not Cloudflare's ISO UTC timestamp format", async () => {
    const dateOnly = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ challenge_ts: "2026-11-15" }));
    const nonIsoDate = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ challenge_ts: "November 15, 2026 12:00:00 GMT" }));

    expect(Number.isFinite(Date.parse("2026-11-15"))).toBe(true);
    expect(Number.isFinite(Date.parse("November 15, 2026 12:00:00 GMT"))).toBe(true);
    await expect(verifyTurnstileToken("date-only-token", CONFIG, dateOnly, NOW)).resolves.toBe(
      false,
    );
    await expect(verifyTurnstileToken("non-iso-token", CONFIG, nonIsoDate, NOW)).resolves.toBe(
      false,
    );
  });

  it("rejects a wrong hostname or action", async () => {
    const wrongHostname = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ hostname: "other.example.test" }));
    const wrongAction = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ action: "different_action" }));

    await expect(
      verifyTurnstileToken("wrong-host-token", CONFIG, wrongHostname, NOW),
    ).resolves.toBe(false);
    await expect(
      verifyTurnstileToken("wrong-action-token", CONFIG, wrongAction, NOW),
    ).resolves.toBe(false);
  });

  it("rejects missing, malformed, or oversized tokens before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(verifyTurnstileToken(undefined, CONFIG, fetcher, NOW)).resolves.toBe(false);
    await expect(verifyTurnstileToken("", CONFIG, fetcher, NOW)).resolves.toBe(false);
    await expect(
      verifyTurnstileToken("x".repeat(TURNSTILE_MAX_TOKEN_LENGTH + 1), CONFIG, fetcher, NOW),
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed when the secret or expected host/action is missing", async () => {
    const fetcher = vi.fn<typeof fetch>();

    expect(isTurnstileVerificationConfigured({ ...CONFIG, secretKey: undefined })).toBe(false);
    expect(isTurnstileVerificationConfigured({ ...CONFIG, expectedHostname: undefined })).toBe(
      false,
    );
    expect(isTurnstileVerificationConfigured({ ...CONFIG, expectedAction: undefined })).toBe(false);
    await expect(
      verifyTurnstileToken("challenge-token", { ...CONFIG, secretKey: undefined }, fetcher, NOW),
    ).resolves.toBe(false);
    await expect(
      verifyTurnstileToken(
        "challenge-token",
        { ...CONFIG, expectedHostname: undefined },
        fetcher,
        NOW,
      ),
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed for network errors, unsuccessful HTTP status, and malformed JSON", async () => {
    const networkFailure = vi.fn<typeof fetch>().mockRejectedValue(new Error("network failure"));
    const unsuccessfulStatus = vi.fn<typeof fetch>().mockResolvedValue(response({}, 503));
    const malformedJson = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{", { status: 200 }));
    const malformedShape = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

    await expect(verifyTurnstileToken("network-token", CONFIG, networkFailure, NOW)).resolves.toBe(
      false,
    );
    await expect(
      verifyTurnstileToken("http-error-token", CONFIG, unsuccessfulStatus, NOW),
    ).resolves.toBe(false);
    await expect(
      verifyTurnstileToken("malformed-response-token", CONFIG, malformedJson, NOW),
    ).resolves.toBe(false);
    await expect(
      verifyTurnstileToken("malformed-shape-token", CONFIG, malformedShape, NOW),
    ).resolves.toBe(false);
  });

  it("rejects Siteverify redirects without forwarding the secret-bearing request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("redirect rejected"));

    await expect(verifyTurnstileToken("redirect-token", CONFIG, fetcher, NOW)).resolves.toBe(false);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });
});
