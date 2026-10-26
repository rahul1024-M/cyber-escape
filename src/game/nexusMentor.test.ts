import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleNexusMentorJson,
  type NexusMentorDependencies,
  type NexusMentorProvider,
  type NexusMentorRequest,
} from "./nexusMentor";

const request: NexusMentorRequest = {
  sectorId: "sector-03",
  missionDescription: "Investigate a fictional email and server log.",
  stage: "in_mission",
  question: "What makes the reply-to address suspicious?",
  mode: "teaching_hint",
};

function dependencies(overrides: Partial<NexusMentorDependencies> = {}): NexusMentorDependencies {
  return {
    provider: {
      generate: vi.fn().mockResolvedValue({ text: "Compare sender and reply domains." }),
    },
    authenticate: vi.fn().mockResolvedValue("user-from-verified-session"),
    allowRequest: vi.fn().mockResolvedValue(true),
    timeoutMs: 20,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NEXUS mentor request validation", () => {
  it("accepts the allowlisted request and sanitizes user text", async () => {
    const provider: NexusMentorProvider = {
      generate: vi.fn().mockResolvedValue({ text: "Check the reply-to domain." }),
    };
    const result = await handleNexusMentorJson(
      JSON.stringify({ ...request, question: "  Compare <reply-to> fields.\n" }),
      dependencies({ provider }),
    );

    expect(result).toEqual({ ok: true, text: "Check the reply-to domain." });
    expect(provider.generate).toHaveBeenCalledWith(
      { ...request, question: "Compare reply-to fields." },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        maxOutputTokens: 384,
      }),
    );
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["oversized serialized request", JSON.stringify({ ...request, question: "x".repeat(5000) })],
    ["invalid mode", JSON.stringify({ ...request, mode: "give_answer" })],
    ["invalid sector", JSON.stringify({ ...request, sectorId: "sector-06" })],
    ["oversized description", JSON.stringify({ ...request, missionDescription: "x".repeat(241) })],
    [
      "empty sanitized question",
      JSON.stringify({ ...request, question: `<>${String.fromCharCode(0)}` }),
    ],
  ])("rejects %s", async (_case, input) => {
    const provider = { generate: vi.fn() };
    const result = await handleNexusMentorJson(input, dependencies({ provider }));

    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("rejects unexpected request fields", async () => {
    const result = await handleNexusMentorJson(
      JSON.stringify({ ...request, correctAnswer: "secret-answer" }),
      dependencies(),
    );

    expect(result).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects an oversized transport body before calling the provider", async () => {
    const provider = { generate: vi.fn() };
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({ provider }),
      "8192",
    );

    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(provider.generate).not.toHaveBeenCalled();
  });
});

describe("NEXUS mentor provider boundary", () => {
  it("returns a clear not-configured response without checking auth or calling a provider", async () => {
    const authenticate = vi.fn();
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({ provider: null, authenticate }),
    );

    expect(result).toEqual({ ok: false, error: "not_configured" });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("requires a verified session before invoking a configured provider", async () => {
    const provider = { generate: vi.fn() };
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({ provider, authenticate: vi.fn().mockResolvedValue(null) }),
    );

    expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("fails closed when the shared rate-limit dependency denies a user", async () => {
    const provider = { generate: vi.fn() };
    const allowRequest = vi.fn().mockResolvedValue(false);
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({ provider, allowRequest }),
    );

    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(allowRequest).toHaveBeenCalledWith("user-from-verified-session");
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("maps provider exceptions to a safe error", async () => {
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        provider: { generate: vi.fn().mockRejectedValue(new Error("sensitive provider details")) },
      }),
    );

    expect(result).toEqual({ ok: false, error: "provider_error" });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("aborts a provider request after the configured timeout", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const provider: NexusMentorProvider = {
      generate: vi.fn((_input, { signal }) => {
        capturedSignal = signal;
        return new Promise(() => {});
      }),
    };
    const pending = handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({ provider, timeoutMs: 15 }),
    );
    await vi.advanceTimersByTimeAsync(15);

    await expect(pending).resolves.toEqual({ ok: false, error: "timeout" });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it.each([
    ["empty response", { text: "" }],
    ["malformed response", { content: "not the expected shape" }],
    ["extra provider fields", { text: "A safe response.", apiKey: "must-not-return" }],
    ["oversized response", { text: "x".repeat(1601) }],
    ["oversized encoded response", { text: "🛡️".repeat(1200) }],
  ])("rejects an %s", async (_case, providerResponse) => {
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({ provider: { generate: vi.fn().mockResolvedValue(providerResponse) } }),
    );

    expect(result).toEqual({ ok: false, error: "invalid_provider_response" });
    expect(JSON.stringify(result)).not.toContain("must-not-return");
  });
});
