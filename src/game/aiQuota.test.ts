import { describe, expect, it } from "vitest";
import {
  AI_QUOTA_LIMITS,
  AI_QUOTA_RESERVATION_TTL_MS,
  AiQuotaService,
  createEmptyAiQuotaState,
  type AiQuotaStateStore,
  type PersistedAiQuotaState,
} from "./aiQuota";
import { DurableAiQuotaStateStore } from "@/server/aiQuotaStorage";

const START = Date.UTC(2026, 10, 14, 12);

class MemoryStorage implements AiQuotaStateStore {
  private value: unknown;
  fail = false;

  transactionSync<T>(operation: (state: PersistedAiQuotaState) => T): T {
    if (this.fail) throw new Error("private storage failure");
    const state =
      this.value === undefined
        ? createEmptyAiQuotaState()
        : (structuredClone(this.value) as PersistedAiQuotaState);
    const result = operation(state);
    this.value = structuredClone(state);
    return result;
  }

  snapshot(): PersistedAiQuotaState {
    return this.value === undefined
      ? createEmptyAiQuotaState()
      : (structuredClone(this.value) as PersistedAiQuotaState);
  }
}

class FakeDurableStorage {
  private readonly values = new Map<string, unknown>();
  fail = false;
  readonly kv = {
    get: (key: string) => {
      if (this.fail) throw new Error("private storage failure");
      return this.values.get(key);
    },
    put: (key: string, value: unknown) => {
      if (this.fail) throw new Error("private storage failure");
      this.values.set(key, structuredClone(value));
    },
  };

  transactionSync<T>(operation: () => T): T {
    if (this.fail) throw new Error("private storage failure");
    const before = new Map(this.values);
    try {
      return operation();
    } catch (error) {
      this.values.clear();
      for (const [key, value] of before) this.values.set(key, value);
      throw error;
    }
  }
}

function setup(
  options: {
    maxRequestCostUsd?: number;
    maxGlobalConcurrent?: number;
    reservationTtlMs?: number;
    start?: number;
  } = {},
) {
  const storage = new MemoryStorage();
  let now = options.start ?? START;
  let sequence = 0;
  const service = new AiQuotaService(
    storage,
    {
      maxRequestCostUsd: options.maxRequestCostUsd ?? 0.1,
      maxGlobalConcurrent: options.maxGlobalConcurrent ?? 5,
      ...(options.reservationTtlMs === undefined
        ? {}
        : { reservationTtlMs: options.reservationTtlMs }),
    },
    () => now,
    () => `reservation-${String(++sequence).padStart(16, "0")}`,
  );
  return {
    storage,
    service,
    setNow(value: number) {
      now = value;
    },
    advance(milliseconds: number) {
      now += milliseconds;
    },
  };
}

function reserveAndRelease(
  service: AiQuotaService,
  identity: `guest:${string}` | `user:${string}`,
  cost = 0.01,
) {
  const reservation = service.reserve(identity, cost);
  if (reservation.status !== "ok") return reservation;
  const released = service.release(identity, reservation.reservationId, "provider_not_called");
  expect(released.status).toBe("ok");
  return reservation;
}

describe("AI quota coordinator state machine", () => {
  it("uses the required identity-specific request limits", () => {
    expect(AI_QUOTA_LIMITS).toEqual({
      guest: { perMinute: 2, perHour: 10, perUtcDay: 20 },
      user: { perMinute: 5, perHour: 30, perUtcDay: 75 },
    });
  });

  it("enforces guest and authenticated minute, hour, and UTC-day quotas", () => {
    const guest = setup();
    reserveAndRelease(guest.service, "guest:guest-1");
    reserveAndRelease(guest.service, "guest:guest-1");
    expect(guest.service.reserve("guest:guest-1", 0.01)).toMatchObject({
      status: "denied",
      reason: "identity_rate_limit",
    });

    const authenticated = setup();
    const authenticatedBatch = (count: number) => {
      for (let index = 0; index < count; index += 1) {
        expect(reserveAndRelease(authenticated.service, "user:user-1").status).toBe("ok");
        if ((index + 1) % 5 === 0 && index + 1 < count) authenticated.advance(60_001);
      }
    };
    authenticatedBatch(5);
    expect(authenticated.service.reserve("user:user-1", 0.01)).toMatchObject({
      status: "denied",
      reason: "identity_rate_limit",
    });
    authenticated.advance(60_001);
    authenticatedBatch(25);
    expect(authenticated.service.getStatus("user:user-1")).toMatchObject({
      status: "ok",
      hourRemaining: 0,
    });
    expect(authenticated.service.reserve("user:user-1", 0.01)).toMatchObject({
      status: "denied",
      reason: "identity_rate_limit",
    });

    authenticated.advance(60 * 60 * 1000 + 1);
    authenticatedBatch(30);
    expect(authenticated.service.getStatus("user:user-1")).toMatchObject({
      status: "ok",
      hourRemaining: 0,
      dayRemaining: 15,
    });
    authenticated.advance(60 * 60 * 1000 + 1);
    authenticatedBatch(15);
    expect(authenticated.service.getStatus("user:user-1")).toMatchObject({
      status: "ok",
      dayRemaining: 0,
    });
    expect(authenticated.service.reserve("user:user-1", 0.01)).toMatchObject({
      status: "denied",
      reason: "identity_rate_limit",
    });

    const dailyGuest = setup();
    for (let batch = 0; batch < 2; batch += 1) {
      for (let index = 0; index < 10; index += 1) {
        reserveAndRelease(dailyGuest.service, "guest:guest-daily");
        if (index < 9) dailyGuest.advance(60_001);
      }
      if (batch === 0) dailyGuest.advance(60 * 60 * 1000 + 1);
    }
    expect(dailyGuest.service.reserve("guest:guest-daily", 0.01)).toMatchObject({
      status: "denied",
      reason: "identity_rate_limit",
    });
  });

  it("releases per-identity concurrency after the reservation expires", () => {
    const { service, advance } = setup();
    const first = service.reserve("guest:expiry", 0.05);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(service.reserve("guest:expiry", 0.05)).toMatchObject({
      status: "denied",
      reason: "identity_concurrency",
    });
    advance(AI_QUOTA_RESERVATION_TTL_MS + 1);
    expect(service.reserve("guest:expiry", 0.05).status).toBe("ok");
  });

  it("serializes concurrent reservations for the same identity", async () => {
    const { service } = setup();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        Promise.resolve().then(() => service.reserve("guest:concurrent", 0.01)),
      ),
    );
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.filter((result) => result.status === "denied")).toHaveLength(19);
    expect(
      results.every(
        (result) => result.status !== "denied" || result.reason === "identity_concurrency",
      ),
    ).toBe(true);
  });

  it("prevents concurrent identities from reserving beyond the global daily budget", async () => {
    const { service, storage } = setup({ maxRequestCostUsd: 0.2, maxGlobalConcurrent: 20 });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        Promise.resolve().then(() => service.reserve(`user:user-${index}`, 0.2)),
      ),
    );
    expect(results.filter((result) => result.status === "ok")).toHaveLength(5);
    expect(results.filter((result) => result.status === "denied")).toHaveLength(15);
    expect(
      Object.values(storage.snapshot().dailyBudgets).reduce(
        (total, budget) => total + budget.reservedMicroUsd + budget.spentMicroUsd,
        0,
      ),
    ).toBe(1_000_000);
  });

  it("enforces the configured global concurrent request limit", () => {
    const { service } = setup({ maxGlobalConcurrent: 1 });
    expect(service.reserve("user:user-a", 0.01).status).toBe("ok");
    expect(service.reserve("user:user-b", 0.01)).toMatchObject({
      status: "denied",
      reason: "global_concurrency",
    });
  });

  
  it("settles once and rejects cross-identity or duplicate settlement", () => {
    const { service, storage } = setup();
    const reservation = service.reserve("user:verified-user", 0.1);
    expect(reservation.status).toBe("ok");
    if (reservation.status !== "ok") return;

    expect(service.settle("user:another-user", reservation.reservationId, 0.02)).toMatchObject({
      status: "denied",
      reason: "reservation_unavailable",
    });

    expect(service.settle("user:verified-user", reservation.reservationId, 0.02).status).toBe("ok");

    expect(service.settle("user:verified-user", reservation.reservationId, 0.02)).toMatchObject({
      status: "denied",
      reason: "reservation_unavailable",
    });

    expect(Object.values(storage.snapshot().dailyBudgets)[0]).toEqual({
      reservedMicroUsd: 0,
      spentMicroUsd: 20_000,
    });
  });

  it("rejects settlement above the reserved amount without changing budget", () => {
    const { service, storage } = setup();

    const reservation = service.reserve("user:verified-user", 0.1);
    expect(reservation.status).toBe("ok");
    if (reservation.status !== "ok") return;

    const result = service.settle(
      "user:verified-user",
      reservation.reservationId,
      0.11,
    );

    expect(result).toMatchObject({
      status: "denied",
      reason: "invalid_cost",
    });

    expect(Object.values(storage.snapshot().dailyBudgets)[0]).toEqual({
      reservedMicroUsd: 100_000,
      spentMicroUsd: 0,
    });

    expect(
  storage.snapshot().reservations[reservation.reservationId],
).toMatchObject({
  status: "reserved",
});
  });


  it("releases only known pre-provider failures and rejects duplicate release", () => {
    const { service, storage } = setup();
    const reservation = service.reserve("guest:release", 0.1);
    expect(reservation.status).toBe("ok");
    if (reservation.status !== "ok") return;

    expect(
      service.release("guest:release", reservation.reservationId, "provider_error").status,
    ).toBe("denied");
    expect(
      service.release("guest:release", reservation.reservationId, "provider_not_called").status,
    ).toBe("ok");
    expect(
      service.release("guest:release", reservation.reservationId, "provider_not_called"),
    ).toMatchObject({ status: "denied", reason: "reservation_unavailable" });
    expect(Object.values(storage.snapshot().dailyBudgets)[0]).toEqual({
      reservedMicroUsd: 0,
      spentMicroUsd: 0,
    });
  });

  it("charges abandoned reservations at their reserved amount and cleans terminal records", () => {
    const { service, storage, advance } = setup({ reservationTtlMs: 1000 });
    const reservation = service.reserve("guest:abandoned", 0.1);
    expect(reservation.status).toBe("ok");
    if (reservation.status !== "ok") return;
    advance(1001);
    expect(service.getStatus("guest:abandoned")).toMatchObject({ status: "ok", inFlight: false });
    expect(Object.values(storage.snapshot().dailyBudgets)[0]).toEqual({
      reservedMicroUsd: 0,
      spentMicroUsd: 100_000,
    });
    advance(48 * 60 * 60 * 1000 + 1);
    service.getStatus("guest:abandoned");
    expect(storage.snapshot().reservations).toEqual({});
  });

  it("persists quota state across store reinitialization", () => {
    const durableStorage = new FakeDurableStorage();
    const firstStore = new DurableAiQuotaStateStore(durableStorage);
    const firstService = new AiQuotaService(
      firstStore,
      { maxRequestCostUsd: 0.1, maxGlobalConcurrent: 5 },
      () => START,
      () => "reservation-persist-0001",
    );
    expect(firstService.reserve("guest:persist", 0.05).status).toBe("ok");

    const secondService = new AiQuotaService(
      new DurableAiQuotaStateStore(durableStorage),
      { maxRequestCostUsd: 0.1, maxGlobalConcurrent: 5 },
      () => START,
      () => "reservation-persist-0002",
    );
    expect(secondService.reserve("guest:persist", 0.05)).toMatchObject({
      status: "denied",
      reason: "identity_concurrency",
    });
  });

  it("fails closed when durable storage operations fail", () => {
    const storage = new MemoryStorage();
    storage.fail = true;
    const service = new AiQuotaService(storage, {
      maxRequestCostUsd: 0.1,
      maxGlobalConcurrent: 5,
    });
    expect(() => service.reserve("guest:storage", 0.01)).toThrow("private storage failure");

    const durableStorage = new FakeDurableStorage();
    durableStorage.fail = true;
    expect(() =>
      new DurableAiQuotaStateStore(durableStorage).transactionSync(() => undefined),
    ).toThrow("private storage failure");
  });

  it("rejects unknown identities and invalid costs without touching storage", () => {
    const { service, storage } = setup();
    expect(service.reserve("admin:forged", 0.01)).toMatchObject({
      status: "denied",
      reason: "invalid_identity",
    });
    expect(service.reserve("guest:valid", Number.NaN)).toMatchObject({
      status: "denied",
      reason: "invalid_cost",
    });
    expect(service.reserve("user:valid", -1)).toMatchObject({
      status: "denied",
      reason: "invalid_cost",
    });
    expect(service.reserve("user:valid", 0.11)).toMatchObject({
      status: "denied",
      reason: "invalid_cost",
    });
    expect(storage.snapshot().requestEvents).toHaveLength(0);
  });

  it("keeps guest and authenticated quota namespaces separate", () => {
    const { service } = setup();
    const guest = service.reserve("guest:shared-id", 0.01);
    const user = service.reserve("user:shared-id", 0.01);
    expect(guest.status).toBe("ok");
    expect(user.status).toBe("ok");
  });

  it("resets daily quotas at UTC midnight while retaining rolling-hour events", () => {
    const midnight = Date.UTC(2026, 10, 15, 0, 0, 0);
    const { service, setNow } = setup({ start: midnight - 1 });
    reserveAndRelease(service, "guest:rollover");
    reserveAndRelease(service, "guest:rollover");
    setNow(midnight);
    expect(service.getStatus("guest:rollover")).toMatchObject({
      status: "ok",
      dayRemaining: 20,
      hourRemaining: 8,
    });
  });
});
