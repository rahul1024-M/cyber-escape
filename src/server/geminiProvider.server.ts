
import type { NexusMentorProvider } from "@/game/nexusMentor";
import { getAiServerBindings } from "./cloudflareBindings.server";

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_API_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/";

const MAX_PROVIDER_RESPONSE_BYTES = 8192;
const MAX_ALLOWED_OUTPUT_TOKENS = 384;

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiUsageMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isTokenCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function validateUsageMetadata(
  value: unknown,
): GeminiUsageMetadata | null {
  if (!isRecord(value)) return null;

  const prompt = value["promptTokenCount"];
  const candidates = value["candidatesTokenCount"];
  const total = value["totalTokenCount"];
  const thoughts = value["thoughtsTokenCount"] ?? 0;
  const cached = value["cachedContentTokenCount"] ?? 0;

  if (
    !isTokenCount(prompt) ||
    !isTokenCount(candidates) ||
    !isTokenCount(total) ||
    !isTokenCount(thoughts) ||
    !isTokenCount(cached)
  ) {
    return null;
  }

  if (cached !== 0) return null;

  if (total < prompt + candidates + thoughts) {
    return null;
  }

  return {
    promptTokenCount: prompt,
    candidatesTokenCount: candidates,
    totalTokenCount: total,
    thoughtsTokenCount: thoughts,
    cachedContentTokenCount: cached,
  };
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes) {
      throw new Error("Gemini response exceeded the permitted size.");
    }
  }

  if (!response.body) {
    throw new Error("Gemini returned an empty response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      bytesRead += value.byteLength;

      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new Error(
          "Gemini response exceeded the permitted size.",
        );
      }

      result += decoder.decode(value, { stream: true });
    }

    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

export const geminiNexusMentorProvider: NexusMentorProvider = {
  async generate(request, options): Promise<unknown> {
    const bindings = getAiServerBindings();
    const apiKey = bindings.GEMINI_API_KEY;

    if (!apiKey || !bindings.AI_ENABLED) {
      throw new Error("Gemini provider is not configured.");
    }

    const model = bindings.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;

    if (model !== DEFAULT_GEMINI_MODEL) {
      throw new Error("Unsupported Gemini model configuration.");
    }

    if (
      !Number.isSafeInteger(options.maxOutputTokens) ||
      options.maxOutputTokens < 1 ||
      options.maxOutputTokens > MAX_ALLOWED_OUTPUT_TOKENS
    ) {
      throw new Error("Invalid Gemini output token limit.");
    }

    const endpoint =
      `${GEMINI_API_BASE_URL}${encodeURIComponent(model)}:generateContent`;

    const prompt = [
      "You are NEXUS, a cybersecurity mission mentor in the Cyber Escape game.",
      "Give safe, educational cybersecurity guidance.",
      "Do not provide instructions for real-world unauthorized access, malware, credential theft, or evasion.",
      "Keep answers concise, practical, and appropriate to the mission stage.",
      `Sector: ${request.sectorId}`,
      `Mission description: ${request.missionDescription}`,
      `Mission stage: ${request.stage}`,
      `Mentor mode: ${request.mode}`,
      `Player question: ${request.question}`,
      "Return plain text only. Do not return JSON or markdown code fences.",
    ].join("\n");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: options.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: options.maxOutputTokens,
          temperature: 0.4,
        },
      }),
    });

    const responseText = await readBoundedResponse(
      response,
      MAX_PROVIDER_RESPONSE_BYTES,
    );

    let payload: unknown;

    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error("Gemini returned an invalid response.");
    }

    if (!response.ok) {
      throw new Error(
        `Gemini request failed with HTTP ${response.status}.`,
      );
    }

    if (!isRecord(payload)) {
      throw new Error("Gemini response has an invalid structure.");
    }

    const data = payload as GeminiGenerateResponse;
    const candidate = data.candidates?.[0];

    if (!candidate || candidate.finishReason !== "STOP") {
      throw new Error("Gemini did not complete the response normally.");
    }

    const parts = candidate.content?.parts;

    if (!Array.isArray(parts)) {
      throw new Error("Gemini returned no response content.");
    }

    const text = parts
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!text) {
      throw new Error("Gemini returned empty response content.");
    }

    const usage = validateUsageMetadata(data.usageMetadata);

    if (!usage) {
      throw new Error("Gemini returned invalid token usage metadata.");
    }

    return {
      text,
      usage,
    };
  },
};
