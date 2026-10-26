import { useGame } from "@/game/GameProvider";
import {
  CYBER_RANGE_LABS,
} from "@/game/cyberRange";
import { Btn } from "./Hud";
import { cn } from "@/lib/utils";

export function CyberRangeHub() {
  const { cyberRangeProgress, startCyberRangeLab, reviewCyberRangeLab, go } = useGame();
  const completedCount = Object.keys(cyberRangeProgress.completions).length;
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.35em] text-accent">AUTHORIZED SIMULATION // OFFLINE READY</p>
          <h1 className="mt-2 font-display text-3xl text-primary sm:text-4xl">CYBER RANGE</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Practice forensic analysis and incident response using fictional, isolated training data.
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface/60 p-3 text-right">
          <p className="font-mono text-xs text-muted-foreground">LAB SCORE · NOT LEADERBOARD SCORE</p>
          <p className="font-display text-2xl text-accent">{cyberRangeProgress.totalScore}</p>
          <p className="font-mono text-xs text-muted-foreground">{completedCount}/{CYBER_RANGE_LABS.length} COMPLETE</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {CYBER_RANGE_LABS.map((lab) => {
          const completion = cyberRangeProgress.completions[lab.id];
          const active = cyberRangeProgress.active?.labId === lab.id;
          const anotherActive = Boolean(cyberRangeProgress.active && !active);
          return (
            <article key={lab.id} className="panel flex flex-col p-4 sm:p-5">
              <p className="font-mono text-[0.65rem] tracking-[0.25em] text-accent">{lab.category}</p>
              <h2 className="mt-2 font-display text-xl">{lab.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{lab.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 font-mono text-xs">
                <span className="rounded border border-border px-2 py-1">{lab.difficulty}</span>
                <span className="rounded border border-border px-2 py-1">~{lab.durationMinutes} MIN</span>
                <span className={cn("rounded border px-2 py-1", completion ? "border-success text-success" : "border-border text-muted-foreground")}>
                  {completion ? "COMPLETE" : active ? `IN PROGRESS · TASK ${(cyberRangeProgress.active?.taskIndex ?? 0) + 1}/${lab.tasks.length}` : "NOT STARTED"}
                </span>
              </div>
              {completion && (
                <p className="mt-3 font-mono text-xs text-success">
                  EARNED LAB SCORE {completion.score} · {completion.hintsUsed} HINTS
                </p>
              )}
              <Btn
                className="mt-4 w-full"
                disabled={anotherActive}
                onClick={() => completion ? reviewCyberRangeLab(lab.id) : startCyberRangeLab(lab.id)}
              >
                {completion ? "VIEW TRAINING REPORT" : active ? "RESUME LAB" : anotherActive ? "ANOTHER LAB IN PROGRESS" : "ENTER LAB"}
              </Btn>
            </article>
          );
        })}
      </div>
      <Btn variant="ghost" className="mt-5" onClick={() => go("menu")}>BACK TO MAIN MENU</Btn>
    </div>
  );
}

export function CyberRangeLabScreen() {
  const {
    cyberRangeProgress,
    player,
    selectedCyberRangeLabId,
    updateCyberRangeFilter,
    inspectCyberRangeArtifact,
    toggleCyberRangeSelection,
    setCyberRangeDraft,
    appendCyberRangeSequence,
    resetCyberRangeSequence,
    buyCyberRangeHint,
    submitCyberRangeTask,
    exitCyberRangeLab,
  } = useGame();
  const active = cyberRangeProgress.active;
  const lab = CYBER_RANGE_LABS.find((item) => item.id === (active?.labId || selectedCyberRangeLabId));
  if (!lab) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p role="alert" className="rounded border border-warning p-4 text-warning">
          No active lab was found. Your completed lab records remain saved.
        </p>
        <Btn className="mt-4" variant="ghost" onClick={exitCyberRangeLab}>RETURN TO RANGE HUB</Btn>
      </div>
    );
  }

  const completion = cyberRangeProgress.completions[lab.id];
  if (!active && completion) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <section className="panel p-5 sm:p-7">
          <p className="font-mono text-xs tracking-[0.3em] text-success">TRAINING REPORT · SIMULATION ONLY</p>
          <h1 className="my-3 font-display text-3xl text-primary">{lab.title} COMPLETE</h1>
          <p className="text-muted-foreground">
            {lab.finalReport}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            All {lab.tasks.length} tasks complete. Lab score is recorded separately from the global leaderboard.
          </p>
          <div className="my-5 grid grid-cols-2 gap-3">
            <Stat label="LAB SCORE" value={completion.score} />
            <Stat label="HINTS USED" value={completion.hintsUsed} />
            <Stat label="XP EARNED" value={lab.rewardXp} />
            <Stat label="COINS EARNED" value={lab.rewardCoins} />
          </div>
          {lab.id === "incident-response" && (
            <div className="rounded-md border border-border bg-background p-4">
              <h2 className="font-display text-sm text-accent">FINAL INCIDENT REPORT</h2>
              <p className="mt-2 text-sm text-muted-foreground">{lab.finalReport}</p>
            </div>
          )}
          {lab.id === "crypto-fundamentals" && (
            <p className="mt-4 rounded-md border border-warning/40 p-3 text-sm text-warning">
              Training note: Caesar shifts and Base64 are educational examples only. They do not provide real security.
            </p>
          )}
          <Btn className="mt-5" onClick={exitCyberRangeLab}>RETURN TO RANGE HUB</Btn>
        </section>
      </div>
    );
  }
  if (!active) return null;
  const task = lab.tasks[active.taskIndex];
  if (!task) return null;
  const result = active.lastEvaluation;
  const filteredArtifacts = lab.artifacts.filter((artifact) =>
    `${artifact.label} ${artifact.kind} ${artifact.details} ${artifact.timestamp ?? ""}`
      .toLowerCase()
      .includes(active.filter.toLowerCase()),
  );
  const canSubmit = task.mode === "select"
    ? active.selectedIds.length > 0
    : task.mode === "sequence"
      ? active.sequence.length === task.options?.length
      : active.draft.trim().length > 0;

  const handleSubmit = () => {
    submitCyberRangeTask();
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-accent">{lab.category} · FICTIONAL TRAINING DATA</p>
          <h1 className="mt-1 font-display text-2xl text-primary">{lab.title}</h1>
        </div>
        <p className="font-mono text-xs text-muted-foreground">TASK {active.taskIndex + 1}/{lab.tasks.length} · HINTS {active.hintsUsed}</p>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-label="Lab task progress" aria-valuemin={0} aria-valuemax={lab.tasks.length} aria-valuenow={active.taskIndex}>
        <div className="h-full bg-primary transition-all" style={{ width: `${(active.taskIndex / lab.tasks.length) * 100}%` }} />
      </div>
      <section className="panel p-4 sm:p-6">
        {lab.artifacts.length > 0 && (
          <div className="mb-5 rounded-md border border-border bg-background p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm text-accent">FICTIONAL EVIDENCE</h2>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Filter
                <input
                  value={active.filter}
                  onChange={(event) => updateCyberRangeFilter(event.target.value)}
                  aria-label="Filter lab evidence"
                  className="min-h-10 w-40 rounded border border-input bg-background px-2"
                  placeholder="search evidence"
                />
              </label>
            </div>
            <div className="space-y-2">
              {filteredArtifacts.map((artifact) => {
                const inspected = active.inspectedArtifactIds.includes(artifact.id);
                return (
                  <details key={artifact.id} className="rounded border border-border p-3">
                    <summary
                      onClick={() => inspectCyberRangeArtifact(artifact.id)}
                      className="cursor-pointer font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {artifact.timestamp && <span className="mr-2 text-accent">{artifact.timestamp}</span>}
                      {artifact.label} · {artifact.kind}
                      <span className={cn("ml-2 text-xs", inspected ? "text-success" : "text-muted-foreground")}>
                        {inspected ? "INSPECTED" : "OPEN TO INSPECT"}
                      </span>
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground">{artifact.details}</p>
                  </details>
                );
              })}
              {!filteredArtifacts.length && <p className="text-sm text-muted-foreground">No matching evidence entries.</p>}
            </div>
          </div>
        )}
        <p className="font-mono text-xs text-muted-foreground">{task.id.replaceAll("-", " ").toUpperCase()}</p>
        <h2 className="mt-2 text-lg font-semibold">{task.prompt}</h2>
        {lab.id === "crypto-fundamentals" && (
          <p className="mt-3 rounded border border-warning/40 p-3 text-sm text-warning">
            Educational samples only. Caesar ciphers are insecure toy examples; Base64 is encoding, not encryption.
          </p>
        )}

        {task.mode === "select" && (
          <div className="mt-4 grid gap-2">
            {task.options?.map((option) => {
              const inspected = active.inspectedArtifactIds.includes(option.id);
              return (
                <label key={option.id} className={cn("flex min-h-12 items-start gap-3 rounded-md border p-3", active.selectedIds.includes(option.id) ? "border-primary bg-primary/5" : "border-border", !inspected && "opacity-60")}>
                  <input
                    type="checkbox"
                    disabled={!inspected}
                    checked={active.selectedIds.includes(option.id)}
                    onChange={() => toggleCyberRangeSelection(option.id)}
                    aria-label={`${option.label}${inspected ? "" : " (inspect evidence first)"}`}
                    className="mt-1 h-5 w-5 accent-[var(--primary)]"
                  />
                  <span className="text-sm">{option.label}{!inspected && <span className="block text-xs text-muted-foreground">Inspect the matching evidence above first.</span>}</span>
                </label>
              );
            })}
          </div>
        )}

        {task.mode === "choice" && (
          <div className="mt-4 grid gap-2">
            {task.options?.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={active.draft === option.id}
                onClick={() => setCyberRangeDraft(option.id)}
                className={cn("tap-target rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", active.draft === option.id ? "border-primary bg-primary/5" : "border-border hover:border-primary")}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {task.mode === "text" && (
          <label className="mt-4 block">
            <span className="sr-only">Your answer</span>
            <input
              value={active.draft}
              onChange={(event) => setCyberRangeDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && canSubmit) handleSubmit(); }}
              maxLength={200}
              autoComplete="off"
              aria-label="Your answer"
              className="min-h-12 w-full rounded-md border border-input bg-background px-4 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Enter answer"
            />
          </label>
        )}

        {task.mode === "sequence" && (
          <div className="mt-4 space-y-3">
            <ol aria-label="Selected action order" className="space-y-2">
              {active.sequence.map((id, index) => (
                <li key={id} className="rounded border border-primary/50 p-3 text-sm">
                  <span className="mr-2 font-mono text-accent">{index + 1}.</span>
                  {task.options?.find((option) => option.id === id)?.label ?? id}
                </li>
              ))}
            </ol>
            <div className="grid gap-2 sm:grid-cols-2">
              {task.options?.filter((option) => !active.sequence.includes(option.id)).map((option) => (
                <button key={option.id} type="button" onClick={() => appendCyberRangeSequence(option.id)} className="tap-target rounded-md border border-border p-3 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  Add: {option.label}
                </button>
              ))}
            </div>
            {active.sequence.length > 0 && <Btn variant="ghost" onClick={resetCyberRangeSequence}>RESET ORDER</Btn>}
          </div>
        )}

        {active.hintShown && (
          <p role="note" className="mt-4 rounded border border-warning/50 p-3 text-sm text-warning">
            HINT: {task.hint}
          </p>
        )}
        {result && (
          <div role={result.correct ? "status" : "alert"} aria-live="polite" className={cn("mt-4 rounded border p-3 text-sm", result.correct ? "border-success/50 text-success" : "border-destructive/50 text-destructive")}>
            {result.taskId !== task.id && (
              <p className="mb-1 font-mono text-[0.65rem] tracking-wider">
                PREVIOUS TASK · {lab.tasks.find((item) => item.id === result.taskId)?.id.replaceAll("-", " ").toUpperCase()}
              </p>
            )}
            <p>{result.feedback}</p>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {!active.hintShown && (
            <Btn variant="ghost" disabled={player.coins < 10} onClick={buyCyberRangeHint}>HINT · 10 COINS</Btn>
          )}
          <Btn onClick={handleSubmit} disabled={!canSubmit}>SUBMIT TASK</Btn>
          <Btn variant="ghost" onClick={exitCyberRangeLab}>SAVE & EXIT</Btn>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border p-3">
      <p className="font-mono text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl">{value}</p>
    </div>
  );
}
