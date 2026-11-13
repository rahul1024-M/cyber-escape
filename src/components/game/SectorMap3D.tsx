import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SectorMapItem } from "./sectorMapUtils";

type SectorVisual = {
  id: number;
  unlocked: boolean;
  completed: boolean;
  position: {
    worldX: number;
    worldY: number;
    z: number;
    color: string;
  };
};

interface SectorMap3DProps {
  activeId: number;
  sectors: SectorVisual[];
  reducedMotion: boolean;
  quality: "low" | "high";
  onCreated: (canvas: HTMLCanvasElement) => void;
}

function getNodeColor(sector: SectorVisual) {
  if (sector.completed) return "#67f6ae";
  if (!sector.unlocked) return "#4d657b";
  return sector.position.color;
}

function SectorOrb({
  sector,
  active,
  reducedMotion,
}: {
  sector: SectorVisual;
  active: boolean;
  reducedMotion: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const color = getNodeColor(sector);

  useFrame((state, delta) => {
    if (reducedMotion || !ring.current) return;
    ring.current.rotation.z += Math.min(delta, 0.05) * 0.35;
    const pulse = active ? 1.12 + Math.sin(state.clock.elapsedTime * 2.4) * 0.08 : 1;
    ring.current.scale.setScalar(pulse);
  });

  return (
    <group position={[sector.position.worldX, sector.position.worldY, sector.position.z]}>
      <mesh>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={sector.unlocked ? 0.78 : 0.38}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={sector.unlocked ? 0.42 : 0.18} />
      </mesh>
      <mesh ref={ring}>
        <torusGeometry args={[0.34, 0.018, 6, 32]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.5} />
      </mesh>
    </group>
  );
}

function SectorConnections({ sectors }: { sectors: SectorVisual[] }) {
  return (
    <>
      {sectors.slice(0, -1).map((sector, index) => {
        const next = sectors[index + 1];
        if (!next) return null;
        const start = new THREE.Vector3(
          sector.position.worldX,
          sector.position.worldY,
          sector.position.z,
        );
        const end = new THREE.Vector3(next.position.worldX, next.position.worldY, next.position.z);
        const difference = end.clone().sub(start);
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        return (
          <mesh
            key={`${sector.id}-${next.id}`}
            position={midpoint}
            rotation={[0, 0, Math.atan2(difference.x, difference.y)]}
          >
            <cylinderGeometry args={[0.012, 0.012, difference.length(), 5]} />
            <meshBasicMaterial
              color={sector.completed ? "#68f2b3" : "#38d9f5"}
              transparent
              opacity={sector.completed ? 0.56 : 0.3}
            />
          </mesh>
        );
      })}
    </>
  );
}

function AmbientParticles({ count, reducedMotion }: { count: number; reducedMotion: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        x: (((index * 37) % 97) / 97) * 22 - 11,
        y: (((index * 53) % 89) / 89) * 5 - 2.5,
        z: -1 - ((index * 29) % 40) / 10,
        speed: 0.04 + ((index * 7) % 10) / 160,
        size: 0.55 + ((index * 11) % 10) / 24,
      })),
    [count],
  );
  const transform = useMemo(() => new THREE.Object3D(), []);
  const initialized = useRef(false);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.018, 5, 5), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#54def4", transparent: true, opacity: 0.6 }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, delta) => {
    const instance = mesh.current;
    if (!instance || (reducedMotion && initialized.current)) return;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle) continue;
      if (!reducedMotion) {
        particle.y += particle.speed * Math.min(delta, 0.05);
        if (particle.y > 2.8) particle.y = -2.8;
      }
      transform.position.set(particle.x, particle.y, particle.z);
      transform.scale.setScalar(particle.size);
      transform.updateMatrix();
      instance.setMatrixAt(index, transform.matrix);
    }
    instance.instanceMatrix.needsUpdate = true;
    initialized.current = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, count]} />;
}

function MapCamera({ activeId, sectors, reducedMotion }: Omit<SectorMap3DProps, "onCreated">) {
  const { camera } = useThree();
  const focus = sectors.find((sector) => sector.id === activeId);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (!focus || reducedMotion) return;
    target.set(focus.position.worldX * 0.018, focus.position.worldY * 0.04, 13);
    camera.position.lerp(target, 1 - Math.exp(-Math.min(delta, 0.05) * 1.4));
    camera.lookAt(0, 0, 0);
  });

  return null;
}

function MapScene({
  activeId,
  sectors,
  reducedMotion,
  quality,
}: Omit<SectorMap3DProps, "onCreated">) {
  const count = quality === "low" ? 10 : 18;
  return (
    <>
      <ambientLight intensity={0.9} />
      <pointLight color="#38d9f5" intensity={15} position={[-6, 4, 3]} />
      <pointLight color="#7559b8" intensity={9} position={[6, -2, -3]} />
      <SectorConnections sectors={sectors} />
      {sectors.map((sector) => (
        <SectorOrb
          key={sector.id}
          sector={sector}
          active={sector.id === activeId}
          reducedMotion={reducedMotion}
        />
      ))}
      <AmbientParticles count={count} reducedMotion={reducedMotion} />
      <MapCamera
        activeId={activeId}
        sectors={sectors}
        reducedMotion={reducedMotion}
        quality={quality}
      />
    </>
  );
}

export default function SectorMap3D(props: SectorMap3DProps) {
  const animate = !props.reducedMotion;
  return (
    <Canvas
      aria-hidden="true"
      tabIndex={-1}
      camera={{ position: [0, 0, 13], fov: 45, near: 0.1, far: 40 }}
      dpr={props.quality === "low" ? 1 : [1, 1.35]}
      frameloop={animate ? "always" : "demand"}
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
      fallback={null}
      onCreated={({ gl }) => props.onCreated(gl.domElement)}
    >
      <MapScene {...props} />
    </Canvas>
  );
}
