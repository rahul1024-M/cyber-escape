import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Quality = "low" | "high";

interface CommandCenterSceneProps {
  reducedMotion: boolean;
  quality: Quality;
  onCreated: (canvas: HTMLCanvasElement) => void;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  speed: number;
  size: number;
}

function AmbientParticles({ count, animate }: { count: number; animate: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: count }, (_, index) => ({
        x: (((index * 37) % 101) / 101) * 16 - 8,
        y: (((index * 53) % 97) / 97) * 6 - 3,
        z: -((index * 29) % 50) / 10 - 1,
        speed: 0.035 + ((index * 7) % 10) / 180,
        size: 0.55 + ((index * 11) % 10) / 20,
      })),
    [count],
  );
  const transform = useMemo(() => new THREE.Object3D(), []);
  const initialized = useRef(false);

  useFrame((_, delta) => {
    const instance = mesh.current;
    if (!instance || (!animate && initialized.current)) return;

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle) continue;
      if (animate) {
        particle.y += particle.speed * Math.min(delta, 0.05);
        if (particle.y > 3.5) particle.y = -3.5;
      }
      transform.position.set(particle.x, particle.y, particle.z);
      transform.scale.setScalar(particle.size);
      transform.updateMatrix();
      instance.setMatrixAt(index, transform.matrix);
    }
    instance.instanceMatrix.needsUpdate = true;
    initialized.current = true;
  });

  const geometry = useMemo(() => new THREE.SphereGeometry(0.018, 5, 5), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#38d9f5", transparent: true, opacity: 0.6 }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return <instancedMesh ref={mesh} args={[geometry, material, count]} />;
}

function CommandCore({ animate }: { animate: boolean }) {
  const core = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!animate || !core.current) return;
    core.current.rotation.y += Math.min(delta, 0.05) * 0.08;
    core.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.18) * 0.035;
  });

  return (
    <group ref={core} position={[0, 0.1, -2]}>
      <mesh>
        <icosahedronGeometry args={[0.75, 1]} />
        <meshStandardMaterial
          color="#071928"
          emissive="#087c9c"
          emissiveIntensity={0.9}
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, 0.2, 0]}>
        <torusGeometry args={[1.15, 0.012, 6, 96]} />
        <meshBasicMaterial color="#168fa9" transparent opacity={0.38} />
      </mesh>
      <mesh rotation={[0.8, 0, 0.4]}>
        <torusGeometry args={[1.42, 0.008, 5, 96]} />
        <meshBasicMaterial color="#6356a9" transparent opacity={0.24} />
      </mesh>
    </group>
  );
}

export default function CommandCenterScene({
  reducedMotion,
  quality,
  onCreated,
}: CommandCenterSceneProps) {
  const animate = !reducedMotion;
  const particleCount = quality === "low" ? 18 : 36;
  const dpr: number | [number, number] = quality === "low" ? 1 : [1, 1.5];

  return (
    <Canvas
      aria-hidden="true"
      tabIndex={-1}
      camera={{ position: [0, 1.4, 10], fov: 42, near: 0.1, far: 40 }}
      dpr={dpr}
      frameloop={animate ? "always" : "demand"}
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
      onCreated={({ gl }) => onCreated(gl.domElement)}
      fallback={null}
    >
      <ambientLight intensity={0.65} />
      <pointLight color="#08b6d4" intensity={18} position={[-5, 3, 1]} />
      <pointLight color="#5542a0" intensity={12} position={[5, 1, -2]} />
      <gridHelper args={[24, 24, "#0b5970", "#0a2638"]} position={[0, -2.35, -1]} />
      <mesh position={[-6.2, 0, -3]}>
        <boxGeometry args={[0.08, 4.5, 0.08]} />
        <meshStandardMaterial color="#0b526a" emissive="#063b53" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[6.2, 0, -3]}>
        <boxGeometry args={[0.08, 4.5, 0.08]} />
        <meshStandardMaterial color="#0b526a" emissive="#063b53" emissiveIntensity={0.8} />
      </mesh>
      <CommandCore animate={animate} />
      <AmbientParticles count={particleCount} animate={animate} />
    </Canvas>
  );
}
