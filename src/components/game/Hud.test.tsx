import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Hud } from "./Hud";

const { useGameMock } = vi.hoisted(() => ({ useGameMock: vi.fn() }));

vi.mock("@/game/GameProvider", () => ({ useGame: useGameMock }));

describe("cinematic gameplay HUD", () => {
  it("shows current health, score, sector challenge progress, XP, coins, and streak", () => {
    useGameMock.mockReturnValue({
      player: {
        name: "OPERATIVE",
        level: 2,
        xp: 180,
        coins: 75,
        streak: 3,
        score: 1240,
        settings: { sound: true },
      },
      run: { levelId: 2, index: 1, health: 4 },
      xpForNext: 250,
      updateSettings: vi.fn(),
    });

    const html = renderToStaticMarkup(<Hud />);

    expect(html).toContain("OPERATIVE");
    expect(html).toContain("180/250");
    expect(html).toContain('aria-label="75 coins"');
    expect(html).toContain('aria-label="3 streak"');
    expect(html).toContain('aria-label="4 health"');
    expect(html).toContain("SECTOR 02 · NETWORK BREACH");
    expect(html).toContain("CHALLENGE 2/5");
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-label="Score 1240"');
    expect(html).toContain("cinematic-hud-metrics grid min-w-0 grid-cols-2");
  });
});
