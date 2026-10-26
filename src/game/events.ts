/**
 * Generic game event bus. The engine emits; analytics (and later multiplayer
 * sync or a backend) subscribe. Listener errors are isolated so they never break play.
 */
export type GameEventType =
  | "MISSION_STARTED"
  | "MISSION_COMPLETED"
  | "MISSION_FAILED"
  | "CHALLENGE_STARTED"
  | "CHALLENGE_COMPLETED"
  | "CHALLENGE_FAILED"
  | "PLAYER_DAMAGED"
  | "HINT_USED"
  | "XP_GAINED"
  | "COIN_GAINED"
  | "ACHIEVEMENT_UNLOCKED"
  | "BOSS_PHASE_STARTED"
  | "PLAYER_ACTION";

export interface GameEvent {
  type: GameEventType;
  at: number;
  missionId?: string;
  challengeId?: string;
  value?: number;
  data?: Record<string, unknown>;
}

type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();

export function onGameEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(type: GameEventType, payload: Omit<GameEvent, "type" | "at"> = {}) {
  const event: GameEvent = { type, at: Date.now(), ...payload };
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      /* a broken listener must not crash the game */
    }
  });
}
