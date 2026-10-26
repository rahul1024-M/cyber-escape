/**
 * Feature flags. Optional systems stay OFF unless explicitly enabled.
 * The Cyber Range is a development-only opt-in via VITE_ENABLE_CYBER_RANGE.
 */
export const FLAGS = {
  ENABLE_CYBER_RANGE: import.meta.env.DEV && import.meta.env["VITE_ENABLE_CYBER_RANGE"] === "true",
  ENABLE_DAILY_CHALLENGE: false,
  ENABLE_AI: false,
  ENABLE_MULTIPLAYER: false,
  ENABLE_ACCOUNTS: true,
  ENABLE_GLOBAL_LEADERBOARD: true,
  ENABLE_PROFILE: true,
  ENABLE_LOCAL_ANALYTICS: true,
} as const;

export type FeatureFlag = keyof typeof FLAGS;
export const isEnabled = (f: FeatureFlag): boolean => FLAGS[f];
