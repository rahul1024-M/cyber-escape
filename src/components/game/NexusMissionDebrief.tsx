import { useEffect, useMemo, useRef, useState } from "react";
import { isEnabled } from "@/game/flags";
import { requestNexusMentor } from "@/game/nexusMentor.functions";
import {
  buildMissionDebriefRequest,
  getScriptedMissionDebrief,
  type MissionAttempt,
} from "@/game/missionDebrief";
import {
  EMPTY_MENTOR_STATE,
  requestMentorResponse,
  type MentorRequestState,
} from "./nexusMentorPanelLogic";
import { MentorTextResponse } from "./nexusMentorPanelResponse";

export interface NexusMissionDebriefProps {
  levelId: number;
  missionDescription: string;
  attempts: readonly MissionAttempt[];
}

export function NexusMissionDebrief({
  levelId,
  missionDescription,
  attempts,
}: NexusMissionDebriefProps) {
  const aiEnabled = isEnabled("ENABLE_AI");
  const request = useMemo(
    () => buildMissionDebriefRequest(levelId, missionDescription, attempts),
    [levelId, missionDescription, attempts],
  );
  const [scriptedText, setScriptedText] = useState("");
  const [state, setState] = useState<MentorRequestState>(EMPTY_MENTOR_STATE);
  const requestLock = useRef({ current: false });
  const mounted = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    setScriptedText("");
    setState(EMPTY_MENTOR_STATE);
    void getScriptedMissionDebrief(attempts)
      .then((text) => {
        if (active) setScriptedText(text);
      })
      .catch(() => {
        if (active) {
          setScriptedText(
            "SCRIPTED NEXUS DEBRIEF · NO LIVE AI\nReview the defensive concepts you practised and choose one to revisit.",
          );
        }
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [attempts]);

  const submit = () => {
    if (!aiEnabled || !request) return;
    void requestMentorResponse({
      aiEnabled,
      request,
      fallback: () => getScriptedMissionDebrief(attempts),
      sendRequest: requestNexusMentor,
      inFlight: requestLock.current,
      setState: (nextState) => {
        if (mounted.current) setState(nextState);
      },
    });
  };

  const text = state.status === "response" || state.status === "error" ? state.text : scriptedText;
  const source = state.status === "response" ? state.source : "scripted";

  return (
    <section
      aria-labelledby="nexus-learning-debrief"
      className="mt-6 rounded-md border border-primary/30 bg-background/50 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent">
            NEXUS · POST-MISSION LEARNING
          </p>
          <h2 id="nexus-learning-debrief" className="mt-1 font-display text-lg text-primary">
            Your defensive learning debrief
          </h2>
        </div>
        {aiEnabled && request && (
          <button
            type="button"
            disabled={state.status === "loading"}
            onClick={submit}
            className="tap-target rounded-md border border-primary px-3 py-2 font-display text-xs text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.status === "loading"
              ? "ASKING NEXUS…"
              : state.status === "error"
                ? "RETRY AI DEBRIEF"
                : "ASK NEXUS"}
          </button>
        )}
      </div>
      {!aiEnabled && (
        <p className="mt-3 font-mono text-xs text-warning">AI DISABLED · SCRIPTED DEBRIEF</p>
      )}
      {state.status === "loading" && (
        <p role="status" className="mt-3 font-mono text-xs text-muted-foreground">
          NEXUS is preparing an optional response. Your mission is already complete.
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="mt-3 font-mono text-xs text-destructive">
          {state.error} Your mission rewards and completion are unaffected.
        </p>
      )}
      {text ? (
        <div className="mt-3" aria-live="polite">
          <MentorTextResponse source={source ?? "scripted"} text={text} />
        </div>
      ) : (
        <p role="status" className="mt-3 font-mono text-sm text-muted-foreground">
          Preparing your scripted learning notes…
        </p>
      )}
    </section>
  );
}
