import { SCORE } from "./progression";

export type LabTaskMode = "select" | "choice" | "text" | "sequence";

export interface LabArtifact {
  id: string;
  label: string;
  kind: string;
  timestamp?: string;
  details: string;
}

export interface LabTaskOption {
  id: string;
  label: string;
  explanation?: string;
}

export interface LabTask {
  id: string;
  mode: LabTaskMode;
  prompt: string;
  options?: LabTaskOption[];
  expected: string | string[];
  correctFeedback: string;
  incorrectFeedback: string;
  hint: string;
}

export interface CyberRangeLab {
  id: string;
  title: string;
  category: string;
  description: string;
  difficulty: "BEGINNER" | "INTERMEDIATE";
  durationMinutes: number;
  artifacts: LabArtifact[];
  tasks: LabTask[];
  finalReport: string;
  rewardXp: number;
  rewardCoins: number;
}

export interface ActiveLabRun {
  labId: string;
  taskIndex: number;
  selectedIds: string[];
  draft: string;
  sequence: string[];
  inspectedArtifactIds: string[];
  filter: string;
  hintsUsed: number;
  hintShown: boolean;
  attempts: number;
  lastEvaluation: (LabEvaluation & { taskId: string }) | null;
}

export interface LabCompletion {
  score: number;
  completedAt: string;
  hintsUsed: number;
}

export interface CyberRangeProgress {
  version: 1;
  active: ActiveLabRun | null;
  completions: Record<string, LabCompletion>;
  totalScore: number;
}

export const CYBER_RANGE_LABS: CyberRangeLab[] = [
  {
    id: "log-investigation",
    title: "Log Investigation",
    category: "DIGITAL FORENSICS",
    description: "Filter and inspect fictional service logs, reconstruct the event order, and explain the likely incident.",
    difficulty: "INTERMEDIATE",
    durationMinutes: 12,
    rewardXp: 120,
    rewardCoins: 60,
    artifacts: [
      { id: "phish-delivery", label: "Mail gateway", kind: "Message event", timestamp: "02:01", details: "A payroll-themed message was delivered to the fictional admin mailbox from an unfamiliar sender." },
      { id: "auth-anomaly", label: "Identity service", kind: "Authentication event", timestamp: "02:13", details: "Fourteen failed sign-ins were followed by a successful admin login from an unfamiliar simulated location. The record marks MFA as bypassed." },
      { id: "new-session", label: "Session audit", kind: "Access event", timestamp: "02:16", details: "A new admin session read the training configuration share shortly after the suspicious sign-in." },
      { id: "scheduled-backup", label: "Backup service", kind: "Routine event", timestamp: "03:00", details: "The backup service ran its usual scheduled job from its expected internal service identity." },
      { id: "bulk-export", label: "File audit", kind: "Data event", timestamp: "02:21", details: "The new admin session requested an unusual batch of fictional employee records." },
    ],
    finalReport: "The fictional evidence indicates a likely credential compromise: a suspicious payroll message preceded anomalous admin authentication, a new session, and unusual record access. The scheduled backup is unrelated routine activity.",
    tasks: [
      {
        id: "identify-events",
        mode: "select",
        prompt: "Filter the log by authentication or access, inspect the records, and select the indicators tied to the suspicious session.",
        options: [
          { id: "phish-delivery", label: "Payroll message delivered · 02:01" },
          { id: "auth-anomaly", label: "Admin authentication anomaly · 02:13" },
          { id: "new-session", label: "New admin session · 02:16" },
          { id: "scheduled-backup", label: "Scheduled backup · 03:00" },
          { id: "bulk-export", label: "Unusual record export · 02:21" },
        ],
        expected: ["auth-anomaly", "new-session", "bulk-export"],
        correctFeedback: "The failed-login burst, MFA bypass, new session, and unusual export form a connected suspicious sequence. The scheduled backup is expected routine activity.",
        incorrectFeedback: "Re-check the inspected authentication and access records. Separate the suspicious session from routine service activity.",
        hint: "Focus on the authentication anomaly and events caused by the newly created session; exclude the routine backup.",
      },
      {
        id: "reconstruct-timeline",
        mode: "sequence",
        prompt: "Put the incident events in the most likely chronological order.",
        options: [
          { id: "phish-delivery", label: "Payroll message delivered" },
          { id: "auth-anomaly", label: "Suspicious admin authentication" },
          { id: "new-session", label: "New admin session created" },
          { id: "bulk-export", label: "Unusual record export" },
        ],
        expected: ["phish-delivery", "auth-anomaly", "new-session", "bulk-export"],
        correctFeedback: "The message preceded the anomalous login; the new session then accessed and exported records.",
        incorrectFeedback: "The session and export follow the login. Start with the earlier message delivery and order by the fictional timestamps.",
        hint: "Use the timestamps: message delivery, authentication, session creation, then record access.",
      },
      {
        id: "incident-conclusion",
        mode: "choice",
        prompt: "Which conclusion is best supported by the evidence?",
        options: [
          { id: "credential-compromise", label: "A likely credential compromise followed by unauthorized record access." },
          { id: "backup-failure", label: "A routine backup job caused the admin login." },
          { id: "false-alarm", label: "All events are routine and no investigation is needed." },
        ],
        expected: "credential-compromise",
        correctFeedback: "Correct: multiple independent artifacts support a likely account compromise and unauthorized access.",
        incorrectFeedback: "Compare the unfamiliar login, MFA bypass, new session, and export with the routine backup record.",
        hint: "Choose the explanation supported by the unusual authentication and follow-on access records.",
      },
    ],
  },
  {
    id: "phishing-analysis",
    title: "Phishing Analysis",
    category: "EMAIL FORENSICS",
    description: "Inspect a fictional email and its headers, distinguish real warning signs from harmless details, and recommend a safe response.",
    difficulty: "BEGINNER",
    durationMinutes: 10,
    rewardXp: 100,
    rewardCoins: 50,
    artifacts: [
      { id: "sender", label: "From", kind: "Header", details: "NEXUS Payroll <payroll@nexus-c0rp.example> — the fictional sender uses a zero in place of the letter o." },
      { id: "reply", label: "Reply-To", kind: "Header", details: "benefits-desk@freemail.example — replies go to an unrelated free-mail domain." },
      { id: "subject", label: "Subject", kind: "Wording", details: "URGENT: claim your bonus in 10 minutes — the message pressures the recipient to act quickly." },
      { id: "link", label: "Link target", kind: "Link", details: "http://bonus-claim.training.invalid/verify — fictional, mismatched destination using plain HTTP." },
      { id: "credential-request", label: "Message body", kind: "Wording", details: "Requests a password and MFA code to release a payment." },
      { id: "footer", label: "Footer", kind: "Context", details: "Contains a normal company mailing address and unsubscribe text; neither proves legitimacy by itself." },
    ],
    finalReport: "The message is a likely phishing attempt based on its lookalike sender, unrelated reply address, urgency, mismatched destination, and credential request. The appropriate action is to report it with headers and avoid replying or using its link.",
    tasks: [
      {
        id: "flag-indicators",
        mode: "select",
        prompt: "Inspect the headers and message details. Select every suspicious indicator.",
        options: [
          { id: "sender", label: "Lookalike sender domain" },
          { id: "reply", label: "Unrelated reply-to address" },
          { id: "subject", label: "Urgent pressure" },
          { id: "link", label: "Mismatched, insecure link" },
          { id: "credential-request", label: "Password and MFA-code request" },
          { id: "footer", label: "Normal mailing address and unsubscribe footer" },
        ],
        expected: ["sender", "reply", "subject", "link", "credential-request"],
        correctFeedback: "These indicators combine domain deception, urgency, a mismatched destination, and credential theft. A professional-looking footer does not validate the message.",
        incorrectFeedback: "Inspect each header and request. A harmless-looking footer is not proof that an email is genuine.",
        hint: "Select the domain, reply, urgency, destination, and credential clues; leave the ordinary footer unselected.",
      },
      {
        id: "assess-message",
        mode: "choice",
        prompt: "What is the most appropriate assessment?",
        options: [
          { id: "phishing", label: "Treat as phishing; do not use its link or reply." },
          { id: "genuine", label: "Trust it because the message includes a company footer." },
          { id: "forward", label: "Forward it to colleagues to ask if they want the bonus." },
        ],
        expected: "phishing",
        correctFeedback: "Correct: report the message through the approved channel and avoid interacting with its link or sender.",
        incorrectFeedback: "The footer is easy to copy. The mismatched domain and credential request require a cautious response.",
        hint: "Do not interact with a message that asks for credentials through an unverified destination.",
      },
      {
        id: "safe-response",
        mode: "choice",
        prompt: "How should the recipient preserve a useful report?",
        options: [
          { id: "report", label: "Use the approved reporting process and include the message headers." },
          { id: "delete-only", label: "Delete it without notifying anyone." },
          { id: "reply", label: "Reply and ask the sender to prove their identity." },
        ],
        expected: "report",
        correctFeedback: "Correct: reporting with headers helps responders investigate while avoiding contact with the sender.",
        incorrectFeedback: "Keep the evidence and use the established reporting channel; do not reply to the suspicious sender.",
        hint: "Use the established reporting path and retain the original headers for investigation.",
      },
    ],
  },
  {
    id: "crypto-fundamentals",
    title: "Cryptography Fundamentals",
    category: "CRYPTOGRAPHY",
    description: "Solve toy Caesar-cipher and Base64 exercises, then distinguish reversible encoding from encryption.",
    difficulty: "BEGINNER",
    durationMinutes: 9,
    rewardXp: 100,
    rewardCoins: 50,
    artifacts: [
      { id: "caesar-note", label: "Caesar exercise", kind: "Toy cipher", details: "Educational exercise only: each letter was shifted forward by 3 places. Decode VDIH." },
      { id: "base64-note", label: "Encoding exercise", kind: "Toy encoding", details: "Educational exercise only: Base64-encode the word CYBER." },
      { id: "base64-decode", label: "Decoding exercise", kind: "Toy encoding", details: "Educational exercise only: decode the Base64 sample Q1lCRVI= to recover its original text." },
    ],
    finalReport: "The Caesar shift is a toy cipher and Base64 is reversible encoding. Neither provides confidentiality; real encryption requires a sound algorithm and key management.",
    tasks: [
      {
        id: "decode-caesar",
        mode: "text",
        prompt: "Decode VDIH using the stated Caesar shift of 3. Enter the original word.",
        expected: "SAFE",
        correctFeedback: "Correct: shifting each letter backward by three yields SAFE.",
        incorrectFeedback: "Reverse the three-place shift for each letter, wrapping from A back to Z as needed.",
        hint: "V shifts back to S; apply the same three-letter shift to the remaining characters.",
      },
      {
        id: "encode-base64",
        mode: "text",
        prompt: "Encode CYBER as Base64. Enter the encoded result.",
        expected: "Q1lCRVI=",
        correctFeedback: "Correct: Q1lCRVI= is a Base64 representation of the sample text CYBER.",
        incorrectFeedback: "Base64 uses groups of bytes and may add padding. This exercise is reversible representation, not secret protection.",
        hint: "Base64-encode the exact uppercase text CYBER; include its trailing padding character.",
      },
      {
        id: "decode-base64",
        mode: "text",
        prompt: "Decode the Base64 sample Q1lCRVI= and enter the original text.",
        expected: "CYBER",
        correctFeedback: "Correct: Q1lCRVI= decodes to CYBER. Base64 is a reversible representation, not encryption.",
        incorrectFeedback: "Decode the sample as Base64 to recover its original text. No secret key is involved.",
        hint: "This Base64 string represents the same five-letter sample used in the previous exercise.",
      },
      {
        id: "encoding-vs-encryption",
        mode: "choice",
        prompt: "Which statement correctly distinguishes encoding from encryption?",
        options: [
          { id: "encoding", label: "Encoding is a reversible format transformation; encryption protects confidentiality with a key." },
          { id: "same", label: "Base64 is encryption because its output is not plain text." },
          { id: "hash", label: "Encoding and encryption are both one-way hashes." },
        ],
        expected: "encoding",
        correctFeedback: "Correct: encoding is not secret; encryption uses keys to protect confidentiality. Caesar is a toy cipher and provides no real security.",
        incorrectFeedback: "Reversibility alone does not make data secret. Consider whether a key is needed to protect confidentiality.",
        hint: "Base64 needs no secret key to reverse; encryption relies on a key and a security design.",
      },
    ],
  },
  {
    id: "incident-response",
    title: "Incident Response",
    category: "RESPONSE OPERATIONS",
    description: "Examine fictional incident evidence, order containment and recovery actions, and complete an after-action report.",
    difficulty: "INTERMEDIATE",
    durationMinutes: 15,
    rewardXp: 140,
    rewardCoins: 70,
    artifacts: [
      { id: "alert", label: "Endpoint alert", kind: "Detection", timestamp: "09:12", details: "A fictional workstation shows rapid changes to training documents." },
      { id: "network", label: "Network record", kind: "Telemetry", timestamp: "09:13", details: "The workstation attempted repeated connections to an unknown simulated peer." },
      { id: "backup", label: "Backup status", kind: "Recovery source", timestamp: "08:00", details: "An isolated backup completed before the simulated incident; its integrity has not yet been checked." },
    ],
    finalReport: "The simulated incident was contained, investigated with evidence preserved, eradicated, and recovered from a verified isolated backup in stages with monitoring.",
    tasks: [
      {
        id: "verify-alert",
        mode: "select",
        prompt: "Inspect the incident artifacts and select the two strongest indicators requiring immediate response.",
        options: [
          { id: "alert", label: "Rapid document changes on one endpoint" },
          { id: "network", label: "Repeated connections to an unfamiliar simulated peer" },
          { id: "backup", label: "Scheduled isolated backup before the incident" },
        ],
        expected: ["alert", "network"],
        correctFeedback: "The endpoint behavior and unusual connections reinforce one another. The earlier backup is useful for recovery, not evidence of the active incident.",
        incorrectFeedback: "Separate active suspicious behavior from routine backup evidence.",
        hint: "Select the evidence showing current endpoint changes and unusual communications.",
      },
      {
        id: "response-order",
        mode: "sequence",
        prompt: "Choose the response actions in a safe order: contain, investigate, eradicate, then recover.",
        options: [
          { id: "contain", label: "Isolate the affected endpoint and preserve evidence." },
          { id: "investigate", label: "Determine scope and preserve relevant logs." },
          { id: "eradicate", label: "Remove the cause and verify clean systems." },
          { id: "recover", label: "Validate the isolated backup, restore in stages, and monitor." },
        ],
        expected: ["contain", "investigate", "eradicate", "recover"],
        correctFeedback: "The order limits spread, establishes scope, removes the cause, then restores from a verified source with monitoring.",
        incorrectFeedback: "Do not restore before containment, investigation, and eradication. Evidence should be preserved throughout.",
        hint: "Stop the spread first, establish what happened, remove the cause, and only then recover safely.",
      },
      {
        id: "after-action",
        mode: "choice",
        prompt: "What belongs in the final incident report?",
        options: [
          { id: "report", label: "Timeline, scope, evidence retained, actions taken, recovery validation, and follow-up owners." },
          { id: "erase", label: "A note that all logs were deleted after the restore." },
          { id: "claim", label: "A claim of full recovery without validation or monitoring." },
        ],
        expected: "report",
        correctFeedback: "Correct: document the evidence-based timeline, scope, response, recovery checks, and follow-up actions.",
        incorrectFeedback: "A useful report is auditable and records what was verified, not assumptions or deleted evidence.",
        hint: "Record what happened, what was preserved, what was done, and how recovery was verified.",
      },
    ],
  },
];

export const CYBER_RANGE_VERSION = 1 as const;
export const LAB_TASK_SCORE = 100;
export const LAB_HINT_PENALTY = 15;

export function createEmptyCyberRangeProgress(): CyberRangeProgress {
  return { version: CYBER_RANGE_VERSION, active: null, completions: {}, totalScore: 0 };
}

export function startLab(labId: string): ActiveLabRun | null {
  return CYBER_RANGE_LABS.some((lab) => lab.id === labId)
    ? {
        labId,
        taskIndex: 0,
        selectedIds: [],
        draft: "",
        sequence: [],
        inspectedArtifactIds: [],
        filter: "",
        hintsUsed: 0,
        hintShown: false,
        attempts: 0,
        lastEvaluation: null,
      }
    : null;
}

export function isCyberRangeProgressValid(value: unknown): value is CyberRangeProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (
    state["version"] !== CYBER_RANGE_VERSION ||
    !Number.isSafeInteger(state["totalScore"]) ||
    Number(state["totalScore"]) < 0 ||
    !state["completions"] ||
    typeof state["completions"] !== "object" ||
    Array.isArray(state["completions"])
  ) return false;
  const completions = state["completions"] as Record<string, unknown>;
  for (const [id, raw] of Object.entries(completions)) {
    if (!CYBER_RANGE_LABS.some((lab) => lab.id === id) || !raw || typeof raw !== "object") return false;
    const completion = raw as Record<string, unknown>;
    const lab = CYBER_RANGE_LABS.find((item) => item.id === id);
    const maxScore = lab ? lab.tasks.length * LAB_TASK_SCORE : 0;
    if (
      !Number.isSafeInteger(completion["score"]) ||
      Number(completion["score"]) < 0 ||
      Number(completion["score"]) > maxScore ||
      typeof completion["completedAt"] !== "string" ||
      !Number.isFinite(Date.parse(completion["completedAt"])) ||
      !Number.isInteger(completion["hintsUsed"]) ||
      Number(completion["hintsUsed"]) < 0 ||
      Number(completion["hintsUsed"]) > (lab?.tasks.length ?? 0)
    ) return false;
    if (lab && completion["score"] !== scoreLabCompletion(lab, Number(completion["hintsUsed"]))) return false;
  }
  const expectedTotalScore = Object.values(completions).reduce<number>((total, raw) => {
    if (!raw || typeof raw !== "object") return total;
    const score = (raw as Record<string, unknown>)["score"];
    return total + (typeof score === "number" ? score : 0);
  }, 0);
  if (state["totalScore"] !== expectedTotalScore) return false;
  const active = state["active"];
  if (active === null) return true;
  if (!active || typeof active !== "object" || Array.isArray(active)) return false;
  const run = active as Record<string, unknown>;
  const lab = CYBER_RANGE_LABS.find((item) => item.id === run["labId"]);
  if (!lab || !Number.isInteger(run["taskIndex"]) || Number(run["taskIndex"]) < 0 || Number(run["taskIndex"]) >= lab.tasks.length) return false;
  const currentTask = lab.tasks[Number(run["taskIndex"])];
  if (!currentTask) return false;
  const allowed = new Set((currentTask.options ?? []).map((option) => option.id));
  const stringList = (entry: unknown, max: number) =>
    Array.isArray(entry) &&
    entry.length <= max &&
    entry.every((item) => typeof item === "string") &&
    new Set(entry).size === entry.length;
  const validLists =
    stringList(run["selectedIds"], allowed.size) &&
    (run["selectedIds"] as string[]).every((id) => allowed.has(id)) &&
    stringList(run["sequence"], allowed.size) &&
    (run["sequence"] as string[]).every((id) => allowed.has(id)) &&
    stringList(run["inspectedArtifactIds"], lab.artifacts.length) &&
    (run["inspectedArtifactIds"] as string[]).every((id) => lab.artifacts.some((artifact) => artifact.id === id));
  if (!validLists) return false;
  const selectedIds = run["selectedIds"] as string[];
  const sequence = run["sequence"] as string[];
  const inspected = run["inspectedArtifactIds"] as string[];
  const draft = run["draft"];
  const hintsUsed = run["hintsUsed"];
  const lastEvaluation = run["lastEvaluation"];
  const lastEvaluationRecord =
    lastEvaluation && typeof lastEvaluation === "object" && !Array.isArray(lastEvaluation)
      ? lastEvaluation as Record<string, unknown>
      : null;
  const lastEvaluationIndex = lastEvaluationRecord
    ? lab.tasks.findIndex((task) => task.id === lastEvaluationRecord["taskId"])
    : -1;
  if (
    completions[lab.id] ||
    (currentTask.mode !== "select" && selectedIds.length > 0) ||
    (currentTask.mode !== "sequence" && sequence.length > 0) ||
    (currentTask.mode !== "choice" && currentTask.mode !== "text" && draft !== "") ||
    (currentTask.mode === "choice" && draft !== "" && !allowed.has(String(draft))) ||
    (currentTask.mode === "select" && selectedIds.some((id) => !inspected.includes(id))) ||
    typeof draft !== "string" ||
    draft.length > 200 ||
    typeof run["filter"] !== "string" ||
    run["filter"].length > 100 ||
    typeof run["hintShown"] !== "boolean" ||
    (lastEvaluation !== undefined && lastEvaluation !== null &&
      (!lastEvaluationRecord ||
        typeof lastEvaluationRecord["taskId"] !== "string" ||
        lastEvaluationIndex < 0 ||
        lastEvaluationIndex < Number(run["taskIndex"]) - 1 ||
        lastEvaluationIndex > Number(run["taskIndex"]) ||
        typeof lastEvaluationRecord["correct"] !== "boolean" ||
        (lastEvaluationIndex === Number(run["taskIndex"]) && lastEvaluationRecord["correct"] === true) ||
        (lastEvaluationIndex < Number(run["taskIndex"]) && lastEvaluationRecord["correct"] !== true) ||
        typeof lastEvaluationRecord["feedback"] !== "string" ||
        (lastEvaluationRecord["feedback"] as string).length > 500)) ||
    !Number.isInteger(hintsUsed) ||
    Number(hintsUsed) < 0 ||
    Number(hintsUsed) > Number(run["taskIndex"]) + Number(run["hintShown"]) ||
    Number(hintsUsed) > lab.tasks.length ||
    (run["hintShown"] && Number(hintsUsed) === 0) ||
    !Number.isInteger(run["attempts"]) ||
    Number(run["attempts"]) < 0 ||
    Number(run["attempts"]) > 1000
  ) return false;
  return true;
}

export function updateLabRun(
  run: ActiveLabRun,
  patch: Partial<Pick<ActiveLabRun, "selectedIds" | "draft" | "sequence" | "inspectedArtifactIds" | "filter">>,
): ActiveLabRun {
  return { ...run, ...patch };
}

export function toggleLabSelection(run: ActiveLabRun, id: string): ActiveLabRun {
  const selectedIds = run.selectedIds.includes(id)
    ? run.selectedIds.filter((selected) => selected !== id)
    : [...run.selectedIds, id];
  return { ...run, selectedIds };
}

export function appendLabSequence(run: ActiveLabRun, id: string): ActiveLabRun {
  if (run.sequence.includes(id)) return run;
  return { ...run, sequence: [...run.sequence, id] };
}

export function resetLabSequence(run: ActiveLabRun): ActiveLabRun {
  return { ...run, sequence: [] };
}

export function inspectLabArtifact(run: ActiveLabRun, artifactId: string): ActiveLabRun {
  if (run.inspectedArtifactIds.includes(artifactId)) return run;
  return { ...run, inspectedArtifactIds: [...run.inspectedArtifactIds, artifactId] };
}

export interface LabEvaluation {
  correct: boolean;
  feedback: string;
}

export function evaluateLabTask(
  lab: CyberRangeLab,
  run: ActiveLabRun,
): LabEvaluation {
  const task = lab.tasks[run.taskIndex];
  if (!task) return { correct: false, feedback: "This lab task is unavailable. Return to the lab hub." };
  if (task.mode === "select") {
    const expected = task.expected as string[];
    const actual = run.selectedIds;
    const correct =
      expected.length === actual.length &&
      expected.every((id) => actual.includes(id)) &&
      actual.every((id) => run.inspectedArtifactIds.includes(id));
    return {
      correct,
      feedback: correct
        ? task.correctFeedback
        : actual.length === expected.length &&
            expected.every((id) => actual.includes(id)) &&
            !actual.every((id) => run.inspectedArtifactIds.includes(id))
          ? "Inspect each selected item before submitting so your conclusion is grounded in the evidence."
          : task.incorrectFeedback,
    };
  }
  if (task.mode === "sequence") {
    const expected = task.expected as string[];
    const correct = expected.length === run.sequence.length && expected.every((id, index) => run.sequence[index] === id);
    return { correct, feedback: correct ? task.correctFeedback : task.incorrectFeedback };
  }
  if (task.mode === "text") {
    const correct = run.draft.trim().toLocaleUpperCase() === String(task.expected).toLocaleUpperCase();
    return { correct, feedback: correct ? task.correctFeedback : task.incorrectFeedback };
  }
  const correct = run.draft === task.expected;
  return { correct, feedback: correct ? task.correctFeedback : task.incorrectFeedback };
}

export function advanceLabTask(run: ActiveLabRun): ActiveLabRun {
  return {
    ...run,
    taskIndex: run.taskIndex + 1,
    selectedIds: [],
    draft: "",
    sequence: [],
    filter: "",
    hintShown: false,
  };
}

export function scoreLabCompletion(lab: CyberRangeLab, hintsUsed: number): number {
  return Math.max(0, lab.tasks.length * LAB_TASK_SCORE - hintsUsed * LAB_HINT_PENALTY);
}

export function canBuyLabHint(run: ActiveLabRun, coins: number, lab: CyberRangeLab): boolean {
  return !run.hintShown && run.hintsUsed < lab.tasks.length && coins >= 10;
}

export function purchaseLabHint(
  run: ActiveLabRun,
  player: { coins: number; score: number; hintsUsed: number },
  lab: CyberRangeLab,
): { run: ActiveLabRun; player: { coins: number; score: number; hintsUsed: number } } | null {
  if (!canBuyLabHint(run, player.coins, lab)) return null;
  return {
    run: { ...run, hintShown: true, hintsUsed: run.hintsUsed + 1 },
    player: {
      coins: player.coins - 10,
      score: Math.max(0, player.score - SCORE.hintPenalty),
      hintsUsed: player.hintsUsed + 1,
    },
  };
}

export interface LabSubmission {
  progress: CyberRangeProgress;
  evaluation: LabEvaluation;
  completed: boolean;
}

export function submitLabTask(
  progress: CyberRangeProgress,
  lab: CyberRangeLab,
  run: ActiveLabRun,
  completedAt: string,
): LabSubmission {
  if (
    run.labId !== lab.id ||
    progress.active?.labId !== lab.id ||
    progress.active.taskIndex !== run.taskIndex ||
    progress.completions[lab.id]
  ) {
    return {
      progress,
      completed: false,
      evaluation: { correct: false, feedback: "This lab submission is no longer active." },
    };
  }
  const task = lab.tasks[run.taskIndex];
  if (!task) {
    return {
      progress,
      completed: false,
      evaluation: { correct: false, feedback: "This lab task is unavailable. Return to the lab hub." },
    };
  }
  const evaluation = evaluateLabTask(lab, run);
  const attempted = {
    ...run,
    attempts: run.attempts + 1,
    lastEvaluation: { ...evaluation, taskId: task.id },
  };
  if (!evaluation.correct) {
    return { progress: { ...progress, active: attempted }, evaluation, completed: false };
  }

  const advanced = advanceLabTask(attempted);
  if (advanced.taskIndex < lab.tasks.length) {
    return { progress: { ...progress, active: advanced }, evaluation, completed: false };
  }
  const completedProgress = completeLab(progress, lab, advanced, completedAt);
  return {
    progress: completedProgress,
    evaluation,
    completed: completedProgress !== progress,
  };
}

export function completeLab(
  progress: CyberRangeProgress,
  lab: CyberRangeLab,
  run: ActiveLabRun,
  completedAt: string,
): CyberRangeProgress {
  if (run.labId !== lab.id || progress.completions[lab.id] || run.taskIndex !== lab.tasks.length) return progress;
  const score = scoreLabCompletion(lab, run.hintsUsed);
  return {
    ...progress,
    active: null,
    totalScore: progress.totalScore + score,
    completions: {
      ...progress.completions,
      [lab.id]: { score, completedAt, hintsUsed: run.hintsUsed },
    },
  };
}
