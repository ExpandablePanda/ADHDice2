"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type DicePhase = "idle" | "rolling" | "settling";
export type DiceLayout = "d20" | "d20-d6" | "d20-d20-d6";

function DiceModel({
  path,
  scale,
  phase,
  offset,
  speedMult,
  isLead,
  onSettled,
}: {
  path: string;
  scale: number;
  phase: DicePhase;
  offset: [number, number, number];
  speedMult: number;
  isLead: boolean;
  onSettled: () => void;
}) {
  const { scene } = useGLTF(path);
  const clone = useMemo(() => scene.clone(true), [scene]);
  const groupRef = useRef<THREE.Group>(null!);
  const vel = useRef({ x: 0, y: 0, z: 0 });
  const notified = useRef(false);

  useEffect(() => {
    if (phase === "rolling") {
      notified.current = false;
      vel.current = {
        x: (10 + Math.random() * 6) * speedMult,
        y: (16 + Math.random() * 8) * speedMult,
        z: (4 + Math.random() * 4) * speedMult,
      };
    }
  }, [phase, speedMult]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    if (phase === "rolling") {
      g.rotation.x += vel.current.x * dt;
      g.rotation.y += vel.current.y * dt;
      g.rotation.z += vel.current.z * dt;
    } else if (phase === "settling") {
      vel.current.x *= 0.87;
      vel.current.y *= 0.87;
      vel.current.z *= 0.87;
      g.rotation.x += vel.current.x * dt;
      g.rotation.y += vel.current.y * dt;
      g.rotation.z += vel.current.z * dt;
      if (isLead && !notified.current && Math.abs(vel.current.y) < 0.06) {
        notified.current = true;
        setTimeout(onSettled, 0);
      }
    }
  });

  useEffect(() => {
    return () => {
      clone.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
    };
  }, [clone]);

  return (
    <group ref={groupRef} position={offset}>
      <primitive object={clone} scale={scale} />
    </group>
  );
}

export function Dice3DCanvas({
  phase,
  layout,
  onSettled,
  lightMode,
}: {
  phase: DicePhase;
  layout: DiceLayout;
  onSettled: () => void;
  lightMode: boolean;
}) {
  const bg = lightMode ? "#f0ecff" : "#130e24";
  const accentColor = lightMode ? "#9b87ff" : "#cabfff";

  return (
    <div className="w-full rounded-2xl overflow-hidden" style={{ height: 180, background: bg }}>
      <Canvas camera={{ position: [0, 0, 7], fov: 48 }} gl={{ antialias: true }}>
        <color attach="background" args={[bg]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 8, 6]} intensity={1.1} />
        <pointLight position={[-3, -2, 4]} intensity={0.5} color={accentColor} />

        {layout === "d20" && (
          <DiceModel
            path="/d20.glb"
            scale={2.0}
            phase={phase}
            offset={[0, 0, 0]}
            speedMult={1}
            isLead
            onSettled={onSettled}
          />
        )}

        {layout === "d20-d6" && (
          <>
            <DiceModel
              path="/d20.glb"
              scale={1.7}
              phase={phase}
              offset={[-1.4, 0, 0]}
              speedMult={1}
              isLead
              onSettled={onSettled}
            />
            <DiceModel
              path="/d6.glb"
              scale={1.3}
              phase={phase}
              offset={[1.5, 0, 0]}
              speedMult={0.9}
              isLead={false}
              onSettled={() => {}}
            />
          </>
        )}

        {layout === "d20-d20-d6" && (
          <>
            <DiceModel
              path="/d20.glb"
              scale={1.5}
              phase={phase}
              offset={[-2.2, 0.3, 0]}
              speedMult={1}
              isLead
              onSettled={onSettled}
            />
            <DiceModel
              path="/d20.glb"
              scale={1.5}
              phase={phase}
              offset={[0, -0.3, -0.5]}
              speedMult={1.1}
              isLead={false}
              onSettled={() => {}}
            />
            <DiceModel
              path="/d6.glb"
              scale={1.2}
              phase={phase}
              offset={[2.0, 0.2, 0]}
              speedMult={0.85}
              isLead={false}
              onSettled={() => {}}
            />
          </>
        )}
      </Canvas>
    </div>
  );
}

useGLTF.preload("/d20.glb");
useGLTF.preload("/d6.glb");
