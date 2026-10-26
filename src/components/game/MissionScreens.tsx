import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { getLevel, LEVELS } from "@/game/levels";
import { BRIEFINGS, fmtTime } from "@/game/progression";
import { playSound } from "@/game/sound";
import { Btn } from "./Hud";
import { cn } from "@/lib/utils";
import { NexusMissionDebrief } from "./NexusMissionDebrief";

export function BriefingScreen() {
  const { run, beginMission, go, player } = useGame();
  const level = run ? getLevel(run.levelId) : null;
  const brief = level ? BRIEFINGS[level.id] : null;
  const script = useMemo(
    () =>
      level && brief
        ? `> INCOMING TRANSMISSION...\n\nSECTOR: ${level.title}\nTHREAT LEVEL: ${brief.threat}\n\nMISSION:\n"${brief.mission}"`
        : "",
    [level, brief],
  );
  const instant = player.settings.reducedMotion;
  const [n, setN] = useState(instant ? script.length : 0);
  const done = n >= script.length;

  useEffect(() => {
    if (done) return;
    const t = window.setTimeout(() => {
      setN((v) => v + 2);
      if (n % 6 === 0) playSound("type");
    }, 22);
    return () => window.clearTimeout(t);
  }, [n, done]);

  if (!level || !brief) return null;
  const danger = brief.threat === "CRITICAL" || brief.threat === "SEVERE";

  return (
    <div className="grid min-h-[calc(100vh-48px)] place-items-center p-3 sm:p-4">
      <div
        className={cn(
          "panel anim-pop w-full max-w-xl p-5 sm:p-8",
          danger ? "border-destructive/60" : "border-primary/25",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <p
            className={cn(
              "font-mono text-xs tracking-[0.4em]",
              danger ? "text-destructive" : "text-accent",
            )}
          >
            NEXUS TRANSMISSION
          </p>
          {!done && (
            <button
              onClick={() => setN(script.length)}
              className="tap-target rounded px-2 font-mono text-xs text-muted-foreground transition-colors hover:bg-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              [SKIP]
            </button>
          )}
        </div>
        <pre className="min-h-[11rem] whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground sm:text-base">
          {script.slice(0, n)}
          {!done && <span className="anim-blink text-primary">▌</span>}
        </pre>
        {done && (
          <div className="anim-rise mt-4">
            <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">OBJECTIVES</p>
            <ul className="mt-2 space-y-1 font-mono text-sm">
              {brief.objectives.map((o) => (
                <li key={o} className="flex gap-2">
                  <span className="text-primary">□</span>
                  {o}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Btn onClick={beginMission}>BEGIN MISSION</Btn>
              <Btn variant="ghost" onClick={() => go("levels")}>
                BACK
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SKILL_LABEL: Record<string, string> = {
  networking: "NETWORKING",
  forensics: "FORENSICS",
  security: "SECURITY",
  logic: "LOGIC",
};

export function MissionReportScreen() {
  const { report, startLevel, go } = useGame();
  if (!report) return null;
  const level = getLevel(report.levelId)!;
  const next = LEVELS.find((l) => l.id === level.id + 1);
  const b = report.breakdown;
  const rows: [string, number, string?][] = [
    ["BASE SCORE", b.base],
    ["SPEED BONUS", b.speed, "+"],
    ["STREAK BONUS", b.streak, "+"],
    ["SECTOR CLEAR", b.completion, "+"],
    ["HINT PENALTY", -b.hints],
    ["MISTAKE PENALTY", -b.wrong],
  ];
  const nb = (k: string) => report.newBests.includes(k);

  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-6">
      <div className="panel glow-border anim-pop overflow-hidden p-4 sm:p-8">
        <p className="text-center font-mono text-xs tracking-[0.4em] text-accent">
          MISSION COMPLETE
        </p>
        <h1 className="my-2 text-center font-display text-2xl text-primary text-glow sm:text-4xl">
          {level.title}
        </h1>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-3 sm:gap-3">
          <Stat k="XP" v={`+${report.xp}`} />
          <Stat k="COINS" v={`+${report.coins}`} />
          <Stat k="ACCURACY" v={`${report.accuracy}%`} best={nb("accuracy")} />
          <Stat k="TIME" v={fmtTime(report.seconds)} best={nb("time")} />
          <Stat k="HINTS" v={report.hints} best={nb("hints")} />
          <Stat k="BEST STREAK" v={report.bestStreak} best={nb("streak")} />
        </div>

        <div className="mt-5 rounded-md border border-border bg-background/35 p-3 font-mono text-sm sm:mt-6 sm:p-4">
          {rows.map(([k, v, sign]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span className={cn(v < 0 && "text-destructive", sign && v > 0 && "text-success")}>
                {v > 0 && sign ? "+" : ""}
                {v}
              </span>
            </div>
          ))}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-base">
            <span>
              FINAL {nb("score") && <span className="ml-1 text-warning">★ NEW BEST</span>}
            </span>
            <span className="font-display text-primary">{b.final.toLocaleString()}</span>
          </div>
        </div>

        <NexusMissionDebrief
          levelId={report.levelId}
          missionDescription={level.description}
          attempts={report.attempts}
        />

        {Object.keys(report.skillXp).length > 0 && (
          <div className="mt-4 font-mono text-sm">
            <p className="text-xs tracking-[0.3em] text-muted-foreground">SKILL XP</p>
            <div className="mt-1 flex flex-wrap gap-x-4">
              {Object.entries(report.skillXp).map(([k, v]) => (
                <span key={k}>
                  {SKILL_LABEL[k]} <span className="text-accent">+{v}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
          {next && (
            <Btn className="w-full sm:w-auto" onClick={() => startLevel(next.id)}>
              CONTINUE
            </Btn>
          )}
          <Btn className="w-full sm:w-auto" variant="ghost" onClick={() => startLevel(level.id)}>
            REPLAY
          </Btn>
          <Btn className="w-full sm:w-auto" variant="ghost" onClick={() => go("levels")}>
            LEVEL SELECT
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, best }: { k: string; v: string | number; best?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border bg-surface/35 p-3 text-center transition-colors",
        best ? "border-warning/70 bg-warning/5" : "border-border",
      )}
    >
      <p className="font-mono text-xs text-muted-foreground">
        {k}
        {best && <span className="text-warning"> ★</span>}
      </p>
      <p className="font-display text-lg leading-tight">{v}</p>
    </div>
  );
}
