import { getRequest } from "@tanstack/react-start/server";

export type DurableObjectIdLike = object;

export interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

export interface AiCloudflareBindings {
  AI_QUOTA_COORDINATOR: DurableObjectNamespaceLike;
  AI_ENABLED: boolean;
  AI_MAX_REQUEST_COST_USD: string;
  AI_MAX_GLOBAL_CONCURRENT: string;
  GUEST_SESSIONS_ENABLED: boolean;
  SUPABASE_URL?: string | undefined;
SUPABASE_PUBLISHABLE_KEY?: string | undefined;
  GUEST_SESSION_AUDIENCE?: string | undefined;
  GUEST_SESSION_ENVIRONMENT?: string | undefined;
  GUEST_SESSION_APP_ORIGIN?: string | undefined;
  GUEST_SESSION_SIGNING_SECRET?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL?: string | undefined;
  TURNSTILE_SECRET_KEY?: string | undefined;
  TURNSTILE_EXPECTED_HOSTNAME?: string | undefined;
  TURNSTILE_EXPECTED_ACTION?: string | undefined;
  TURNSTILE_RENEW_EXPECTED_ACTION?: string | undefined;
  TURNSTILE_SITE_KEY?: string | undefined;
}

export class AiCloudflareBindingsError extends Error {
  constructor() {
    super("Required server runtime bindings are unavailable.");
    this.name = "AiCloudflareBindingsError";
  }
}

export function getAiServerBindings(): AiCloudflareBindings {
  return getAiCloudflareBindings(getRequest());
}

export function getAiCloudflareBindings(request: Request): AiCloudflareBindings {
  if (!("runtime" in request)) throw new AiCloudflareBindingsError();
  const runtime = asRecord(request.runtime);
  const cloudflare = asRecord(runtime?.["cloudflare"]);
  const env = asRecord(cloudflare?.["env"]);
  if (!env) throw new AiCloudflareBindingsError();

  const namespace = env["AI_QUOTA_COORDINATOR"];
  if (!isDurableObjectNamespace(namespace)) throw new AiCloudflareBindingsError();

  const aiEnabled = env["AI_ENABLED"];
  const maxRequestCostUsd = env["AI_MAX_REQUEST_COST_USD"];
  const maxGlobalConcurrent = env["AI_MAX_GLOBAL_CONCURRENT"];
  const guestSessionsEnabled = env["GUEST_SESSIONS_ENABLED"];
  if (
    (aiEnabled !== "true" && aiEnabled !== "false") ||
    (guestSessionsEnabled !== undefined &&
      guestSessionsEnabled !== "true" &&
      guestSessionsEnabled !== "false") ||
    typeof maxRequestCostUsd !== "string" ||
    typeof maxGlobalConcurrent !== "string"
  ) {
    throw new AiCloudflareBindingsError();
  }

  return {
    AI_QUOTA_COORDINATOR: namespace,
    AI_ENABLED: aiEnabled === "true",
    AI_MAX_REQUEST_COST_USD: maxRequestCostUsd,
    AI_MAX_GLOBAL_CONCURRENT: maxGlobalConcurrent,
    GUEST_SESSIONS_ENABLED: guestSessionsEnabled === "true",
    SUPABASE_URL: optionalConfiguration(env["SUPABASE_URL"]),
    SUPABASE_PUBLISHABLE_KEY: optionalConfiguration(
       env["SUPABASE_PUBLISHABLE_KEY"],
    ),
    GUEST_SESSION_AUDIENCE: optionalConfiguration(env["GUEST_SESSION_AUDIENCE"]),
    GUEST_SESSION_ENVIRONMENT: optionalConfiguration(env["GUEST_SESSION_ENVIRONMENT"]),
    GUEST_SESSION_APP_ORIGIN: optionalConfiguration(env["GUEST_SESSION_APP_ORIGIN"]),
    GUEST_SESSION_SIGNING_SECRET: optionalSecret(env["GUEST_SESSION_SIGNING_SECRET"]),
    GEMINI_API_KEY: optionalSecret(env["GEMINI_API_KEY"]),
    GEMINI_MODEL: optionalConfiguration(env["GEMINI_MODEL"]),
    TURNSTILE_SECRET_KEY: optionalSecret(env["TURNSTILE_SECRET_KEY"]),
    TURNSTILE_EXPECTED_HOSTNAME: optionalConfiguration(env["TURNSTILE_EXPECTED_HOSTNAME"]),
    TURNSTILE_EXPECTED_ACTION: optionalConfiguration(env["TURNSTILE_EXPECTED_ACTION"]),
    TURNSTILE_RENEW_EXPECTED_ACTION: optionalConfiguration(env["TURNSTILE_RENEW_EXPECTED_ACTION"]),
    TURNSTILE_SITE_KEY: optionalConfiguration(env["TURNSTILE_SITE_KEY"]),
  };
}

function optionalConfiguration(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new AiCloudflareBindingsError();
  return value;
}

function optionalSecret(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new AiCloudflareBindingsError();
  return value;
}

function isDurableObjectNamespace(value: unknown): value is DurableObjectNamespaceLike {
  const record = asRecord(value);
  return (
    record !== undefined &&
    typeof record["idFromName"] === "function" &&
    typeof record["get"] === "function"
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
