import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useGame } from "@/game/GameProvider";
import { Btn } from "./Hud";
import { signInWithPassword } from "./accountAuth";

const STATUS: Record<string, string> = {
  guest: "GUEST · saved on this device only",
  syncing: "SYNCING…",
  synced: "CLOUD SAVE · up to date",
  offline: "OFFLINE · will sync when back online",
  error: "SYNC FAILED · progress still saved on this device",
};

export function AccountPanel() {
  const { user, syncStatus, player, retrySync } = useGame();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <div className="space-y-4">
        <p className="font-mono text-sm text-secondary">{STATUS[syncStatus]}</p>
        {(syncStatus === "error" || syncStatus === "offline") && (
          <Btn variant="ghost" className="w-full" onClick={retrySync}>RETRY CLOUD SYNC</Btn>
        )}
        <p>Signed in as <span className="text-foreground">{user.email}</span></p>
        <p className="text-sm text-muted-foreground">
          Progress for <b>{player.name}</b> is backed up to your account. A new full run starting
          at Sector 01 can submit a server-verified score to the global leaderboard.
        </p>
        <Btn variant="ghost" className="w-full" onClick={() => void supabase.auth.signOut()}>SIGN OUT</Btn>
      </div>
    );
  }

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        return "Check your email for a reset link.";
      }
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pw,
          options: { emailRedirectTo: window.location.origin, data: { codename: player.name } },
        });
        if (error) throw error;
        return data.session ? null : "Check your email to confirm your account, then sign in.";
      }
      await signInWithPassword(supabase.auth, email, pw);
      return null;
    });

  const google = () =>
    run(async () => {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (r.error) throw r.error;
      return null;
    });

  return (
    <div className="space-y-4">
      <p className="font-mono text-sm text-muted-foreground">{STATUS[syncStatus]}</p>
      {syncStatus === "error" && (
        <p className="text-sm text-muted-foreground">
          Account services are unavailable. Guest progress remains saved on this device.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        An account is optional. Sign in to back up your progress. A new full run from Sector 01 can
        qualify for the verified global leaderboard. Your current progress is kept.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="email" required placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-4 py-3 font-mono text-foreground outline-none focus:border-primary"
        />
        {mode !== "forgot" && (
          <input
            type="password" required minLength={6} placeholder="password" value={pw} onChange={(e) => setPw(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-4 py-3 font-mono text-foreground outline-none focus:border-primary"
          />
        )}
        <Btn type="submit" className="w-full" disabled={busy}>
          {mode === "in" ? "SIGN IN" : mode === "up" ? "CREATE ACCOUNT" : "SEND RESET LINK"}
        </Btn>
      </form>
      {mode !== "forgot" && (
        <Btn variant="ghost" className="w-full" onClick={() => void google()} disabled={busy}>CONTINUE WITH GOOGLE</Btn>
      )}
      {msg && <p className="font-mono text-sm text-accent">{msg}</p>}
      <div className="flex flex-wrap justify-between gap-2 font-mono text-xs text-muted-foreground">
        <button type="button" onClick={() => setMode(mode === "up" ? "in" : "up")} className="underline">
          {mode === "up" ? "Have an account? Sign in" : "New here? Create account"}
        </button>
        <button type="button" onClick={() => setMode("forgot")} className="underline">Forgot password?</button>
      </div>
    </div>
  );
}
