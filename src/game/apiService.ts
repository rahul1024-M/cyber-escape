/**
 * API service layer.
 *
 * Every call is a LOCAL implementation (no network) so the game is fully playable
 * without a backend. To attach a backend later, replace each body with a request
 * to the endpoint named in the comment — signatures stay the same.
 *
 * The leaderboard is LOCAL (this device). It is never presented as global.
 */
import { loadLeaderboard, submitScore as submitScoreLocal } from "./storage";
import { storageService } from "./services/storageService";
import { ACHIEVEMENTS } from "./achievements";
import { LEVELS } from "./levels";
import { MISSIONS, getMission as findMission } from "./missions";
import { isEnabled } from "./flags";
import type { Mission } from "./platform";
import type { Achievement, LeaderboardEntry, Level, PlayerState } from "./types";

export type LeaderboardScope = "local" | "global";

// Future: GET /api/player
export async function getPlayer(): Promise<PlayerState | null> {
  return storageService.loadPlayer();
}

// Future: POST /api/player
export async function savePlayer(player: PlayerState): Promise<void> {
  storageService.savePlayer(player);
}

// Future: GET /api/missions
export async function getMissions(): Promise<Mission[]> {
  return MISSIONS;
}

// Future: GET /api/missions/:id
export async function getMission(id: string): Promise<Mission | null> {
  return findMission(id);
}

// Future: POST /api/score
export async function submitScore(entry: LeaderboardEntry): Promise<void> {
  submitScoreLocal(entry);
}

// Future: GET /api/leaderboard?scope=global
export async function getLeaderboard(scope: LeaderboardScope = "local"): Promise<LeaderboardEntry[]> {
  if (scope === "global" && !isEnabled("ENABLE_GLOBAL_LEADERBOARD")) return [];
  return loadLeaderboard();
}

// Future: GET /api/achievements
export async function getAchievements(): Promise<Achievement[]> {
  return ACHIEVEMENTS;
}

// Future: GET /api/challenges
export async function getLevels(): Promise<Level[]> {
  return LEVELS;
}
