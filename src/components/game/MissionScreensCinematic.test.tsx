import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BriefingScreen, MissionReportScreen } from "./MissionScreens";

const { useGameMock } = vi.hoisted(() => ({ useGameMock: vi.fn() }));

vi.mock("@/game/GameProvider", () => ({ useGame: useGameMock }));
vi.mock("./NexusMissionDebrief", () => ({ NexusMissionDebrief: () => null }));

describe("cinematic mission screens", () => {
  beforeEach(() => {
    useGameMock.mockReset();
  });

  it("presents existing briefing threat and objectives with immediate mission controls", () => {
    const beginMission = vi.fn();
    useGameMock.mockReturnValue({
      run: { levelId: 5 },
      beginMission,
      go: vi.fn(),
      player: { settings: { reducedMotion: true } },
    });

    const html = renderToStaticMarkup(<BriefingScreen />);

    expect(html).toContain("cinematic-screen");
    expect(html).toContain('data-threat="critical"');
    expect(html).toContain("SECTOR 05 · AI CORE");
    expect(html).toContain("THREAT / CRITICAL");
    expect(html).toContain("Survive the NEXUS interrogation");
    expect(html).toContain("BEGIN MISSION");
    expect(beginMission).not.toHaveBeenCalled();
  });

  it("shows report rewards, recorded accuracy, and recorded correct/incorrect attempts", () => {
    useGameMock.mockReturnValue({
      report: {
        levelId: 1,
        breakdown: {
          base: 200,
          speed: 20,
          streak: 10,
          hints: 15,
          wrong: 25,
          completion: 150,
          final: 340,
        },
        xp: 250,
        coins: 100,
        accuracy: 67,
        seconds: 95,
        hints: 1,
        bestStreak: 2,
        skillXp: {},
        newBests: [],
        attempts: [
          { topic: "security", outcome: "correct" },
          { topic: "networking", outcome: "incorrect" },
          { topic: "logic", outcome: "correct" },
        ],
      },
      startLevel: vi.fn(),
      go: vi.fn(),
    });

    const html = renderToStaticMarkup(<MissionReportScreen />);

    expect(html).toContain("SECTOR 01 CLEARED");
    expect(html).toContain(">+250<");
    expect(html).toContain(">+100<");
    expect(html).toContain(">67%<");
    expect(html).toContain("CORRECT");
    expect(html).toContain(">2<");
    expect(html).toContain("INCORRECT");
    expect(html).toContain(">1<");
    expect(html).toContain("340");
    expect(html).toContain("LEVEL SELECT");
  });
});
