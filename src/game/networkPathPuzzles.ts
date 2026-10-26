import type {
  NetworkConnection,
  NetworkPathPuzzle,
  NetworkPathState,
} from "./types";

export const NETWORK_PATH_PUZZLES = {
  "sector-2-route-1": {
    start: "workstation",
    destination: "training-server",
    nodes: [
      { id: "workstation", label: "Analyst workstation", role: "START" },
      { id: "gateway", label: "Training gateway", role: "ROUTER" },
      { id: "inspection", label: "Inspection firewall", role: "FIREWALL" },
      { id: "relay", label: "Unverified relay", role: "UNKNOWN RELAY" },
      { id: "honeypot", label: "Decoy service", role: "DECOY" },
      { id: "training-server", label: "Evidence server", role: "DESTINATION" },
    ],
    connections: [
      { from: "workstation", to: "gateway", safe: true, reason: "The managed gateway is the approved next hop." },
      { from: "gateway", to: "inspection", safe: true, reason: "The inspection firewall validates the route." },
      { from: "inspection", to: "training-server", safe: true, reason: "The server is reached through the approved inspection point." },
      { from: "workstation", to: "relay", safe: false, reason: "The relay is unverified and bypasses the managed gateway." },
      { from: "relay", to: "training-server", safe: false, reason: "This route reaches the server through an unverified relay." },
      { from: "gateway", to: "honeypot", safe: false, reason: "The decoy service is not part of the approved route." },
      { from: "honeypot", to: "training-server", safe: false, reason: "The decoy is not a trusted transit point." },
    ],
    validPath: ["workstation", "gateway", "inspection", "training-server"],
  },
  "sector-2-route-2": {
    start: "review-console",
    destination: "archive-vault",
    nodes: [
      { id: "review-console", label: "Review console", role: "START" },
      { id: "identity-check", label: "Identity checkpoint", role: "AUTHENTICATION" },
      { id: "audit-proxy", label: "Audited proxy", role: "PROXY" },
      { id: "open-proxy", label: "Open proxy", role: "UNTRUSTED" },
      { id: "mirror", label: "Public mirror", role: "MIRROR" },
      { id: "archive-vault", label: "Training archive vault", role: "DESTINATION" },
    ],
    connections: [
      { from: "review-console", to: "identity-check", safe: true, reason: "Verify identity before accessing protected records." },
      { from: "identity-check", to: "audit-proxy", safe: true, reason: "The audited proxy records and controls archive access." },
      { from: "audit-proxy", to: "archive-vault", safe: true, reason: "The audited proxy has the approved vault connection." },
      { from: "review-console", to: "open-proxy", safe: false, reason: "The open proxy bypasses identity verification." },
      { from: "open-proxy", to: "archive-vault", safe: false, reason: "The vault must not be reached through an untrusted proxy." },
      { from: "identity-check", to: "mirror", safe: false, reason: "The public mirror is not an approved archive route." },
      { from: "mirror", to: "archive-vault", safe: false, reason: "A public mirror is not a trusted transit point." },
    ],
    validPath: ["review-console", "identity-check", "audit-proxy", "archive-vault"],
  },
  "sector-2-route-3": {
    start: "response-desk",
    destination: "backup-store",
    nodes: [
      { id: "response-desk", label: "Incident response desk", role: "START" },
      { id: "log-gateway", label: "Log gateway", role: "AUDIT GATEWAY" },
      { id: "backup-proxy", label: "Backup proxy", role: "PROXY" },
      { id: "public-bridge", label: "Public bridge", role: "UNTRUSTED" },
      { id: "staging-node", label: "Staging node", role: "STAGING" },
      { id: "backup-store", label: "Isolated backup store", role: "DESTINATION" },
    ],
    connections: [
      { from: "response-desk", to: "log-gateway", safe: true, reason: "The audited gateway preserves the investigation trail." },
      { from: "log-gateway", to: "backup-proxy", safe: true, reason: "The backup proxy is the authorized transfer point." },
      { from: "backup-proxy", to: "backup-store", safe: true, reason: "The isolated store accepts transfers from the backup proxy." },
      { from: "response-desk", to: "public-bridge", safe: false, reason: "The public bridge exposes the recovery route." },
      { from: "public-bridge", to: "backup-store", safe: false, reason: "The isolated store must not be accessed from a public bridge." },
      { from: "log-gateway", to: "staging-node", safe: false, reason: "The staging node is not authorized for backup transfers." },
      { from: "staging-node", to: "backup-store", safe: false, reason: "This path would bypass the designated backup proxy." },
    ],
    validPath: ["response-desk", "log-gateway", "backup-proxy", "backup-store"],
  },
} satisfies Record<string, NetworkPathPuzzle>;

export const EMPTY_NETWORK_PATH_STATE: NetworkPathState = { path: [] };

export function isNetworkPathPuzzleValid(
  puzzle: unknown,
): puzzle is NetworkPathPuzzle {
  if (!puzzle || typeof puzzle !== "object" || Array.isArray(puzzle)) return false;
  const candidate = puzzle as Record<string, unknown>;
  if (
    !Array.isArray(candidate["nodes"]) ||
    !Array.isArray(candidate["connections"]) ||
    !Array.isArray(candidate["validPath"]) ||
    typeof candidate["start"] !== "string" ||
    typeof candidate["destination"] !== "string"
  ) return false;
  const start = candidate["start"];
  const destination = candidate["destination"];
  const nodes: NetworkPathPuzzle["nodes"] = [];
  for (const value of candidate["nodes"]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const node = value as Record<string, unknown>;
    if (
      typeof node["id"] !== "string" ||
      !node["id"] ||
      typeof node["label"] !== "string" ||
      !node["label"] ||
      typeof node["role"] !== "string" ||
      !node["role"]
    ) return false;
    nodes.push({ id: node["id"], label: node["label"], role: node["role"] });
  }
  const connections: NetworkConnection[] = [];
  for (const value of candidate["connections"]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const edge = value as Record<string, unknown>;
    if (
      typeof edge["from"] !== "string" ||
      typeof edge["to"] !== "string" ||
      typeof edge["safe"] !== "boolean" ||
      typeof edge["reason"] !== "string" ||
      !edge["reason"]
    ) return false;
    connections.push({
      from: edge["from"],
      to: edge["to"],
      safe: edge["safe"],
      reason: edge["reason"],
    });
  }
  const path = candidate["validPath"].filter((nodeId): nodeId is string => typeof nodeId === "string");
  if (path.length !== candidate["validPath"].length) return false;
  const ids = nodes.map((node) => node.id);
  if (
    ids.length < 3 ||
    new Set(ids).size !== ids.length ||
    !ids.includes(start) ||
    !ids.includes(destination) ||
    start === destination
  ) return false;
  const edges = new Set<string>();
  for (const edge of connections) {
    const key = `${edge.from}\0${edge.to}`;
    if (
      !ids.includes(edge.from) ||
      !ids.includes(edge.to) ||
      edge.from === edge.to ||
      edges.has(key)
    ) return false;
    edges.add(key);
  }
  if (
    path.length < 2 ||
    path[0] !== start ||
    path[path.length - 1] !== destination ||
    new Set(path).size !== path.length
  ) return false;
  return path.slice(1).every((to, index) => {
    const edge = connections.find((item) => item.from === path[index] && item.to === to);
    return Boolean(edge?.safe);
  });
}

export function initialNetworkPathState(puzzle: NetworkPathPuzzle): NetworkPathState {
  return { path: [puzzle.start] };
}

export function selectNetworkPathNode(
  puzzle: NetworkPathPuzzle,
  state: NetworkPathState,
  nodeId: string,
): NetworkPathState {
  if (!state.path.length || state.path.includes(nodeId)) return state;
  const current = state.path[state.path.length - 1];
  if (!puzzle.connections.some((edge) => edge.from === current && edge.to === nodeId)) return state;
  return { path: [...state.path, nodeId] };
}

export function resetNetworkPath(puzzle: NetworkPathPuzzle): NetworkPathState {
  return initialNetworkPathState(puzzle);
}

export function isNetworkPathStateValid(
  puzzle: NetworkPathPuzzle,
  state: unknown,
): state is NetworkPathState {
  if (!state || typeof state !== "object" || !("path" in state) || !Array.isArray(state.path)) return false;
  const path = state.path as unknown[];
  if (
    path.length < 1 ||
    path[0] !== puzzle.start ||
    path.length > puzzle.nodes.length ||
    path.some((id) => typeof id !== "string" || !puzzle.nodes.some((node) => node.id === id)) ||
    new Set(path).size !== path.length
  ) return false;
  return path.slice(1).every((to, index) =>
    puzzle.connections.some((edge) => edge.from === path[index] && edge.to === to),
  );
}

export interface NetworkPathEvaluation {
  correct: boolean;
  feedback: string;
}

export function evaluateNetworkPath(
  puzzle: NetworkPathPuzzle,
  path: string[],
): NetworkPathEvaluation {
  if (!isNetworkPathStateValid(puzzle, { path })) {
    return { correct: false, feedback: "That path is incomplete or contains a connection not shown in the training map." };
  }
  if (path[path.length - 1] !== puzzle.destination) {
    return { correct: false, feedback: "The selected route does not reach the designated destination." };
  }
  const unsafe = path.slice(1).map((to, index) =>
    puzzle.connections.find((edge) => edge.from === path[index] && edge.to === to),
  ).find((edge) => !edge?.safe);
  if (unsafe) return { correct: false, feedback: unsafe.reason };
  if (path.length !== puzzle.validPath.length || path.some((node, index) => node !== puzzle.validPath[index])) {
    return { correct: false, feedback: "This route reaches the destination, but it does not follow the approved training path." };
  }
  return { correct: true, feedback: "Correct route. Each hop follows the approved, monitored training path." };
}

export function outgoingNetworkConnections(
  puzzle: NetworkPathPuzzle,
  state: NetworkPathState,
): NetworkConnection[] {
  const current = state.path[state.path.length - 1];
  return puzzle.connections.filter((edge) => edge.from === current && !state.path.includes(edge.to));
}
