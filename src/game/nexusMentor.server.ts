import { createClient } from "@supabase/supabase-js";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import type { NexusMentorDependencies } from "./nexusMentor";

async function getAuthenticatedUserId(): Promise<string | null> {
  const authorization = getRequestHeader("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  if (!token || token.split(".").length !== 3) return null;

  const url = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !publishableKey) return null;

  const supabase = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

export function getNexusMentorDependencies(): NexusMentorDependencies {
  return {
    provider: null,
    authenticate: getAuthenticatedUserId,
    allowRequest: async () => false,
  };
}

export function getNexusMentorRequestContentLength(): string | null {
  return getRequest().headers.get("content-length");
}
