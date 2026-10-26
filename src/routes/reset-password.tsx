import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Cyber Escape" },
      { name: "description", content: "Choose a new password for your Cyber Escape account." },
      { property: "og:title", content: "Reset Password — Cyber Escape" },
      { property: "og:description", content: "Choose a new password for your Cyber Escape account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <div className="grid-bg grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <form
        className="panel glow-border w-full max-w-md space-y-4 p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.auth.updateUser({ password: pw });
          if (error) return setMsg(error.message);
          setMsg("Password updated. Returning to the game…");
          setTimeout(() => navigate({ to: "/" }), 1200);
        }}
      >
        <h1 className="font-display text-3xl text-primary text-glow">NEW PASSWORD</h1>
        <input
          type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="new password"
          className="w-full rounded-md border border-input bg-background px-4 py-3 font-mono outline-none focus:border-primary"
        />
        <button type="submit" className="w-full rounded-md bg-primary px-4 py-3 font-display text-primary-foreground">SAVE</button>
        {msg && <p className="font-mono text-sm text-accent">{msg}</p>}
      </form>
    </div>
  );
}
