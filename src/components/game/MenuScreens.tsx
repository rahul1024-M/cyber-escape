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
    <div className="grid min-h-screen place-items-center p-4">
      <form
        className="panel glow-border anim-rise w-full max-w-md p-8"
        onSubmit={(e) => {
          e.preventDefault();
          setName(v);
        }}
      >
        <p className="font-mono text-xs tracking-[0.3em] text-accent">NEW OPERATIVE</p>
        <h1 className="mt-2 font-display text-4xl text-primary text-glow">CYBER ESCAPE</h1>
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
  const anyDone = Object.values(player.levels).some((l) => l.completed);
  const open = (p: Panel) => {
    sfx("click");
    setPanel(p);
  };
  return (
    <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-3xl flex-col items-center justify-center p-6 text-center">
      <p className="font-mono text-xs tracking-[0.4em] text-accent anim-flicker">
        NEXUS // INTRUSION SHELL
      </p>
      <h1 className="my-4 font-display text-5xl text-primary text-glow sm:text-7xl">
        CYBER ESCAPE
      </h1>
      <p className="mb-10 max-w-lg text-lg text-muted-foreground">
        Welcome back, <span className="text-foreground">{player.name}</span>. The firewall is
        waiting.
      </p>
      <div className="grid w-full max-w-sm gap-3">
        {hasSave && anyDone ? (
          <Btn onClick={continueGame}>CONTINUE</Btn>
        ) : (
          <Btn onClick={startNewGame}>START MISSION</Btn>
        )}
        <Btn variant="ghost" onClick={() => go("levels")}>
          SECTOR MAP
        </Btn>
        {isEnabled("ENABLE_CYBER_RANGE") && (
          <Btn variant="ghost" onClick={openCyberRange}>
            CYBER RANGE · {Object.keys(cyberRangeProgress.completions).length}/4
          </Btn>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Btn variant="ghost" onClick={() => open("how")}>
            HOW TO PLAY
          </Btn>
          <Btn variant="ghost" onClick={() => open("achievements")}>
            BADGES
          </Btn>
          <Btn variant="ghost" onClick={() => open("board")}>
            LEADERBOARD
          </Btn>
          <Btn variant="ghost" onClick={() => open("shop")}>
            THEMES
          </Btn>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Btn variant="ghost" onClick={() => open("profile")}>
            PROFILE
          </Btn>
          <Btn variant="ghost" onClick={() => open("settings")}>
            SETTINGS
          </Btn>
        </div>
        <Btn variant="ghost" onClick={() => open("account")}>
          {user ? "ACCOUNT · CLOUD SAVE" : "SIGN IN (OPTIONAL)"}
        </Btn>
      </div>
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
    </div>
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
        className="panel glow-border anim-pop max-h-[85vh] w-full max-w-xl overflow-y-auto p-6 text-left"
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
