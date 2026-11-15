import { describe, expect, it } from "vitest";
import { isAiQuotaIdentity } from "@/game/aiQuota";
import { resolveNexusIdentity } from "./nexusIdentity.server";

describe("NEXUS trusted identity resolution", () => {
  it("prefers a verified Supabase subject over a valid guest session", () => {
    const identity = resolveNexusIdentity("abc-123", { guestId: "guest-456" });
    expect(identity).toEqual({ identity: "user:abc-123", identityType: "user" });
    expect(isAiQuotaIdentity(identity?.identity)).toBe(true);
  });

  it("keeps guest and account namespaces distinct", () => {
    expect(resolveNexusIdentity(null, { guestId: "same-id" })).toEqual({
      identity: "guest:same-id",
      identityType: "guest",
    });
    expect(resolveNexusIdentity("same-id", { guestId: "same-id" })).toEqual({
      identity: "user:same-id",
      identityType: "user",
    });
  });

  it("rejects malformed or absent trusted identities without accepting request-body IDs", () => {
    expect(resolveNexusIdentity("invalid subject!", { guestId: "guest-1" })).toBeNull();
    expect(resolveNexusIdentity(null, null)).toBeNull();
    expect(resolveNexusIdentity({ userId: "forged" }, { guestId: "guest-1" })).toBeNull();
  });
});
