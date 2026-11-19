
import { createClient } from "@supabase/supabase-js";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { geminiNexusMentorProvider } from "@/server/geminiProvider.server";
import type {
  NexusMentorDependencies,
  NexusMentorIdentity,
  NexusMentorQuotaReservationResult,
} from "./nexusMentor";
import {
  readGuestSessionCookie,
  verifyGuestSession,
} from "@/server/guestSessions.server";
import { getAiServerBindings } from "@/server/cloudflareBindings.server";
import { resolveNexusIdentity } from "@/server/nexusIdentity.server";
import {
  releaseAiQuota,
  reserveAiQuota,
  settleAiQuota,
} from "@/server/aiQuotaBinding.server";
import type { AiQuotaResult } from "./aiQuota";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const authorization = getRequestHeader("authorization");

  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length);

  if (!token || token.split(".").length !== 3) return null;

  let bindings: ReturnType<typeof getAiServerBindings>;

  try {
    bindings = getAiServerBindings();
  } catch {
    return null;
  }

  const url = bindings.SUPABASE_URL;
  const publishableKey = bindings.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;

  const supabase = createClient<Database>(url, publishableKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { data, error } = await supabase.auth.getClaims(token);

    if (error || !data?.claims?.sub) return null;

    return data.claims.sub;
  } catch {
    return null;
  }
}

export function getNexusMentorDependencies(): NexusMentorDependencies {
  return {
    provider: geminiNexusMentorProvider,

    isAiEnabled: () => {
      try {
        return getAiServerBindings().AI_ENABLED;
      } catch {
        return false;
      }
    },

    resolveIdentity: resolveNexusMentorIdentity,

    quota: {
      reserve: reserveNexusMentorQuota,

      settle: async (identity, reservationId, actualCostUsd) =>
        (await settleAiQuota(identity.identity, reservationId, actualCostUsd))
          .status === "ok",

      release: async (identity, reservationId) =>
        (await releaseAiQuota(
          identity.identity,
          reservationId,
          "provider_not_called",
        )).status === "ok",
    },

    // Keep authorization fail-closed until the authorization
    // implementation has been verified.
    authorizeRequest: async () => false,
  };
}

async function reserveNexusMentorQuota(
  identity: NexusMentorIdentity,
): Promise<NexusMentorQuotaReservationResult> {
  try {
    const bindings = getAiServerBindings();

    if (!bindings.AI_ENABLED) {
      return { status: "denied" };
    }

    const reservedCostUsd = Number(bindings.AI_MAX_REQUEST_COST_USD);

    if (!Number.isFinite(reservedCostUsd) || reservedCostUsd <= 0) {
      return { status: "retry_later" };
    }

    const result: AiQuotaResult<{
      reservationId: string;
      expiresAt: number;
    }> = await reserveAiQuota(identity.identity, reservedCostUsd);

    if (result.status !== "ok") {
      return result.status === "denied"
        ? { status: "denied" }
        : { status: "retry_later" };
    }

    return {
      ...result,
      reservedCostUsd,
    };
  } catch {
    return { status: "retry_later" };
  }
}


export async function resolveNexusMentorIdentity() {
  const request = getRequest();
  const authorization = request.headers.get("authorization");

  // If authentication was attempted, never downgrade to guest.
  if (authorization !== null) {
    if (!authorization.startsWith("Bearer ")) return null;

    const verifiedSubject = await getAuthenticatedUserId();

    if (verifiedSubject === null) return null;

    return resolveNexusIdentity(verifiedSubject, null);
  }

  // No Authorization header: guest identity may be used.
  const bindings = getAiServerBindings();

  const token = readGuestSessionCookie(
    request.headers.get("cookie"),
  );

  const guestSession = token
    ? await verifyGuestSession(token, {
        signingSecret: bindings.GUEST_SESSION_SIGNING_SECRET,
        audience: bindings.GUEST_SESSION_AUDIENCE,
        environment: bindings.GUEST_SESSION_ENVIRONMENT,
      })
    : null;

  return resolveNexusIdentity(null, guestSession);
}


export function getNexusMentorRequestContentLength(): string | null {
  return getRequest().headers.get("content-length");
}
