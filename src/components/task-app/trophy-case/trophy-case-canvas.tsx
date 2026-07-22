"use client";

import { PerspectiveCamera, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MilestoneTier } from "@/lib/milestones";
import { getTrophyRotationDelta, getTrophyShowcaseStageLayout, isTrophyRotationActive, TROPHY_CONTEXT_RESTORE_GRACE_MS, TROPHY_GALLERY_TIERS, TROPHY_SHOWCASE_CAMERA_DISTANCE, TROPHY_SHOWCASE_CAMERA_FOV, TROPHY_TIER_MATERIALS, type TrophyQualityProfile } from "@/lib/trophy-case";
import { withBasePath } from "@/lib/utils";
import { createTrophyDieGlitterTexture, getTrophyDiePipColor, TROPHY_DIE_PLATINUM_BODY_MATERIAL, TROPHY_DIE_PRESENTATION_ROTATION } from "./trophy-die-visual";

class TrophyRotationController {
  private readonly groups: Array<THREE.Group | null> = [null, null, null, null];

  register(index: number, group: THREE.Group | null) {
    this.groups[index] = group;
  }

  rotate(delta: number) {
    let rotated = false;
    for (const group of this.groups) {
      if (!group) continue;
      group.rotation.y += delta;
      rotated = true;
    }
    return rotated;
  }
}

export function TrophyGalleryCanvas({ autoRotate, onContextLost, onContextRestoreFailed, onContextRestored, profile }: {
  autoRotate: boolean;
  onContextLost: () => void;
  onContextRestoreFailed: () => void;
  onContextRestored: () => void;
  profile: TrophyQualityProfile;
}) {
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState>(() => document.visibilityState);
  const [contextCanvas, setContextCanvas] = useState<HTMLCanvasElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [wideLayout, setWideLayout] = useState(() => window.matchMedia("(min-width: 640px)").matches);
  const [rotationController] = useState(() => new TrophyRotationController());
  const lifecycleCallbacks = useRef({ onContextLost, onContextRestoreFailed, onContextRestored });
  const rotationActive = !contextLost && isTrophyRotationActive(autoRotate, visibilityState);

  useEffect(() => {
    lifecycleCallbacks.current = { onContextLost, onContextRestoreFailed, onContextRestored };
  }, [onContextLost, onContextRestoreFailed, onContextRestored]);

  useEffect(() => {
    const onVisibilityChange = () => setVisibilityState(document.visibilityState);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const handleChange = () => setWideLayout(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!contextCanvas) return;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    const clearRestoreTimer = () => {
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = null;
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      clearRestoreTimer();
      setContextLost(true);
      lifecycleCallbacks.current.onContextLost();
      restoreTimer = setTimeout(() => lifecycleCallbacks.current.onContextRestoreFailed(), TROPHY_CONTEXT_RESTORE_GRACE_MS);
    };
    const handleContextRestored = () => {
      clearRestoreTimer();
      setContextLost(false);
      lifecycleCallbacks.current.onContextRestored();
    };
    contextCanvas.addEventListener("webglcontextlost", handleContextLost);
    contextCanvas.addEventListener("webglcontextrestored", handleContextRestored);
    return () => {
      clearRestoreTimer();
      contextCanvas.removeEventListener("webglcontextlost", handleContextLost);
      contextCanvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [contextCanvas]);

  return <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-preview-layout="one-rectangle-four-fixed-stages">
    <Canvas
      aria-label="Four rotating trophy collection dice. Use the adjacent buttons to filter."
      dpr={profile.dpr}
      frameloop={rotationActive ? "always" : "demand"}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => {
        setContextCanvas(gl.domElement);
      }}
      shadows={profile.shadows}
      style={{ inset: 0, pointerEvents: "none", position: "absolute" }}
    >
      <TrophyStages columns={wideLayout ? 4 : 2} performanceMode={!profile.shadows} registerGroup={(index, group) => rotationController.register(index, group)} shadowMapSize={profile.shadowMapSize} />
      <TrophyRotationDriver active={rotationActive} controller={rotationController} />
    </Canvas>
  </div>;
}

function TrophyStages({ columns, performanceMode, registerGroup, shadowMapSize }: {
  columns: 2 | 4;
  performanceMode: boolean;
  registerGroup: (index: number, group: THREE.Group | null) => void;
  shadowMapSize: number;
}) {
  const size = useThree((state) => state.size);
  const stages = useMemo(() => getTrophyShowcaseStageLayout(size.width, size.height, columns), [columns, size.height, size.width]);
  return <>
    <PerspectiveCamera makeDefault fov={TROPHY_SHOWCASE_CAMERA_FOV} position={[0, 0, TROPHY_SHOWCASE_CAMERA_DISTANCE]} />
    <ambientLight intensity={performanceMode ? 2.2 : 1.7} />
    <directionalLight castShadow={!performanceMode} intensity={2.7} position={[4, 6, 7]} shadow-mapSize-height={shadowMapSize} shadow-mapSize-width={shadowMapSize} />
    <pointLight color="#9d8cff" intensity={performanceMode ? 5 : 10} position={[0, 4, 7]} />
    {TROPHY_GALLERY_TIERS.map((tier, index) => <RotatingTrophy key={tier} position={stages[index].position} registerGroup={(group) => registerGroup(index, group)} scale={stages[index].scale} tier={tier} />)}
  </>;
}

function useNormalizedD6Geometry() {
  const { scene } = useGLTF(withBasePath("/d6.glb"));
  return useMemo(() => {
    const body: THREE.BufferGeometry[] = [];
    const pips: THREE.BufferGeometry[] = [];
    scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const mesh = object as THREE.Mesh;
      (mesh.name.includes("Material001") ? pips : body).push(mesh.geometry);
    });
    return { body, pips };
  }, [scene]);
}

export function TrophyDie({ tier }: { tier: MilestoneTier }) {
  const geometry = useNormalizedD6Geometry();
  const material = TROPHY_TIER_MATERIALS[tier];
  return <group rotation={TROPHY_DIE_PRESENTATION_ROTATION} scale={0.82}>
    <group position={[0, 0, 0]}>
      {geometry.body.map((item, index) => <mesh castShadow geometry={item} key={`body-${index}`}>
        {tier === "platinum"
          ? <PlatinumBodyMaterial color={material.color} />
          : <meshStandardMaterial color={material.color} metalness={0.88} roughness={material.roughness} />}
      </mesh>)}
      {geometry.pips.map((item, index) => <mesh geometry={item} key={`pips-${index}`}><meshStandardMaterial color={getTrophyDiePipColor(tier)} metalness={0.18} roughness={0.32} /></mesh>)}
    </group>
  </group>;
}

function PlatinumBodyMaterial({ color }: { color: string }) {
  const glitterTexture = useMemo(() => createTrophyDieGlitterTexture(), []);
  useEffect(() => () => glitterTexture.dispose(), [glitterTexture]);
  return <meshPhysicalMaterial
    bumpMap={glitterTexture}
    color={color}
    roughnessMap={glitterTexture}
    {...TROPHY_DIE_PLATINUM_BODY_MATERIAL}
  />;
}

function TrophyRotationDriver({ active, controller }: { active: boolean; controller: TrophyRotationController }) {
  useFrame((state, rawDelta) => {
    const rotationDelta = getTrophyRotationDelta(rawDelta, active && document.visibilityState === "visible");
    if (rotationDelta === 0) return;
    if (controller.rotate(rotationDelta)) state.invalidate();
  });
  return null;
}

function RotatingTrophy({ position, registerGroup, scale, tier }: {
  position: [number, number, number];
  registerGroup: (group: THREE.Group | null) => void;
  scale: number;
  tier: MilestoneTier;
}) {
  return <group position={position} ref={registerGroup} rotation={[0, 0, 0]} scale={scale}>
    <TrophyDie tier={tier} />
  </group>;
}
