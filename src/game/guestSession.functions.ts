import { createServerFn } from "@tanstack/react-start";

const issueGuestSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const { issueGuestSession } = await import("@/server/guestSessions.server");
    return issueGuestSession(data);
  });

const guestSessionTurnstileConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getGuestSessionTurnstileConfig } = await import("@/server/guestSessions.server");
  return getGuestSessionTurnstileConfig();
});

const renewGuestSessionFn = createServerFn({ method: "POST" })
  .validator(validateTurnstileTokenRequest)
  .handler(async ({ data }) => {
    const { renewGuestSession } = await import("@/server/guestSessions.server");
    return renewGuestSession(data);
  });

const logoutGuestSessionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const { logoutGuestSession } = await import("@/server/guestSessions.server");
    return logoutGuestSession(data);
  });

export function getGuestSessionTurnstileConfig() {
  return guestSessionTurnstileConfigFn();
}

export function requestGuestSession(turnstileToken: string) {
  return issueGuestSessionFn({ data: { turnstileToken } });
}

export function renewGuestSessionCookie(turnstileToken: string) {
  return renewGuestSessionFn({ data: { turnstileToken } });
}

export function logoutGuestSessionCookie() {
  return logoutGuestSessionFn({ data: null });
}

function validateTurnstileTokenRequest(value: unknown): { turnstileToken: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid guest session renewal request.");
  }
  const request = value as Record<string, unknown>;
  const token = request["turnstileToken"];
  if (
    Object.keys(request).length !== 1 ||
    !Object.hasOwn(request, "turnstileToken") ||
    typeof token !== "string" ||
    token.length === 0
  ) {
    throw new Error("Invalid guest session renewal request.");
  }
  return { turnstileToken: token };
}
