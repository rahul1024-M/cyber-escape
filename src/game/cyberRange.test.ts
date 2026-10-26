import { describe, expect, it } from "vitest";
import {
  advanceLabTask,
  appendLabSequence,
  canBuyLabHint,
  completeLab,
  createEmptyCyberRangeProgress,
  CYBER_RANGE_LABS,
  evaluateLabTask,
  inspectLabArtifact,
  isCyberRangeProgressValid,
  LAB_HINT_PENALTY,
  LAB_TASK_SCORE,
  purchaseLabHint,
  scoreLabCompletion,
  startLab,
  submitLabTask,
  toggleLabSelection,
  type CyberRangeProgress,
} from "./cyberRange";

describe("Cyber Range lab engine", () => {
  it("starts only known labs and advances through meaningful tasks", () => {
    expect(startLab("unknown")).toBeNull();
    const run = startLab("log-investigation");
    expect(run?.taskIndex).toBe(0);
    expect(CYBER_RANGE_LABS.every((lab) => lab.tasks.length >= 3)).toBe(true);
    expect(advanceLabTask(run!).taskIndex).toBe(1);
  });

  it("requires log evidence to be inspected before selecting and evaluates the incident evidence", () => {
    const lab = CYBER_RANGE_LABS.find((item) => item.id === "log-investigation")!;
    let run = startLab(lab.id)!;
    run = toggleLabSelection(run, "auth-anomaly");
    expect(evaluateLabTask(lab, run).correct).toBe(false);
    run = inspectLabArtifact(run, "auth-anomaly");
    run = inspectLabArtifact(run, "new-session");
    run = toggleLabSelection(run, "new-session");
    run = inspectLabArtifact(run, "bulk-export");
    run = toggleLabSelection(run, "bulk-export");
    expect(evaluateLabTask(lab, run)).toEqual({
      correct: true,
      feedback: lab.tasks[0]?.correctFeedback,
    });
  });

  it("evaluates choice and text answers without exposing real security operations", () => {
    const lab = CYBER_RANGE_LABS.find((item) => item.id === "crypto-fundamentals")!;
    let run = startLab(lab.id)!;
    expect(evaluateLabTask(lab, run).correct).toBe(false);
    run = { ...run, draft: "SAFE" };
    expect(evaluateLabTask(lab, run).correct).toBe(true);
    run = advanceLabTask(run);
    run = { ...run, draft: "Q1lCRVI=" };
    expect(evaluateLabTask(lab, run).correct).toBe(true);
    run = advanceLabTask(run);
    run = { ...run, draft: "CYBER" };
    expect(evaluateLabTask(lab, run).correct).toBe(true);
    run = advanceLabTask(run);
    run = { ...run, draft: "encoding" };
    expect(evaluateLabTask(lab, run).correct).toBe(true);
    expect(lab.artifacts.every((artifact) => artifact.details.includes("exercise") || artifact.details.includes("Educational"))).toBe(true);
  });

  it("requires the correct ordered response and supports appending actions", () => {
    const lab = CYBER_RANGE_LABS.find((item) => item.id === "incident-response")!;
    let run = startLab(lab.id)!;
    run = advanceLabTask(run);
    run = appendLabSequence(run, "recover");
    run = appendLabSequence(run, "contain");
    expect(evaluateLabTask(lab, run).correct).toBe(false);
    run = {
      ...run,
      sequence: ["contain", "investigate", "eradicate", "recover"],
    };
    expect(evaluateLabTask(lab, run).correct).toBe(true);
  });

  it("applies hint score deductions and records completion only once", () => {
    const lab = CYBER_RANGE_LABS.find((item) => item.id === "phishing-analysis")!;
    const run = { ...startLab(lab.id)!, taskIndex: lab.tasks.length, hintsUsed: 1 };
    const baseProgress = createEmptyCyberRangeProgress();
    const completed = completeLab(baseProgress, lab, run, "2026-10-22T00:00:00.000Z");
    expect(scoreLabCompletion(lab, 1)).toBe(lab.tasks.length * LAB_TASK_SCORE - LAB_HINT_PENALTY);
    expect(completed.completions[lab.id]?.score).toBe(scoreLabCompletion(lab, 1));
    expect(completed.totalScore).toBe(completed.completions[lab.id]?.score);
    expect(completeLab(completed, lab, run, "later")).toBe(completed);
    expect(completeLab(baseProgress, lab, { ...run, labId: "incident-response" }, "later")).toBe(baseProgress);
    expect(isCyberRangeProgressValid(completed)).toBe(true);
  });

  it("persists correct-task feedback while advancing and rejects stale duplicate submissions", () => {
    const lab = CYBER_RANGE_LABS.find((item) => item.id === "crypto-fundamentals")!;
    const run = { ...startLab(lab.id)!, draft: "SAFE" };
    const progress = { ...createEmptyCyberRangeProgress(), active: run };
    const submitted = submitLabTask(progress, lab, run, "2026-10-22T00:00:00.000Z");

    expect(submitted.evaluation.correct).toBe(true);
    expect(submitted.progress.active?.taskIndex).toBe(1);
    expect(submitted.progress.active?.lastEvaluation).toEqual({
      taskId: "decode-caesar",
      correct: true,
      feedback: lab.tasks[0]?.correctFeedback,
    });
    expect(submitLabTask(submitted.progress, lab, run, "later").progress).toBe(submitted.progress);
    expect(isCyberRangeProgressValid(submitted.progress)).toBe(true);
  });

  it("completes every lab through evaluated tasks and awards completion once", () => {
    for (const lab of CYBER_RANGE_LABS) {
      let progress: CyberRangeProgress = { ...createEmptyCyberRangeProgress(), active: startLab(lab.id)! };
      let lastRun = progress.active;

      for (const task of lab.tasks) {
        const run = progress.active!;
        lastRun = run;
        const answer = task.mode === "select"
          ? {
              ...run,
              selectedIds: task.expected as string[],
              inspectedArtifactIds: task.expected as string[],
            }
          : task.mode === "sequence"
            ? { ...run, sequence: task.expected as string[] }
            : { ...run, draft: String(task.expected) };
        const submitted = submitLabTask(progress, lab, answer, "2026-10-22T00:00:00.000Z");
        expect(submitted.evaluation.correct, `${lab.id}:${task.id}`).toBe(true);
        progress = submitted.progress;
      }

      expect(progress.active).toBeNull();
      expect(progress.completions[lab.id]?.score).toBe(lab.tasks.length * LAB_TASK_SCORE);
      expect(submitLabTask(progress, lab, lastRun!, "later").progress).toBe(progress);
      expect(isCyberRangeProgressValid(progress)).toBe(true);
    }
  });

  it("allows one affordable hint per task and applies the existing score penalty", () => {
    const lab = CYBER_RANGE_LABS.find((item) => item.id === "crypto-fundamentals")!;
    const run = startLab(lab.id)!;
    expect(canBuyLabHint(run, 9, lab)).toBe(false);
    expect(canBuyLabHint(run, 10, lab)).toBe(true);
    expect(canBuyLabHint({ ...run, hintShown: true }, 100, lab)).toBe(false);
    const purchase = purchaseLabHint(run, { coins: 25, score: 80, hintsUsed: 0 }, lab);
    expect(purchase).toEqual({
      run: { ...run, hintShown: true, hintsUsed: 1 },
      player: { coins: 15, score: 80 - LAB_HINT_PENALTY, hintsUsed: 1 },
    });
    expect(purchaseLabHint(purchase!.run, purchase!.player, lab)).toBeNull();
    expect(scoreLabCompletion(lab, 2)).toBe(lab.tasks.length * LAB_TASK_SCORE - 2 * LAB_HINT_PENALTY);
  });

  it("rejects malformed lab progress", () => {
    expect(isCyberRangeProgressValid({ version: 2, active: null, completions: {}, totalScore: 0 })).toBe(false);
    expect(isCyberRangeProgressValid({
      version: 1,
      active: { ...startLab("log-investigation"), taskIndex: 99 },
      completions: {},
      totalScore: 0,
    })).toBe(false);
  });
});
