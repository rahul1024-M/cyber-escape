import { describe, expect, it, vi } from "vitest";
import {
  AiQuotaService,
  type AiQuotaStateStore,
  type PersistedAiQuotaState,
  createEmptyAiQuotaState,
} from "@/game/aiQuota";
import { handleAiQuotaRequest } from "./aiQuotaHttp";

class TestStore implements AiQuotaStateStore {
  transactionSync<T>(operation: (state: PersistedAiQuotaState) => T): T {
    return operation(createEmptyAiQuotaState());
  }
}

function request(path: string, body: unknown) {
  return new Request(`https://ai-quota.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("quota coordinator HTTP boundary", () => {
  it("returns retry-later when the coordinator binding is unavailable", async () => {
    const response = await handleAiQuotaRequest(request("/reserve", {}), undefined, false);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "retry_later" });
  });

  it("does not return storage error details", async () => {
    const service = new AiQuotaService(
      {
        transactionSync() {
          throw new Error("private storage detail");
        },
      },
      { maxRequestCostUsd: 0.1, maxGlobalConcurrent: 5 },
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleAiQuotaRequest(
      request("/reserve", { identity: "guest:test", requestCostUsd: 0.01 }),
      service,
      true,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "retry_later" });
    expect(errorSpy).toHaveBeenCalledWith("[AiQuotaCoordinator] quota operation failed.");
    errorSpy.mockRestore();
  });

  it("rejects unknown paths, methods, extra fields, and oversized bodies", async () => {
    const service = new AiQuotaService(new TestStore(), {
      maxRequestCostUsd: 0.1,
      maxGlobalConcurrent: 5,
    });
    expect((await handleAiQuotaRequest(new Request("https://x/"), service, true)).status).toBe(405);
    expect(
      (
        await handleAiQuotaRequest(
          request("/reserve", { identity: "guest:test", requestCostUsd: 0.01, extra: true }),
          service,
          true,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleAiQuotaRequest(
          new Request("https://x/reserve", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identity: "guest:test", requestCostUsd: 0.01 }).padEnd(
              4097,
              " ",
            ),
          }),
          service,
          true,
        )
      ).status,
    ).toBe(413);
  });

  it("denies reservations while the server-side AI kill switch is off", async () => {
    const service = new AiQuotaService(new TestStore(), {
      maxRequestCostUsd: 0.1,
      maxGlobalConcurrent: 5,
    });
    const response = await handleAiQuotaRequest(
      request("/reserve", { identity: "guest:test", requestCostUsd: 0.01 }),
      service,
      false,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "denied", reason: "ai_disabled" });
  });
});
