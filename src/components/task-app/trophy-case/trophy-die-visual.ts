import * as THREE from "three";
import type { MilestoneTier } from "@/lib/milestones";

export const TROPHY_DIE_PRESENTATION_ROTATION: [number, number, number] = [0, Math.PI, 0];
export const TROPHY_DIE_DEFAULT_PIP_COLOR = "#201b2b";
export const TROPHY_DIE_LIGHT_PIP_COLOR = "#ffffff";
export const TROPHY_DIE_PLATINUM_BODY_MATERIAL = {
  bumpScale: 0.035,
  clearcoat: 1,
  clearcoatRoughness: 0.12,
  iridescence: 0.42,
  metalness: 0.96,
  roughness: 0.2,
  sheen: 0.55,
  sheenColor: "#ffffff",
} as const;

export function getTrophyDiePipColor(tier: MilestoneTier) {
  return tier === "gold" || tier === "platinum" ? TROPHY_DIE_LIGHT_PIP_COLOR : TROPHY_DIE_DEFAULT_PIP_COLOR;
}

export function createTrophyDieGlitterTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const bright = (index * 73 + 19) % 97 < 13;
    const value = bright ? 32 : 190 + ((index * 31) % 54);
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.name = "PlatinumGlitterSurface";
  texture.repeat.set(6, 6);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
