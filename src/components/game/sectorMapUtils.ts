import type { Level } from "@/game/types";

export interface SectorMapItem {
  level: Level;
  unlocked: boolean;
  completed: boolean;
  bestScore: number;
}

export function getNextSectorId(
  sectors: Pick<SectorMapItem, "level">[],
  currentId: number,
  direction: "next" | "previous",
) {
  if (sectors.length === 0) return currentId;
  const currentIndex = sectors.findIndex((sector) => sector.level.id === currentId);
  const startIndex = currentIndex < 0 ? 0 : currentIndex;
  const offset = direction === "next" ? 1 : -1;
  return sectors[(startIndex + offset + sectors.length) % sectors.length]!.level.id;
}

export function selectSector(sector: SectorMapItem, onSelect: (levelId: number) => void) {
  if (sector.unlocked) onSelect(sector.level.id);
}
