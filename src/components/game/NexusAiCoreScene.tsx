import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BossPhaseId } from "@/game/types";

type AnswerFeedback = "correct" | "incorrect" | null;

interface NexusAiCoreSceneProps {
  phase: BossPhaseId;
  feedback: AnswerFeedback;
  onCreated: (canvas: HTMLCanvasElement) => void;
}

const PHASE_STYLE: Record<BossPhaseId, { color: string; speed: number; intensity: number }> = {
  reconnaissance: { color: "#35d9ff", speed: 0.18, intensity: 1.05 },
  containment: { color: "#399dff", speed: 0.42, intensity: 1.35 },
  recovery: { color: "#8b72ff", speed: 0.28, intensity: 0.92 },
};

function createNeuralGeometry() {
  const positions: number[] = [];
  const nodeCount = 18;
  for (let index = 0; index < nodeCount; index += 1) {
    const latitude = Math.acos(1 - (2 * (index + 0.5)) / nodeCount);
    const longitude = Math.PI * (1 + Math.sqrt(5)) * index;
    const point = new THREE.Vector3(
      Math.cos(longitude) * Math.sin(latitude),
      Math.sin(longitude) * Math.sin(latitude),
      Math.cos(latitude),
    );
    const neighborIndex = (index + 5) % nodeCount;
    const neighborLatitude = Math.acos(1 - (2 * (neighborIndex + 0.5)) / nodeCount);
    const neighborLongitude = Math.PI * (1 + Math.sqrt(5)) * neighborIndex;
    const neighbor = new THREE.Vector3(
      Math.cos(neighborLongitude) * Math.sin(neighborLatitude),
      Math.sin(neighborLongitude) * Math.sin(neighborLatitude),
      Math.cos(neighborLatitude),
    );
    positions.push(
      point.x * 0.78,
      point.y * 0.78,
      point.z * 0.78,
      neighbor.x * 0.78,
      neighbor.y * 0.78,
      neighbor.z * 0.78,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function EnergyParticles() {
  const points = useMemo(() => {
    const positions = new Float32Array(54);
    for (let index = 0; index < 18; index += 1) {
      const angle = index * 2.4;
      const radius = 1.15 + ((index * 7) % 9) / 30;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = Math.sin(angle * 1.7) * radius * 0.7;
      positions[index * 3 + 2] = Math.sin(angle) * radius * 0.45;
    }
    return positions;
  }, []);
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return buffer;
  }, [points]);
  const material = useMemo(
    () =>
      new THREE.PointsMaterial({ color: "#78dfff", size: 0.035, transparent: true, opacity: 0.8 }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <points geometry={geometry} material={material} />;
}

function NexusEntity({ phase, feedback }: Pick<NexusAiCoreSceneProps, "phase" | "feedback">) {
  const entity = useRef<THREE.Group>(null);
  const innerOrbit = useRef<THREE.Group>(null);
  const outerOrbit = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const feedbackStartedAt = useRef<number | null>(null);
  const neuralGeometry = useMemo(createNeuralGeometry, []);
  const style = PHASE_STYLE[phase];

  useEffect(() => {
    feedbackStartedAt.current = feedback ? performance.now() : null;
  }, [feedback]);

  useEffect(
    () => () => {
      neuralGeometry.dispose();
    },
    [neuralGeometry],
  );

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const step = Math.min(delta, 0.05);
    const pulse = 1 + Math.sin(elapsed * (phase === "containment" ? 4.2 : 2.2)) * 0.035;
    const feedbackAge =
      feedbackStartedAt.current === null
        ? Number.POSITIVE_INFINITY
        : performance.now() - feedbackStartedAt.current;
    const feedbackPulse = feedbackAge < 850 ? Math.sin((feedbackAge / 850) * Math.PI) : 0;

    if (entity.current) entity.current.rotation.y += step * style.speed * 0.42;
    if (innerOrbit.current) innerOrbit.current.rotation.z += step * style.speed * 1.25;
    if (outerOrbit.current) outerOrbit.current.rotation.y -= step * style.speed * 0.72;
    if (core.current) core.current.scale.setScalar(pulse + feedbackPulse * 0.11);
    if (light.current) {
      const answerBoost = feedbackPulse * (feedback === "correct" ? 1.2 : 0.6);
      light.current.intensity = style.intensity + Math.sin(elapsed * 1.6) * 0.12 + answerBoost;
    }
  });

  return (
    <group ref={entity}>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.64, 2]} />
        <meshStandardMaterial
          color="#092c53"
          emissive={style.color}
          emissiveIntensity={style.intensity}
          roughness={0.25}
          metalness={0.4}
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.78, 1]} />
        <meshBasicMaterial color={style.color} wireframe transparent opacity={0.24} />
      </mesh>
      <lineSegments geometry={neuralGeometry}>
        <lineBasicMaterial
          color={feedback === "incorrect" ? "#b184ff" : style.color}
          transparent
          opacity={0.56}
        />
      </lineSegments>
      <group ref={innerOrbit} rotation={[0.8, 0.2, 0.25]}>
        <mesh>
          <torusGeometry args={[0.98, 0.014, 6, 72]} />
          <meshBasicMaterial color="#a280ff" transparent opacity={0.78} />
        </mesh>
      </group>
      <group ref={outerOrbit} rotation={[0.25, 0.65, 1.05]}>
        <mesh>
          <torusGeometry args={[1.22, 0.012, 6, 88]} />
          <meshBasicMaterial color={style.color} transparent opacity={0.72} />
        </mesh>
      </group>
      <mesh rotation={[0.3, 0.7, 0.1]}>
        <torusGeometry args={[1.4, 0.006, 5, 96]} />
        <meshBasicMaterial color="#a280ff" transparent opacity={0.28} />
      </mesh>
      <EnergyParticles />
      <pointLight ref={light} color={style.color} intensity={style.intensity} distance={5} />
      <pointLight color="#895fff" intensity={0.55} distance={4} position={[1.2, -0.5, 0.8]} />
    </group>
  );
}

export default function NexusAiCoreScene({ phase, feedback, onCreated }: NexusAiCoreSceneProps) {
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <Canvas
      aria-hidden="true"
      tabIndex={-1}
      camera={{ position: [0, 0, 5.2], fov: 42, near: 0.1, far: 20 }}
      dpr={[1, 1.35]}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
      onCreated={({ gl }) => onCreated(gl.domElement)}
      fallback={null}
    >
      <ambientLight intensity={0.55} />
      <pointLight color="#37cfff" intensity={8} position={[-2, 1.5, 2]} />
      <NexusEntity phase={phase} feedback={feedback} />
    </Canvas>
  );
}
