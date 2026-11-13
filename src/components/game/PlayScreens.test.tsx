import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEXUS_CHALLENGES, NEXUS_BOSS_HEALTH } from "@/game/nexusEncounter";
import { LEVELS } from "@/game/levels";
import { PlayScreen } from "./PlayScreens";

const { useGameMock } = vi.hoisted(() => ({ useGameMock: vi.fn() }));

vi.mock("@/game/GameProvider", () => ({ useGame: useGameMock }));
vi.mock("./nexusMentorPanel", () => ({ NexusMentorPanel: () => null }));

describe("NEXUS encounter visual integration", () => {
  beforeEach(() => {
    useGameMock.mockReset();
  });

  it("adds the CSS-safe core without replacing existing encounter controls or text", () => {
    useGameMock.mockReturnValue({
      player: { levels: {} },
      run: {
        levelId: 5,
        index: 0,
        health: 4,
        hintsInLevel: 0,
        correctInLevel: 0,
        wrongInLevel: 0,
        runStreak: 0,
        bossEncounterState: { phase: "reconnaissance", bossHealth: NEXUS_BOSS_HEALTH },
      },
      challenge: NEXUS_CHALLENGES[0],
      answered: null,
      answer: vi.fn(),
      updateEvidenceBoard: vi.fn(),
      selectNetworkPathNode: vi.fn(),
      resetNetworkPath: vi.fn(),
      retryNetworkPath: vi.fn(),
      retryBossDecision: vi.fn(),
      nextChallenge: vi.fn(),
      hintShown: false,
      buyHint: vi.fn(),
      timeLeft: null,
      shake: 0,
      go: vi.fn(),
    });

    const html = renderToStaticMarkup(<PlayScreen />);

    expect(html).toContain("nexus-ai-core-fallback");
    expect(html).toContain('data-phase="reconnaissance"');
    expect(html).toContain("NEXUS: ");
    expect(html).toContain("NEXUS CORE INTEGRITY");
    expect(html).toContain(`PLAYER HEALTH 4/5`);
    expect(html).toContain("HINTS 3/3");
    expect(html).toContain("Which event most strongly indicates a compromised account?");
    expect(html).toContain("An admin login follows repeated failures");
    expect(html).toContain("HINT (10 coins · 3 LEFT)");
  });

  it.each([
    [{ correct: true, chosen: "C" }, "correct"],
    [{ correct: false, chosen: "A" }, "incorrect"],
  ] as const)("passes %s answer feedback to the visual only", (answered, feedback) => {
    useGameMock.mockReturnValue({
      player: { levels: {} },
      run: {
        levelId: 5,
        index: 0,
        health: 4,
        hintsInLevel: 1,
        correctInLevel: 0,
        wrongInLevel: 0,
        runStreak: 0,
        bossEncounterState: { phase: "containment", bossHealth: 4 },
      },
      challenge: NEXUS_CHALLENGES[2],
      answered,
      answer: vi.fn(),
      updateEvidenceBoard: vi.fn(),
      selectNetworkPathNode: vi.fn(),
      resetNetworkPath: vi.fn(),
      retryNetworkPath: vi.fn(),
      retryBossDecision: vi.fn(),
      nextChallenge: vi.fn(),
      hintShown: false,
      buyHint: vi.fn(),
      timeLeft: null,
      shake: 0,
      go: vi.fn(),
    });

    const html = renderToStaticMarkup(<PlayScreen />);

    expect(html).toContain('data-phase="containment"');
    expect(html).toContain(`data-feedback="${feedback}"`);
    expect(html).toContain("PHASE 2 — CONTAINMENT");
    expect(html).toContain("NEXUS CORE INTEGRITY");
    expect(html).toContain("PLAYER HEALTH 4/5");
  });

  it.each([
    [{ correct: true, chosen: "D" }, "correct", "✓ CORRECT · ACCESS GRANTED"],
    [{ correct: false, chosen: "A" }, "incorrect", "✕ INCORRECT · −1 HP"],
  ] as const)(
    "styles existing %s answer feedback without changing controls",
    (answered, state, text) => {
      useGameMock.mockReturnValue({
        player: { levels: {} },
        run: {
          levelId: 1,
          index: 0,
          health: 4,
          hintsInLevel: 0,
          correctInLevel: answered.correct ? 1 : 0,
          wrongInLevel: answered.correct ? 0 : 1,
          runStreak: 0,
        },
        challenge: LEVELS[0]!.challenges[0],
        answered,
        answer: vi.fn(),
        updateEvidenceBoard: vi.fn(),
        selectNetworkPathNode: vi.fn(),
        resetNetworkPath: vi.fn(),
        retryNetworkPath: vi.fn(),
        retryBossDecision: vi.fn(),
        nextChallenge: vi.fn(),
        hintShown: false,
        buyHint: vi.fn(),
        timeLeft: null,
        shake: 0,
        go: vi.fn(),
      });

      const html = renderToStaticMarkup(<PlayScreen />);

      expect(html).toContain(`data-answer-state="${state}"`);
      expect(html).toContain(`challenge-result--${state}`);
      expect(html).toContain(text);
      expect(html).toContain('aria-valuenow="0"');
      expect(html).toContain("NEXT");
    },
  );

  it("shows a purchased hint as existing text and keeps challenge choices available", () => {
    useGameMock.mockReturnValue({
      player: { levels: {} },
      run: {
        levelId: 1,
        index: 0,
        health: 5,
        hintsInLevel: 1,
        correctInLevel: 0,
        wrongInLevel: 0,
        runStreak: 0,
      },
      challenge: LEVELS[0]!.challenges[0],
      answered: null,
      answer: vi.fn(),
      updateEvidenceBoard: vi.fn(),
      selectNetworkPathNode: vi.fn(),
      resetNetworkPath: vi.fn(),
      retryNetworkPath: vi.fn(),
      retryBossDecision: vi.fn(),
      nextChallenge: vi.fn(),
      hintShown: true,
      buyHint: vi.fn(),
      timeLeft: null,
      shake: 0,
      go: vi.fn(),
    });

    const html = renderToStaticMarkup(<PlayScreen />);

    expect(html).toContain("challenge-hint");
    expect(html).toContain(`HINT: ${LEVELS[0]!.challenges[0]!.hint}`);
    expect(html).toContain("T9#kL7!qZ2@x");
    expect(html).not.toContain("HINT (10 coins");
  });
});
