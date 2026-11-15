import { isAiQuotaIdentity } from "@/game/aiQuota";
import type { NexusMentorIdentity } from "@/game/nexusMentor";
import type { GuestSessionClaims } from "./guestSessions.server";

export function resolveNexusIdentity(
  verifiedSupabaseSubject: unknown,
  guestSession: Pick<GuestSessionClaims, "guestId"> | null,
): NexusMentorIdentity | null {
  if (verifiedSupabaseSubject !== null && verifiedSupabaseSubject !== undefined) {
    if (typeof verifiedSupabaseSubject !== "string") return null;
    const identity = `user:${verifiedSupabaseSubject}`;
    return isAiQuotaIdentity(identity) ? { identity, identityType: "user" } : null;
  }

  if (!guestSession || typeof guestSession.guestId !== "string") return null;
  const identity = `guest:${guestSession.guestId}`;
  return isAiQuotaIdentity(identity) ? { identity, identityType: "guest" } : null;
}
