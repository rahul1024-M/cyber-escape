/**
 * Optional online layer. The game never waits on this: every call fails soft
 * and guest/local play keeps working when signed out or offline.
 */
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { LeaderboardEntry, PlayerState } from "./types";

export type SyncStatus = "guest" | "syncing" | "synced" | "offline" | "error";

interface CloudSaveSyncOptions {
  fetchSave: (userId: string) => Promise<PlayerState | null>;
  pushSave: (userId: string, player: PlayerState) => Promise<void>;
  getLocalSave: () => PlayerState | null;
  applyCloudSave: (player: PlayerState) => void;
  onStatus: (status: SyncStatus) => void;
  isOnline: () => boolean;
  debounceMs?: number;
}

/** Serializes cloud initialization and save uploads; failed work stays retryable. */
export class CloudSaveSync {
  private userId: string | null = null;
  private readyUserId: string | null = null;
  private latestPlayer: PlayerState | null = null;
  private pendingSave = false;
  private flushRequested = false;
  private inFlight = false;
  private disposed = false;
  private lastSyncedSave = "";
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly debounceMs: number;

  constructor(private readonly options: CloudSaveSyncOptions) {
    this.debounceMs = options.debounceMs ?? 1500;
  }

  setUser(userId: string | null) {
    this.disposed = false;
    if (this.userId === userId) {
      if (userId && this.readyUserId !== userId) void this.pump();
      return;
    }
    this.userId = userId;
    this.readyUserId = null;
    this.pendingSave = false;
    this.flushRequested = false;
    this.lastSyncedSave = "";
    this.clearDebounce();
    if (!userId) {
      this.options.onStatus("guest");
      return;
    }
    if (!this.options.isOnline()) {
      this.options.onStatus("offline");
      return;
    }
    void this.pump();
  }

  updatePlayer(player: PlayerState) {
    this.disposed = false;
    this.latestPlayer = player;
    if (!player.name || !this.userId || this.readyUserId !== this.userId) return;
    if (JSON.stringify(player) === this.lastSyncedSave) return;
    this.pendingSave = true;
    this.flushRequested = false;
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.flushRequested = true;
      void this.pump();
    }, this.debounceMs);
  }

  setOffline() {
    this.disposed = false;
    if (this.userId) {
      this.clearDebounce();
      this.flushRequested = false;
      this.options.onStatus("offline");
    }
  }

  setOnline() {
    this.disposed = false;
    if (!this.userId) return;
    if (this.readyUserId !== this.userId) {
      void this.pump();
      return;
    }
    if (this.pendingSave) {
      this.clearDebounce();
      this.flushRequested = true;
      void this.pump();
    }
  }

  retry() {
    this.disposed = false;
    if (!this.userId) return;
    if (!this.options.isOnline()) {
      this.options.onStatus("offline");
      return;
    }
    if (this.readyUserId !== this.userId) {
      void this.pump();
      return;
    }
    if (this.pendingSave) {
      this.clearDebounce();
      this.flushRequested = true;
      void this.pump();
    }
  }

  dispose() {
    this.disposed = true;
    this.clearDebounce();
  }

  private clearDebounce() {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  private async pump() {
    if (this.inFlight || this.disposed || !this.userId) return;
    this.inFlight = true;
    const startedForUserId = this.userId;
    try {
      const userId = this.userId;
      if (!this.options.isOnline()) {
        this.flushRequested = false;
        this.options.onStatus("offline");
        return;
      }
      if (this.readyUserId !== userId) {
        this.options.onStatus("syncing");
        let cloud: PlayerState | null;
        try {
          cloud = await this.options.fetchSave(userId);
        } catch {
          if (this.userId === userId) {
            this.flushRequested = false;
            this.options.onStatus(this.options.isOnline() ? "error" : "offline");
          }
          return;
        }
        if (this.disposed || this.userId !== userId) return;

        const local = this.options.getLocalSave() ?? this.latestPlayer;
        const pick = pickNewerSave(local, cloud);
        if (pick === "cloud" && cloud) {
          this.lastSyncedSave = JSON.stringify(cloud);
          this.latestPlayer = cloud;
          this.options.applyCloudSave(cloud);
        } else if (pick === "local" && local?.name) {
          this.latestPlayer = local;
          this.pendingSave = true;
          this.flushRequested = false;
        }
        this.readyUserId = userId;
        if (this.pendingSave) this.schedulePendingSave();
        else this.options.onStatus("synced");
      }

      if (!this.flushRequested || !this.pendingSave || !this.latestPlayer) return;
      const save = this.latestPlayer;
      this.options.onStatus("syncing");
      try {
        await this.options.pushSave(userId, save);
      } catch {
        if (this.userId === userId) {
          this.flushRequested = false;
          this.options.onStatus(this.options.isOnline() ? "error" : "offline");
        }
        return;
      }
      if (this.disposed || this.userId !== userId) return;
      this.lastSyncedSave = JSON.stringify(save);
      this.pendingSave = JSON.stringify(this.latestPlayer) !== this.lastSyncedSave;
      this.flushRequested = false;
      if (this.pendingSave) {
        this.flushRequested = true;
        void this.pump();
      } else {
        this.options.onStatus("synced");
      }
    } catch {
      if (this.userId) {
        this.flushRequested = false;
        this.options.onStatus(this.options.isOnline() ? "error" : "offline");
      }
    } finally {
      this.inFlight = false;
      if (!this.disposed && this.userId && this.userId !== startedForUserId) {
        void this.pump();
      } else if (
        !this.disposed &&
        this.userId &&
        this.options.isOnline() &&
        this.flushRequested &&
        this.pendingSave
      ) {
        void this.pump();
      }
    }
  }

  private schedulePendingSave() {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.flushRequested = true;
      void this.pump();
    }, this.debounceMs);
  }
}

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    let authStateReceived = false;
    let unsubscribe: (() => void) | undefined;
    const reportUnavailable = (error: unknown) => {
      console.error("[Supabase] Authentication unavailable; continuing as guest.", error);
      if (active) {
        setUser(null);
        setAuthUnavailable(true);
        setReady(true);
      }
    };
    try {
      const { data } = supabase.auth.onAuthStateChange((_e, session) => {
        authStateReceived = true;
        setUser(session?.user ?? null);
        setAuthUnavailable(false);
        setReady(true);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void loadAuthSession(() => supabase.auth.getSession()).then(
        ({ user: sessionUser, error }) => {
          if (!active) return;
          if (error) {
            if (authStateReceived) {
              console.error("[Supabase] Could not read the current session.", error);
            } else {
              reportUnavailable(error);
            }
            return;
          }
          if (!authStateReceived) {
            setUser(sessionUser);
            setAuthUnavailable(false);
            setReady(true);
          }
        },
      );
    } catch (error) {
      reportUnavailable(error);
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  return { user, ready, authUnavailable };
}

export async function loadAuthSession<T>(
  getSession: () => Promise<{
    data: { session: { user: T } | null };
    error: unknown | null;
  }>,
): Promise<{ user: T | null; error: unknown | null }> {
  try {
    const { data, error } = await getSession();
    return { user: error ? null : (data.session?.user ?? null), error };
  } catch (error) {
    return { user: null, error };
  }
}

/** Which save represents more progress. Pure so it can be tested. */
export function pickNewerSave(local: PlayerState | null, cloud: PlayerState | null): "local" | "cloud" | "none" {
  if (!local && !cloud) return "none";
  if (!cloud) return "local";
  if (!local) return "cloud";
  const rank = (p: PlayerState) => [p.challengesCompleted, p.xp, p.score];
  const a = rank(local);
  const b = rank(cloud);
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return "local";
    if ((a[i] ?? 0) < (b[i] ?? 0)) return "cloud";
  }
  return "cloud";
}

export async function fetchCloudSave(userId: string): Promise<PlayerState | null> {
  const { data, error } = await supabase.from("cloud_saves").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data?.data as unknown as PlayerState) ?? null;
}

export async function pushCloudSave(userId: string, player: PlayerState) {
  const { error } = await supabase
    .from("cloud_saves")
    .upsert({ user_id: userId, data: player as unknown as Json, updated_at: new Date().toISOString() });
  if (error) throw error;
}

interface GlobalBoardRow {
  codename: string;
  score: number;
  time_seconds: number;
  accuracy: number;
  created_at: string;
}

export function parseGlobalBoardResult(
  data: GlobalBoardRow[] | null,
  error: { message: string } | null,
): LeaderboardEntry[] {
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    name: r.codename,
    score: r.score,
    timeSeconds: r.time_seconds,
    accuracy: r.accuracy,
    date: r.created_at.slice(0, 10),
  }));
}

export async function fetchGlobalBoard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select("codename, score, time_seconds, accuracy, created_at")
    .order("score", { ascending: false })
    .limit(20);
  return parseGlobalBoardResult(data, error);
}
