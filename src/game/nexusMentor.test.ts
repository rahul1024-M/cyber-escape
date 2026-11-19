import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleNexusMentorJson,
  type NexusMentorIdentity,
  type NexusMentorDependencies,
  type NexusMentorProvider,
  type NexusMentorQuotaOperations,
  type NexusMentorRequest,
} from "./nexusMentor";
import {
  AI_QUOTA_RESERVATION_TTL_MS,
  AiQuotaService,
  createEmptyAiQuotaState,
  type AiQuotaStateStore,
  type PersistedAiQuotaState,
} from "./aiQuota";

const request: NexusMentorRequest = {
  sectorId: "sector-03",
  missionDescription: "Investigate a fictional email and server log.",
  stage: "in_mission",
  question: "What makes the reply-to address suspicious?",
  mode: "teaching_hint",
};
const validUsage = {
  promptTokenCount: 120,
  candidatesTokenCount: 18,
  thoughtsTokenCount: 0,
  cachedContentTokenCount: 0,
  totalTokenCount: 138,
};

function providerResult(text: string) {
  return { text, usage: validUsage };
}

function createQuotaMock(
  overrides: Partial<NexusMentorQuotaOperations> = {},
): NexusMentorQuotaOperations {
  return {
    reserve: vi.fn().mockResolvedValue({
      status: "ok",
      reservationId: "reservation-00000001",
      expiresAt: Date.now() + AI_QUOTA_RESERVATION_TTL_MS,
      reservedCostUsd: 0.1,
    }),
    settle: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function dependencies(overrides: Partial<NexusMentorDependencies> = {}): NexusMentorDependencies {
  return {
    provider: {
               generate: vi.fn().mockResolvedValue(
  providerResult("Compare sender and reply domains."),
),
    },
    isAiEnabled: () => true,
    resolveIdentity: vi.fn().mockResolvedValue({
      identity: "user:verified-user",
      identityType: "user",
    }),
    quota: createQuotaMock(),
    authorizeRequest: vi.fn().mockResolvedValue(true),
    timeoutMs: 20,
    ...overrides,
  };
}

class MemoryQuotaStore implements AiQuotaStateStore {
  private readonly state: PersistedAiQuotaState = createEmptyAiQuotaState();

  transactionSync<T>(operation: (state: PersistedAiQuotaState) => T): T {
    return operation(this.state);
  }
}

function createServiceQuotaOperations(
  requestCostUsd: number,
  maxGlobalConcurrent = 5,
): NexusMentorQuotaOperations {
  const service = new AiQuotaService(
    new MemoryQuotaStore(),
    { maxRequestCostUsd: requestCostUsd, maxGlobalConcurrent },
    Date.now,
    (() => {
      let sequence = 0;
      return () => `reservation-${String(++sequence).padStart(8, "0")}`;
    })(),
  );
  return {
    reserve: async (identity) => {
      const result = service.reserve(identity.identity, requestCostUsd);
      return result.status === "ok"
        ? { ...result, reservedCostUsd: requestCostUsd }
        : { status: result.status === "denied" ? "denied" : "retry_later" };
    },
    settle: async (identity, reservationId, actualCostUsd) =>
      service.settle(identity.identity, reservationId, actualCostUsd).status === "ok",
    release: async (identity, reservationId) =>
      service.release(identity.identity, reservationId, "provider_not_called").status === "ok",
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NEXUS mentor request validation", () => {
  it("accepts the allowlisted request and sanitizes user text", async () => {
    const provider: NexusMentorProvider = {
      generate: vi.fn().mockResolvedValue(providerResult("Check the reply-to domain.")),
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
      JSON.stringify({ ...request, userId: "forged-user-id" }),
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
    const resolveIdentity = vi.fn();
    const reserve = vi.fn();
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({ provider: null, resolveIdentity, quota: createQuotaMock({ reserve }) }),
    );

    expect(result).toEqual({ ok: false, error: "not_configured" });
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("does not reserve when AI is disabled", async () => {
    const reserve = vi.fn();
    const provider = { generate: vi.fn() };
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        provider,
        isAiEnabled: () => false,
        quota: createQuotaMock({ reserve }),
      }),
    );

    expect(result).toEqual({ ok: false, error: "not_configured" });
    expect(reserve).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("requires a verified session before invoking a configured provider", async () => {
    const provider = { generate: vi.fn() };
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({ provider, resolveIdentity: vi.fn().mockResolvedValue(null) }),
    );

    expect(result).toEqual({ ok: false, error: "unauthorized" });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("fails closed when the shared rate-limit dependency denies a user", async () => {
    const provider = { generate: vi.fn() };
    const authorizeRequest = vi.fn().mockResolvedValue(false);
    const settle = vi.fn();
    const release = vi.fn().mockResolvedValue(true);
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        provider,
        authorizeRequest,
        quota: createQuotaMock({ settle, release }),
      }),
    );

    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(authorizeRequest).toHaveBeenCalledWith({
      identity: "user:verified-user",
      identityType: "user",
    });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(settle).not.toHaveBeenCalled();
  });

  it("reserves the trusted guest identity before authorization and provider execution", async () => {
    const events: string[] = [];
    const identity: NexusMentorIdentity = {
      identity: "guest:guest-123",
      identityType: "guest",
    };
   const provider = {
  generate: vi.fn().mockResolvedValue(
    providerResult("Stay within the lab."),
  ),
};

provider.generate.mockImplementation(async () => {
  events.push("provider");
  return providerResult("Stay within the lab.");
});
    const reserve = vi.fn().mockImplementation(async (resolvedIdentity: NexusMentorIdentity) => {
      events.push("reserve");
      expect(resolvedIdentity).toEqual(identity);
      return {
        status: "ok",
        reservationId: "reservation-00000001",
        expiresAt: Date.now() + AI_QUOTA_RESERVATION_TTL_MS,
        reservedCostUsd: 0.1,
      };
    });
    const authorizeRequest = vi.fn().mockImplementation(async () => {
      events.push("authorize");
      return true;
    });
    const settle = vi.fn().mockImplementation(async () => {
      events.push("settle");
      return true;
    });
    const release = vi.fn();
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        provider,
        resolveIdentity: vi.fn().mockResolvedValue(identity),
        authorizeRequest,
        quota: createQuotaMock({ reserve, settle, release }),
      }),
    );

    expect(result).toEqual({ ok: true, text: "Stay within the lab." });
    expect(reserve).toHaveBeenCalledWith(identity);
    expect(authorizeRequest).toHaveBeenCalledWith(identity);
    expect(events).toEqual(["reserve", "authorize", "provider", "settle"]);
    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(identity, "reservation-00000001", 0.000057);
    expect(release).not.toHaveBeenCalled();
  });

  it("reserves the exact trusted authenticated namespace", async () => {
    const identity: NexusMentorIdentity = {
      identity: "user:verified-user",
      identityType: "user",
    };
    const reserve = vi.fn().mockResolvedValue({
      status: "ok",
      reservationId: "reservation-00000001",
      expiresAt: Date.now() + AI_QUOTA_RESERVATION_TTL_MS,
      reservedCostUsd: 0.1,
    });
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        resolveIdentity: vi.fn().mockResolvedValue(identity),
        quota: createQuotaMock({ reserve }),
      }),
    );

    expect(result).toEqual({ ok: true, text: "Compare sender and reply domains." });
    expect(reserve).toHaveBeenCalledWith(identity);
  });

  it("rejects a browser-supplied identity before it can affect the reservation", async () => {
    const reserve = vi.fn();
    const result = await handleNexusMentorJson(
      JSON.stringify({
        ...request,
        identity: "user:forged",
        identityType: "user",
      }),
      dependencies({ quota: createQuotaMock({ reserve }) }),
    );

    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("does not execute the provider when reservation is denied or unavailable", async () => {
    const provider = { generate: vi.fn() };
    const reserve = vi.fn().mockResolvedValue({ status: "denied" });
    const authorizeRequest = vi.fn();
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        provider,
        authorizeRequest,
        quota: createQuotaMock({ reserve }),
      }),
    );

    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(reserve).toHaveBeenCalledOnce();
    expect(authorizeRequest).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("releases an expired reservation before provider execution", async () => {
    const identity: NexusMentorIdentity = {
      identity: "user:verified-user",
      identityType: "user",
    };
    const provider = { generate: vi.fn() };
    const reserve = vi.fn().mockResolvedValue({
      status: "ok",
      reservationId: "reservation-00000001",
      expiresAt: Date.now() - 1,
      reservedCostUsd: 0.1,
    });
    const release = vi.fn().mockResolvedValue(false);
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        provider,
        resolveIdentity: vi.fn().mockResolvedValue(identity),
        quota: createQuotaMock({ reserve, release }),
      }),
    );

    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(identity, "reservation-00000001");
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("settles once after uncertain provider failure using the full reserved amount", async () => {
    const identity: NexusMentorIdentity = {
      identity: "user:verified-user",
      identityType: "user",
    };
    const settle = vi.fn().mockResolvedValue(true);
    const release = vi.fn();
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        provider: { generate: vi.fn().mockRejectedValue(new Error("network uncertain")) },
        quota: createQuotaMock({ settle, release }),
      }),
    );

    expect(result).toEqual({ ok: false, error: "provider_error" });
    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(identity, "reservation-00000001", 0.1);
    expect(release).not.toHaveBeenCalled();
  });

  it("returns a safe denial if settlement fails and does not attempt a second cleanup", async () => {
    const settle = vi.fn().mockResolvedValue(false);
    const release = vi.fn();
    const result = await handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        quota: createQuotaMock({ settle, release }),
      }),
    );

    expect(result).toEqual({ ok: false, error: "rate_limited" });
    expect(settle).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
  });

  it("applies real identity concurrency policy to concurrent Mentor requests", async () => {
    const providerStarted: Array<() => void> = [];
    const provider = {
      generate: vi.fn(
        () =>
          new Promise((resolve) => {
            providerStarted.push(() => resolve(providerResult("Concurrent response.")));
          }),
      ),
    };
    const deps = dependencies({
      provider,
      quota: createServiceQuotaOperations(0.1),
    });
    const first = handleNexusMentorJson(JSON.stringify(request), deps);
    while (providerStarted.length === 0) await Promise.resolve();
    const second = await handleNexusMentorJson(JSON.stringify(request), deps);

    expect(second).toEqual({ ok: false, error: "rate_limited" });
    expect(provider.generate).toHaveBeenCalledOnce();
    providerStarted[0]?.();
    await expect(first).resolves.toEqual({ ok: true, text: "Concurrent response." });
  });

  it("denies at the global budget before provider execution", async () => {
    let identityIndex = 0;
    const providerStarted: Array<() => void> = [];
    const provider = {
      generate: vi.fn(
        () =>
          new Promise((resolve) => {
            providerStarted.push(() => resolve(providerResult("Budget response.")));
          }),
      ),
    };
    const deps = dependencies({
      provider,
      resolveIdentity: vi.fn(async (): Promise<NexusMentorIdentity> => ({
        identity: `user:budget-${++identityIndex}`,
        identityType: "user",
      })),
      quota: createServiceQuotaOperations(1),
    });
    const first = handleNexusMentorJson(JSON.stringify(request), deps);
    while (providerStarted.length === 0) await Promise.resolve();
    const second = await handleNexusMentorJson(JSON.stringify(request), deps);

    expect(second).toEqual({ ok: false, error: "rate_limited" });
    expect(provider.generate).toHaveBeenCalledOnce();
    providerStarted[0]?.();
    await expect(first).resolves.toEqual({ ok: true, text: "Budget response." });
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
    const settle = vi.fn().mockResolvedValue(true);
    const release = vi.fn();
    const provider: NexusMentorProvider = {
      generate: vi.fn((_input, { signal }) => {
        capturedSignal = signal;
        return new Promise(() => {});
      }),
    };
    const pending = handleNexusMentorJson(
      JSON.stringify(request),
      dependencies({
        provider,
        timeoutMs: 15,
        quota: createQuotaMock({ settle, release }),
      }),
    );
    await vi.advanceTimersByTimeAsync(15);

    await expect(pending).resolves.toEqual({ ok: false, error: "timeout" });
    expect(capturedSignal?.aborted).toBe(true);
    expect(settle).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
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
