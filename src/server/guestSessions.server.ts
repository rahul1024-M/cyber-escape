import { getRequest, setCookie } from "@tanstack/react-start/server";
import { getAiServerBindings } from "./cloudflareBindings.server";
import {
  isTurnstileVerificationConfigured,
  TURNSTILE_MAX_TOKEN_LENGTH,
  verifyTurnstileToken,
  type TurnstileVerificationConfig,
} from "./turnstile.server";

export const GUEST_SESSION_COOKIE_NAME = "__Host-cyber-guest-session";
export const GUEST_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const GUEST_SESSION_MAX_AGE_MS = GUEST_SESSION_MAX_AGE_SECONDS * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SCOPE_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_TOKEN_LENGTH = 2048;
const MAX_REQUEST_BYTES = 3072;
const encoder = new TextEncoder();

export interface GuestSessionClaims {
  version: 1;
  guestId: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
  audience: string;
  environment: string;
}

export interface GuestSessionConfig {
  signingSecret?: string | undefined;
  audience?: string | undefined;
  environment?: string | undefined;
}

export interface GuestSessionBindings extends GuestSessionConfig {
  GUEST_SESSIONS_ENABLED?: boolean | undefined;
  GUEST_SESSION_APP_ORIGIN?: string | undefined;
  TURNSTILE_SECRET_KEY?: string | undefined;
  TURNSTILE_EXPECTED_HOSTNAME?: string | undefined;
  TURNSTILE_EXPECTED_ACTION?: string | undefined;
  TURNSTILE_RENEW_EXPECTED_ACTION?: string | undefined;
  TURNSTILE_SITE_KEY?: string | undefined;
}

export type GuestSessionOperationResult =
  | { ok: true }
  | {
      ok: false;
      error:
        "disabled" | "request_rejected" | "verification_failed" | "invalid_session" | "unavailable";
    };

export type GuestSessionCookieOptions = NonNullable<Parameters<typeof setCookie>[2]>;
export type GuestSessionCookieWriter = (value: string, options: GuestSessionCookieOptions) => void;
export type GuestSessionTurnstileVerifier = (
  token: unknown,
  config: TurnstileVerificationConfig,
) => Promise<boolean>;

export interface GuestSessionTurnstileClientConfig {
  siteKey: string;
  action: string;
}

async function createGuestSession(
  config: GuestSessionConfig,
  now = Date.now(),
): Promise<{ token: string; claims: GuestSessionClaims }> {
  const scope = validateSessionConfig(config);
  validateTimestamp(now);
  const claims: GuestSessionClaims = {
    version: 1,
    guestId: createRandomIdentifier(),
    sessionId: createRandomIdentifier(),
    issuedAt: now,
    expiresAt: now + GUEST_SESSION_MAX_AGE_MS,
    audience: scope.audience,
    environment: scope.environment,
  };
  return { token: await signClaims(claims, scope.secret), claims };
}

async function rotateGuestSession(
  config: GuestSessionConfig,
  current: GuestSessionClaims,
  now = Date.now(),
): Promise<{ token: string; claims: GuestSessionClaims }> {
  const scope = validateSessionConfig(config);
  validateTimestamp(now);
  const claims: GuestSessionClaims = {
    version: 1,
    guestId: current.guestId,
    sessionId: createRandomIdentifier(),
    issuedAt: now,
    expiresAt: now + GUEST_SESSION_MAX_AGE_MS,
    audience: scope.audience,
    environment: scope.environment,
  };
  return { token: await signClaims(claims, scope.secret), claims };
}

export async function verifyGuestSession(
  token: unknown,
  config: GuestSessionConfig,
  now = Date.now(),
): Promise<GuestSessionClaims | null> {
  try {
    const scope = validateSessionConfig(config);
    validateTimestamp(now);
    if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
    if (!TOKEN_PATTERN.test(token)) return null;

    const [encodedPayload, encodedSignature] = token.split(".");
    if (!encodedPayload || !encodedSignature) return null;
    const payloadBytes = decodeBase64Url(encodedPayload);
    const signatureBytes = decodeBase64Url(encodedSignature);
    if (!payloadBytes || !signatureBytes || signatureBytes.byteLength !== 32) return null;

    const key = await importSigningKey(scope.secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(signatureBytes).buffer,
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;

    const payloadText = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
    const parsed: unknown = JSON.parse(payloadText);
    if (!isGuestSessionClaims(parsed)) return null;
    if (parsed.audience !== scope.audience || parsed.environment !== scope.environment) return null;
    if (parsed.issuedAt > now || parsed.expiresAt <= now) return null;
    if (
      parsed.expiresAt <= parsed.issuedAt ||
      parsed.expiresAt - parsed.issuedAt > GUEST_SESSION_MAX_AGE_MS
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readGuestSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader || cookieHeader.length > 4096) return null;
  const matches = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${GUEST_SESSION_COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match) return null;
  const token = match.slice(GUEST_SESSION_COOKIE_NAME.length + 1);
  return token.length <= MAX_TOKEN_LENGTH && TOKEN_PATTERN.test(token) ? token : null;
}

function hasGuestSessionCookie(cookieHeader: string | null): boolean {
  return (
    cookieHeader !== null &&
    cookieHeader.length <= 4096 &&
    cookieHeader.split(";").some((part) => part.trim().startsWith(`${GUEST_SESSION_COOKIE_NAME}=`))
  );
}

export function guestSessionCookieOptions(
  expiresAt: number,
  now = Date.now(),
): GuestSessionCookieOptions {
  if (!Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(now) || expiresAt <= now) {
    throw new Error("Invalid guest session expiry.");
  }
  return {
    expires: new Date(expiresAt),
    httpOnly: true,
    maxAge: Math.floor((expiresAt - now) / 1000),
    path: "/",
    sameSite: "strict",
    secure: true,
  };
}

export function clearedGuestSessionCookieOptions(): GuestSessionCookieOptions {
  return {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: true,
  };
}

export function isGuestSessionIssuanceEnabled(bindings: GuestSessionBindings): boolean {
  const origin = parseHttpsOrigin(bindings.GUEST_SESSION_APP_ORIGIN);
  return (
    bindings.GUEST_SESSIONS_ENABLED === true &&
    (bindings.environment === "test" || bindings.environment === "staging") &&
    typeof bindings.signingSecret === "string" &&
    encoder.encode(bindings.signingSecret).byteLength >= 32 &&
    typeof bindings.audience === "string" &&
    SCOPE_PATTERN.test(bindings.audience) &&
    typeof bindings.environment === "string" &&
    SCOPE_PATTERN.test(bindings.environment) &&
    isTurnstileVerificationConfigured(
      turnstileVerificationConfig(bindings, bindings.TURNSTILE_EXPECTED_ACTION),
    ) &&
    typeof bindings.TURNSTILE_SITE_KEY === "string" &&
    bindings.TURNSTILE_SITE_KEY.length > 0 &&
    bindings.TURNSTILE_SITE_KEY.length <= 512 &&
    isTurnstileVerificationConfigured(
      turnstileVerificationConfig(bindings, bindings.TURNSTILE_RENEW_EXPECTED_ACTION),
    ) &&
    bindings.TURNSTILE_RENEW_EXPECTED_ACTION !== bindings.TURNSTILE_EXPECTED_ACTION &&
    origin !== null &&
    origin.hostname.toLowerCase() === bindings.TURNSTILE_EXPECTED_HOSTNAME?.toLowerCase()
  );
}

export function isGuestSessionRequestAllowed(
  request: Request,
  expectedOrigin: string | undefined,
  data: unknown,
  allowTurnstileToken = false,
): boolean {
  if (
    request.method !== "POST" ||
    (allowTurnstileToken ? !isGuestSessionTurnstileRequest(data) : data !== null)
  ) {
    return false;
  }
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return false;

  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)
  ) {
    return false;
  }
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_REQUEST_BYTES) return false;

  const origin = parseHttpsOrigin(expectedOrigin);
  if (!origin || request.headers.get("origin") !== origin.origin) return false;
  if (request.headers.get("host")?.toLowerCase() !== origin.host.toLowerCase()) return false;

  try {
    if (new URL(request.url).origin !== origin.origin) return false;
  } catch {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}

export async function handleGuestSessionIssue(
  request: Request,
  data: unknown,
  bindings: GuestSessionBindings,
  writeCookie: GuestSessionCookieWriter,
  now = Date.now(),
  verifyTurnstile: GuestSessionTurnstileVerifier = verifyTurnstileToken,
): Promise<GuestSessionOperationResult> {
  if (!isGuestSessionRequestAllowed(request, bindings.GUEST_SESSION_APP_ORIGIN, data, true)) {
    return { ok: false, error: "request_rejected" };
  }
  if (!isGuestSessionIssuanceEnabled(bindings)) {
    return { ok: false, error: "disabled" };
  }

  const token = readGuestSessionTurnstileToken(data);
  if (!token) return { ok: false, error: "verification_failed" };
  let verified = false;
  try {
    verified = await verifyTurnstile(
      token,
      turnstileVerificationConfig(bindings, bindings.TURNSTILE_EXPECTED_ACTION),
    );
  } catch {
    return { ok: false, error: "verification_failed" };
  }
  if (!verified) {
    return { ok: false, error: "verification_failed" };
  }

  try {
    const config = sessionConfig(bindings);
    const cookieHeader = request.headers.get("cookie");
    const existingToken = readGuestSessionCookie(cookieHeader);
    if (hasGuestSessionCookie(cookieHeader)) {
      const existingClaims = existingToken
        ? await verifyGuestSession(existingToken, config, now)
        : null;
      if (existingClaims) return { ok: true };
      writeCookie("", clearedGuestSessionCookieOptions());
      return { ok: false, error: "invalid_session" };
    }
    const session = await createGuestSession(config, now);
    writeCookie(session.token, guestSessionCookieOptions(session.claims.expiresAt, now));
    return { ok: true };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function handleGuestSessionRenewal(
  request: Request,
  data: unknown,
  bindings: GuestSessionBindings,
  writeCookie: GuestSessionCookieWriter,
  now = Date.now(),
  verifyTurnstile: GuestSessionTurnstileVerifier = verifyTurnstileToken,
): Promise<GuestSessionOperationResult> {
  if (!isGuestSessionRequestAllowed(request, bindings.GUEST_SESSION_APP_ORIGIN, data, true)) {
    return { ok: false, error: "request_rejected" };
  }
  if (!isGuestSessionIssuanceEnabled(bindings)) {
    return { ok: false, error: "disabled" };
  }

  const turnstileToken = readGuestSessionTurnstileToken(data);
  if (!turnstileToken) return { ok: false, error: "verification_failed" };
  let verified = false;
  try {
    verified = await verifyTurnstile(
      turnstileToken,
      turnstileVerificationConfig(bindings, bindings.TURNSTILE_RENEW_EXPECTED_ACTION),
    );
  } catch {
    return { ok: false, error: "verification_failed" };
  }
  if (!verified) return { ok: false, error: "verification_failed" };

  try {
    const config = sessionConfig(bindings);
    const token = readGuestSessionCookie(request.headers.get("cookie"));
    const current = token ? await verifyGuestSession(token, config, now) : null;
    if (!current) {
      writeCookie("", clearedGuestSessionCookieOptions());
      return { ok: false, error: "invalid_session" };
    }
    const renewed = await rotateGuestSession(config, current, now);
    writeCookie(renewed.token, guestSessionCookieOptions(renewed.claims.expiresAt, now));
    return { ok: true };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export function handleGuestSessionLogout(
  request: Request,
  data: unknown,
  expectedOrigin: string | undefined,
  writeCookie: GuestSessionCookieWriter,
): GuestSessionOperationResult {
  if (!isGuestSessionRequestAllowed(request, expectedOrigin, data)) {
    return { ok: false, error: "request_rejected" };
  }
  writeCookie("", clearedGuestSessionCookieOptions());
  return { ok: true };
}

export function getGuestSessionTurnstileClientConfig(
  bindings: GuestSessionBindings,
): GuestSessionTurnstileClientConfig | null {
  if (
    !isGuestSessionIssuanceEnabled(bindings) ||
    !bindings.TURNSTILE_SITE_KEY ||
    !bindings.TURNSTILE_EXPECTED_ACTION
  ) {
    return null;
  }
  return {
    siteKey: bindings.TURNSTILE_SITE_KEY,
    action: bindings.TURNSTILE_EXPECTED_ACTION,
  };
}

export function getGuestSessionTurnstileConfig(): GuestSessionTurnstileClientConfig | null {
  try {
    return getGuestSessionTurnstileClientConfig(guestSessionBindings(getAiServerBindings()));
  } catch {
    return null;
  }
}

export async function issueGuestSession(data: unknown): Promise<GuestSessionOperationResult> {
  try {
    const request = getRequest();
    const bindings = getAiServerBindings();
    return handleGuestSessionIssue(request, data, guestSessionBindings(bindings), writeGuestCookie);
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function renewGuestSession(data: unknown): Promise<GuestSessionOperationResult> {
  try {
    const request = getRequest();
    const bindings = getAiServerBindings();
    return handleGuestSessionRenewal(
      request,
      data,
      guestSessionBindings(bindings),
      writeGuestCookie,
    );
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export function logoutGuestSession(data: unknown): GuestSessionOperationResult {
  try {
    const request = getRequest();
    const bindings = getAiServerBindings();
    return handleGuestSessionLogout(
      request,
      data,
      bindings.GUEST_SESSION_APP_ORIGIN,
      writeGuestCookie,
    );
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

function writeGuestCookie(value: string, options: GuestSessionCookieOptions): void {
  setCookie(GUEST_SESSION_COOKIE_NAME, value, options);
}

function sessionConfig(bindings: GuestSessionBindings): GuestSessionConfig {
  return {
    signingSecret: bindings.signingSecret,
    audience: bindings.audience,
    environment: bindings.environment,
  };
}

function guestSessionBindings(
  bindings: ReturnType<typeof getAiServerBindings>,
): GuestSessionBindings {
  return {
    GUEST_SESSIONS_ENABLED: bindings.GUEST_SESSIONS_ENABLED,
    GUEST_SESSION_APP_ORIGIN: bindings.GUEST_SESSION_APP_ORIGIN,
    signingSecret: bindings.GUEST_SESSION_SIGNING_SECRET,
    audience: bindings.GUEST_SESSION_AUDIENCE,
    environment: bindings.GUEST_SESSION_ENVIRONMENT,
    TURNSTILE_SECRET_KEY: bindings.TURNSTILE_SECRET_KEY,
    TURNSTILE_EXPECTED_HOSTNAME: bindings.TURNSTILE_EXPECTED_HOSTNAME,
    TURNSTILE_EXPECTED_ACTION: bindings.TURNSTILE_EXPECTED_ACTION,
    TURNSTILE_RENEW_EXPECTED_ACTION: bindings.TURNSTILE_RENEW_EXPECTED_ACTION,
    TURNSTILE_SITE_KEY: bindings.TURNSTILE_SITE_KEY,
  };
}

function turnstileVerificationConfig(
  bindings: GuestSessionBindings,
  expectedAction: string | undefined,
): TurnstileVerificationConfig {
  return {
    secretKey: bindings.TURNSTILE_SECRET_KEY,
    expectedHostname: bindings.TURNSTILE_EXPECTED_HOSTNAME,
    expectedAction,
  };
}

function isGuestSessionTurnstileRequest(value: unknown): value is { turnstileToken: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    Object.keys(request).length === 1 &&
    Object.hasOwn(request, "turnstileToken") &&
    typeof request["turnstileToken"] === "string" &&
    request["turnstileToken"].length > 0 &&
    request["turnstileToken"].length <= TURNSTILE_MAX_TOKEN_LENGTH
  );
}

function readGuestSessionTurnstileToken(value: unknown): string | null {
  return isGuestSessionTurnstileRequest(value) ? value.turnstileToken : null;
}

function validateSessionConfig(config: GuestSessionConfig): {
  secret: string;
  audience: string;
  environment: string;
} {
  if (
    typeof config.signingSecret !== "string" ||
    encoder.encode(config.signingSecret).byteLength < 32 ||
    typeof config.audience !== "string" ||
    !SCOPE_PATTERN.test(config.audience) ||
    typeof config.environment !== "string" ||
    !SCOPE_PATTERN.test(config.environment)
  ) {
    throw new Error("Guest session configuration is unavailable.");
  }
  return {
    secret: config.signingSecret,
    audience: config.audience,
    environment: config.environment,
  };
}

function validateTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid guest session time.");
}

async function signClaims(claims: GuestSessionClaims, secret: string): Promise<string> {
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  if (encoder.encode(secret).byteLength < 32) {
    throw new Error("Guest session configuration is unavailable.");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function createRandomIdentifier(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function isGuestSessionClaims(value: unknown): value is GuestSessionClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  const expectedKeys = [
    "version",
    "guestId",
    "sessionId",
    "issuedAt",
    "expiresAt",
    "audience",
    "environment",
  ];
  return (
    Object.keys(claims).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(claims, key)) &&
    claims["version"] === 1 &&
    typeof claims["guestId"] === "string" &&
    IDENTIFIER_PATTERN.test(claims["guestId"]) &&
    typeof claims["sessionId"] === "string" &&
    IDENTIFIER_PATTERN.test(claims["sessionId"]) &&
    Number.isSafeInteger(claims["issuedAt"]) &&
    Number.isSafeInteger(claims["expiresAt"]) &&
    typeof claims["audience"] === "string" &&
    SCOPE_PATTERN.test(claims["audience"]) &&
    typeof claims["environment"] === "string" &&
    SCOPE_PATTERN.test(claims["environment"])
  );
}

function parseHttpsOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const origin = new URL(value);
    if (origin.protocol !== "https:" || origin.origin !== value) return null;
    return origin;
  } catch {
    return null;
  }
}
