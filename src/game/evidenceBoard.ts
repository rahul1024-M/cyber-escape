import type {
  EvidenceBoardData,
  EvidenceBoardState,
  EvidenceLink,
} from "./types";

export const EMPTY_EVIDENCE_BOARD_STATE: EvidenceBoardState = {
  openedEvidenceIds: [],
  importantEvidenceIds: [],
  selectedEvidenceIds: [],
  connections: [],
  conclusion: "",
};

export interface EvidenceBoardFeedback {
  correct: boolean;
  correctConnections: number;
  totalConnections: number;
  incorrectConnections: EvidenceLink[];
  missingConnections: EvidenceLink[];
  correctlyMarked: number;
  totalRelevant: number;
  conclusionCorrect: boolean;
}

export type EvidenceBoardAction =
  | { type: "toggle-open"; id: string }
  | { type: "toggle-important"; id: string }
  | { type: "select"; id: string }
  | { type: "connect" }
  | { type: "set-conclusion"; id: string }
  | { type: "remove-connection"; from: string; to: string };

export function isEvidenceBoardDataValid(data: EvidenceBoardData | undefined): data is EvidenceBoardData {
  if (!data || !Array.isArray(data.items) || data.items.length < 5) return false;
  if (!Array.isArray(data.expectedConnections) || !Array.isArray(data.conclusions)) return false;
  if (!data.conclusions.length || typeof data.correctConclusion !== "string") return false;

  const itemIds = new Set<string>();
  for (const item of data.items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      itemIds.has(item.id) ||
      typeof item.label !== "string" ||
      typeof item.kind !== "string" ||
      typeof item.timestamp !== "string" ||
      typeof item.summary !== "string" ||
      typeof item.details !== "string" ||
      typeof item.relevant !== "boolean"
    ) return false;
    itemIds.add(item.id);
  }

  const connectionKeys = new Set<string>();
  for (const link of data.expectedConnections) {
    if (
      !link ||
      typeof link.from !== "string" ||
      typeof link.to !== "string" ||
      link.from === link.to ||
      !itemIds.has(link.from) ||
      !itemIds.has(link.to)
    ) return false;
    const key = `${link.from}\u0000${link.to}`;
    if (connectionKeys.has(key)) return false;
    connectionKeys.add(key);
  }

  const conclusionIds = new Set<string>();
  for (const conclusion of data.conclusions) {
    if (
      !conclusion ||
      typeof conclusion.id !== "string" ||
      !conclusion.id ||
      conclusionIds.has(conclusion.id) ||
      typeof conclusion.label !== "string"
    ) return false;
    conclusionIds.add(conclusion.id);
  }
  return conclusionIds.has(data.correctConclusion);
}

export function updateEvidenceBoard(
  state: EvidenceBoardState,
  action: EvidenceBoardAction,
  data: EvidenceBoardData,
): EvidenceBoardState {
  if (!isEvidenceBoardDataValid(data)) return state;
  const ids = new Set(data.items.map((item) => item.id));
  if (
    (action.type === "toggle-open" ||
      action.type === "toggle-important" ||
      action.type === "select") &&
    !ids.has(action.id)
  ) return state;

  if (action.type === "toggle-open") {
    return {
      ...state,
      openedEvidenceIds: state.openedEvidenceIds.includes(action.id)
        ? state.openedEvidenceIds.filter((id) => id !== action.id)
        : [...state.openedEvidenceIds, action.id],
    };
  }
  if (action.type === "toggle-important") {
    return {
      ...state,
      importantEvidenceIds: state.importantEvidenceIds.includes(action.id)
        ? state.importantEvidenceIds.filter((id) => id !== action.id)
        : [...state.importantEvidenceIds, action.id],
    };
  }
  if (action.type === "select") {
    return {
      ...state,
      selectedEvidenceIds: state.selectedEvidenceIds.includes(action.id)
        ? state.selectedEvidenceIds.filter((id) => id !== action.id)
        : [...state.selectedEvidenceIds, action.id].slice(-2),
    };
  }
  if (action.type === "remove-connection") {
    return {
      ...state,
      connections: state.connections.filter(
        (link) => link.from !== action.from || link.to !== action.to,
      ),
    };
  }
  if (action.type === "set-conclusion") {
    if (action.id && !data.conclusions.some((conclusion) => conclusion.id === action.id)) return state;
    return { ...state, conclusion: action.id };
  }

  const [from, to] = state.selectedEvidenceIds;
  if (!from || !to || from === to) return state;
  const exists = state.connections.some((link) => link.from === from && link.to === to);
  if (exists) return state;
  return {
    ...state,
    connections: [...state.connections, { from, to }],
    selectedEvidenceIds: [],
  };
}

export function evaluateEvidenceBoard(
  data: EvidenceBoardData,
  state: EvidenceBoardState,
  conclusion: string,
): EvidenceBoardFeedback {
  const keyFor = (link: EvidenceLink) => `${link.from}\u0000${link.to}`;
  const expected = new Set(data.expectedConnections.map(keyFor));
  const actual = new Set(state.connections.map(keyFor));
  const incorrectConnections = state.connections.filter((link) => !expected.has(keyFor(link)));
  const missingConnections = data.expectedConnections.filter((link) => !actual.has(keyFor(link)));
  const relevant = data.items.filter((item) => item.relevant);
  const marked = new Set(state.importantEvidenceIds);
  const correctlyMarked = relevant.filter((item) => marked.has(item.id)).length;
  const allRelevantCorrect = relevant.every((item) => marked.has(item.id)) &&
    data.items.every((item) => item.relevant || !marked.has(item.id));
  const conclusionCorrect = conclusion === data.correctConclusion;
  return {
    correct:
      incorrectConnections.length === 0 &&
      missingConnections.length === 0 &&
      allRelevantCorrect &&
      conclusionCorrect,
    correctConnections: data.expectedConnections.length - missingConnections.length,
    totalConnections: data.expectedConnections.length,
    incorrectConnections,
    missingConnections,
    correctlyMarked,
    totalRelevant: relevant.length,
    conclusionCorrect,
  };
}
