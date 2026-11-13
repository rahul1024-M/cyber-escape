import { Coins, Flame, Heart, Star, Volume2, VolumeX } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { getLevel } from "@/game/levels";
import { cn } from "@/lib/utils";

export function Btn({
  children,
  onClick,
  variant = "primary",
  className,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "tap-target inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 font-display text-sm tracking-[0.2em] uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_24px_var(--glow)]",
        variant === "ghost" &&
          "border border-border bg-surface/60 text-foreground hover:border-primary hover:text-primary",
        variant === "danger" &&
          "border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Hud() {
  const { player, run, xpForNext, updateSettings } = useGame();
  const pct = Math.min(100, Math.round((player.xp / xpForNext) * 100));
  const activeLevel = run ? getLevel(run.levelId) : null;
  const challengeProgress =
    run && activeLevel ? Math.min(run.index + 1, activeLevel.challenges.length) : 0;
  const challengeCount = activeLevel?.challenges.length ?? 0;
  const challengePct = challengeCount ? Math.round((challengeProgress / challengeCount) * 100) : 0;

  return (
    <header className="panel cinematic-hud sticky top-0 z-30 flex flex-col gap-2 rounded-none border-x-0 border-t-0 px-2.5 py-2 font-mono text-sm sm:gap-2 sm:px-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="hud-live-indicator" />
          <span className="min-w-0 truncate font-display tracking-widest text-primary">
            {player.name || "AGENT"}
          </span>
          {activeLevel && (
            <span className="hidden truncate text-[10px] tracking-wider text-muted-foreground sm:inline">
              SECTOR {activeLevel.code} · {activeLevel.title}
            </span>
          )}
        </div>
        <button
          aria-label="Toggle sound"
          className="tap-target shrink-0 rounded-md px-2 text-muted-foreground transition-colors hover:bg-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => updateSettings({ sound: !player.settings.sound })}
        >
          {player.settings.sound ? (
            <Volume2 aria-hidden="true" className="h-4 w-4" />
          ) : (
            <VolumeX aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="cinematic-hud-metrics grid min-w-0 grid-cols-2 gap-1.5 border-t border-border/70 pt-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
        <div className="hud-metric">
          <span className="hud-metric-label">LEVEL / XP</span>
          <span className="flex items-center gap-1.5">
            <Star aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
            LV {player.level}
            <span
              role="progressbar"
              aria-label="Player XP progress"
              aria-valuemin={0}
              aria-valuemax={xpForNext}
              aria-valuenow={Math.min(player.xp, xpForNext)}
              className="relative h-2 w-16 shrink-0 overflow-hidden rounded bg-muted sm:w-24"
            >
              <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-muted-foreground">
              {player.xp}/{xpForNext}
            </span>
          </span>
        </div>
        <div className="hud-metric">
          <span className="hud-metric-label">COINS</span>
          <span
            className="flex items-center gap-1 text-warning"
            aria-label={`${player.coins} coins`}
          >
            <Coins aria-hidden="true" className="h-4 w-4" /> {player.coins}
          </span>
        </div>
        <div className="hud-metric">
          <span className="hud-metric-label">STREAK</span>
          <span
            className="flex items-center gap-1 text-accent"
            aria-label={`${player.streak} streak`}
          >
            <Flame aria-hidden="true" className="h-4 w-4" /> {player.streak}
          </span>
        </div>
        {run && (
          <div className="hud-metric">
            <span className="hud-metric-label">HEALTH</span>
            <span className="flex items-center gap-0.5" aria-label={`${run.health} health`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Heart
                  key={i}
                  aria-hidden="true"
                  className={cn(
                    "h-4 w-4",
                    i < run.health ? "fill-destructive text-destructive" : "text-muted",
                  )}
                />
              ))}
            </span>
          </div>
        )}
        {activeLevel && (
          <div className="hud-metric min-w-0">
            <span className="hud-metric-label">
              SECTOR {activeLevel.code} · {activeLevel.title}
            </span>
            <span className="hud-challenge-label">
              CHALLENGE {challengeProgress}/{challengeCount}
            </span>
            <span
              role="progressbar"
              aria-label="Challenge progress"
              aria-valuemin={0}
              aria-valuemax={challengeCount}
              aria-valuenow={challengeProgress}
              className="relative h-1.5 w-full overflow-hidden rounded bg-muted"
            >
              <span
                className="absolute inset-y-0 left-0 bg-primary"
                style={{ width: `${challengePct}%` }}
              />
            </span>
          </div>
        )}
        <div className="hud-metric">
          <span className="hud-metric-label">SCORE</span>
          <span
            className="whitespace-nowrap text-sm text-primary"
            aria-label={`Score ${player.score}`}
          >
            {player.score.toLocaleString()}
          </span>
        </div>
      </div>
    </header>
  );
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed right-4 top-16 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "panel anim-float-up max-w-full break-words px-3 py-1.5 font-mono text-sm",
            t.tone === "xp" && "text-primary",
            t.tone === "coin" && "text-warning",
            t.tone === "achievement" && "text-accent",
            t.tone === "bad" && "text-destructive",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function LevelUpModal() {
  const { levelUpTo, levelUpFrom, dismissLevelUp } = useGame();
  if (!levelUpTo) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="panel glow-border anim-pop max-w-sm p-8 text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-accent">LEVEL UP!</p>
        {levelUpFrom && (
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            LEVEL {levelUpFrom} → LEVEL {levelUpTo}
          </p>
        )}
        <p className="my-4 font-display text-6xl text-primary text-glow">LV {levelUpTo}</p>
        <p className="mb-6 text-muted-foreground">+50 BONUS COINS</p>
        <Btn onClick={dismissLevelUp}>CONTINUE</Btn>
      </div>
    </div>
  );
}
