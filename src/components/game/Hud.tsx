import { Coins, Flame, Heart, Star, Volume2, VolumeX } from "lucide-react";
import { useGame } from "@/game/GameProvider";
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
  return (
    <header className="panel sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 rounded-none border-x-0 border-t-0 px-3 py-2 font-mono text-sm sm:flex sm:flex-wrap sm:gap-x-5 sm:px-4">
      <span className="min-w-0 truncate font-display tracking-widest text-primary">
        {player.name || "AGENT"}
      </span>
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 border-t border-border/70 pt-2 sm:col-span-1 sm:contents sm:border-0 sm:pt-0 sm:gap-x-4">
        <span className="flex items-center gap-2">
          <Star aria-hidden="true" className="h-4 w-4 text-warning" />
          LV {player.level}
          <span
            role="progressbar"
            aria-label="Player XP progress"
            aria-valuemin={0}
            aria-valuemax={xpForNext}
            aria-valuenow={Math.min(player.xp, xpForNext)}
            className="relative h-2 w-16 overflow-hidden rounded bg-muted sm:w-24"
          >
            <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-muted-foreground">
            {player.xp}/{xpForNext}
          </span>
        </span>
        <span className="flex items-center gap-1 text-warning" aria-label={`${player.coins} coins`}>
          <Coins aria-hidden="true" className="h-4 w-4" /> {player.coins}
        </span>
        <span
          className="flex items-center gap-1 text-accent"
          aria-label={`${player.streak} streak`}
        >
          <Flame aria-hidden="true" className="h-4 w-4" /> {player.streak}
        </span>
        {run && (
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
        )}
        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
          SCORE {player.score}
        </span>
      </div>
      <button
        aria-label="Toggle sound"
        className="tap-target row-start-1 col-start-2 rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:order-last"
        onClick={() => updateSettings({ sound: !player.settings.sound })}
      >
        {player.settings.sound ? (
          <Volume2 aria-hidden="true" className="h-4 w-4" />
        ) : (
          <VolumeX aria-hidden="true" className="h-4 w-4" />
        )}
      </button>
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
