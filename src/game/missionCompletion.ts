export function claimMissionRun(
  completedRunIds: readonly string[],
  runId: string,
): string[] | null {
  if (!runId || completedRunIds.includes(runId)) return null;
  return [...completedRunIds.slice(-99), runId];
}
