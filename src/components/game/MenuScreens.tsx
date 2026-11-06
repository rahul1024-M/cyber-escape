import { useCallback, useEffect, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { Lock, Check, X } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { isEnabled } from "@/game/flags";
import { LEVELS } from "@/game/levels";
import { ACHIEVEMENTS } from "@/game/achievements";
import { COSMETICS } from "@/game/storage";
import { getLeaderboard } from "@/game/apiService";
import { getStats } from "@/game/analytics";
import { SKILLS, SKILL_MAX, fmtTime } from "@/game/progression";
import type { LeaderboardEntry } from "@/game/types";
import { Btn } from "./Hud";
import { cn } from "@/lib/utils";
import { fetchGlobalBoard } from "@/game/cloud";
import { AccountPanel } from "./AccountPanel";
import {
  getDialogTabStopTarget,
  getLeaderboardEmptyMessage,
  loadLeaderboard,
} from "./menuScreenUtils";

export function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center font-mono text-primary">
      <p className="anim-flicker">
        &gt; BOOTING NEXUS INTERFACE<span className="anim-blink">_</span>
      </p>
    </div>
  );
}

export function CodenameScreen() {
  const { setName } = useGame();
  const [v, setV] = useState("");
  return (
    <div className="grid min-h-screen place-items-center p-3 sm:p-4">
      <form
        className="panel glow-border anim-rise w-full max-w-md p-5 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          setName(v);
        }}
      >
        <p className="font-mono text-xs tracking-[0.3em] text-accent">NEW OPERATIVE</p>
        <h1 className="mt-2 font-display text-3xl text-primary text-glow sm:text-4xl">CYBER ESCAPE</h1>
        <p className="mt-3 text-muted-foreground">
          You are trapped inside the NEXUS network. Break five sectors and defeat its AI core to
          escape.
        </p>
        <label className="mt-6 block font-mono text-sm text-muted-foreground" htmlFor="codename">
          ENTER CODENAME
        </label>
        <input
          id="codename"
          autoFocus
          maxLength={18}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="e.g. GHOST"
          className="mt-2 w-full rounded-md border border-input bg-background px-4 py-3 font-mono uppercase text-foreground outline-none focus:border-primary"
        />
        <Btn type="submit" className="mt-6 w-full">
          JACK IN
        </Btn>
      </form>
    </div>
  );
}

type Panel = null | "how" | "achievements" | "board" | "settings" | "shop" | "profile" | "account";

export function MenuScreen() {
  const {
    hasSave,
    player,
    startNewGame,
    continueGame,
    go,
    sfx,
    user,
    cyberRangeProgress,
    openCyberRange,
  } = useGame();

  const [panel, setPanel] = useState<Panel>(null);
  const closePanel = useCallback(() => setPanel(null), []);

  const anyDone = Object.values(player.levels).some((level) => level.completed);
  const completedSectors = Object.values(player.levels).filter(
    (level) => level.completed,
  ).length;

  const open = (nextPanel: Panel) => {
    sfx("click");
    setPanel(nextPanel);
  };

  const menuItems = [
    {
      label: "HOW TO PLAY",
      detail: "Learn the controls",
      icon: Icons.BookOpen,
      action: () => open("how"),
    },
    {
      label: "BADGES",
      detail: "Your achievements",
      icon: Icons.Award,
      action: () => open("achievements"),
    },
    {
      label: "LEADERBOARD",
      detail: "Rank the operatives",
      icon: Icons.Trophy,
      action: () => open("board"),
    },
    {
      label: "THEMES",
      detail: "Customize your interface",
      icon: Icons.Palette,
      action: () => open("shop"),
    },
    {
      label: "PROFILE",
      detail: "Your operative record",
      icon: Icons.UserRound,
      action: () => open("profile"),
    },
    {
      label: "SETTINGS",
      detail: "Configure your system",
      icon: Icons.Settings2,
      action: () => open("settings"),
    },
  ];

  return (
    <main className="relative mx-auto flex min-h-[calc(100dvh-48px)] w-full max-w-6xl flex-col justify-center overflow-visible px-3 py-6 sm:min-h-[calc(100vh-48px)] sm:px-8 sm:py-8 lg:px-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-3xl"
      />

      <div className="relative grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        {/* Branding and welcome */}
        <section className="text-center lg:text-left">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-primary/25 bg-primary/[0.06] px-4 py-2 font-mono text-[10px] tracking-[0.25em] text-primary sm:text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            NEXUS SYSTEM // ONLINE
          </div>

          <p className="mb-3 font-mono text-xs tracking-[0.35em] text-muted-foreground">
            YOUR MISSION BEGINS HERE
          </p>

          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-primary text-glow sm:text-7xl lg:text-8xl">
            CYBER
            <span className="block text-foreground">
              ESCAPE<span className="text-primary">.</span>
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg lg:mx-0">
            Welcome back,{" "}
            <span className="font-semibold text-foreground">{player.name}</span>.
            {" "}The network is compromised. Five sectors stand between you and freedom.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <span className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              <Icons.ShieldCheck className="h-4 w-4 text-primary" />
              SECURITY PROTOCOL ACTIVE
            </span>

            <span className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card/50 px-3 py-2 font-mono text-xs text-muted-foreground">
              <Icons.Crosshair className="h-4 w-4 text-accent" />
              OPERATIVE: {player.name}
            </span>
          </div>
        </section>

        {/* Mission control */}
        <section className="panel glow-border relative mx-auto w-full max-w-xl overflow-hidden p-4 sm:p-7">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] tracking-[0.3em] text-primary">
                NEXUS // COMMAND
              </p>
              <h2 className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                Mission Control
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ready when you are, operative.
              </p>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/[0.07] p-3 text-primary">
              <Icons.Radar className="h-7 w-7" />
            </div>
          </div>

          {/* Live progress statistics */}
          <div className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-background/50 p-3 sm:p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icons.Layers3 className="h-4 w-4 text-primary" />
                <span className="font-mono text-[10px] tracking-wider">
                  SECTORS
                </span>
              </div>

              <p className="mt-3 font-display text-3xl text-foreground">
                {completedSectors}
                <span className="text-lg text-muted-foreground"> / 5</span>
              </p>

              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Completed sectors"
                aria-valuemin={0}
                aria-valuemax={5}
                aria-valuenow={Math.min(completedSectors, 5)}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(completedSectors / 5, 1) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/50 p-3 sm:p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icons.Zap className="h-4 w-4 text-accent" />
                <span className="font-mono text-[10px] tracking-wider">
                  STATUS
                </span>
              </div>

              <p className="mt-3 font-display text-xl text-foreground">
                {completedSectors === 5
                  ? "ELITE"
                  : completedSectors > 0
                    ? "ACTIVE"
                    : "READY"}
              </p>

              <p className="mt-2 text-xs text-muted-foreground">
                {completedSectors === 5
                  ? "All sectors completed"
                  : `${5 - Math.min(completedSectors, 5)} sectors remaining`}
              </p>
            </div>
          </div>

          {/* Main actions */}
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => {
                sfx("click");
                if (hasSave && anyDone) {
                  continueGame();
                } else {
                  startNewGame();
                }
              }}
              className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-lg border border-primary/50 bg-primary px-5 py-4 text-left font-mono text-sm font-bold tracking-[0.12em] text-primary-foreground shadow-[0_0_28px_-8px_var(--primary)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_38px_-5px_var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <span className="flex items-center gap-3">
                <Icons.Play className="h-5 w-5" />
                {hasSave && anyDone ? "CONTINUE MISSION" : "START MISSION"}
              </span>

              <Icons.ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                sfx("click");
                go("levels");
              }}
              className="flex min-h-12 w-full items-center justify-between rounded-lg border border-border bg-background/40 px-5 py-3 font-mono text-xs tracking-[0.12em] text-foreground transition-all hover:border-primary/50 hover:bg-primary/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <span className="flex items-center gap-3">
                <Icons.Map className="h-4 w-4 text-primary" />
                SECTOR MAP
              </span>
              <Icons.ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            {isEnabled("ENABLE_CYBER_RANGE") && (
              <button
                type="button"
                onClick={() => {
                  sfx("click");
                  openCyberRange();
                }}
                className="flex min-h-12 w-full items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] px-5 py-3 font-mono text-xs tracking-[0.12em] text-foreground transition-all hover:border-emerald-400/60 hover:bg-emerald-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <span className="flex items-center gap-3">
                  <Icons.Terminal className="h-4 w-4 text-emerald-400" />
                  CYBER RANGE
                </span>

                <span className="text-emerald-400">
                  {Object.keys(cyberRangeProgress.completions).length}/4
                </span>
              </button>
            )}
          </div>

          {/* Secondary menu cards */}
          <div className="mt-7 border-t border-border/70 pt-5">
            <p className="mb-3 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
              OPERATIVE TOOLS
            </p>

            <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2">
              {menuItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.action}
                    className="group flex min-h-[76px] items-center gap-3 rounded-lg border border-border/70 bg-background/30 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-4"
                  >
                    <span className="rounded-md border border-border bg-card/70 p-2 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                      <Icon className="h-4 w-4" />
                    </span>

                    <span className="min-w-0">
                      <span className="block font-mono text-[10px] font-bold tracking-wider text-foreground sm:text-xs">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => open("account")}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border/70 bg-background/30 px-4 py-3 font-mono text-[10px] tracking-[0.15em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-xs"
            >
              {user ? (
                <>
                  <Icons.Cloud className="h-4 w-4" />
                  ACCOUNT · CLOUD SAVE
                </>
              ) : (
                <>
                  <Icons.LogIn className="h-4 w-4" />
                  SIGN IN · OPTIONAL
                </>
              )}
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/50 pt-4 font-mono text-[9px] tracking-wider text-muted-foreground">
            <span>SYS.STATUS: NOMINAL</span>
            <span>BUILD // NEXUS-01</span>
          </div>
        </section>
      </div>

      {/* Existing functional panels are preserved */}
      {panel && (
        <Modal title={titles[panel]} onClose={closePanel}>
          {panel === "how" && <HowTo />}
          {panel === "achievements" && <Achievements />}
          {panel === "board" && <Leaderboard />}
          {panel === "settings" && <SettingsPanel />}
          {panel === "shop" && <Shop />}
          {panel === "profile" && <Profile />}
          {panel === "account" && <AccountPanel />}
        </Modal>
      )}
    </main>
  );
}

const titles: Record<Exclude<Panel, null>, string> = {
  how: "HOW TO PLAY",
  profile: "OPERATIVE PROFILE",
  account: "ACCOUNT",
  achievements: "ACHIEVEMENTS",
  board: "LEADERBOARD",
  settings: "SETTINGS",
  shop: "INTERFACE THEMES",
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      const elements = focusable();
      const target = getDialogTabStopTarget(
        event.key,
        event.shiftKey,
        elements,
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
        dialogRef.current,
      );
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-dialog-title"
        tabIndex={-1}
        className="panel glow-border anim-pop max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto p-4 text-left sm:max-h-[85vh] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="menu-dialog-title" className="font-display text-xl text-primary">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            aria-label="Close"
            onClick={onClose}
            className="tap-target flex-shrink-0 rounded-md text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HowTo() {
  return (
    <ul className="space-y-3 text-muted-foreground">
      <li>
        • Clear 5 sectors of real-world cybersecurity challenges. The last one is the NEXUS AI boss.
      </li>
      <li>• You start each sector with 5 health. Wrong answers or timeouts cost 1 health.</li>
      <li>• Correct answers earn XP, coins and score. Streaks give bonus XP.</li>
      <li>• Stuck? Spend 10 coins on a hint. Spend spare coins on interface themes.</li>
      <li>• Progress saves automatically on this device.</li>
    </ul>
  );
}

function Achievements() {
  const { player } = useGame();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ACHIEVEMENTS.map((a) => {
        const got = player.achievements[a.id];
        const Icon =
          (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
            a.icon
          ] ?? Icons.Award;
        return (
          <div
            key={a.id}
            className={cn(
              "rounded-md border p-3",
              got ? "border-accent" : "border-border opacity-50",
            )}
          >
            <div className="flex items-center gap-2 font-display text-sm">
              <Icon className={cn("h-4 w-4", got ? "text-accent" : "text-muted-foreground")} />{" "}
              {a.title}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [scope, setScope] = useState<"local" | "global">("local");
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void loadLeaderboard(scope, getLeaderboard, fetchGlobalBoard, ({ status, rows: result }) => {
      if (cancelled) return;
      setRows(result);
      setLoadState(status);
    });
    return () => {
      cancelled = true;
    };
  }, [retryCount, scope]);
  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(["local", "global"] as const).map((s) => (
          <button
            key={s}
            aria-pressed={scope === s}
            onClick={() => setScope(s)}
            className={cn(
              "tap-target rounded-md border px-3 py-1 font-mono text-xs",
              scope === s ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            {s === "local" ? "THIS DEVICE" : "GLOBAL"}
          </button>
        ))}
      </div>
      {loadState === "loading" && (
        <p role="status" className="font-mono text-sm text-muted-foreground">
          Loading leaderboard…
        </p>
      )}
      {loadState === "error" && (
        <div role="alert" className="mb-3 font-mono text-sm text-destructive">
          <p>Could not load the {scope} leaderboard.</p>
          <button className="mt-2 underline" onClick={() => setRetryCount((count) => count + 1)}>
            RETRY
          </button>
        </div>
      )}
      {loadState === "loaded" && rows.length === 0 && (
        <p className="font-mono text-sm text-muted-foreground">
          {getLeaderboardEmptyMessage(scope)}
        </p>
      )}
      {loadState === "loaded" && rows.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[28rem] font-mono text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">AGENT</th>
                <th className="text-right">SCORE</th>
                <th className="text-right">TIME</th>
                <th className="text-right">ACC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={cn("border-t border-border", r.demo && "text-muted-foreground")}
                >
                  <td className="py-2">{i + 1}</td>
                  <td>{r.name}</td>
                  <td className="text-right">{r.score}</td>
                  <td className="text-right">
                    {Math.floor(r.timeSeconds / 60)}m{r.timeSeconds % 60}s
                  </td>
                  <td className="text-right">{r.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border border-border p-3">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--primary)]"
      />
    </label>
  );
}

function SettingsPanel() {
  const { player, updateSettings, resetProgress } = useGame();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-3">
      <Toggle
        label="Sound effects"
        on={player.settings.sound}
        onChange={(v) => updateSettings({ sound: v })}
      />
      <Toggle
        label="Reduced motion"
        on={player.settings.reducedMotion}
        onChange={(v) => updateSettings({ reducedMotion: v })}
      />
      {confirm ? (
        <div className="flex gap-2">
          <Btn variant="danger" onClick={resetProgress}>
            ERASE ALL
          </Btn>
          <Btn variant="ghost" onClick={() => setConfirm(false)}>
            CANCEL
          </Btn>
        </div>
      ) : (
        <Btn variant="danger" onClick={() => setConfirm(true)}>
          RESET PROGRESS
        </Btn>
      )}
    </div>
  );
}

function Shop() {
  const { player, buyCosmetic, equipCosmetic } = useGame();
  return (
    <div className="grid gap-3">
      {COSMETICS.map((c) => {
        const owned = player.ownedCosmetics.includes(c.id);
        const active = player.cosmetic === c.id;
        return (
          <div
            key={c.id}
            className={cn(
              "flex items-center justify-between rounded-md border p-3",
              active ? "border-primary" : "border-border",
            )}
          >
            <div>
              <p className="font-display text-sm">{c.name}</p>
              <p className="text-sm text-muted-foreground">{c.description}</p>
            </div>
            {active ? (
              <span className="font-mono text-sm text-primary">ACTIVE</span>
            ) : owned ? (
              <Btn variant="ghost" onClick={() => equipCosmetic(c.id)}>
                EQUIP
              </Btn>
            ) : (
              <Btn onClick={() => buyCosmetic(c.id)} disabled={player.coins < c.price}>
                {c.price} ¢
              </Btn>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LevelSelect() {
  const { player, isUnlocked, startLevel, go } = useGame();
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl text-primary text-glow">SECTOR MAP</h1>
        <Btn variant="ghost" onClick={() => go("menu")}>
          BACK
        </Btn>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LEVELS.map((l) => {
          const open = isUnlocked(l.id);
          const rec = player.levels[l.id];
          return (
            <button
              key={l.id}
              disabled={!open}
              onClick={() => startLevel(l.id)}
              className={cn(
                "panel anim-rise group p-5 text-left transition-all",
                open ? "hover:glow-border hover:-translate-y-1" : "cursor-not-allowed opacity-50",
                l.id === 5 && open && "border-destructive",
              )}
            >
              <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                <span>SECTOR {l.code}</span>
                <span className={cn(l.id === 5 && "text-destructive")}>{l.difficulty}</span>
              </div>
              <h2 className="mt-2 font-display text-xl">{l.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{l.tagline}</p>
              <div className="mt-4 flex items-center justify-between font-mono text-xs">
                <span>{l.challenges.length} CHALLENGES</span>
                {!open ? (
                  <Lock className="h-4 w-4" />
                ) : rec?.completed ? (
                  <span className="flex items-center gap-1 text-accent">
                    <Check className="h-4 w-4" /> BEST {rec.bestScore}
                  </span>
                ) : (
                  <span className="text-primary">READY</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Profile() {
  const { player, accuracy } = useGame();
  const st = getStats();
  const stat = (k: string, v: string | number) => (
    <div key={k} className="rounded-md border border-border p-2">
      <p className="font-mono text-[10px] tracking-widest text-muted-foreground">{k}</p>
      <p className="font-display text-lg text-foreground">{v}</p>
    </div>
  );
  return (
    <div className="space-y-5 text-left">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stat("LEVEL", player.level)}
        {stat("SCORE", player.score)}
        {stat("ACCURACY", `${accuracy}%`)}
        {stat("BEST STREAK", player.highestStreak)}
        {stat("MISSIONS WON", st.missionCompletions)}
        {stat("FASTEST", st.fastestMission ? fmtTime(st.fastestMission) : "—")}
      </div>
      <div>
        <p className="mb-2 font-mono text-xs tracking-widest text-accent">SKILLS</p>
        {SKILLS.map((k) => {
          const v = player.skills[k] ?? 0;
          return (
            <div key={k} className="mb-2">
              <div className="flex justify-between font-mono text-xs uppercase">
                <span>{k}</span>
                <span>
                  {v}/{SKILL_MAX}
                </span>
              </div>
              <div className="h-2 rounded bg-muted">
                <div
                  className="h-2 rounded bg-primary"
                  style={{ width: `${Math.min(100, (v / SKILL_MAX) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <p className="mb-2 font-mono text-xs tracking-widest text-accent">PERSONAL BESTS</p>
        {LEVELS.map((l) => {
          const r = player.levels[l.id];
          return (
            <div
              key={l.id}
              className="flex justify-between border-b border-border py-1 font-mono text-xs"
            >
              <span>
                {String(l.id).padStart(2, "0")} {l.title}
              </span>
              <span className="text-muted-foreground">
                {r?.completed
                  ? `${r.bestScore} pts · ${r.bestTime !== undefined && Number.isFinite(r.bestTime) ? fmtTime(r.bestTime) : "—"} · ${r.bestAccuracy ?? 0}%`
                  : "LOCKED / NOT CLEARED"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
