
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAiServerBindings } = vi.hoisted(() => ({
  getAiServerBindings: vi.fn(),
}));

vi.mock("./cloudflareBindings.server", () => ({
  getAiServerBindings,
}));

import { geminiNexusMentorProvider } from "./geminiProvider.server";

const testRequest = {
  sectorId: "sector-1",
  missionDescription: "Investigate a suspicious email.",
  stage: "analysis",
  mode: "hint",
  question: "How do I inspect the sender?",
} as unknown as Parameters<
  typeof geminiNexusMentorProvider.generate
>[0];

const testOptions = {
  signal: new AbortController().signal,
  maxOutputTokens: 384,
};

function successfulResponse(
  text = "Check the sender and reply domains.",
  usageOverrides: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 120,
        candidatesTokenCount: 18,
        thoughtsTokenCount: 0,
        totalTokenCount: 138,
        ...usageOverrides,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("Gemini NEXUS provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());

    getAiServerBindings.mockReturnValue({
      AI_ENABLED: true,
      GEMINI_API_KEY: "test-only-api-key",
      GEMINI_MODEL: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the default Gemini 3.1 Flash-Lite model and returns usage", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(successfulResponse());

    const result = await geminiNexusMentorProvider.generate(
      testRequest,
      testOptions,
    );

    expect(result).toEqual({
      text: "Check the sender and reply domains.",
      usage: {
        promptTokenCount: 120,
        candidatesTokenCount: 18,
        thoughtsTokenCount: 0,
        totalTokenCount: 138,
        cachedContentTokenCount: 0,
      },
    });

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstCall = fetchMock.mock.calls[0];

expect(firstCall).toBeDefined();

if (!firstCall) {
  throw new Error("Expected Gemini fetch to be called.");
}

const [url, init] = firstCall;

    expect(String(url)).toContain(
      "gemini-3.1-flash-lite:generateContent",
    );

    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(
      "test-only-api-key",
    );

    const body = JSON.parse(String(init?.body));

    expect(body.generationConfig.maxOutputTokens).toBe(384);
    expect(body.contents[0].parts[0].text).toContain(
      "Investigate a suspicious email.",
    );
    expect(body.contents[0].parts[0].text).toContain(
      "How do I inspect the sender?",
    );
  });

  it("uses the explicitly configured supported model", async () => {
    getAiServerBindings.mockReturnValue({
      AI_ENABLED: true,
      GEMINI_API_KEY: "test-only-api-key",
      GEMINI_MODEL: "gemini-3.1-flash-lite",
    });

    vi.mocked(globalThis.fetch).mockResolvedValue(successfulResponse());

    await geminiNexusMentorProvider.generate(
      testRequest,
      testOptions,
    );

    const firstCall = vi.mocked(globalThis.fetch).mock.calls[0];

expect(firstCall).toBeDefined();

if (!firstCall) {
  throw new Error("Expected Gemini fetch to be called.");
}

expect(String(firstCall[0])).toContain(
      "gemini-3.1-flash-lite:generateContent",
    );
  });

  it("fails when the API key is missing", async () => {
    getAiServerBindings.mockReturnValue({
      AI_ENABLED: true,
      GEMINI_API_KEY: undefined,
      GEMINI_MODEL: undefined,
    });

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow("Gemini provider is not configured.");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fails when AI is disabled", async () => {
    getAiServerBindings.mockReturnValue({
      AI_ENABLED: false,
      GEMINI_API_KEY: "test-only-api-key",
      GEMINI_MODEL: undefined,
    });

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow("Gemini provider is not configured.");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects an unsupported or unpriced model configuration", async () => {
    getAiServerBindings.mockReturnValue({
      AI_ENABLED: true,
      GEMINI_API_KEY: "test-only-api-key",
      GEMINI_MODEL: "gemini-test-model",
    });

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow("Unsupported Gemini model configuration.");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid output token limit", async () => {
    await expect(
      geminiNexusMentorProvider.generate(testRequest, {
        ...testOptions,
        maxOutputTokens: 385,
      }),
    ).rejects.toThrow("Invalid Gemini output token limit.");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON from Gemini", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("not-json", { status: 200 }),
    );

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow("Gemini returned an invalid response.");
  });

  it("rejects unsuccessful Gemini HTTP responses", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "Request rejected." },
        }),
        { status: 429 },
      ),
    );

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow("Gemini request failed with HTTP 429.");
  });

  it("rejects responses without candidate content", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow("Gemini did not complete the response normally.");
  });

  it("rejects an oversized provider response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("x".repeat(8193), { status: 200 }),
    );

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow(
      "Gemini response exceeded the permitted size.",
    );
  });

  it("rejects missing token usage metadata", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "A safe answer." }] },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow(
      "Gemini returned invalid token usage metadata.",
    );
  });

  it("rejects malformed token usage metadata", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      successfulResponse("A safe answer.", {
        promptTokenCount: -1,
      }),
    );

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow(
      "Gemini returned invalid token usage metadata.",
    );
  });

  it("rejects unexpected cached token usage", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      successfulResponse("A safe answer.", {
        cachedContentTokenCount: 10,
      }),
    );

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow(
      "Gemini returned invalid token usage metadata.",
    );
  });

  it("rejects responses that did not finish normally", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "Partial answer." }] },
              finishReason: "MAX_TOKENS",
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      geminiNexusMentorProvider.generate(testRequest, testOptions),
    ).rejects.toThrow(
      "Gemini did not complete the response normally.",
    );
  });
});
