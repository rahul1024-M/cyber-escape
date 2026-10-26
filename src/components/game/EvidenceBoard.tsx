import {
  EMPTY_EVIDENCE_BOARD_STATE,
  evaluateEvidenceBoard,
  isEvidenceBoardDataValid,
} from "@/game/evidenceBoard";
import type { EvidenceBoardAction } from "@/game/evidenceBoard";
import type { EvidenceBoardData, EvidenceBoardState } from "@/game/types";
import { cn } from "@/lib/utils";
import { Btn } from "./Hud";

export function EvidenceBoard({
  data,
  state,
  answered,
  submit,
  update,
}: {
  data: EvidenceBoardData;
  state: EvidenceBoardState | undefined;
  answered: { correct: boolean; chosen: string } | null;
  submit: (conclusion: string) => void;
  update: (action: EvidenceBoardAction) => void;
}) {
  if (!isEvidenceBoardDataValid(data)) {
    return (
      <p role="alert" className="mt-4 rounded-md border border-destructive p-3 font-mono text-sm text-destructive">
        EVIDENCE SET UNAVAILABLE · This training case is incomplete.
      </p>
    );
  }

  const board = state ?? EMPTY_EVIDENCE_BOARD_STATE;
  const feedback = answered
    ? evaluateEvidenceBoard(data, board, answered.chosen)
    : null;
  const labelFor = (id: string) => data.items.find((item) => item.id === id)?.label ?? "Unknown evidence";

  return (
    <div className="mt-4 space-y-5">
      <p className="rounded-md border border-accent/40 bg-accent/5 p-3 font-mono text-xs text-accent">
        FICTIONAL EVIDENCE · AUTHORIZED TRAINING SIMULATION · NO REAL SYSTEMS
      </p>

      <section aria-labelledby="evidence-items-heading">
        <h3 id="evidence-items-heading" className="mb-2 font-display text-sm text-primary">
          CASE FILES · OPEN TO INSPECT
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.items.map((item) => {
            const isOpen = board.openedEvidenceIds.includes(item.id);
            const isImportant = board.importantEvidenceIds.includes(item.id);
            const isSelected = board.selectedEvidenceIds.includes(item.id);
            return (
              <article
                key={item.id}
                className={cn(
                  "rounded-md border bg-background/60 p-3",
                  isSelected ? "border-primary" : "border-border",
                )}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => update({ type: "toggle-open", id: item.id })}
                  className="tap-target w-full text-left"
                >
                  <span className="block font-mono text-xs text-accent">{item.kind} · {item.timestamp}</span>
                  <span className="mt-1 block font-display text-sm">{item.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{item.summary}</span>
                </button>
                {isOpen && (
                  <p className="mt-2 border-t border-border pt-2 text-sm leading-relaxed">
                    {item.details}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={isImportant}
                    disabled={!!answered}
                    onClick={() => update({ type: "toggle-important", id: item.id })}
                    className={cn(
                      "tap-target rounded border px-3 py-2 font-mono text-xs",
                      isImportant ? "border-warning text-warning" : "border-border text-muted-foreground",
                    )}
                  >
                    {isImportant ? "★ IMPORTANT" : "MARK IMPORTANT"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    disabled={!!answered}
                    onClick={() => update({ type: "select", id: item.id })}
                    className={cn(
                      "tap-target rounded border px-3 py-2 font-mono text-xs",
                      isSelected ? "border-primary text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    {isSelected ? "SELECTED FOR LINK" : "SELECT TO LINK"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="timeline-heading" className="rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="timeline-heading" className="font-display text-sm text-primary">SUSPECTED TIMELINE</h3>
            <p className="mt-1 text-xs text-muted-foreground">Select two records in order, then connect the first to the second.</p>
          </div>
          <Btn
            variant="ghost"
            onClick={() => update({ type: "connect" })}
            disabled={!!answered || board.selectedEvidenceIds.length !== 2}
          >
            CONNECT SELECTED
          </Btn>
        </div>
        <ol className="mt-3 space-y-2">
          {board.connections.length === 0 && (
            <li className="font-mono text-sm text-muted-foreground">No records connected yet.</li>
          )}
          {board.connections.map((link) => {
            const correctLink = data.expectedConnections.some(
              (expected) => expected.from === link.from && expected.to === link.to,
            );
            return (
              <li key={`${link.from}-${link.to}`} className="flex flex-wrap items-center gap-2 rounded border border-border p-2 text-sm">
                <span>{labelFor(link.from)}</span>
                <span aria-label="leads to" className="font-mono text-primary">→</span>
                <span>{labelFor(link.to)}</span>
                {feedback && (
                  <span className={cn("ml-auto font-mono text-xs", correctLink ? "text-success" : "text-destructive")}>
                    {correctLink ? "CORRECT LINK" : "INCORRECT LINK"}
                  </span>
                )}
                {!answered && (
                  <button
                    type="button"
                    aria-label={`Remove link from ${labelFor(link.from)} to ${labelFor(link.to)}`}
                    onClick={() => update({ type: "remove-connection", from: link.from, to: link.to })}
                    className="tap-target rounded border border-border px-2 font-mono text-xs text-muted-foreground hover:text-destructive"
                  >
                    REMOVE
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <fieldset disabled={!!answered} className="space-y-2">
        <legend className="mb-2 font-display text-sm text-primary">INVESTIGATION CONCLUSION</legend>
        {data.conclusions.map((conclusion) => (
          <label key={conclusion.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
            <input
              type="radio"
              name="evidence-conclusion"
              value={conclusion.id}
              checked={board.conclusion === conclusion.id}
              onChange={() => update({ type: "set-conclusion", id: conclusion.id })}
              className="mt-1 h-4 w-4 accent-[var(--primary)]"
            />
            <span>{conclusion.label}</span>
          </label>
        ))}
      </fieldset>
      {!answered && (
        <Btn
          className="w-full sm:w-auto"
          disabled={!board.conclusion}
          onClick={() => submit(board.conclusion)}
        >
          SUBMIT INVESTIGATION
        </Btn>
      )}

      {feedback && (
        <section aria-live="polite" className="rounded-md border border-border p-3">
          <h3 className={cn("font-display text-sm", feedback.correct ? "text-success" : "text-destructive")}>
            {feedback.correct ? "CASE CONCLUSION SUPPORTED" : "INVESTIGATION NEEDS REVISION"}
          </h3>
          <p className="mt-2 text-sm">
            Correct connections: {feedback.correctConnections}/{feedback.totalConnections}.
            {" "}Relevant evidence marked: {feedback.correctlyMarked}/{feedback.totalRelevant}.
            {" "}Conclusion: {feedback.conclusionCorrect ? "supported." : "not supported."}
          </p>
          {feedback.incorrectConnections.length > 0 && (
            <p className="mt-2 text-sm text-destructive">
              Incorrect links: {feedback.incorrectConnections.map((link) => `${labelFor(link.from)} → ${labelFor(link.to)}`).join("; ")}.
            </p>
          )}
          {feedback.missingConnections.length > 0 && (
            <p className="mt-1 text-sm text-warning">
              Missing sequence links: {feedback.missingConnections.map((link) => `${labelFor(link.from)} → ${labelFor(link.to)}`).join("; ")}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
