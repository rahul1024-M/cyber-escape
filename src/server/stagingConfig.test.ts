import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("isolated Cloudflare staging configuration", () => {
  it("declares only staging Worker resources and a SQLite quota coordinator", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../wrangler.staging.json", import.meta.url), "utf8"),
    ) as {
      name: string;
      main: string;
      compatibility_flags: string[];
      assets: { binding: string; directory: string };
      durable_objects: { bindings: Array<{ name: string; class_name: string }> };
      exports: Record<string, { type: string; storage: string }>;
      vars: Record<string, string>;
      routes?: unknown;
      account_id?: unknown;
    };
    expect(config.name).toMatch(/-staging$/);
    expect(config.main).toBe("worker.staging.mjs");
    expect(config.compatibility_flags).toContain("nodejs_compat");
    expect(config.assets).toEqual({ binding: "ASSETS", directory: ".output/public" });
    expect(config.durable_objects.bindings).toEqual([
      { name: "AI_QUOTA_COORDINATOR", class_name: "AiQuotaCoordinator" },
    ]);
    expect(config.exports["AiQuotaCoordinator"]).toEqual({
      type: "durable-object",
      storage: "sqlite",
    });
    expect(config.vars["AI_ENABLED"]).toBe("false");
    expect(config.vars["GUEST_SESSIONS_ENABLED"]).toBe("false");
    expect(config.vars["GUEST_SESSION_ENVIRONMENT"]).toBe("staging");
    expect(config.vars["GUEST_SESSION_AUDIENCE"]).toBe("cyber-escape-staging");
    expect(config.vars["TURNSTILE_EXPECTED_ACTION"]).toBe("guest_session_create");
    expect(config.vars["TURNSTILE_RENEW_EXPECTED_ACTION"]).toBe("guest_session_renew");
    expect(config.vars).not.toHaveProperty("TURNSTILE_EXPECTED_HOSTNAME");
    expect(config.vars).not.toHaveProperty("TURNSTILE_SITE_KEY");
    expect(config.vars).not.toHaveProperty("TURNSTILE_SECRET_KEY");
    expect(config.vars).not.toHaveProperty("GUEST_SESSION_APP_ORIGIN");
    expect(config).not.toHaveProperty("routes");
    expect(config).not.toHaveProperty("account_id");
  });
});
