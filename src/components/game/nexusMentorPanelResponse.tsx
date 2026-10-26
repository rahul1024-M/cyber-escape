import type { MentorRequestState } from "./nexusMentorPanelLogic";

export function MentorTextResponse({
  source,
  text,
}: {
  source: MentorRequestState["source"];
  text: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <p className="font-mono text-[0.65rem] tracking-[0.15em] text-accent">
        {source === "live" ? "NEXUS MENTOR RESPONSE" : "SCRIPTED NEXUS RESPONSE"}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {text}
      </p>
    </div>
  );
}
