import { describe, expect, it } from "vitest";
import {
  AiCloudflareBindingsError,
  getAiCloudflareBindings,
  type DurableObjectIdLike,
  type DurableObjectNamespaceLike,
} from "./cloudflareBindings.server";

function makeRequest(env: Record<string, unknown>): Request {
  const request = new Request("https://staging.example.test");
  Object.defineProperty(request, "runtime", {
    value: { name: "cloudflare", cloudflare: { env } },
  });
  return request;
}

const namespace: DurableObjectNamespaceLike = {
  idFromName: (_name: string): DurableObjectIdLike => ({}),
  get: (_id: DurableObjectIdLike) => ({
    fetch: async (_request: Request) => new Response(null),
  }),
};

describe("Nitro Cloudflare binding access", () => {
  it("reads typed bindings from the Nitro request runtime without using process.env", () => {
    expect(
      getAiCloudflareBindings(
        makeRequest({
          AI_QUOTA_COORDINATOR: namespace,
          AI_ENABLED: "false",
          AI_MAX_REQUEST_COST_USD: "0.1",
          AI_MAX_GLOBAL_CONCURRENT: "5",
          GEMINI_API_KEY: "server-only-test-secret",
          GUEST_SESSION_AUDIENCE: "cyber-escape-staging",
          GUEST_SESSION_ENVIRONMENT: "staging",
          TURNSTILE_SECRET_KEY: "server-only-turnstile-test-secret",
          TURNSTILE_EXPECTED_HOSTNAME: "staging.example.test",
          TURNSTILE_EXPECTED_ACTION: "guest_session_create",
          TURNSTILE_RENEW_EXPECTED_ACTION: "guest_session_renew",
          TURNSTILE_SITE_KEY: "public-test-site-key",
        }),
      ),
    ).toEqual({
      AI_QUOTA_COORDINATOR: namespace,
      AI_ENABLED: false,
      AI_MAX_REQUEST_COST_USD: "0.1",
      AI_MAX_GLOBAL_CONCURRENT: "5",
      GUEST_SESSIONS_ENABLED: false,
      GUEST_SESSION_AUDIENCE: "cyber-escape-staging",
      GUEST_SESSION_ENVIRONMENT: "staging",
      GUEST_SESSION_APP_ORIGIN: undefined,
      GEMINI_API_KEY: "server-only-test-secret",
      GUEST_SESSION_SIGNING_SECRET: undefined,
      TURNSTILE_SECRET_KEY: "server-only-turnstile-test-secret",
      TURNSTILE_EXPECTED_HOSTNAME: "staging.example.test",
      TURNSTILE_EXPECTED_ACTION: "guest_session_create",
      TURNSTILE_RENEW_EXPECTED_ACTION: "guest_session_renew",
      TURNSTILE_SITE_KEY: "public-test-site-key",
    });
  });

  it("fails closed when runtime bindings or required config are missing or malformed", () => {
    expect(() => getAiCloudflareBindings(new Request("https://staging.example.test"))).toThrow(
      AiCloudflareBindingsError,
    );
    expect(() =>
      getAiCloudflareBindings(
        makeRequest({
          AI_ENABLED: "false",
          AI_MAX_REQUEST_COST_USD: "0.1",
          AI_MAX_GLOBAL_CONCURRENT: "5",
        }),
      ),
    ).toThrow(AiCloudflareBindingsError);
    expect(() =>
      getAiCloudflareBindings(
        makeRequest({
          AI_QUOTA_COORDINATOR: namespace,
          AI_ENABLED: "maybe",
          AI_MAX_REQUEST_COST_USD: "0.1",
          AI_MAX_GLOBAL_CONCURRENT: "5",
        }),
      ),
    ).toThrow(AiCloudflareBindingsError);
    expect(() =>
      getAiCloudflareBindings(
        makeRequest({
          AI_QUOTA_COORDINATOR: namespace,
          AI_ENABLED: "false",
          AI_MAX_REQUEST_COST_USD: "0.1",
          AI_MAX_GLOBAL_CONCURRENT: "5",
          GUEST_SESSIONS_ENABLED: "yes",
        }),
      ),
    ).toThrow(AiCloudflareBindingsError);
  });

  it("defaults guest session issuance to disabled", () => {
    expect(
      getAiCloudflareBindings(
        makeRequest({
          AI_QUOTA_COORDINATOR: namespace,
          AI_ENABLED: "false",
          AI_MAX_REQUEST_COST_USD: "0.1",
          AI_MAX_GLOBAL_CONCURRENT: "5",
        }),
      ).GUEST_SESSIONS_ENABLED,
    ).toBe(false);
  });
});
