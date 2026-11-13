import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type { BossPhaseId } from "@/game/types";

const NexusAiCoreScene = lazy(() => import("./NexusAiCoreScene"));

type AnswerFeedback = "correct" | "incorrect" | null;
type RendererState = "checking" | "loading" | "webgl" | "fallback";

interface NexusAiCoreProps {
  phase: BossPhaseId;
  feedback: AnswerFeedback;
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ??
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true });
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("The NEXUS AI core scene failed; using its CSS fallback.", error);
    this.props.onFailure();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function NexusAiCore({ phase, feedback }: NexusAiCoreProps) {
  const [renderer, setRenderer] = useState<RendererState>("checking");
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setRenderer(supportsWebGL() ? "loading" : "fallback");
  }, []);

  useEffect(() => {
    if (!canvas) return;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setRenderer("fallback");
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [canvas]);

  const onFailure = useCallback(() => setRenderer("fallback"), []);
  const onCreated = useCallback((element: HTMLCanvasElement) => {
    setCanvas(element);
    setRenderer("webgl");
  }, []);

  return (
    <div
      className="nexus-ai-core"
      data-phase={phase}
      data-feedback={feedback ?? "none"}
      data-renderer={renderer}
      aria-hidden="true"
    >
      <div className="nexus-ai-core-fallback">
        <div className="nexus-ai-core-css-orbit nexus-ai-core-css-orbit--outer" />
        <div className="nexus-ai-core-css-orbit nexus-ai-core-css-orbit--inner" />
        <div className="nexus-ai-core-css-neural" />
        <div className="nexus-ai-core-css-sphere" />
        <div className="nexus-ai-core-css-scan" />
        <span className="nexus-ai-core-label">NEXUS / CORE</span>
      </div>
      {renderer !== "checking" && renderer !== "fallback" && (
        <div className="nexus-ai-core-canvas">
          <Suspense fallback={null}>
            <SceneErrorBoundary onFailure={onFailure}>
              <NexusAiCoreScene phase={phase} feedback={feedback} onCreated={onCreated} />
            </SceneErrorBoundary>
          </Suspense>
        </div>
      )}
    </div>
  );
}
