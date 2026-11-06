import { useEffect, useState } from "react";
import { Lightbulb, Timer } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { getLevel, LEVELS } from "@/game/levels";
import { Btn } from "./Hud";
import { EvidenceBoard } from "./EvidenceBoard";
import { NetworkPathBoard } from "./NetworkPathBoard";
import { NEXUS_BOSS_HEALTH, NEXUS_PHASES } from "@/game/nexusEncounter";
import { cn } from "@/lib/utils";
import { NexusMentorPanel } from "./nexusMentorPanel";
import { NexusMissionDebrief } from "./NexusMissionDebrief";

export function PlayScreen() {
  const {
    player,
    run,
    challenge,
    answered,
    answer,
    updateEvidenceBoard,
    selectNetworkPathNode,
    resetNetworkPath,
    retryNetworkPath,
    retryBossDecision,
    nextChallenge,
    hintShown,
    buyHint,
    timeLeft,
    shake,
    go,
  } = useGame();
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  useEffect(() => {
    setPicked([]);
    setText("");
  }, [challenge?.id]);
  if (!run || !challenge) return null;
  const level = getLevel(run.levelId)!;
  const boss = level.id === 5;
  const isOptions = !!challenge.options?.length;
  const bossPhaseId = boss ? (run.bossEncounterState?.phase ?? challenge.bossPhase) : undefined;
  const bossPhase = bossPhaseId ? NEXUS_PHASES[bossPhaseId] : undefined;
  const bossHealth = run.bossEncounterState?.bossHealth ?? NEXUS_BOSS_HEALTH - run.index;

  const optionState = (id: string) => {
    if (!answered) return "";
    if (id === challenge.correctAnswer) return "border-success text-success";
    if (id === answered.chosen) return "border-destructive text-destructive";
    return "opacity-50";
  };

  return (
    <div key={shake} className={cn("mx-auto max-w-3xl p-3 sm:p-6", shake > 0 && "anim-shake")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
        <button
          onClick={() => go("levels")}
          className="tap-target rounded px-2 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          &lt; ABORT
        </button>
        <span className={cn("text-right", boss && "text-destructive")}>
          SECTOR {level.code} · {level.title} · {run.index + 1}/{level.challenges.length}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Mission progress"
        aria-valuemin={0}
        aria-valuemax={level.challenges.length}
        aria-valuenow={run.index}
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(run.index / level.challenges.length) * 100}%` }}
        />
      </div>

      <section
        className={cn(
          "panel anim-rise p-3 sm:p-6",
          boss ? "border-destructive/60" : "border-primary/25",
        )}
      >
        {boss && bossPhase && (
          <div className="mb-5 space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
              <span className="text-destructive">NEXUS · FICTIONAL SIMULATION</span>
              <span>
                PLAYER HEALTH {run.health}/{5}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm text-destructive">
                PHASE {bossPhase.number} — {bossPhase.title}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                HINTS {Math.max(0, 3 - run.hintsInLevel)}/3
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{bossPhase.objective}</p>
            <p
              className="rounded border border-border bg-background/70 p-3 font-mono text-sm"
              aria-live="polite"
            >
              NEXUS: {bossPhase.dialogue}
            </p>
            <div>
              <div className="mb-1 flex justify-between font-mono text-[0.65rem] text-muted-foreground">
                <span>NEXUS CORE INTEGRITY</span>
                <span>
                  {bossHealth}/{NEXUS_BOSS_HEALTH}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="NEXUS core integrity"
                aria-valuemin={0}
                aria-valuemax={NEXUS_BOSS_HEALTH}
                aria-valuenow={bossHealth}
                className="h-2 overflow-hidden rounded bg-muted"
              >
                <div
                  className="h-full bg-destructive transition-all"
                  style={{ width: `${(bossHealth / NEXUS_BOSS_HEALTH) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-accent sm:tracking-[0.3em]">
              {challenge.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {challenge.description}
            </p>
          </div>
          {timeLeft !== null && !answered && (
            <span
              className={cn(
                "flex items-center gap-1 font-mono",
                timeLeft <= 5 ? "text-destructive anim-blink" : "text-warning",
              )}
            >
              <Timer className="h-4 w-4" /> {timeLeft}s
            </span>
          )}
        </div>

        {challenge.terminalLines && (
          <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-sm text-accent">
            {challenge.terminalLines.join("\n")}
          </pre>
        )}

        <h2 className="mt-4 text-lg font-semibold leading-snug sm:text-xl">{challenge.question}</h2>

        {challenge.evidenceBoard && (
          <EvidenceBoard
            data={challenge.evidenceBoard}
            state={run.evidenceBoardState}
            answered={answered}
            submit={answer}
            update={updateEvidenceBoard}
          />
        )}
        {challenge.networkPath && (
          <NetworkPathBoard
            puzzle={challenge.networkPath}
            state={run.networkPathState}
            answered={answered}
            selectNode={selectNetworkPathNode}
            reset={resetNetworkPath}
            retry={retryNetworkPath}
            submit={answer}
          />
        )}
        {challenge.type === "path" && !challenge.networkPath && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive p-3 font-mono text-sm text-destructive"
          >
            ROUTE MAP UNAVAILABLE · This training puzzle is incomplete.
          </p>
        )}
        {challenge.type === "evidence-board" && !challenge.evidenceBoard && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive p-3 font-mono text-sm text-destructive"
          >
            EVIDENCE SET UNAVAILABLE · This training case is incomplete.
          </p>
        )}

        {isOptions && (
          <div className="mt-4 grid gap-2">
            {challenge.options!.map((o) => (
              <button
                key={o.id}
                disabled={!!answered}
                onClick={() => answer(o.id)}
                className={cn(
                  "tap-target rounded-md border border-border bg-surface/60 p-3 text-left transition-colors hover:border-primary/70 hover:bg-surface active:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60",
                  optionState(o.id),
                )}
              >
                <span className="mr-2 font-mono text-primary">{o.id}</span>
                <span
                  className={cn(
                    challenge.type === "hash" ||
                      challenge.type === "path" ||
                      challenge.type === "terminal"
                      ? "font-mono"
                      : "",
                  )}
                >
                  {o.label}
                </span>
                {o.sub && <span className="mt-1 block text-sm font-semibold">{o.sub}</span>}
                {o.body && (
                  <span className="mt-1 block text-sm text-muted-foreground">{o.body}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {challenge.inspect && (
          <div className="mt-4">
            <div className="overflow-hidden rounded-md border border-border bg-background">
              {challenge.inspect.parts.map((pt) => {
                const on = picked.includes(pt.id);
                const result = answered
                  ? pt.clue
                    ? on
                      ? "hit"
                      : "miss"
                    : on
                      ? "false"
                      : "ok"
                  : null;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    disabled={!!answered}
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((p) => (on ? p.filter((x) => x !== pt.id) : [...p, pt.id]))
                    }
                    className={cn(
                      "tap-target block w-full border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0 disabled:cursor-default",
                      !answered && (on ? "bg-destructive/15 text-destructive" : "hover:bg-surface"),
                      result === "hit" && "bg-success/15 text-success",
                      result === "miss" && "bg-warning/15 text-warning",
                      result === "false" && "bg-destructive/15 text-destructive",
                    )}
                  >
                    {pt.field && (
                      <span className="mr-2 font-mono text-xs text-muted-foreground">
                        {pt.field}:
                      </span>
                    )}
                    <span className={cn(pt.field && "font-mono text-sm")}>{pt.text}</span>
                    {!answered && on && <span className="ml-2 font-mono text-xs">⚑</span>}
                    {answered && (pt.clue || on) && (
                      <span className="mt-1 block text-xs opacity-90">
                        {result === "hit"
                          ? "✓ "
                          : result === "miss"
                            ? "MISSED · "
                            : "NOT A CLUE · "}
                        {pt.why}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {!answered && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {picked.length} FLAGGED
                </span>
                <Btn onClick={() => answer(picked.join("|"))} disabled={!picked.length}>
                  SUBMIT REPORT
                </Btn>
              </div>
            )}
          </div>
        )}

        {challenge.configOptions && (
          <div className="mt-4 grid gap-2">
            {challenge.configOptions.map((o) => {
              const on = picked.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3",
                    on ? "border-primary" : "border-border",
                    answered && (on === o.secure ? "border-success" : "border-destructive"),
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={!!answered}
                    checked={on}
                    onChange={() =>
                      setPicked((p) => (on ? p.filter((x) => x !== o.id) : [...p, o.id]))
                    }
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    <span className="font-semibold">{o.label}</span>
                    <span className="block text-sm text-muted-foreground">{o.description}</span>
                  </span>
                </label>
              );
            })}
            {!answered && (
              <Btn className="mt-2" onClick={() => answer(picked.join("|"))}>
                DEPLOY CONFIG
              </Btn>
            )}
          </div>
        )}

        {!isOptions && !challenge.configOptions && challenge.accepted && (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) answer(text);
            }}
          >
            <input
              value={text}
              disabled={!!answered}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              aria-label="Your answer"
              className="flex-1 rounded-md border border-input bg-background px-4 py-3 font-mono outline-none focus:border-primary"
              placeholder="> type answer"
            />
            {!answered && <Btn type="submit">SUBMIT</Btn>}
          </form>
        )}

        {hintShown && !answered && (
          <p className="mt-4 rounded-md border border-warning/50 p-3 text-sm text-warning">
            HINT: {challenge.hint}
          </p>
        )}

        {answered ? (
          <div className="anim-rise mt-5 border-t border-border pt-4">
            <p
              className={cn("font-display", answered.correct ? "text-success" : "text-destructive")}
            >
              {answered.correct
                ? "✓ CORRECT · ACCESS GRANTED"
                : answered.chosen === "__timeout__"
                  ? "TIME EXPIRED"
                  : "✕ INCORRECT · −1 HP"}
            </p>
            <p className="mt-2 text-muted-foreground">{challenge.explanation}</p>
            {boss && !answered.correct && run.health > 0 && (
              <Btn className="mt-4" onClick={retryBossDecision}>
                REASSESS & RETRY
              </Btn>
            )}
            {run.health > 0 && (answered.correct || (challenge.type !== "path" && !boss)) && (
              <Btn className="mt-4" onClick={nextChallenge}>
                NEXT &gt;
              </Btn>
            )}
          </div>
        ) : (
          !hintShown &&
          (!boss || run.hintsInLevel < 3) && (
            <button
              onClick={buyHint}
              className="mt-5 flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-warning"
            >
              <Lightbulb className="h-4 w-4" /> HINT (10 coins
              {boss ? ` · ${3 - run.hintsInLevel} LEFT` : ""})
            </button>
          )
        )}

        <NexusMentorPanel
          levelId={level.id}
          missionDescription={level.description}
          challenge={challenge}
          answeredCorrect={answered?.correct ?? null}
          health={run.health}
          correctAnswers={run.correctInLevel}
          mistakes={run.wrongInLevel}
          hintsUsed={run.hintsInLevel}
          streak={run.runStreak}
          missionsCompleted={
            Object.values(player.levels).filter((record) => record.completed).length
          }
        />
      </section>
    </div>
  );
}

export function LevelCompleteScreen() {
  const { run, startLevel, go } = useGame();
  if (!run) return null;
  const level = getLevel(run.levelId)!;
  const next = LEVELS.find((l) => l.id === level.id + 1);
  return (
    <Result
      tag="SECTOR CLEARED"
      title={level.title}
      stats={[
        ["SCORE", run.scoreInLevel + level.xpReward],
        ["XP", run.xpInLevel + level.xpReward],
        ["COINS", run.coinsInLevel + level.coinReward],
        ["MISTAKES", run.wrongInLevel],
      ]}
    >
      {next && <Btn onClick={() => startLevel(next.id)}>NEXT SECTOR</Btn>}
      <Btn variant="ghost" onClick={() => go("levels")}>
        SECTOR MAP
      </Btn>
    </Result>
  );
}

export function VictoryScreen() {
  const { player, runSeconds, accuracy, go, report } = useGame();
  const level = report ? getLevel(report.levelId) : null;
  return (
    <Result
      tag="NEXUS CORE DESTROYED"
      title="YOU ESCAPED"
      good
      stats={[
        ["TOTAL SCORE", player.score],
        ["ACCURACY", `${accuracy}%`],
        ["BEST STREAK", player.highestStreak],
        ["BOSS TIME", `${runSeconds}s`],
      ]}
    >
      {report && level && (
        <NexusMissionDebrief
          levelId={report.levelId}
          missionDescription={level.description}
          attempts={report.attempts}
        />
      )}
      <Btn onClick={() => go("menu")}>MAIN MENU</Btn>
      <Btn variant="ghost" onClick={() => go("levels")}>
        REPLAY SECTORS
      </Btn>
    </Result>
  );
}

export function FailureScreen() {
  const { retryLevel, go, run } = useGame();
  const level = run ? getLevel(run.levelId) : null;
  return (
    <Result
      tag={level?.id === 5 ? "NEXUS SIMULATION · DEFEAT" : "CONNECTION TERMINATED"}
      title={level?.id === 5 ? "CORE DEFENDED" : "TRACED"}
      bad
      stats={[["SECTOR", level?.title ?? "-"]]}
    >
      <Btn onClick={retryLevel}>{level?.id === 5 ? "RETRY NEXUS" : "RETRY SECTOR"}</Btn>
      <Btn variant="ghost" onClick={() => go("menu")}>
        MAIN MENU
      </Btn>
    </Result>
  );
}

function Result({
  tag,
  title,
  stats,
  children,
  good,
  bad,
}: {
  tag: string;
  title: string;
  stats: [string, string | number][];
  children: React.ReactNode;
  good?: boolean;
  bad?: boolean;
}) {
  return (
    <div className="grid min-h-[calc(100vh-48px)] place-items-center p-6">
      <div
        className={cn(
          "panel glow-border anim-pop w-full max-w-lg p-8 text-center",
          bad && "border-destructive",
        )}
      >
        <p
          className={cn(
            "font-mono text-xs tracking-[0.4em]",
            bad ? "text-destructive" : "text-accent",
          )}
        >
          {tag}
        </p>
        <h1
          className={cn(
            "my-3 font-display text-4xl text-glow sm:text-5xl",
            bad ? "text-destructive" : good ? "text-accent" : "text-primary",
          )}
        >
          {title}
        </h1>
        <div className="my-6 grid grid-cols-2 gap-3">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-md border border-border p-3">
              <p className="font-mono text-xs text-muted-foreground">{k}</p>
              <p className="font-display text-xl">{v}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </div>
  );
}
