/** Web Audio sound effects — no audio files required. */
export type SoundName =
  | "click"
  | "correct"
  | "wrong"
  | "levelComplete"
  | "levelUp"
  | "achievement"
  | "boss"
  | "victory"
  | "streak"
  | "type";

let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain = 0.07) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

const RECIPES: Record<SoundName, () => void> = {
  click: () => tone(420, 0, 0.06, "square", 0.04),
  correct: () => {
    tone(660, 0, 0.1, "triangle");
    tone(880, 0.08, 0.14, "triangle");
  },
  wrong: () => {
    tone(180, 0, 0.16, "sawtooth", 0.06);
    tone(120, 0.1, 0.2, "sawtooth", 0.05);
  },
  levelComplete: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.16, "triangle"));
  },
  levelUp: () => {
    [440, 554, 659, 880].forEach((f, i) => tone(f, i * 0.07, 0.18, "sine", 0.08));
  },
  achievement: () => {
    [784, 988, 1318].forEach((f, i) => tone(f, i * 0.08, 0.2, "sine", 0.07));
  },
  boss: () => {
    tone(90, 0, 0.5, "sawtooth", 0.07);
    tone(135, 0.05, 0.45, "square", 0.04);
  },
  streak: () => {
    [660, 990].forEach((f, i) => tone(f, i * 0.05, 0.1, "square", 0.04));
  },
  type: () => tone(1200, 0, 0.02, "square", 0.015),
  victory: () => {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      tone(f, i * 0.12, 0.28, "triangle", 0.08),
    );
  },
};

export function playSound(name: SoundName) {
  if (!enabled) return;
  try {
    RECIPES[name]?.();
  } catch {
    /* audio unavailable — silent fallback */
  }
}
