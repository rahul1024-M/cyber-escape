import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, Lock } from "lucide-react";
import { getNextSectorId, selectSector, type SectorMapItem } from "./sectorMapUtils";

const SectorMap3D = lazy(() => import("./SectorMap3D"));

const POSITIONS = [
  { x: 8, y: 44, worldX: -9.2, worldY: 0.6, z: 0.2, color: "#38d9f5" },
  { x: 25, y: 58, worldX: -5.5, worldY: -0.8, z: -0.5, color: "#6c9bff" },
  { x: 42, y: 40, worldX: -1.8, worldY: 1.0, z: 0.1, color: "#a77bff" },
  { x: 58, y: 60, worldX: 1.8, worldY: -1.0, z: -0.6, color: "#e878ff" },
  { x: 75, y: 42, worldX: 5.5, worldY: 0.8, z: 0.2, color: "#ffb45c" },
  { x: 92, y: 56, worldX: 9.2, worldY: -0.6, z: -0.4, color: "#72f1b8" },
] as const;

const LINK_POINTS = "8,44 25,58 42,40 58,60 75,42 92,56";

interface SectorMapProps {
  sectors: SectorMapItem[];
  onSelect: (levelId: number) => void;
}

interface SectorNodeStyle extends CSSProperties {
  "--sector-x": string;
  "--sector-y": string;
  "--sector-accent": string;
}

type SectorStatus = "locked" | "ready" | "completed";

function getStatus(sector: SectorMapItem): SectorStatus {
  if (sector.completed) return "completed";
  return sector.unlocked ? "ready" : "locked";
}

function getRequirement(sector: SectorMapItem, sectors: SectorMapItem[]) {
  const { level } = sector;
  if (sector.completed) return "Completed. Replay anytime to improve your score.";
  if (sector.unlocked) return "Available now. Select to begin this sector.";
  const previous = sectors.find((entry) => entry.level.id === level.id - 1);
  return previous
    ? `Clear Sector ${previous.level.code} — ${previous.level.title} to unlock.`
    : "Complete the previous sector to unlock.";
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

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("The 3D sector map could not initialize; using the CSS map.", error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SectorMap({ sectors, onSelect }: SectorMapProps) {
  const initiallyAvailable = sectors.find((sector) => sector.unlocked)?.level.id ?? 1;
  const [activeId, setActiveId] = useState(initiallyAvailable);
  const [sceneSettings, setSceneSettings] = useState<{
    reducedMotion: boolean;
    quality: "low" | "high";
    compact: boolean;
    webgl: boolean;
  } | null>(null);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [sceneCanvas, setSceneCanvas] = useState<HTMLCanvasElement | null>(null);
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const activeSector = sectors.find((sector) => sector.level.id === activeId) ?? sectors[0];

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactScreen = window.matchMedia("(max-width: 760px)");
    const touchInput = window.matchMedia("(pointer: coarse)");
    const webgl = supportsWebGL();
    const updateSettings = () => {
      const compact = compactScreen.matches;
      const lowQuality =
        compact ||
        touchInput.matches ||
        (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
      setSceneSettings({
        reducedMotion: motionPreference.matches,
        quality: lowQuality ? "low" : "high",
        compact,
        webgl,
      });
    };

    updateSettings();
    motionPreference.addEventListener("change", updateSettings);
    compactScreen.addEventListener("change", updateSettings);
    touchInput.addEventListener("change", updateSettings);
    return () => {
      motionPreference.removeEventListener("change", updateSettings);
      compactScreen.removeEventListener("change", updateSettings);
      touchInput.removeEventListener("change", updateSettings);
    };
  }, []);

  useEffect(() => {
    if (!sceneCanvas) return;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setSceneFailed(true);
    };
    sceneCanvas.addEventListener("webglcontextlost", handleContextLost);
    return () => sceneCanvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [sceneCanvas]);

  const navigate = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentId: number) => {
      let direction: "next" | "previous" | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") direction = "next";
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") direction = "previous";
      if (!direction) return;

      event.preventDefault();
      const nextId = getNextSectorId(sectors, currentId, direction);
      setActiveId(nextId);
      buttonRefs.current.get(nextId)?.focus();
    },
    [sectors],
  );

  if (!activeSector) return null;

  const activeStatus = getStatus(activeSector);
  const activeRequirement = getRequirement(activeSector, sectors);
  const activePosition =
    POSITIONS[sectors.findIndex((sector) => sector.level.id === activeId)] ?? POSITIONS[0];

  return (
    <div className="sector-map-layout">
      <section className="sector-map-stage" aria-label="Interactive six-sector map">
        <div className="sector-map-visual" aria-hidden="true">
          <svg className="sector-map-connections" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={LINK_POINTS} className="sector-map-link sector-map-link-base" />
            <polyline points={LINK_POINTS} className="sector-map-link sector-map-link-glow" />
            <circle
              cx={activePosition.x}
              cy={activePosition.y}
              r="1.5"
              className="sector-map-scan"
            />
          </svg>
          {sceneSettings?.webgl && !sceneSettings.compact && !sceneFailed && (
            <Suspense fallback={null}>
              <SceneErrorBoundary>
                <SectorMap3D
                  activeId={activeId}
                  onCreated={setSceneCanvas}
                  sectors={sectors.map((sector, index) => ({
                    id: sector.level.id,
                    completed: sector.completed,
                    unlocked: sector.unlocked,
                    position: POSITIONS[index] ?? POSITIONS[0],
                  }))}
                  reducedMotion={sceneSettings.reducedMotion}
                  quality={sceneSettings.quality}
                />
              </SceneErrorBoundary>
            </Suspense>
          )}
        </div>
        <div className="sector-map-nodes">
          {sectors.map((sector, index) => {
            const position = POSITIONS[index] ?? POSITIONS[0];
            const status = getStatus(sector);
            const statusText =
              status === "completed" ? "COMPLETED" : status === "ready" ? "AVAILABLE" : "LOCKED";
            const requirement = getRequirement(sector, sectors);
            const style: SectorNodeStyle = {
              "--sector-x": `${position.x}%`,
              "--sector-y": `${position.y}%`,
              "--sector-accent": position.color,
            };

            return (
              <button
                key={sector.level.id}
                ref={(element) => {
                  if (element) buttonRefs.current.set(sector.level.id, element);
                  else buttonRefs.current.delete(sector.level.id);
                }}
                type="button"
                data-sector-id={sector.level.id}
                data-status={status}
                aria-disabled={!sector.unlocked}
                tabIndex={sector.level.id === activeId ? 0 : -1}
                aria-label={`Sector ${sector.level.code}, ${sector.level.title}. ${statusText}. ${requirement}`}
                aria-current={sector.level.id === activeId ? "true" : undefined}
                className={`sector-map-node sector-map-node--${status}${sector.level.id === activeId ? " is-active" : ""}`}
                style={style}
                onPointerEnter={() => setActiveId(sector.level.id)}
                onFocus={() => setActiveId(sector.level.id)}
                onKeyDown={(event) => navigate(event, sector.level.id)}
                onClick={() => {
                  setActiveId(sector.level.id);
                  selectSector(sector, onSelect);
                }}
              >
                <span className="sector-map-node-code">SECTOR {sector.level.code}</span>
                <span className="sector-map-node-title">{sector.level.title}</span>
                <span className="sector-map-node-status">
                  {status === "locked" ? (
                    <Lock aria-hidden="true" size={13} />
                  ) : status === "completed" ? (
                    <Check aria-hidden="true" size={13} />
                  ) : null}
                  {statusText}
                </span>
              </button>
            );
          })}
        </div>
        <p className="sector-map-keyboard-hint">
          TAB TO FOCUS <span aria-hidden="true">·</span> ARROW KEYS TO NAVIGATE
          <span aria-hidden="true">·</span> ENTER TO DEPLOY
        </p>
      </section>

      <aside className="sector-map-info panel" aria-live="polite" aria-atomic="true">
        <div className="sector-map-info-eyebrow">
          <span>SECTOR {activeSector.level.code}</span>
          <span className={`sector-map-info-state sector-map-info-state--${activeStatus}`}>
            {activeStatus === "completed"
              ? "COMPLETE"
              : activeStatus === "ready"
                ? "READY"
                : "LOCKED"}
          </span>
        </div>
        <h2>{activeSector.level.title}</h2>
        <p className="sector-map-info-tagline">{activeSector.level.tagline}</p>
        <p className="sector-map-info-description">{activeSector.level.description}</p>
        <div className="sector-map-info-requirement">
          <span>STATUS / REQUIREMENT</span>
          <p>{activeRequirement}</p>
        </div>
        {activeSector.completed ? (
          <p className="sector-map-info-best">
            BEST SCORE <strong>{activeSector.bestScore}</strong>
          </p>
        ) : (
          <p className="sector-map-info-best">
            {activeSector.unlocked
              ? `${activeSector.level.challenges.length} CHALLENGES`
              : "ACCESS RESTRICTED"}
          </p>
        )}
        {activeSector.unlocked && (
          <p className="sector-map-info-action">SELECT SECTOR NODE TO BEGIN</p>
        )}
      </aside>
    </div>
  );
}
