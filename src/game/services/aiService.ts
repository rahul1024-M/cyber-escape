/**
 * NEXUS AI service. Uses local, static responses — no API keys in the browser.
 * A future secure server-side AI integration can replace these bodies.
 */
import type { Challenge } from "../types";
import type { NexusState, PerformanceProfile } from "../platform";

const LINES: Record<NexusState, string[]> = {
  IDLE: ["NEXUS is dormant. For now."],
  OBSERVING: ["I see you, intruder.", "Your keystrokes are being logged."],
  WARNING: ["Turn back. This sector is monitored.", "Countermeasures are arming."],
  CHALLENGING: ["Prove you belong here.", "Solve this, if you can."],
  ATTACKING: ["Purging intruder process...", "Firewall surge deployed."],
  DEFEATED: ["...core... integrity... failing...", "You were not supposed to get this far."],
};

export function nexusStateFor(opts: {
  levelId: number;
  health: number;
  answeredWrong: boolean;
  completed: boolean;
}): NexusState {
  if (opts.completed) return opts.levelId === 5 ? "DEFEATED" : "IDLE";
  if (opts.answeredWrong) return "ATTACKING";
  if (opts.levelId === 5) return "CHALLENGING";
  if (opts.health <= 2) return "WARNING";
  return "OBSERVING";
}

export const aiService = {
  async generateHint(c: Challenge): Promise<string> {
    return c.hint;
  },
  async explainAnswer(c: Challenge): Promise<string> {
    return c.explanation;
  },
  generateMissionDialogue(state: NexusState, seed = 0): string {
    const pool = LINES[state];
    return pool[seed % pool.length] ?? "";
  },
  async analyzePerformance(p: PerformanceProfile): Promise<string> {
    if (p.accuracy >= 90) return "Exceptional precision. NEXUS considers you a priority threat.";
    if (p.accuracy >= 70) return "Solid work. Review the explanations to sharpen weak spots.";
    return "Slow down and read each clue carefully. Hints cost coins but save health.";
  },
  async generateScenario(): Promise<null> {
    return null; // not available until a server-side AI integration exists
  },
};
