import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

const CommandCenterScene = lazy(() => import("./CommandCenterScene"));

type SceneSettings = {
  reducedMotion: boolean;
  quality: "low" | "high";
  webglAvailable: boolean;
};

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

function getQuality() {
  const isSmallOrTouch =
    window.matchMedia("(max-width: 640px)").matches ||
    window.matchMedia("(pointer: coarse)").matches;
  const hasFewCores = navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
  return isSmallOrTouch || hasFewCores ? "low" : "high";
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function CommandCenterBackground() {
  const [settings, setSettings] = useState<SceneSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const smallScreen = window.matchMedia("(max-width: 640px)");
    const touchInput = window.matchMedia("(pointer: coarse)");
    const webglAvailable = supportsWebGL();
    const updateSettings = () =>
      setSettings({
        reducedMotion: motionPreference.matches,
        quality: getQuality(),
        webglAvailable,
      });

    updateSettings();
    motionPreference.addEventListener("change", updateSettings);
    smallScreen.addEventListener("change", updateSettings);
    touchInput.addEventListener("change", updateSettings);
    return () => {
      motionPreference.removeEventListener("change", updateSettings);
      smallScreen.removeEventListener("change", updateSettings);
      touchInput.removeEventListener("change", updateSettings);
    };
  }, []);

  useEffect(() => {
    if (!canvas) return;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [canvas]);

  return (
    <div
      aria-hidden="true"
      className="command-center-background pointer-events-none absolute inset-0"
    >
      <div className="command-center-fallback absolute inset-0" />
      {settings?.webglAvailable && !failed && (
        <Suspense fallback={null}>
          <SceneErrorBoundary onError={() => setFailed(true)}>
            <CommandCenterScene
              reducedMotion={settings.reducedMotion}
              quality={settings.quality}
              onCreated={(element) => setCanvas(element)}
            />
          </SceneErrorBoundary>
        </Suspense>
      )}
    </div>
  );
}
