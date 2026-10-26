/**
 * Storage abstraction. The engine talks to `storageService` only; swap the
 * implementation for a cloud-backed one later without touching the UI.
 */
import { loadGame, resetGame, saveGame } from "../storage";
import type { PlayerState, Settings } from "../types";

export interface StorageService {
  readonly kind: "local" | "cloud";
  loadPlayer(): PlayerState | null;
  savePlayer(p: PlayerState): void;
  loadProgress(): PlayerState["levels"];
  saveProgress(levels: PlayerState["levels"]): void;
  loadSettings(): Settings | null;
  saveSettings(s: Settings): void;
  clear(): void;
}

class LocalStorageService implements StorageService {
  readonly kind = "local" as const;
  private lastSaved = "";
  loadPlayer() {
    return loadGame();
  }
  savePlayer(p: PlayerState) {
    const json = JSON.stringify(p);
    if (json === this.lastSaved) return; // skip redundant writes
    this.lastSaved = json;
    saveGame(p);
  }
  loadProgress() {
    return loadGame()?.levels ?? {};
  }
  saveProgress(levels: PlayerState["levels"]) {
    const p = loadGame();
    if (p) this.savePlayer({ ...p, levels });
  }
  loadSettings() {
    return loadGame()?.settings ?? null;
  }
  saveSettings(settings: Settings) {
    const p = loadGame();
    if (p) this.savePlayer({ ...p, settings });
  }
  clear() {
    this.lastSaved = "";
    resetGame();
  }
}

export const storageService: StorageService = new LocalStorageService();
