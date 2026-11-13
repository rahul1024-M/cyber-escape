import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEVELS } from "@/game/levels";
import { BriefingScreen } from "./MissionScreens";

const { useGameMock } = vi.hoisted(() => ({ useGameMock: vi.fn() }));

vi.mock("@/game/GameProvider", () => ({ useGame: useGameMock }));

describe("sector briefing screen", () => {
  beforeEach(() => {
    useGameMock.mockReset();
  });

  it.each(LEVELS)("renders the briefing and begin action for Sector $code", (level) => {
    useGameMock.mockReturnValue({
      run: { levelId: level.id },
      beginMission: vi.fn(),
      go: vi.fn(),
      player: { settings: { reducedMotion: true } },
    });

    const html = renderToStaticMarkup(<BriefingScreen />);

    expect(html).toContain(level.title);
    expect(html).toContain("NEXUS TRANSMISSION");
    expect(html).toContain("BEGIN MISSION");
  });
});
