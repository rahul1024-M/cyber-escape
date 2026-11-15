
import type { NexusMentorProvider } from "@/game/nexusMentor";
import { getAiServerBindings } from "./cloudflareBindings.server";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const MAX_PROVIDER_RESPONSE_BYTES = 8192;

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const geminiNexusMentorProvider: NexusMentorProvider = {
  async generate(request, options): Promise<unknown> {
    const bindings = getAiServerBindings();
    const apiKey = bindings.GEMINI_API_KEY;

    if (!apiKey || !bindings.AI_ENABLED) {
      throw new Error("Gemini provider is not configured.");
    }

    const model = bindings.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;

    if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) {
      throw new Error("Invalid Gemini model configuration.");
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

    const responseText = await response.text();

    if (
      new TextEncoder().encode(responseText).byteLength >
      MAX_PROVIDER_RESPONSE_BYTES
    ) {
      throw new Error("Gemini response exceeded the permitted size.");
    }

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
    const parts = candidate?.content?.parts;

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

    return { text };
  },
};
