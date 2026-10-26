import { useEffect, useRef, useState } from "react";
import type { NexusMentorRequest, NexusMentorResponse } from "@/game/nexusMentor";
import { requestNexusMentor } from "@/game/nexusMentor.functions";
import type { Challenge } from "@/game/types";
import { isEnabled } from "@/game/flags";
import {
  createMentorRequest,
  EMPTY_MENTOR_STATE,
  getScriptedMentorText,
  requestMentorResponse,
  type MentorPanelContext,
  type MentorPanelMode,
  type MentorRequestState,
} from "./nexusMentorPanelLogic";
import { MentorTextResponse } from "./nexusMentorPanelResponse";

export interface NexusMentorPanelProps {
  levelId: number;
  missionDescription: string;
  challenge: Challenge;
  answeredCorrect: boolean | null;
  health: number;
  correctAnswers: number;
  mistakes: number;
  hintsUsed: number;
  streak: number;
  missionsCompleted: number;
  aiEnabled?: boolean;
  sendRequest?: (request: NexusMentorRequest) => Promise<NexusMentorResponse>;
}

export function NexusMentorPanel({
  levelId,
  missionDescription,
  challenge,
  answeredCorrect,
  health,
  correctAnswers,
  mistakes,
  hintsUsed,
  streak,
  missionsCompleted,
  aiEnabled = isEnabled("ENABLE_AI"),
  sendRequest = requestNexusMentor,
}: NexusMentorPanelProps) {
  const [mode, setMode] = useState<MentorPanelMode>("explanation");
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<MentorRequestState>(EMPTY_MENTOR_STATE);
  const requestLock = useRef({ current: false });
  const requestGeneration = useRef(0);
  useEffect(() => {
    requestGeneration.current += 1;
    requestLock.current = { current: false };
    setMode("explanation");
    setQuestion("");
    setState(EMPTY_MENTOR_STATE);
  }, [challenge.id]);
  const context: MentorPanelContext = {
    levelId,
    health,
    answeredCorrect,
    correctAnswers,
    mistakes,
    hintsUsed,
    streak,
    missionsCompleted,
  };
  const request = createMentorRequest(levelId, missionDescription, question, mode);

  const submit = () => {
    if (!request) return;
    const generation = requestGeneration.current;
    void requestMentorResponse({
      aiEnabled,
      request,
      fallback: () => getScriptedMentorText(mode, challenge, context, challenge.levelId),
      sendRequest,
      inFlight: requestLock.current,
      setState: (nextState) => {
        if (generation === requestGeneration.current) setState(nextState);
      },
    });
  };

  return (
    <details className="panel mt-5 overflow-hidden border border-primary/30">
      <summary className="tap-target cursor-pointer px-4 py-3 font-display text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        NEXUS MENTOR · OPTIONAL
      </summary>
      <section aria-label="NEXUS Mentor" className="border-t border-border p-4">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">NEXUS · TRAINING MENTOR</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask about this fictional mission. Mentor guidance is separate from paid gameplay hints.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-3">
            <label
              className="block font-mono text-xs text-muted-foreground"
              htmlFor={`mentor-mode-${challenge.id}`}
            >
              RESPONSE MODE
            </label>
            <select
              id={`mentor-mode-${challenge.id}`}
              value={mode}
              onChange={(event) => setMode(event.target.value as MentorPanelMode)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="explanation">Explain a concept</option>
              <option value="teaching_hint">Teaching hint</option>
              <option value="mission_question">Ask a mission question</option>
            </select>
            <label
              className="block font-mono text-xs text-muted-foreground"
              htmlFor={`mentor-question-${challenge.id}`}
            >
              YOUR QUESTION
            </label>
            <textarea
              id={`mentor-question-${challenge.id}`}
              value={question}
              onChange={(event) => setQuestion(event.target.value.slice(0, 400))}
              maxLength={400}
              rows={2}
              placeholder="Ask about a defensive security concept…"
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="button"
            disabled={!request || state.status === "loading"}
            onClick={submit}
            className="tap-target self-end rounded-md border border-primary px-4 py-2 font-display text-xs text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.status === "loading" ? "ASKING…" : "ASK NEXUS"}
          </button>
        </div>
        <div aria-live="polite" aria-atomic="true" className="mt-4">
          {state.status === "loading" && (
            <p role="status" className="font-mono text-sm text-muted-foreground">
              NEXUS is considering the mission context…
            </p>
          )}
          {state.status === "error" && (
            <div role="alert" className="rounded-md border border-destructive/40 p-3">
              <p className="font-mono text-sm text-destructive">{state.error}</p>
              <button
                type="button"
                onClick={submit}
                className="tap-target mt-2 rounded px-2 font-mono text-xs text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                RETRY
              </button>
            </div>
          )}
          {state.status === "response" && (
            <>
              {state.source === "scripted" && (
                <p className="mb-2 font-mono text-xs text-warning">
                  {aiEnabled
                    ? "LIVE AI UNAVAILABLE · SCRIPTED MODE"
                    : "AI DISABLED · SCRIPTED MODE"}
                </p>
              )}
              <MentorTextResponse source={state.source} text={state.text} />
            </>
          )}
          {state.status === "error" && (
            <div className="mt-3">
              <MentorTextResponse source="scripted" text={state.text} />
            </div>
          )}
        </div>
      </section>
    </details>
  );
}
