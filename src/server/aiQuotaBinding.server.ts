import { type AiQuotaIdentity, type AiQuotaResult } from "@/game/aiQuota";
import { getAiServerBindings } from "./cloudflareBindings.server";

export interface AiQuotaReservation {
  reservationId: string;
  expiresAt: number;
}

export async function reserveAiQuota(
  identity: AiQuotaIdentity,
  requestCostUsd: number,
): Promise<AiQuotaResult<AiQuotaReservation>> {
  return sendQuotaRequest("/reserve", { identity, requestCostUsd }, true);
}

export async function settleAiQuota(
  identity: AiQuotaIdentity,
  reservationId: string,
  actualCostUsd: number,
): Promise<AiQuotaResult> {
  return sendQuotaRequest("/settle", { identity, reservationId, actualCostUsd });
}

export async function releaseAiQuota(
  identity: AiQuotaIdentity,
  reservationId: string,
  reason: "provider_not_called",
): Promise<AiQuotaResult> {
  return sendQuotaRequest("/release", { identity, reservationId, reason });
}

export async function getAiQuotaStatus(identity: AiQuotaIdentity): Promise<
  AiQuotaResult<{
    minuteRemaining: number;
    hourRemaining: number;
    dayRemaining: number;
    inFlight: boolean;
  }>
> {
  return sendQuotaRequest("/status", { identity });
}

async function sendQuotaRequest<T extends object = Record<never, never>>(
  path: string,
  body: object,
  requireAiEnabled = false,
): Promise<AiQuotaResult<T>> {
  try {
    const bindings = getAiServerBindings();
    if (requireAiEnabled && !bindings.AI_ENABLED) {
      return { status: "denied", reason: "ai_disabled" };
    }
    const id = bindings.AI_QUOTA_COORDINATOR.idFromName("ai-quota-global-v1");
    const stub = bindings.AI_QUOTA_COORDINATOR.get(id);
    const response = await stub.fetch(
      new Request(`https://ai-quota.internal${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (response.status >= 500) return { status: "retry_later" };
    if (!response.ok) return { status: "denied", reason: "reservation_unavailable" };
    return (await response.json()) as AiQuotaResult<T>;
  } catch {
    return { status: "retry_later" };
  }
}
