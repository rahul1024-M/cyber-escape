import { createServerFn } from "@tanstack/react-start";
import { handleNexusMentorJson, validateNexusMentorRequest } from "./nexusMentor";
import type { NexusMentorRequest, NexusMentorResponse } from "./nexusMentor";

const postNexusMentorRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<NexusMentorResponse> => {
    const { getNexusMentorDependencies, getNexusMentorRequestContentLength } =
      await import("./nexusMentor.server");
    return handleNexusMentorJson(
      data,
      getNexusMentorDependencies(),
      getNexusMentorRequestContentLength(),
    );
  });

export async function requestNexusMentor(
  request: NexusMentorRequest,
): Promise<NexusMentorResponse> {
  const validated = validateNexusMentorRequest(request);
  if (!validated) return { ok: false, error: "invalid_request" };
  return postNexusMentorRequest({ data: JSON.stringify(validated) });
}
