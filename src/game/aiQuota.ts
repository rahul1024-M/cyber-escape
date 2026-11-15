export const AI_QUOTA_LIMITS = {
  guest: { perMinute: 2, perHour: 10, perUtcDay: 20 },
  user: { perMinute: 5, perHour: 30, perUtcDay: 75 },
} as const;

export const AI_QUOTA_DAILY_BUDGET_USD = 1;
export const AI_QUOTA_RESERVATION_TTL_MS = 2 * 60 * 1000;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MICRO_USD_PER_USD = 1_000_000;
const TERMINAL_RESERVATION_RETENTION_MS = 48 * HOUR_MS;
const RESERVATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type AiQuotaIdentity = `guest:${string}` | `user:${string}`;
export type AiQuotaDenialReason =
  | "invalid_identity"
  | "invalid_cost"
  | "ai_disabled"
  | "identity_rate_limit"
  | "identity_concurrency"
  | "global_concurrency"
  | "global_budget"
  | "reservation_unavailable";

export interface AiQuotaConfig {
  maxRequestCostUsd: number;
  maxGlobalConcurrent: number;
  reservationTtlMs?: number;
}

export interface QuotaRequestEvent {
  identity: string;
  timestampMs: number;
}

export interface QuotaReservation {
  id: string;
  identity: string;
  createdAtMs: number;
  expiresAtMs: number;
  budgetDay: string;
  reservedMicroUsd: number;
  actualMicroUsd?: number;
  status: "reserved" | "settled" | "released" | "expired";
  statusChangedAtMs?: number;
}

export interface DailyBudget {
  reservedMicroUsd: number;
  spentMicroUsd: number;
}

export interface PersistedAiQuotaState {
  version: 1;
  requestEvents: QuotaRequestEvent[];
  reservations: Record<string, QuotaReservation>;
  dailyBudgets: Record<string, DailyBudget>;
}

export interface AiQuotaStateStore {
  transactionSync<T>(operation: (state: PersistedAiQuotaState) => T): T;
}

export interface AiQuotaDenial {
  status: "denied";
  reason: AiQuotaDenialReason;
  retryAfterSeconds?: number;
}

export type AiQuotaResult<T extends object = Record<never, never>> =
  ({ status: "ok" } & T) | AiQuotaDenial | { status: "retry_later" };

export function createEmptyAiQuotaState(): PersistedAiQuotaState {
  return {
    version: 1,
    requestEvents: [],
    reservations: {},
    dailyBudgets: {},
  };
}

export function parsePersistedAiQuotaState(value: unknown): PersistedAiQuotaState {
  if (value === undefined) return createEmptyAiQuotaState();
  if (!isRecord(value) || value["version"] !== 1) throw new Error("Invalid quota state");

  const requestEvents = value["requestEvents"];
  const reservations = value["reservations"];
  const dailyBudgets = value["dailyBudgets"];
  if (!Array.isArray(requestEvents) || !isRecord(reservations) || !isRecord(dailyBudgets)) {
    throw new Error("Invalid quota state");
  }
  if (
    !requestEvents.every(
      (event) =>
        isRecord(event) &&
        typeof event["identity"] === "string" &&
        isFiniteNumber(event["timestampMs"]),
    )
  ) {
    throw new Error("Invalid quota state");
  }
  for (const [id, reservation] of Object.entries(reservations)) {
    if (
      !RESERVATION_ID_PATTERN.test(id) ||
      !isRecord(reservation) ||
      reservation["id"] !== id ||
      typeof reservation["identity"] !== "string" ||
      typeof reservation["budgetDay"] !== "string" ||
      !isFiniteNumber(reservation["createdAtMs"]) ||
      !isFiniteNumber(reservation["expiresAtMs"]) ||
      !isNonNegativeSafeInteger(reservation["reservedMicroUsd"]) ||
      !["reserved", "settled", "released", "expired"].includes(String(reservation["status"])) ||
      (reservation["actualMicroUsd"] !== undefined &&
        !isNonNegativeSafeInteger(reservation["actualMicroUsd"])) ||
      (reservation["statusChangedAtMs"] !== undefined &&
        !isFiniteNumber(reservation["statusChangedAtMs"]))
    ) {
      throw new Error("Invalid quota state");
    }
  }
  for (const [day, budget] of Object.entries(dailyBudgets)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !isRecord(budget) ||
      !isNonNegativeSafeInteger(budget["reservedMicroUsd"]) ||
      !isNonNegativeSafeInteger(budget["spentMicroUsd"])
    ) {
      throw new Error("Invalid quota state");
    }
  }

  return value as unknown as PersistedAiQuotaState;
}

export function isAiQuotaIdentity(value: unknown): value is AiQuotaIdentity {
  if (typeof value !== "string") return false;
  const separator = value.indexOf(":");
  if (separator <= 0) return false;
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return (type === "guest" || type === "user") && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

export function isReservationId(value: unknown): value is string {
  return typeof value === "string" && RESERVATION_ID_PATTERN.test(value);
}

export function toMicroUsd(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  const amount = Math.ceil(value * MICRO_USD_PER_USD);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

export class AiQuotaService {
  private readonly reservationTtlMs: number;

  constructor(
    private readonly store: AiQuotaStateStore,
    private readonly config: AiQuotaConfig,
    private readonly now: () => number = Date.now,
    private readonly createReservationId: () => string = () => crypto.randomUUID(),
  ) {
    const maxRequestMicroUsd = toMicroUsd(config.maxRequestCostUsd);
    if (
      maxRequestMicroUsd === undefined ||
      maxRequestMicroUsd <= 0 ||
      maxRequestMicroUsd > AI_QUOTA_DAILY_BUDGET_USD * MICRO_USD_PER_USD ||
      !Number.isSafeInteger(config.maxGlobalConcurrent) ||
      config.maxGlobalConcurrent < 1
    ) {
      throw new Error("Invalid AI quota configuration");
    }
    this.reservationTtlMs = config.reservationTtlMs ?? AI_QUOTA_RESERVATION_TTL_MS;
    if (!Number.isSafeInteger(this.reservationTtlMs) || this.reservationTtlMs < 1) {
      throw new Error("Invalid AI quota configuration");
    }
  }

  reserve(
    identity: unknown,
    requestCostUsd: unknown,
  ): AiQuotaResult<{
    reservationId: string;
    expiresAt: number;
  }> {
    if (!isAiQuotaIdentity(identity)) return denied("invalid_identity");
    const requestCostMicroUsd = toMicroUsd(requestCostUsd);
    const maximumMicroUsd = toMicroUsd(this.config.maxRequestCostUsd);
    if (
      requestCostMicroUsd === undefined ||
      requestCostMicroUsd <= 0 ||
      maximumMicroUsd === undefined ||
      requestCostMicroUsd > maximumMicroUsd ||
      requestCostMicroUsd > AI_QUOTA_DAILY_BUDGET_USD * MICRO_USD_PER_USD
    ) {
      return denied("invalid_cost");
    }

    return this.store.transactionSync((state) => {
      const now = this.now();
      cleanupState(state, now);
      const policy = identityPolicy(identity);
      const day = utcDay(now);
      const events = state.requestEvents.filter((event) => event.identity === identity);
      const minuteEvents = events.filter((event) => event.timestampMs > now - MINUTE_MS);
      const hourEvents = events.filter((event) => event.timestampMs > now - HOUR_MS);
      const dayEvents = events.filter((event) => utcDay(event.timestampMs) === day);

      if (
        minuteEvents.length >= policy.perMinute ||
        hourEvents.length >= policy.perHour ||
        dayEvents.length >= policy.perUtcDay
      ) {
        return denied("identity_rate_limit");
      }

      const activeReservations = Object.values(state.reservations).filter(
        (reservation) => reservation.status === "reserved",
      );
      if (activeReservations.some((reservation) => reservation.identity === identity)) {
        return denied("identity_concurrency");
      }
      if (activeReservations.length >= this.config.maxGlobalConcurrent) {
        return denied("global_concurrency");
      }

      const budget = getDailyBudget(state, day);
      const dailyLimit = AI_QUOTA_DAILY_BUDGET_USD * MICRO_USD_PER_USD;
      if (budget.spentMicroUsd + budget.reservedMicroUsd + requestCostMicroUsd > dailyLimit) {
        return denied("global_budget");
      }

      const reservationId = this.createReservationId();
      if (!isReservationId(reservationId) || state.reservations[reservationId]) {
        throw new Error("Reservation ID generation failed");
      }
      const expiresAt = now + this.reservationTtlMs;
      const reservation: QuotaReservation = {
        id: reservationId,
        identity,
        createdAtMs: now,
        expiresAtMs: expiresAt,
        budgetDay: day,
        reservedMicroUsd: requestCostMicroUsd,
        status: "reserved",
      };
      state.requestEvents.push({ identity, timestampMs: now });
      state.reservations[reservationId] = reservation;
      budget.reservedMicroUsd += requestCostMicroUsd;
      return { status: "ok", reservationId, expiresAt };
    });
  }

  settle(identity: unknown, reservationId: unknown, actualCostUsd: unknown): AiQuotaResult {
    if (!isAiQuotaIdentity(identity)) return denied("invalid_identity");
    if (!isReservationId(reservationId)) return denied("reservation_unavailable");
    const actualMicroUsd = toMicroUsd(actualCostUsd);
    if (actualMicroUsd === undefined) return denied("invalid_cost");

    return this.store.transactionSync((state) => {
      const now = this.now();
      cleanupState(state, now);
      const reservation = state.reservations[reservationId];
      if (!reservation || reservation.status !== "reserved") {
        return denied("reservation_unavailable");
      }
      if (reservation.identity !== identity) return denied("reservation_unavailable");
       if (actualMicroUsd > reservation.reservedMicroUsd) {
  return denied("invalid_cost");
      }
      const budget = state.dailyBudgets[reservation.budgetDay];
      if (!budget || budget.reservedMicroUsd < reservation.reservedMicroUsd) {
        throw new Error("Invalid quota accounting state");
      }
      budget.reservedMicroUsd -= reservation.reservedMicroUsd;
      budget.spentMicroUsd += actualMicroUsd;
      reservation.actualMicroUsd = actualMicroUsd;
      reservation.status = "settled";
      reservation.statusChangedAtMs = now;
      return { status: "ok" };
    });
  }

  release(identity: unknown, reservationId: unknown, reason: unknown): AiQuotaResult {
    if (!isAiQuotaIdentity(identity)) return denied("invalid_identity");
    if (!isReservationId(reservationId) || reason !== "provider_not_called") {
      return denied("reservation_unavailable");
    }

    return this.store.transactionSync((state) => {
      const now = this.now();
      cleanupState(state, now);
      const reservation = state.reservations[reservationId];
      if (!reservation || reservation.status !== "reserved") {
        return denied("reservation_unavailable");
      }
      if (reservation.identity !== identity) return denied("reservation_unavailable");

      const budget = state.dailyBudgets[reservation.budgetDay];
      if (!budget || budget.reservedMicroUsd < reservation.reservedMicroUsd) {
        throw new Error("Invalid quota accounting state");
      }
      budget.reservedMicroUsd -= reservation.reservedMicroUsd;
      reservation.status = "released";
      reservation.statusChangedAtMs = now;
      return { status: "ok" };
    });
  }

  getStatus(identity: unknown): AiQuotaResult<{
    minuteRemaining: number;
    hourRemaining: number;
    dayRemaining: number;
    inFlight: boolean;
  }> {
    if (!isAiQuotaIdentity(identity)) return denied("invalid_identity");

    return this.store.transactionSync((state) => {
      const now = this.now();
      cleanupState(state, now);
      const policy = identityPolicy(identity);
      const events = state.requestEvents.filter((event) => event.identity === identity);
      return {
        status: "ok",
        minuteRemaining: Math.max(
          0,
          policy.perMinute - events.filter((event) => event.timestampMs > now - MINUTE_MS).length,
        ),
        hourRemaining: Math.max(
          0,
          policy.perHour - events.filter((event) => event.timestampMs > now - HOUR_MS).length,
        ),
        dayRemaining: Math.max(
          0,
          policy.perUtcDay -
            events.filter((event) => utcDay(event.timestampMs) === utcDay(now)).length,
        ),
        inFlight: Object.values(state.reservations).some(
          (reservation) => reservation.identity === identity && reservation.status === "reserved",
        ),
      };
    });
  }
}

function cleanupState(state: PersistedAiQuotaState, now: number): void {
  const terminalCutoff = now - TERMINAL_RESERVATION_RETENTION_MS;
  for (const [id, reservation] of Object.entries(state.reservations)) {
    if (reservation.status === "reserved" && reservation.expiresAtMs <= now) {
      const budget = state.dailyBudgets[reservation.budgetDay];
      if (!budget || budget.reservedMicroUsd < reservation.reservedMicroUsd) {
        throw new Error("Invalid quota accounting state");
      }
      budget.reservedMicroUsd -= reservation.reservedMicroUsd;
      budget.spentMicroUsd += reservation.reservedMicroUsd;
      reservation.status = "expired";
      reservation.statusChangedAtMs = now;
    } else if (
      reservation.status !== "reserved" &&
      reservation.statusChangedAtMs !== undefined &&
      reservation.statusChangedAtMs < terminalCutoff
    ) {
      delete state.reservations[id];
    }
  }

  const eventCutoff = Math.min(utcDayStart(now), now - HOUR_MS);
  state.requestEvents = state.requestEvents.filter((event) => event.timestampMs >= eventCutoff);

  for (const day of Object.keys(state.dailyBudgets)) {
    if (day < utcDay(now) && !hasReservationForDay(state, day)) {
      delete state.dailyBudgets[day];
    }
  }
}

function getDailyBudget(state: PersistedAiQuotaState, day: string): DailyBudget {
  let budget = state.dailyBudgets[day];
  if (!budget) {
    budget = { reservedMicroUsd: 0, spentMicroUsd: 0 };
    state.dailyBudgets[day] = budget;
  }
  return budget;
}

function hasReservationForDay(state: PersistedAiQuotaState, day: string): boolean {
  return Object.values(state.reservations).some((reservation) => reservation.budgetDay === day);
}

function identityPolicy(identity: AiQuotaIdentity) {
  return identity.startsWith("guest:") ? AI_QUOTA_LIMITS.guest : AI_QUOTA_LIMITS.user;
}

function utcDay(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function utcDayStart(timestampMs: number): number {
  const date = new Date(timestampMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function denied(reason: AiQuotaDenialReason): AiQuotaDenial {
  return { status: "denied", reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}
