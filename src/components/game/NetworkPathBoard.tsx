import { evaluateNetworkPath, initialNetworkPathState, isNetworkPathPuzzleValid, outgoingNetworkConnections } from "@/game/networkPathPuzzles";
import type { NetworkPathPuzzle, NetworkPathState } from "@/game/types";
import { Btn } from "./Hud";
import { cn } from "@/lib/utils";

interface NetworkPathBoardProps {
  puzzle: NetworkPathPuzzle;
  state?: NetworkPathState | undefined;
  answered: { correct: boolean; chosen: string } | null;
  selectNode: (nodeId: string) => void;
  reset: () => void;
  retry: () => void;
  submit: (value: string) => void;
}

export function NetworkPathBoard({
  puzzle,
  state,
  answered,
  selectNode,
  reset,
  retry,
  submit,
}: NetworkPathBoardProps) {
  if (!isNetworkPathPuzzleValid(puzzle)) {
    return (
      <p role="alert" className="mt-4 rounded-md border border-destructive p-3 font-mono text-sm text-destructive">
        ROUTE MAP UNAVAILABLE · This fictional training puzzle is incomplete.
      </p>
    );
  }

  const route = state ?? initialNetworkPathState(puzzle);
  const currentId = route.path[route.path.length - 1];
  const current = puzzle.nodes.find((node) => node.id === currentId);
  const outgoing = outgoingNetworkConnections(puzzle, route);
  const evaluation = evaluateNetworkPath(puzzle, route.path);

  return (
    <div className="mt-4 space-y-4">
      <p className="rounded-md border border-border bg-background p-3 font-mono text-xs text-muted-foreground">
        FICTIONAL TRAINING SIMULATION · No real networks are contacted.
      </p>
      <div className="grid gap-2 sm:grid-cols-2" aria-label="Fictional network diagram">
        {puzzle.nodes.map((node) => {
          const position = route.path.indexOf(node.id);
          const canConnect = !answered && outgoing.some((edge) => edge.to === node.id);
          return (
            <button
              key={node.id}
              type="button"
              disabled={!canConnect}
              aria-label={`${node.role}: ${node.label}${position >= 0 ? `, route step ${position + 1}` : ""}${canConnect ? `, connect from ${current?.label ?? "current node"}` : ""}`}
              onClick={() => selectNode(node.id)}
              className={cn(
                "tap-target min-w-0 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                position >= 0 ? "border-primary bg-primary/10" : "border-border bg-surface/50",
                canConnect && "cursor-pointer hover:border-primary",
                !canConnect && !position && !answered && "opacity-80",
                answered && answered.correct && position >= 0 && "border-success text-success",
              )}
            >
              <span className="block font-mono text-[0.65rem] tracking-wider text-accent">{node.role}</span>
              <span className="mt-1 block break-words font-semibold">{node.label}</span>
              {position >= 0 && <span className="mt-1 block font-mono text-xs text-primary">ROUTE {position + 1}</span>}
            </button>
          );
        })}
      </div>

      <section aria-label="Selected route" className="rounded-md border border-border bg-background p-3">
        <h3 className="font-mono text-xs text-muted-foreground">CURRENT PATH</h3>
        <p className="mt-2 break-words font-mono text-sm" aria-live="polite">
          {route.path.map((id) => puzzle.nodes.find((node) => node.id === id)?.label ?? id).join(" → ")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Current node: {current?.label ?? "Unavailable"}
        </p>
      </section>

      {!answered && (
        <section aria-label="Available connections">
          <h3 className="mb-2 font-mono text-xs text-muted-foreground">AVAILABLE CONNECTIONS</h3>
          {outgoing.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {outgoing.map((edge) => {
                const target = puzzle.nodes.find((node) => node.id === edge.to);
                return (
                  <button
                    key={`${edge.from}-${edge.to}`}
                    type="button"
                    aria-label={`Connect to ${target?.label ?? edge.to}. ${edge.safe ? "Approved route." : "Untrusted route."} ${edge.reason}`}
                    onClick={() => selectNode(edge.to)}
                    className="tap-target rounded-md border border-border bg-surface/50 p-3 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="block font-mono text-sm">→ {target?.label ?? edge.to}</span>
                    <span className={cn("mt-1 block text-xs", edge.safe ? "text-success" : "text-warning")}>
                      {edge.safe ? "MONITORED CONNECTION" : "UNTRUSTED CONNECTION"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md border border-warning/50 p-3 text-sm text-warning">
              No further connections are available from this node. Reset the path and try another route.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="ghost" onClick={reset}>RESET PATH</Btn>
            <Btn onClick={() => submit(JSON.stringify(route.path))} disabled={route.path.length < 2}>
              SUBMIT PATH
            </Btn>
          </div>
        </section>
      )}

      {answered && (
        <div role="status" aria-live="polite" className={cn("rounded-md border p-3", answered.correct ? "border-success/50 text-success" : "border-destructive/50 text-destructive")}>
          <p className="font-mono text-sm">{evaluation.feedback}</p>
          {!answered.correct && <Btn className="mt-3" onClick={retry}>RESET & RETRY PATH</Btn>}
        </div>
      )}
    </div>
  );
}
