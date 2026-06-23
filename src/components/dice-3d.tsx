"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { withBasePath } from "@/lib/utils";

export type DicePhase = "idle" | "rolling" | "settling";
export type DiceLayout = "d20" | "d20-d6" | "d20-d20-d6";
export type D20MaterialPreset = "ceramic" | "candy" | "glass" | "matte" | "metal";

// These rotations map the requested top face value to the actual d6.glb orientation.
const D6_FACE_ROTATIONS: Record<number, [number, number, number]> = {
  1: [1.5708, -0.7854, 3.2289],
  2: [0.6981, -0.0873, -1.4835],
  3: [-0.6981, Math.PI, Math.PI / 2],
  4: [2.3387, -2.9496, 1.3788],
  5: [-0.0873, 2.5133, Math.PI],
  6: [-1.5708, 0.7854, Math.PI],
};

export const D6_FACE_ROTATION_PRESETS = D6_FACE_ROTATIONS;

const D20_FACE_ROTATIONS: Record<number, [number, number, number]> = {
  1: [1.501, 3.1416, 3.1416],
  2: [2.1468, 1.0123, 0.2793],
  3: [-0.9948, 2.1118, 0.9076],
  4: [0.4538, 0.5585, 2.234],
  5: [-1.1694, -2.1468, -0.9599],
  6: [0.4189, -0.5236, -2.2515],
  7: [5.7945, 3.1765, 0],
  8: [2.042, -1.0123, -0.192],
  9: [-0.6109, -0.0698, 0.5236],
  10: [2.3736, -0.1047, -0.6458],
  11: [-0.7679, -0.0698, -0.6981],
  12: [2.6005, 0.0524, 0.576],
  13: [-1.1868, 5.2709, -0.384],
  14: [2.4609, -3.1067, 0],
  15: [0.3142, -2.5831, 0.9425],
  16: [1.7279, -2.1817, -0.8727],
  17: [0.2443, 2.5831, -0.8901],
  18: [1.7279, 2.2166, 1.0647],
  19: [-1.0472, 1.0647, 0.2618],
  20: [1.4137, -0.0175, 0],
};

export const D20_FACE_ROTATION_PRESETS = D20_FACE_ROTATIONS;

const D6_BODY_COLOR = "#cbbcff";
const D6_BODY_EMISSIVE = "#8f7af6";
const D6_PIP_COLOR = "#ffffff";
const D6_PIP_EMISSIVE = "#f7f4ff";
export type D6MaterialPreset = "candy" | "ceramic" | "glass" | "matte" | "metal";

export type D6VisualStyle = {
  bodyColor: string;
  bodyEmissive: string;
  bodyEmissiveIntensity: number;
  bodyMetalness: number;
  bodyOpacity: number;
  bodyRoughness: number;
  finish: D6MaterialPreset;
  pipColor: string;
  pipEmissive: string;
  pipEmissiveIntensity: number;
  pipMetalness: number;
  pipOpacity: number;
  pipRoughness: number;
};

export const DEFAULT_D6_VISUAL_STYLE: D6VisualStyle = {
  bodyColor: D6_BODY_COLOR,
  bodyEmissive: D6_BODY_EMISSIVE,
  bodyEmissiveIntensity: 0.05,
  bodyMetalness: 0.06,
  bodyOpacity: 1,
  bodyRoughness: 0.5,
  finish: "ceramic",
  pipColor: D6_PIP_COLOR,
  pipEmissive: D6_PIP_EMISSIVE,
  pipEmissiveIntensity: 0.12,
  pipMetalness: 0.04,
  pipOpacity: 1,
  pipRoughness: 0.18,
};

export type D20VisualStyle = {
  bodyColor: string;
  bodyEmissive: string;
  bodyEmissiveIntensity: number;
  bodyMetalness: number;
  bodyOpacity: number;
  bodyRoughness: number;
  finish: D20MaterialPreset;
  pipColor: string;
  pipEmissive: string;
  pipEmissiveIntensity: number;
  pipMetalness: number;
  pipOpacity: number;
  pipRoughness: number;
};

export const DEFAULT_D20_VISUAL_STYLE: D20VisualStyle = {
  bodyColor: "#8e82f9",
  bodyEmissive: "#6552f1",
  bodyEmissiveIntensity: 0.08,
  bodyMetalness: 0.08,
  bodyOpacity: 1,
  bodyRoughness: 0.38,
  finish: "ceramic",
  pipColor: "#f7f4ff",
  pipEmissive: "#ffffff",
  pipEmissiveIntensity: 0.16,
  pipMetalness: 0.06,
  pipOpacity: 1,
  pipRoughness: 0.2,
};

const DEFAULT_D20_CAMERA_POSITION: [number, number, number] = [0, 0.2, 12.2];

function isD6PipMesh(mesh: THREE.Mesh) {
  return mesh.name.includes("Material001");
}

function getD6MaterialFinish(finish: D6MaterialPreset, isPipMesh: boolean) {
  if (finish === "matte") {
    return {
      emissiveIntensity: isPipMesh ? 0.05 : 0.03,
      metalness: 0.02,
      roughness: isPipMesh ? 0.24 : 0.72,
    };
  }

  if (finish === "candy") {
    return {
      emissiveIntensity: isPipMesh ? 0.12 : 0.08,
      metalness: 0.08,
      roughness: isPipMesh ? 0.14 : 0.32,
    };
  }

  if (finish === "glass") {
    return {
      emissiveIntensity: isPipMesh ? 0.1 : 0.06,
      metalness: 0.02,
      roughness: isPipMesh ? 0.04 : 0.12,
    };
  }

  if (finish === "metal") {
    return {
      emissiveIntensity: isPipMesh ? 0.08 : 0.03,
      metalness: isPipMesh ? 0.32 : 0.74,
      roughness: isPipMesh ? 0.18 : 0.26,
    };
  }

  return {
    emissiveIntensity: isPipMesh ? 0.12 : 0.05,
    metalness: isPipMesh ? 0.04 : 0.06,
    roughness: isPipMesh ? 0.18 : 0.5,
  };
}

function getD20MaterialFinish(finish: D20MaterialPreset, isPipMesh: boolean) {
  if (finish === "matte") {
    return {
      emissiveIntensity: isPipMesh ? 0.08 : 0.05,
      metalness: 0.03,
      roughness: isPipMesh ? 0.28 : 0.7,
    };
  }

  if (finish === "candy") {
    return {
      emissiveIntensity: isPipMesh ? 0.18 : 0.12,
      metalness: 0.12,
      roughness: isPipMesh ? 0.14 : 0.28,
    };
  }

  if (finish === "glass") {
    return {
      emissiveIntensity: isPipMesh ? 0.14 : 0.08,
      metalness: 0.04,
      roughness: isPipMesh ? 0.06 : 0.12,
    };
  }

  if (finish === "metal") {
    return {
      emissiveIntensity: isPipMesh ? 0.1 : 0.04,
      metalness: isPipMesh ? 0.48 : 0.82,
      roughness: isPipMesh ? 0.16 : 0.24,
    };
  }

  return {
    emissiveIntensity: isPipMesh ? 0.16 : 0.08,
    metalness: isPipMesh ? 0.06 : 0.08,
    roughness: isPipMesh ? 0.2 : 0.38,
  };
}

export function applyD6MaterialPreset(baseStyle: D6VisualStyle, finish: D6MaterialPreset): D6VisualStyle {
  const bodyFinish = getD6MaterialFinish(finish, false);
  const pipFinish = getD6MaterialFinish(finish, true);
  const bodyOpacity = finish === "glass" ? 0.72 : finish === "metal" ? 0.96 : 1;
  const pipOpacity = finish === "glass" ? 0.9 : 1;

  return {
    ...baseStyle,
    bodyEmissiveIntensity: bodyFinish.emissiveIntensity,
    bodyMetalness: bodyFinish.metalness,
    bodyOpacity,
    bodyRoughness: bodyFinish.roughness,
    finish,
    pipEmissiveIntensity: pipFinish.emissiveIntensity,
    pipMetalness: pipFinish.metalness,
    pipOpacity,
    pipRoughness: pipFinish.roughness,
  };
}

export function applyD20MaterialPreset(baseStyle: D20VisualStyle, finish: D20MaterialPreset): D20VisualStyle {
  const bodyFinish = getD20MaterialFinish(finish, false);
  const pipFinish = getD20MaterialFinish(finish, true);
  const bodyOpacity = finish === "glass" ? 0.78 : finish === "metal" ? 0.96 : 1;
  const pipOpacity = finish === "glass" ? 0.94 : 1;

  return {
    ...baseStyle,
    bodyEmissiveIntensity: bodyFinish.emissiveIntensity,
    bodyMetalness: bodyFinish.metalness,
    bodyOpacity,
    bodyRoughness: bodyFinish.roughness,
    finish,
    pipEmissiveIntensity: pipFinish.emissiveIntensity,
    pipMetalness: pipFinish.metalness,
    pipOpacity,
    pipRoughness: pipFinish.roughness,
  };
}

function buildRewardD6Material(mesh: THREE.Mesh, style: D6VisualStyle = DEFAULT_D6_VISUAL_STYLE) {
  const isPipMesh = isD6PipMesh(mesh);

  return new THREE.MeshStandardMaterial({
    color: isPipMesh ? style.pipColor : style.bodyColor,
    metalness: isPipMesh ? style.pipMetalness : style.bodyMetalness,
    opacity: isPipMesh ? style.pipOpacity : style.bodyOpacity,
    roughness: isPipMesh ? style.pipRoughness : style.bodyRoughness,
    emissive: isPipMesh ? style.pipEmissive : style.bodyEmissive,
    emissiveIntensity: isPipMesh ? style.pipEmissiveIntensity : style.bodyEmissiveIntensity,
    transparent: (isPipMesh ? style.pipOpacity : style.bodyOpacity) < 0.999,
  });
}

function isD20LetterMesh(mesh: THREE.Mesh) {
  return mesh.name.includes("Letters") || (mesh.material instanceof THREE.Material && mesh.material.name === "Letters");
}

function buildD20Material(mesh: THREE.Mesh, style: D20VisualStyle = DEFAULT_D20_VISUAL_STYLE) {
  const isLetterMesh = isD20LetterMesh(mesh);

  return new THREE.MeshStandardMaterial({
    color: isLetterMesh ? style.pipColor : style.bodyColor,
    emissive: isLetterMesh ? style.pipEmissive : style.bodyEmissive,
    emissiveIntensity: isLetterMesh ? style.pipEmissiveIntensity : style.bodyEmissiveIntensity,
    metalness: isLetterMesh ? style.pipMetalness : style.bodyMetalness,
    opacity: isLetterMesh ? style.pipOpacity : style.bodyOpacity,
    roughness: isLetterMesh ? style.pipRoughness : style.bodyRoughness,
    transparent: (isLetterMesh ? style.pipOpacity : style.bodyOpacity) < 0.999,
  });
}

function angleDelta(current: number, target: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current: number, target: number, alpha: number) {
  return current + (angleDelta(current, target) * alpha);
}

function randomUnit() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (buffer[0] ?? 0) / 0x100000000;
  }

  return Math.random();
}

function randomInRange(min: number, max: number) {
  return min + ((max - min) * randomUnit());
}

function DiceModel({
  faceValue,
  path,
  scale,
  phase,
  offset,
  normalizeFitSize,
  style,
  speedMult,
  isLead,
  onSettled,
}: {
  faceValue?: number;
  path: string;
  scale: number;
  phase: DicePhase;
  offset: [number, number, number];
  normalizeFitSize?: number;
  style?: D20VisualStyle;
  speedMult: number;
  isLead: boolean;
  onSettled: () => void;
}) {
  const { scene } = useGLTF(path);
  const clone = useMemo(() => {
    const nextScene = scene.clone(true);
    if (style && path.includes("/d20.glb")) {
      nextScene.traverse((obj) => {
        if (!(obj as THREE.Mesh).isMesh) {
          return;
        }
        const mesh = obj as THREE.Mesh;
        mesh.material = buildD20Material(mesh, style);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
    }
    return nextScene;
  }, [path, scene, style]);
  const groupRef = useRef<THREE.Group>(null!);
  const vel = useRef({ x: 0, y: 0, z: 0 });
  const driftOffsets = useRef({
    phaseX: 0,
    phaseY: 0,
    phaseZ: 0,
    yawSign: 1,
  });
  const notified = useRef(false);
  const motionTime = useRef(0);
  const settleProgress = useRef(0);
  const settleStartRotation = useRef<[number, number, number] | null>(null);
  const settleRotation = useMemo(() => {
    if (!path.includes("/d20.glb") || faceValue === undefined) {
      return null;
    }
    const [x, y, z] = D20_FACE_ROTATIONS[faceValue] ?? D20_FACE_ROTATIONS[20];
    return new THREE.Euler(x, y, z);
  }, [faceValue, path]);
  const normalizedTransform = useMemo(() => {
    if (!normalizeFitSize) {
      return {
        scale: scale,
        position: [0, 0, 0] as [number, number, number],
      };
    }

    const bounds = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const fittedScale = (normalizeFitSize / maxDimension) * scale;

    return {
      scale: fittedScale,
      position: [
        -center.x * fittedScale,
        -center.y * fittedScale,
        -center.z * fittedScale,
      ] as [number, number, number],
    };
  }, [clone, normalizeFitSize, scale]);

  useEffect(() => {
    if (phase === "rolling") {
      notified.current = false;
      motionTime.current = 0;
      settleProgress.current = 0;
      settleStartRotation.current = null;
      driftOffsets.current = {
        phaseX: randomInRange(0, Math.PI * 2),
        phaseY: randomInRange(0, Math.PI * 2),
        phaseZ: randomInRange(0, Math.PI * 2),
        yawSign: randomUnit() > 0.5 ? 1 : -1,
      };
      vel.current = {
        x: randomInRange(10, 16) * speedMult,
        y: randomInRange(16, 24) * speedMult * driftOffsets.current.yawSign,
        z: randomInRange(4, 8) * speedMult,
      };
    }
  }, [phase, speedMult]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    motionTime.current += dt;
    if (phase === "rolling") {
      g.rotation.x += vel.current.x * dt;
      g.rotation.y += vel.current.y * dt;
      g.rotation.z += vel.current.z * dt;
      if (settleRotation) {
        const wobbleX = Math.sin((motionTime.current * 4.2) + driftOffsets.current.phaseX) * 0.14;
        const wobbleY = Math.cos((motionTime.current * 3.3) + driftOffsets.current.phaseY) * 0.12;
        const wobbleZ = Math.sin((motionTime.current * 5.1) + driftOffsets.current.phaseZ) * 0.08;
        g.position.set(
          offset[0] + wobbleX,
          offset[1] + wobbleY,
          offset[2] + wobbleZ,
        );
      }
    } else if (phase === "settling") {
      vel.current.x *= 0.87;
      vel.current.y *= 0.87;
      vel.current.z *= 0.87;
      if (!settleStartRotation.current) {
        settleStartRotation.current = [g.rotation.x, g.rotation.y, g.rotation.z];
        settleProgress.current = 0;
      }
      settleProgress.current = Math.min(1, settleProgress.current + (dt / 1.05));
      g.rotation.x += vel.current.x * dt * 0.4;
      g.rotation.y += vel.current.y * dt * 0.4;
      g.rotation.z += vel.current.z * dt * 0.4;

      if (settleRotation) {
        const [startX, startY, startZ] = settleStartRotation.current;
        const t = settleProgress.current;
        const eased = 1 - ((1 - t) ** 3);
        const wobble = Math.sin(t * Math.PI * 4.5) * ((1 - t) ** 2) * 0.24;
        g.rotation.x = lerpAngle(startX, settleRotation.x, eased) + wobble;
        g.rotation.y = lerpAngle(startY, settleRotation.y, eased) + (wobble * 0.78);
        g.rotation.z = lerpAngle(startZ, settleRotation.z, eased) + (wobble * 0.56);
        g.position.set(
          offset[0] + (Math.sin(t * Math.PI * 3.2) * (1 - t) * 0.12),
          offset[1] + (Math.sin(t * Math.PI * 5.4) * (1 - t) * 0.2),
          offset[2] + (Math.cos(t * Math.PI * 3.2) * (1 - t) * 0.05),
        );

        if (
          isLead
          && !notified.current
          && t > 0.96
          && Math.abs(angleDelta(g.rotation.x, settleRotation.x)) < 0.05
          && Math.abs(angleDelta(g.rotation.y, settleRotation.y)) < 0.05
          && Math.abs(angleDelta(g.rotation.z, settleRotation.z)) < 0.05
        ) {
          g.rotation.set(settleRotation.x, settleRotation.y, settleRotation.z);
          g.position.set(...offset);
          notified.current = true;
          setTimeout(onSettled, 0);
        }
      } else if (isLead && !notified.current && Math.abs(vel.current.y) < 0.06) {
        notified.current = true;
        setTimeout(onSettled, 0);
      }
    } else if (settleRotation) {
      g.position.set(...offset);
      g.rotation.set(settleRotation.x, settleRotation.y, settleRotation.z);
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
      <group position={normalizedTransform.position}>
        <primitive object={clone} scale={normalizedTransform.scale} />
      </group>
    </group>
  );
}

export function Dice3DCanvas({
  phase,
  layout,
  onSettled,
  onClick,
  dark,
  d20Style = DEFAULT_D20_VISUAL_STYLE,
  faceValue,
}: {
  phase: DicePhase;
  layout: DiceLayout;
  onSettled: () => void;
  onClick?: () => void;
  dark: boolean;
  d20Style?: D20VisualStyle;
  faceValue?: number;
}) {
  const bg = dark ? "#130e24" : "#f0ecff";
  const accentColor = dark ? "#cabfff" : "#9b87ff";
  const isSingleD20 = layout === "d20";
  const containerClass = isSingleD20
    ? "mx-auto aspect-square w-full max-w-[24rem] rounded-2xl overflow-hidden"
    : "w-full rounded-2xl overflow-hidden";
  const containerStyle = isSingleD20
    ? { background: bg }
    : { height: 180, background: bg };
  const cameraPosition: [number, number, number] = isSingleD20 ? DEFAULT_D20_CAMERA_POSITION : [0, 0, 7];
  const cameraFov = isSingleD20 ? 56 : 48;
  const d20Scale = isSingleD20 ? 1.02 : 2.0;

  return (
    <div
      className={`${containerClass} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={containerStyle}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <Canvas camera={{ position: cameraPosition, fov: cameraFov }} gl={{ antialias: true }}>
        <color attach="background" args={[bg]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 8, 6]} intensity={1.1} />
        <pointLight position={[-3, -2, 4]} intensity={0.5} color={accentColor} />

        {layout === "d20" && (
          <DiceModel
            faceValue={faceValue}
            path={withBasePath("/d20.glb")}
            scale={d20Scale}
            phase={phase}
            offset={[0, 0, 0]}
            normalizeFitSize={3.45}
            style={d20Style}
            speedMult={1}
            isLead
            onSettled={onSettled}
          />
        )}

        {layout === "d20-d6" && (
          <>
            <DiceModel
              faceValue={faceValue}
              path={withBasePath("/d20.glb")}
              scale={1.7}
              phase={phase}
              offset={[-1.4, 0, 0]}
              style={d20Style}
              speedMult={1}
              isLead
              onSettled={onSettled}
            />
            <DiceModel
              path={withBasePath("/d6.glb")}
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
              faceValue={faceValue}
              path={withBasePath("/d20.glb")}
              scale={1.5}
              phase={phase}
              offset={[-2.2, 0.3, 0]}
              style={d20Style}
              speedMult={1}
              isLead
              onSettled={onSettled}
            />
            <DiceModel
              faceValue={faceValue}
              path={withBasePath("/d20.glb")}
              scale={1.5}
              phase={phase}
              offset={[0, -0.3, -0.5]}
              style={d20Style}
              speedMult={1.1}
              isLead={false}
              onSettled={() => {}}
            />
            <DiceModel
              path={withBasePath("/d6.glb")}
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

useGLTF.preload(withBasePath("/d20.glb"));
useGLTF.preload(withBasePath("/d6.glb"));

function RewardDiceModel({
  faceValue,
  isLead,
  offset,
  onSettled,
  phase,
  scale,
  speedScale = 1,
  speedMult,
}: {
  faceValue: number;
  isLead: boolean;
  offset: [number, number, number];
  onSettled: () => void;
  phase: DicePhase;
  scale: number;
  speedScale?: number;
  speedMult: number;
}) {
  const { scene } = useGLTF(withBasePath("/d6.glb"));
  const clone = useMemo(() => {
    const nextScene = scene.clone(true);
    nextScene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) {
        return;
      }

      const mesh = obj as THREE.Mesh;
      mesh.material = buildRewardD6Material(mesh);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return nextScene;
  }, [scene]);
  const groupRef = useRef<THREE.Group>(null!);
  const vel = useRef({ x: 0, y: 0, z: 0 });
  const currentPosition = useRef(new THREE.Vector3(...offset));
  const notified = useRef(false);
  const settleRotation = useMemo(() => {
    const [x, y, z] = D6_FACE_ROTATIONS[faceValue] ?? D6_FACE_ROTATIONS[1];
    return new THREE.Euler(x, y, z);
  }, [faceValue]);

  useEffect(() => {
    if (phase === "rolling") {
      notified.current = false;
      currentPosition.current.set(...offset);
      vel.current = {
        x: (8.8 + Math.random() * 3.2) * speedMult * speedScale,
        y: (11.2 + Math.random() * 4.2) * speedMult * speedScale,
        z: (6.4 + Math.random() * 3.4) * speedMult * speedScale,
      };
    }
  }, [offset, phase, speedMult, speedScale]);

  useEffect(() => {
    if (phase === "idle") {
      currentPosition.current.set(...offset);
    }
  }, [offset, phase]);

  useFrame((_, dt) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const position = currentPosition.current;
    if (phase === "rolling") {
      position.set(...offset);
      group.position.set(position.x, position.y, offset[2]);
      group.rotation.x += vel.current.x * dt;
      group.rotation.y += vel.current.y * dt;
      group.rotation.z += vel.current.z * dt;
      return;
    }

    if (phase === "settling") {
      vel.current.x *= 0.89;
      vel.current.y *= 0.89;
      vel.current.z *= 0.89;
      position.x = THREE.MathUtils.lerp(position.x, offset[0], 0.2);
      position.y = THREE.MathUtils.lerp(position.y, offset[1], 0.2);
      group.position.set(position.x, position.y, offset[2]);
      group.rotation.x += vel.current.x * dt;
      group.rotation.y += vel.current.y * dt;
      group.rotation.z += vel.current.z * dt;
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, settleRotation.x, 0.16);
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, settleRotation.y, 0.16);
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, settleRotation.z, 0.16);

      if (
        isLead
        && !notified.current
        && Math.abs(group.rotation.x - settleRotation.x) < 0.04
        && Math.abs(group.rotation.y - settleRotation.y) < 0.04
        && Math.abs(group.rotation.z - settleRotation.z) < 0.04
      ) {
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
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material?.dispose();
          }
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

function PreviewD6Model({
  style = DEFAULT_D6_VISUAL_STYLE,
  rotation,
  scale,
}: {
  style?: D6VisualStyle;
  rotation: [number, number, number];
  scale: number;
}) {
  const { scene } = useGLTF(withBasePath("/d6.glb"));
  const clone = useMemo(() => {
    const nextScene = scene.clone(true);
    nextScene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) {
        return;
      }

      const mesh = obj as THREE.Mesh;
      mesh.material = buildRewardD6Material(mesh, style);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return nextScene;
  }, [scene, style]);

  useEffect(() => {
    return () => {
      clone.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material?.dispose();
          }
        }
      });
    };
  }, [clone]);

  return (
    <group rotation={rotation}>
      <primitive object={clone} scale={scale} />
    </group>
  );
}

function PreviewD20Model({
  rotation,
  scale,
  style = DEFAULT_D20_VISUAL_STYLE,
}: {
  rotation: [number, number, number];
  scale: number;
  style?: D20VisualStyle;
}) {
  const { scene } = useGLTF(withBasePath("/d20.glb"));
  const clone = useMemo(() => {
    const nextScene = scene.clone(true);
    nextScene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) {
        return;
      }

      const mesh = obj as THREE.Mesh;
      mesh.material = buildD20Material(mesh, style);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return nextScene;
  }, [scene, style]);
  const normalizedTransform = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const fittedScale = (3.45 / maxDimension) * scale;

    return {
      scale: fittedScale,
      position: [
        -center.x * fittedScale,
        -center.y * fittedScale,
        -center.z * fittedScale,
      ] as [number, number, number],
    };
  }, [clone, scale]);

  useEffect(() => {
    return () => {
      clone.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material?.dispose();
          }
        }
      });
    };
  }, [clone]);

  return (
    <group rotation={rotation}>
      <group position={normalizedTransform.position}>
        <primitive object={clone} scale={normalizedTransform.scale} />
      </group>
    </group>
  );
}

function getRewardDiceLayout(count: number) {
  const columns = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / columns);
  const spacingX = count >= 10 ? 2.15 : count >= 7 ? 2.25 : 2.4;
  const spacingY = count >= 10 ? 2.05 : count >= 7 ? 2.15 : 2.28;
  const scale = count >= 13 ? 0.48 : count >= 10 ? 0.56 : count >= 7 ? 0.68 : count >= 5 ? 0.82 : count >= 3 ? 0.94 : 1.06;
  const cameraZ = count >= 13 ? 11.8 : count >= 10 ? 10.8 : count >= 7 ? 9.8 : count >= 5 ? 9.1 : 8.4;
  const fov = count >= 10 ? 38 : count >= 7 ? 40 : 42;
  const columnCenter = (columns - 1) / 2;
  const rowCenter = (rows - 1) / 2;
  const offsets: Array<[number, number, number]> = Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return [
      (column - columnCenter) * spacingX,
      (rowCenter - row) * spacingY,
      0,
    ];
  });

  return { cameraZ, fov, offsets, scale };
}

export function RewardDice3DCanvas({
  className = "",
  dark,
  height = 220,
  onSettled,
  phase,
  results,
  speedScale = 1,
}: {
  className?: string;
  dark: boolean;
  height?: number;
  onSettled: () => void;
  phase: DicePhase;
  results: number[];
  speedScale?: number;
}) {
  const bg = dark ? "#130e24" : "#f0ecff";
  const accentColor = dark ? "#cabfff" : "#9b87ff";
  const layout = useMemo(() => getRewardDiceLayout(results.length), [results.length]);

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl ${className}`} style={{ height, background: bg }}>
      <Canvas camera={{ position: [0, 0, layout.cameraZ], fov: layout.fov }} gl={{ antialias: true }}>
        <color attach="background" args={[bg]} />
        <ambientLight intensity={1.08} />
        <directionalLight position={[4, 8, 6]} intensity={1.28} />
        <pointLight color={accentColor} intensity={0.35} position={[-3, -2, 4]} />
        {results.map((result, index) => (
          <RewardDiceModel
            faceValue={result}
            isLead={index === 0}
            key={`${index}-${result}`}
            offset={layout.offsets[index] ?? [0, 0, 0]}
            onSettled={onSettled}
            phase={phase}
            scale={layout.scale}
            speedScale={speedScale}
            speedMult={1 + (index * 0.04)}
          />
        ))}
      </Canvas>
    </div>
  );
}

export function D6CalibrationCanvas({
  dark,
  height = 280,
  interactive = false,
  rotation,
  scale = 1.8,
  style = DEFAULT_D6_VISUAL_STYLE,
}: {
  dark: boolean;
  height?: number;
  interactive?: boolean;
  rotation: [number, number, number];
  scale?: number;
  style?: D6VisualStyle;
}) {
  const bg = dark ? "#130e24" : "#f0ecff";
  const accentColor = dark ? "#cabfff" : "#9b87ff";

  return (
    <div className="w-full overflow-hidden rounded-2xl" style={{ height, background: bg }}>
      <Canvas camera={{ position: [0, 0.25, 7.9], fov: 42 }} gl={{ antialias: true }}>
        <color attach="background" args={[bg]} />
        <ambientLight intensity={1.05} />
        <directionalLight position={[4, 8, 6]} intensity={1.35} />
        <pointLight color={accentColor} intensity={0.38} position={[-3, -2, 4]} />
        <pointLight color="#ffffff" intensity={0.4} position={[2, 1.5, 5]} />
        {interactive ? (
          <OrbitControls
            enableDamping
            enablePan
            maxDistance={11}
            minDistance={5.2}
            panSpeed={0.85}
            rotateSpeed={0.9}
            target={[0, 0.1, 0]}
            zoomSpeed={0.8}
          />
        ) : null}
        <PreviewD6Model rotation={rotation} scale={scale} style={style} />
      </Canvas>
    </div>
  );
}

export function D20CalibrationCanvas({
  dark,
  height = 420,
  interactive = false,
  onRotationChange,
  rotation,
  scale = 1.02,
  style = DEFAULT_D20_VISUAL_STYLE,
}: {
  dark: boolean;
  height?: number;
  interactive?: boolean;
  onRotationChange?: (nextRotation: [number, number, number]) => void;
  rotation: [number, number, number];
  scale?: number;
  style?: D20VisualStyle;
}) {
  const bg = dark ? "#130e24" : "#f0ecff";
  const accentColor = dark ? "#cabfff" : "#9b87ff";
  const dragState = useRef<{
    active: boolean;
    baseRotation: [number, number, number];
    pointerId: number | null;
    startX: number;
    startY: number;
  }>({
    active: false,
    baseRotation: rotation,
    pointerId: null,
    startX: 0,
    startY: 0,
  });
  const currentRotationRef = useRef(rotation);

  useEffect(() => {
    currentRotationRef.current = rotation;
  }, [rotation]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ height, background: bg }}>
      <Canvas camera={{ position: DEFAULT_D20_CAMERA_POSITION, fov: 56 }} gl={{ antialias: true }}>
        <color attach="background" args={[bg]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 8, 6]} intensity={1.2} />
        <pointLight color={accentColor} intensity={0.45} position={[-3, -2, 4]} />
        <pointLight color="#ffffff" intensity={0.42} position={[2, 1.5, 5]} />
        <PreviewD20Model rotation={rotation} scale={scale} style={style} />
      </Canvas>
      {interactive && onRotationChange ? (
        <div
          className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragState.current = {
              active: true,
              baseRotation: currentRotationRef.current,
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
            };
          }}
          onPointerMove={(event) => {
            const drag = dragState.current;
            if (!drag.active || drag.pointerId !== event.pointerId) {
              return;
            }

            const deltaX = event.clientX - drag.startX;
            const deltaY = event.clientY - drag.startY;
            onRotationChange([
              drag.baseRotation[0] + (deltaY * 0.0125),
              drag.baseRotation[1] + (deltaX * 0.0125),
              drag.baseRotation[2],
            ]);
          }}
          onPointerUp={(event) => {
            if (dragState.current.pointerId !== event.pointerId) {
              return;
            }
            dragState.current.active = false;
            dragState.current.pointerId = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        />
      ) : null}
    </div>
  );
}
