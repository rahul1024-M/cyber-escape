import { DurableObject } from "cloudflare:workers";
import {
  AI_QUOTA_DAILY_BUDGET_USD,
  AI_QUOTA_RESERVATION_TTL_MS,
  AiQuotaService,
} from "@/game/aiQuota";
import { DurableAiQuotaStateStore } from "./aiQuotaStorage";
import { handleAiQuotaRequest } from "./aiQuotaHttp";

interface AiQuotaEnv {
  AI_ENABLED?: string;
  AI_MAX_REQUEST_COST_USD?: string;
  AI_MAX_GLOBAL_CONCURRENT?: string;
}

export class AiQuotaCoordinator extends DurableObject<AiQuotaEnv> {
  private readonly quotaService: AiQuotaService | undefined;
  private readonly aiEnabled: boolean;

  constructor(ctx: DurableObjectState, env: AiQuotaEnv) {
    super(ctx, env);
    this.aiEnabled = env.AI_ENABLED === "true";
    const maxRequestCostUsd = parsePositiveNumber(env.AI_MAX_REQUEST_COST_USD);
    const maxGlobalConcurrent = parsePositiveInteger(env.AI_MAX_GLOBAL_CONCURRENT);
    if (
      maxRequestCostUsd === undefined ||
      maxRequestCostUsd > AI_QUOTA_DAILY_BUDGET_USD ||
      maxGlobalConcurrent === undefined
    ) {
      return;
    }
    this.quotaService = new AiQuotaService(new DurableAiQuotaStateStore(ctx.storage), {
      maxRequestCostUsd,
      maxGlobalConcurrent,
      reservationTtlMs: AI_QUOTA_RESERVATION_TTL_MS,
    });
  }

  override fetch(request: Request): Promise<Response> {
    return handleAiQuotaRequest(request, this.quotaService, this.aiEnabled);
  }
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^(?:\d+\.?\d*|\.\d+)$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
