import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LEVELS } from "@/game/levels";
import { SectorMap } from "./SectorMap";
import { getNextSectorId, selectSector } from "./sectorMapUtils";

const sectors = LEVELS.map((level) => ({
  level,
  unlocked: level.id <= 2,
  completed: level.id === 1,
  bestScore: level.id === 1 ? 340 : 0,
}));

describe("interactive sector map", () => {
  it("renders all six sectors with completed, available, and locked states", () => {
    const html = renderToStaticMarkup(<SectorMap sectors={sectors} onSelect={vi.fn()} />);

    expect(html.match(/data-sector-id="\d+"/g)).toHaveLength(6);
    expect(html).toContain('data-sector-id="1" data-status="completed"');
    expect(html).toContain('data-sector-id="2" data-status="ready"');
    expect(html).toContain('data-sector-id="6" data-status="locked"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("BEST SCORE");
    expect(html).toContain("Clear Sector 02 — NETWORK BREACH to unlock.");
  });

  it("selects only unlocked sectors using the existing level id", () => {
    const onSelect = vi.fn();

    selectSector(sectors[1]!, onSelect);
    selectSector(sectors[2]!, onSelect);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("moves keyboard focus among all sectors and wraps in either direction", () => {
    expect(getNextSectorId(sectors, 1, "next")).toBe(2);
    expect(getNextSectorId(sectors, 2, "next")).toBe(3);
    expect(getNextSectorId(sectors, 1, "previous")).toBe(6);
  });

  it("keeps the responsive accessible controls in the CSS fallback", () => {
    const html = renderToStaticMarkup(<SectorMap sectors={sectors} onSelect={vi.fn()} />);

    expect(html).toContain('aria-label="Interactive six-sector map"');
    expect(html).toContain("TAB TO FOCUS");
    expect(html).toContain("ARROW KEYS TO NAVIGATE");
    expect(html).toContain("sector-map-nodes");
    expect(html).toContain("sector-map-info");
  });
});
