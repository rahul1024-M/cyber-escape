import type { Level, LevelRecord } from "./types";

export function claimMissionRun(
  completedRunIds: readonly string[],
  runId: string,
): string[] | null {
  if (!runId || completedRunIds.includes(runId)) return null;
  return [...completedRunIds.slice(-99), runId];
}

export function isFinalSectorCompletion(
  levelId: number,
  levels: readonly Pick<Level, "id">[],
  completedLevels: Record<number, LevelRecord>,
): boolean {
  const finalLevel = levels.at(-1);
  return Boolean(
    finalLevel &&
      levelId === finalLevel.id &&
      levels.every((level) => level.id === levelId || completedLevels[level.id]?.completed),
  );
}
