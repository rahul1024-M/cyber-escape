import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CloudSaveSync,
  loadAuthSession,
  parseGlobalBoardResult,
  pickNewerSave,
  type SyncStatus,
} from "./cloud";
import { createPlayer } from "./storage";

afterEach(() => {
  vi.useRealTimers();
});

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("pickNewerSave", () => {
  it("keeps the save with more challenges completed", () => {
    const a = { ...createPlayer("A"), challengesCompleted: 5 };
    const b = { ...createPlayer("A"), challengesCompleted: 2, score: 9999 };
    expect(pickNewerSave(a, b)).toBe("local");
    expect(pickNewerSave(b, a)).toBe("cloud");
  });
  it("uses local when there is no cloud save", () => {
    expect(pickNewerSave(createPlayer("A"), null)).toBe("local");
  });
});

describe("auth session bootstrap", () => {
  it("returns the authenticated user when session retrieval succeeds", async () => {
    const user = { id: "guest-test-user" };
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { user } },
      error: null,
    });

    await expect(loadAuthSession(getSession)).resolves.toEqual({ user, error: null });
  });

  it("reports missing configuration without throwing or inventing a user", async () => {
    const error = new Error("missing Supabase configuration");
    const getSession = vi.fn().mockRejectedValue(error);

    await expect(loadAuthSession(getSession)).resolves.toEqual({ user: null, error });
  });

  it("does not accept a session when the auth client reports an error", async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { user: { id: "unverified-user" } } },
      error: new Error("session unavailable"),
    });

    await expect(loadAuthSession(getSession)).resolves.toEqual({
      user: null,
      error: expect.any(Error),
    });
  });
});

describe("CloudSaveSync", () => {
  it("recovers from an initial fetch failure without losing or overwriting local progress", async () => {
    vi.useFakeTimers();
    const local = { ...createPlayer("LOCAL"), challengesCompleted: 4, score: 800 };
    const olderCloud = { ...createPlayer("CLOUD"), challengesCompleted: 2, score: 9000 };
    let currentOnline = true;
    const applyCloudSave = vi.fn();
    const pushSave = vi.fn().mockResolvedValue(undefined);
    const onStatus = vi.fn<(status: SyncStatus) => void>();
    const fetchSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce(olderCloud);
    const sync = new CloudSaveSync({
      fetchSave,
      pushSave,
      getLocalSave: () => local,
      applyCloudSave,
      onStatus,
      isOnline: () => currentOnline,
      debounceMs: 10,
    });

    sync.setUser("user-1");
    await settlePromises();
    expect(fetchSave).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith("error");

    sync.setOnline();
    await settlePromises();
    await vi.advanceTimersByTimeAsync(10);
    await settlePromises();

    expect(fetchSave).toHaveBeenCalledTimes(2);
    expect(applyCloudSave).not.toHaveBeenCalled();
    expect(pushSave).toHaveBeenCalledWith("user-1", local);
    expect(onStatus).toHaveBeenLastCalledWith("synced");

    currentOnline = false;
    sync.setOffline();
    sync.dispose();
  });

  it("does not fetch while offline and initializes when connectivity returns", async () => {
    vi.useFakeTimers();
    let currentOnline = false;
    const cloud = createPlayer("CLOUD");
    const fetchSave = vi.fn().mockResolvedValue(cloud);
    const applyCloudSave = vi.fn();
    const onStatus = vi.fn<(status: SyncStatus) => void>();
    const sync = new CloudSaveSync({
      fetchSave,
      pushSave: vi.fn().mockResolvedValue(undefined),
      getLocalSave: () => null,
      applyCloudSave,
      onStatus,
      isOnline: () => currentOnline,
      debounceMs: 10,
    });

    sync.setUser("user-1");
    expect(fetchSave).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith("offline");

    currentOnline = true;
    sync.setOnline();
    await settlePromises();

    expect(fetchSave).toHaveBeenCalledTimes(1);
    expect(applyCloudSave).toHaveBeenCalledWith(cloud);
    expect(onStatus).toHaveBeenLastCalledWith("synced");
    sync.dispose();
  });

  it("preserves the latest local progress offline and uploads it once after reconnect", async () => {
    vi.useFakeTimers();
    let currentOnline = false;
    const olderLocal = { ...createPlayer("LOCAL"), score: 100 };
    const latestLocal = { ...olderLocal, score: 250, xp: 75 };
    let localSave = olderLocal;
    const pushSave = vi.fn().mockResolvedValue(undefined);
    const sync = new CloudSaveSync({
      fetchSave: vi.fn().mockResolvedValue(null),
      pushSave,
      getLocalSave: () => localSave,
      applyCloudSave: vi.fn(),
      onStatus: vi.fn(),
      isOnline: () => currentOnline,
      debounceMs: 10,
    });

    sync.setUser("user-1");
    sync.updatePlayer(latestLocal);
    localSave = latestLocal;
    expect(pushSave).not.toHaveBeenCalled();

    currentOnline = true;
    sync.setOnline();
    await settlePromises();
    await vi.advanceTimersByTimeAsync(10);
    await settlePromises();

    expect(pushSave).toHaveBeenCalledTimes(1);
    expect(pushSave).toHaveBeenCalledWith("user-1", latestLocal);
    expect(localSave).toEqual(latestLocal);
    sync.dispose();
  });

  it("retries a failed pending save on reconnect without retrying in a loop", async () => {
    vi.useFakeTimers();
    let currentOnline = true;
    const local = createPlayer("LOCAL");
    const pushSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary save failure"))
      .mockResolvedValueOnce(undefined);
    const onStatus = vi.fn<(status: SyncStatus) => void>();
    const sync = new CloudSaveSync({
      fetchSave: vi.fn().mockResolvedValue(null),
      pushSave,
      getLocalSave: () => local,
      applyCloudSave: vi.fn(),
      onStatus,
      isOnline: () => currentOnline,
      debounceMs: 10,
    });

    sync.setUser("user-1");
    await settlePromises();
    await vi.advanceTimersByTimeAsync(10);
    await settlePromises();

    expect(pushSave).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith("error");

    currentOnline = false;
    sync.setOffline();
    currentOnline = true;
    sync.setOnline();
    await settlePromises();

    expect(pushSave).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenLastCalledWith("synced");
    sync.dispose();
  });

  it("does not duplicate an in-flight save when reconnect is signaled repeatedly", async () => {
    vi.useFakeTimers();
    let currentOnline = true;
    const local = createPlayer("LOCAL");
    let resolvePush!: () => void;
    const pushSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePush = resolve;
        }),
    );
    const sync = new CloudSaveSync({
      fetchSave: vi.fn().mockResolvedValue(null),
      pushSave,
      getLocalSave: () => local,
      applyCloudSave: vi.fn(),
      onStatus: vi.fn(),
      isOnline: () => currentOnline,
      debounceMs: 10,
    });

    sync.setUser("user-1");
    await settlePromises();
    await vi.advanceTimersByTimeAsync(10);
    expect(pushSave).toHaveBeenCalledTimes(1);

    currentOnline = false;
    sync.setOffline();
    currentOnline = true;
    sync.setOnline();
    sync.setOnline();
    resolvePush();
    await settlePromises();

    expect(pushSave).toHaveBeenCalledTimes(1);
    sync.dispose();
  });

  it("serializes save requests and sends the newest pending progress", async () => {
    vi.useFakeTimers();
    const initial = createPlayer("LOCAL");
    const newest = { ...initial, score: 500 };
    let resolveFirst!: () => void;
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const pushed: (typeof initial)[] = [];
    const pushSave = vi.fn((_userId: string, player: typeof initial) => {
      pushed.push(player);
      activeRequests++;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      if (pushed.length === 1) {
        return new Promise<void>((resolve) => {
          resolveFirst = () => {
            activeRequests--;
            resolve();
          };
        });
      }
      activeRequests--;
      return Promise.resolve();
    });
    const sync = new CloudSaveSync({
      fetchSave: vi.fn().mockResolvedValue(null),
      pushSave,
      getLocalSave: () => initial,
      applyCloudSave: vi.fn(),
      onStatus: vi.fn(),
      isOnline: () => true,
      debounceMs: 10,
    });

    sync.setUser("user-1");
    await settlePromises();
    await vi.advanceTimersByTimeAsync(10);
    expect(pushSave).toHaveBeenCalledTimes(1);

    sync.updatePlayer(newest);
    await vi.advanceTimersByTimeAsync(10);
    expect(pushSave).toHaveBeenCalledTimes(1);

    resolveFirst();
    await settlePromises();

    expect(pushSave).toHaveBeenCalledTimes(2);
    expect(pushed[1]).toEqual(newest);
    expect(maxActiveRequests).toBe(1);
    sync.dispose();
  });
});

describe("parseGlobalBoardResult", () => {
  it("keeps a successful empty response distinct from an error", () => {
    expect(parseGlobalBoardResult([], null)).toEqual([]);
    expect(parseGlobalBoardResult(null, null)).toEqual([]);
    expect(() => parseGlobalBoardResult(null, { message: "backend unavailable" })).toThrow(
      "backend unavailable",
    );
  });
});
