import { AiQuotaService, type AiQuotaIdentity } from "@/game/aiQuota";

const MAX_BODY_BYTES = 4096;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function handleAiQuotaRequest(
  request: Request,
  service: AiQuotaService | undefined,
  aiEnabled: boolean,
): Promise<Response> {
  if (!service) return jsonResponse({ status: "retry_later" }, 503);
  if (request.method !== "POST") return jsonResponse({ status: "denied" }, 405);
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse({ status: "denied" }, 415);
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ status: "denied" }, 413);
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ status: "denied" }, 413);
    }
    input = JSON.parse(body);
  } catch {
    return jsonResponse({ status: "denied" }, 400);
  }
  const payload = asRecord(input);
  if (!payload) return jsonResponse({ status: "denied" }, 400);

  const url = new URL(request.url);
  try {
    switch (url.pathname) {
      case "/reserve":
        if (!aiEnabled) {
          return jsonResponse({ status: "denied", reason: "ai_disabled" }, 403);
        }
        if (!hasOnlyKeys(payload, ["identity", "requestCostUsd"])) {
          return jsonResponse({ status: "denied" }, 400);
        }
        return resultResponse(service.reserve(payload["identity"], payload["requestCostUsd"]));
      case "/settle":
        if (!hasOnlyKeys(payload, ["identity", "reservationId", "actualCostUsd"])) {
          return jsonResponse({ status: "denied" }, 400);
        }
        return resultResponse(
          service.settle(payload["identity"], payload["reservationId"], payload["actualCostUsd"]),
        );
      case "/release":
        if (!hasOnlyKeys(payload, ["identity", "reservationId", "reason"])) {
          return jsonResponse({ status: "denied" }, 400);
        }
        return resultResponse(
          service.release(payload["identity"], payload["reservationId"], payload["reason"]),
        );
      case "/status":
        if (!hasOnlyKeys(payload, ["identity"])) return jsonResponse({ status: "denied" }, 400);
        return resultResponse(service.getStatus(payload["identity"]));
      default:
        return jsonResponse({ status: "denied" }, 404);
    }
  } catch {
    console.error("[AiQuotaCoordinator] quota operation failed.");
    return jsonResponse({ status: "retry_later" }, 503);
  }
}

function resultResponse(result: { status: string; reason?: string }): Response {
  if (result.status === "retry_later") return jsonResponse(result, 503);
  if (result.status === "denied") {
    const status =
      result.reason === "invalid_identity" || result.reason === "invalid_cost"
        ? 400
        : result.reason === "ai_disabled"
          ? 403
          : 429;
    return jsonResponse(result, status);
  }
  return jsonResponse(result, 200);
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function hasOnlyKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}

export type AiQuotaRequestIdentity = AiQuotaIdentity;
