import { describe, expect, it, vi } from "vitest";
import {
  GUEST_SESSION_COOKIE_NAME,
  GUEST_SESSION_MAX_AGE_MS,
  GUEST_SESSION_MAX_AGE_SECONDS,
  clearedGuestSessionCookieOptions,
  getGuestSessionTurnstileClientConfig,
  guestSessionCookieOptions,
  handleGuestSessionIssue,
  handleGuestSessionLogout,
  handleGuestSessionRenewal,
  isGuestSessionIssuanceEnabled,
  isGuestSessionRequestAllowed,
  readGuestSessionCookie,
  verifyGuestSession,
  type GuestSessionBindings,
  type GuestSessionCookieOptions,
  type GuestSessionTurnstileVerifier,
} from "./guestSessions.server";

const NOW = Date.UTC(2026, 10, 14, 12);
const CONFIG = {
  signingSecret: "test-only-signing-secret-with-32-bytes-minimum",
  audience: "cyber-escape-tests",
  environment: "test",
};
const APP_ORIGIN = "https://mentor.example.test";
const ISSUE_DATA = { turnstileToken: "test-turnstile-token" };
const RENEW_DATA = { turnstileToken: "test-renew-turnstile-token" };
const acceptTurnstile: GuestSessionTurnstileVerifier = async () => true;

function request(
  overrides: {
    method?: string;
    origin?: string;
    host?: string;
    fetchSite?: string;
    contentType?: string;
    contentLength?: string;
    cookie?: string;
  } = {},
): Request {
  const headers = new Headers({
    origin: overrides.origin ?? APP_ORIGIN,
    host: overrides.host ?? "mentor.example.test",
    "content-type": overrides.contentType ?? "application/json",
    "sec-fetch-site": overrides.fetchSite ?? "same-origin",
  });
  if (overrides.contentLength !== undefined) {
    headers.set("content-length", overrides.contentLength);
  }
  if (overrides.cookie !== undefined) headers.set("cookie", overrides.cookie);
  const method = overrides.method ?? "POST";
  return new Request(`${APP_ORIGIN}/_serverFn`, {
    method,
    headers,
    ...(method === "GET" ? {} : { body: "{}" }),
  });
}

function bindings(overrides: Partial<GuestSessionBindings> = {}): GuestSessionBindings {
  return {
    ...CONFIG,
    GUEST_SESSIONS_ENABLED: true,
    GUEST_SESSION_APP_ORIGIN: APP_ORIGIN,
    TURNSTILE_SECRET_KEY: "test-only-turnstile-secret",
    TURNSTILE_EXPECTED_HOSTNAME: "mentor.example.test",
    TURNSTILE_EXPECTED_ACTION: "guest_session_create",
    TURNSTILE_RENEW_EXPECTED_ACTION: "guest_session_renew",
    TURNSTILE_SITE_KEY: "test-only-public-site-key",
    ...overrides,
  };
}

async function issueTestSession(now = NOW) {
  const writeCookie = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
  const result = await handleGuestSessionIssue(
    request(),
    ISSUE_DATA,
    bindings(),
    writeCookie,
    now,
    acceptTurnstile,
  );
  if (!result.ok) throw new Error("Test guest session issuance failed.");
  const token = writeCookie.mock.calls[0]?.[0];
  if (!token) throw new Error("Test guest session cookie was not written.");
  const claims = await verifyGuestSession(token, CONFIG, now);
  if (!claims) throw new Error("Test guest session claims could not be verified.");
  return { token, claims };
}

describe("guest session tokens", () => {
  it("generates cryptographically random guest and session identifiers", async () => {
    const first = await issueTestSession();
    const second = await issueTestSession();

    expect(first.claims.guestId).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first.claims.sessionId).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first.claims.guestId).not.toBe(second.claims.guestId);
    expect(first.claims.sessionId).not.toBe(second.claims.sessionId);
    expect(first.claims.expiresAt - first.claims.issuedAt).toBe(GUEST_SESSION_MAX_AGE_MS);
  });

  it("verifies the HMAC token and rejects a tampered signature", async () => {
    const session = await issueTestSession();
    await expect(verifyGuestSession(session.token, CONFIG, NOW + 1)).resolves.toEqual(
      session.claims,
    );

    const [payload, signature] = session.token.split(".");
    if (!payload || !signature) throw new Error("Generated test token is malformed.");
    const changedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    await expect(
      verifyGuestSession(`${payload}.${changedSignature}`, CONFIG, NOW + 1),
    ).resolves.toBeNull();
  });

  it("rejects expired, malformed, wrong-audience, and wrong-environment tokens", async () => {
    const session = await issueTestSession();
    await expect(
      verifyGuestSession(session.token, CONFIG, session.claims.expiresAt),
    ).resolves.toBeNull();
    await expect(verifyGuestSession("not-a-token", CONFIG, NOW)).resolves.toBeNull();
    await expect(
      verifyGuestSession(session.token, { ...CONFIG, audience: "other-audience" }, NOW),
    ).resolves.toBeNull();
    await expect(
      verifyGuestSession(session.token, { ...CONFIG, environment: "staging" }, NOW),
    ).resolves.toBeNull();
  });

  it("does not issue at the handler boundary when signing configuration is missing or weak", async () => {
    const writeCookie = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const verify = vi.fn().mockResolvedValue(true);
    for (const signingSecret of [undefined, "short"]) {
      await expect(
        handleGuestSessionIssue(
          request(),
          ISSUE_DATA,
          bindings({ signingSecret }),
          writeCookie,
          NOW,
          verify,
        ),
      ).resolves.toEqual({ ok: false, error: "disabled" });
    }
    expect(verify).not.toHaveBeenCalled();
    expect(writeCookie).not.toHaveBeenCalled();
    await expect(
      verifyGuestSession("malformed", { ...CONFIG, signingSecret: undefined }, NOW),
    ).resolves.toBeNull();
  });

  it("rotates the session id while preserving the guest identity", async () => {
    const original = await issueTestSession();
    const order: string[] = [];
    const writer = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>(() => {
      order.push("cookie");
    });
    const verify = vi.fn<GuestSessionTurnstileVerifier>(async () => {
      order.push("verification");
      return true;
    });
    const result = await handleGuestSessionRenewal(
      request({ cookie: `${GUEST_SESSION_COOKIE_NAME}=${original.token}` }),
      RENEW_DATA,
      bindings(),
      writer,
      NOW + 1000,
      verify,
    );
    expect(result).toEqual({ ok: true });
    expect(verify).toHaveBeenCalledWith(RENEW_DATA.turnstileToken, {
      secretKey: "test-only-turnstile-secret",
      expectedHostname: "mentor.example.test",
      expectedAction: "guest_session_renew",
    });
    expect(order).toEqual(["verification", "cookie"]);
    const renewedToken = writer.mock.calls[0]?.[0];
    if (!renewedToken) throw new Error("Renewed guest session cookie was not written.");
    const renewedClaims = await verifyGuestSession(renewedToken, CONFIG, NOW + 1000);

    expect(renewedClaims?.guestId).toBe(original.claims.guestId);
    expect(renewedClaims?.sessionId).not.toBe(original.claims.sessionId);
    if (!renewedClaims) throw new Error("Renewed guest session claims could not be verified.");
    expect(renewedClaims.expiresAt - renewedClaims.issuedAt).toBe(GUEST_SESSION_MAX_AGE_MS);
    await expect(verifyGuestSession(original.token, CONFIG, NOW + 1000)).resolves.toEqual(
      original.claims,
    );
  });

  it("rejects duplicate and malformed cookie values", async () => {
    const session = await issueTestSession();
    const cookie = `${GUEST_SESSION_COOKIE_NAME}=${session.token}`;

    expect(readGuestSessionCookie(cookie)).toBe(session.token);
    expect(readGuestSessionCookie(`${cookie}; ${cookie}`)).toBeNull();
    expect(readGuestSessionCookie(`${GUEST_SESSION_COOKIE_NAME}="bad value"`)).toBeNull();
    expect(readGuestSessionCookie(null)).toBeNull();
  });
});

describe("guest session cookies and request protections", () => {
  it("uses a host-only secure cookie with strict same-site and explicit expiry", () => {
    const options = guestSessionCookieOptions(NOW + GUEST_SESSION_MAX_AGE_MS, NOW);
    expect(options).toMatchObject({
      expires: new Date(NOW + GUEST_SESSION_MAX_AGE_MS),
      httpOnly: true,
      maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "strict",
      secure: true,
    });
    expect(options).not.toHaveProperty("domain");
  });

  it("clears the cookie using the same secure host-only attributes", () => {
    expect(clearedGuestSessionCookieOptions()).toMatchObject({
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "strict",
      secure: true,
    });
    expect(clearedGuestSessionCookieOptions()).not.toHaveProperty("domain");
  });

  it("requires exact HTTPS origin and host, same-origin fetch metadata, JSON, and a small body", () => {
    expect(isGuestSessionRequestAllowed(request(), APP_ORIGIN, null)).toBe(true);
    expect(
      isGuestSessionRequestAllowed(
        request({ origin: "https://other.example.test" }),
        APP_ORIGIN,
        null,
      ),
    ).toBe(false);
    expect(
      isGuestSessionRequestAllowed(request({ host: "other.example.test" }), APP_ORIGIN, null),
    ).toBe(false);
    expect(
      isGuestSessionRequestAllowed(request({ fetchSite: "cross-site" }), APP_ORIGIN, null),
    ).toBe(false);
    expect(
      isGuestSessionRequestAllowed(request({ contentType: "text/plain" }), APP_ORIGIN, null),
    ).toBe(false);
    expect(isGuestSessionRequestAllowed(request({ contentLength: "4096" }), APP_ORIGIN, null)).toBe(
      false,
    );
    expect(isGuestSessionRequestAllowed(request({ method: "GET" }), APP_ORIGIN, null)).toBe(false);
    expect(isGuestSessionRequestAllowed(request(), undefined, null)).toBe(false);
    expect(isGuestSessionRequestAllowed(request(), APP_ORIGIN, { guestId: "forged" })).toBe(false);
    expect(isGuestSessionRequestAllowed(request(), APP_ORIGIN, ISSUE_DATA, true)).toBe(true);
    expect(isGuestSessionRequestAllowed(request(), APP_ORIGIN, ISSUE_DATA)).toBe(false);
    expect(
      isGuestSessionRequestAllowed(
        request(),
        APP_ORIGIN,
        { turnstileToken: "x".repeat(2049) },
        true,
      ),
    ).toBe(false);
  });
});

describe("guest session operation gates", () => {
  it("requires an explicit test or staging gate and complete Turnstile configuration", () => {
    expect(isGuestSessionIssuanceEnabled(bindings({ GUEST_SESSIONS_ENABLED: undefined }))).toBe(
      false,
    );
    expect(isGuestSessionIssuanceEnabled(bindings({ GUEST_SESSIONS_ENABLED: false }))).toBe(false);
    expect(
      isGuestSessionIssuanceEnabled(
        bindings({ environment: "staging", GUEST_SESSIONS_ENABLED: false }),
      ),
    ).toBe(false);
    expect(
      isGuestSessionIssuanceEnabled(
        bindings({ environment: "production", GUEST_SESSIONS_ENABLED: true }),
      ),
    ).toBe(false);
    expect(isGuestSessionIssuanceEnabled(bindings())).toBe(true);
    expect(
      isGuestSessionIssuanceEnabled(
        bindings({
          TURNSTILE_SECRET_KEY: undefined,
          TURNSTILE_EXPECTED_HOSTNAME: undefined,
          TURNSTILE_SITE_KEY: undefined,
        }),
      ),
    ).toBe(false);
    expect(
      isGuestSessionIssuanceEnabled(bindings({ TURNSTILE_RENEW_EXPECTED_ACTION: undefined })),
    ).toBe(false);
    expect(
      isGuestSessionIssuanceEnabled(
        bindings({ TURNSTILE_RENEW_EXPECTED_ACTION: "guest_session_create" }),
      ),
    ).toBe(false);
  });

  it("issues only in the isolated test configuration and does not return the token", async () => {
    const writeCookie = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const result = await handleGuestSessionIssue(
      request(),
      ISSUE_DATA,
      bindings(),
      writeCookie,
      NOW,
      acceptTurnstile,
    );

    expect(result).toEqual({ ok: true });
    expect(result).not.toHaveProperty("token");
    expect(writeCookie).toHaveBeenCalledOnce();
    const cookieOptions = writeCookie.mock.calls[0]?.[1];
    expect(cookieOptions).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
  });

  it("keeps staging issuance disabled when its default flag is false", async () => {
    const writeCookie = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const result = await handleGuestSessionIssue(
      request(),
      ISSUE_DATA,
      bindings({ environment: "staging", GUEST_SESSIONS_ENABLED: false }),
      writeCookie,
      NOW,
      acceptTurnstile,
    );
    expect(result).toEqual({ ok: false, error: "disabled" });
    expect(writeCookie).not.toHaveBeenCalled();
  });

  it("does not mint a new identity for a repeated issue request with a valid cookie", async () => {
    const existing = await issueTestSession();
    const writeCookie = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const result = await handleGuestSessionIssue(
      request({ cookie: `${GUEST_SESSION_COOKIE_NAME}=${existing.token}` }),
      ISSUE_DATA,
      bindings(),
      writeCookie,
      NOW + 1,
      acceptTurnstile,
    );
    expect(result).toEqual({ ok: true });
    expect(writeCookie).not.toHaveBeenCalled();
  });

  it("does not silently replace an expired or malformed guest session", async () => {
    const expired = await issueTestSession(NOW - GUEST_SESSION_MAX_AGE_MS - 1);
    const writeCookie = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const result = await handleGuestSessionIssue(
      request({ cookie: `${GUEST_SESSION_COOKIE_NAME}=${expired.token}` }),
      ISSUE_DATA,
      bindings(),
      writeCookie,
      NOW,
      acceptTurnstile,
    );

    expect(result).toEqual({ ok: false, error: "invalid_session" });
    expect(writeCookie).toHaveBeenCalledWith("", expect.objectContaining({ maxAge: 0 }));
  });

  it("does not issue or clear a cookie when Turnstile verification fails", async () => {
    const writeCookie = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const verify = vi.fn().mockResolvedValue(false);
    const result = await handleGuestSessionIssue(
      request(),
      ISSUE_DATA,
      bindings(),
      writeCookie,
      NOW,
      verify,
    );

    expect(result).toEqual({ ok: false, error: "verification_failed" });
    expect(verify).toHaveBeenCalledWith(ISSUE_DATA.turnstileToken, {
      secretKey: "test-only-turnstile-secret",
      expectedHostname: "mentor.example.test",
      expectedAction: "guest_session_create",
    });
    expect(writeCookie).not.toHaveBeenCalled();
  });

  it("does not call verification or issue a cookie when the token is missing", async () => {
    const writeCookie = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const verify = vi.fn().mockResolvedValue(true);
    const result = await handleGuestSessionIssue(
      request(),
      null,
      bindings(),
      writeCookie,
      NOW,
      verify,
    );

    expect(result).toEqual({ ok: false, error: "request_rejected" });
    expect(verify).not.toHaveBeenCalled();
    expect(writeCookie).not.toHaveBeenCalled();
  });

  it("exposes only the public widget settings when issuance is fully configured", () => {
    expect(getGuestSessionTurnstileClientConfig(bindings())).toEqual({
      siteKey: "test-only-public-site-key",
      action: "guest_session_create",
    });
    expect(
      getGuestSessionTurnstileClientConfig(bindings({ TURNSTILE_SECRET_KEY: undefined })),
    ).toBeNull();
    expect(
      getGuestSessionTurnstileClientConfig(bindings({ TURNSTILE_SITE_KEY: undefined })),
    ).toBeNull();
  });

  it("rejects renewal without a Turnstile token without touching the cookie", async () => {
    const original = await issueTestSession();
    const writer = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const verify = vi.fn().mockResolvedValue(true);
    const result = await handleGuestSessionRenewal(
      request({ cookie: `${GUEST_SESSION_COOKIE_NAME}=${original.token}` }),
      null,
      bindings(),
      writer,
      NOW + 1000,
      verify,
    );
    expect(result).toEqual({ ok: false, error: "request_rejected" });
    expect(verify).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
  });

  it("does not rotate or write a cookie when renewal verification fails", async () => {
    const original = await issueTestSession();
    const writer = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const verify = vi.fn().mockResolvedValue(false);
    const result = await handleGuestSessionRenewal(
      request({ cookie: `${GUEST_SESSION_COOKIE_NAME}=${original.token}` }),
      RENEW_DATA,
      bindings(),
      writer,
      NOW + 1000,
      verify,
    );
    expect(result).toEqual({ ok: false, error: "verification_failed" });
    expect(verify).toHaveBeenCalledOnce();
    expect(writer).not.toHaveBeenCalled();
  });

  it("fails closed for renewal when its server-side action configuration is missing", async () => {
    const original = await issueTestSession();
    const writer = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    const verify = vi.fn().mockResolvedValue(true);
    const result = await handleGuestSessionRenewal(
      request({ cookie: `${GUEST_SESSION_COOKIE_NAME}=${original.token}` }),
      RENEW_DATA,
      bindings({ TURNSTILE_RENEW_EXPECTED_ACTION: undefined }),
      writer,
      NOW + 1000,
      verify,
    );
    expect(result).toEqual({ ok: false, error: "disabled" });
    expect(verify).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
  });

  it("clears invalid sessions only after valid Turnstile verification", async () => {
    const invalidWriter = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    await expect(
      handleGuestSessionRenewal(
        request({ cookie: `${GUEST_SESSION_COOKIE_NAME}=malformed` }),
        RENEW_DATA,
        bindings(),
        invalidWriter,
        NOW + 1000,
        acceptTurnstile,
      ),
    ).resolves.toEqual({ ok: false, error: "invalid_session" });
    expect(invalidWriter).toHaveBeenCalledWith("", expect.objectContaining({ maxAge: 0 }));
  });

  it("logs out by clearing the cookie without claiming token revocation", () => {
    const writer = vi.fn<(value: string, options: GuestSessionCookieOptions) => void>();
    expect(handleGuestSessionLogout(request(), null, APP_ORIGIN, writer)).toEqual({ ok: true });
    expect(writer).toHaveBeenCalledWith("", expect.objectContaining({ maxAge: 0, secure: true }));
  });
});
