import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NexusAiCore } from "./NexusAiCore";

describe("NEXUS AI core visual", () => {
  it.each(["reconnaissance", "containment", "recovery"] as const)(
    "uses the current %s encounter phase and retains a CSS fallback",
    (phase) => {
      const html = renderToStaticMarkup(<NexusAiCore phase={phase} feedback={null} />);

      expect(html).toContain(`data-phase="${phase}"`);
      expect(html).toContain('data-renderer="checking"');
      expect(html).toContain("nexus-ai-core-fallback");
      expect(html).toContain("NEXUS / CORE");
      expect(html).toContain('aria-hidden="true"');
    },
  );

  it.each([
    ["correct", 'data-feedback="correct"'],
    ["incorrect", 'data-feedback="incorrect"'],
  ] as const)("exposes transient %s answer feedback to the visual", (feedback, expected) => {
    const html = renderToStaticMarkup(<NexusAiCore phase="containment" feedback={feedback} />);

    expect(html).toContain(expected);
    expect(html).toContain("nexus-ai-core-fallback");
  });
});
