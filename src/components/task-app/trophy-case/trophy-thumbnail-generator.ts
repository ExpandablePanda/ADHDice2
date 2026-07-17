import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MilestoneTier } from "@/lib/milestones";
import { TROPHY_GALLERY_TIERS, TROPHY_TIER_MATERIALS } from "@/lib/trophy-case";
import { withBasePath } from "@/lib/utils";

let thumbnailPromise: Promise<Record<MilestoneTier, string>> | null = null;

export function getTierTrophyThumbnails() {
  if (!thumbnailPromise) {
    thumbnailPromise = generateTierTrophyThumbnails().catch((error) => {
      thumbnailPromise = null;
      throw error;
    });
  }
  return thumbnailPromise;
}

async function generateTierTrophyThumbnails() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(256, 256, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 6.4);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight("#ffffff", 2.1));
  const keyLight = new THREE.DirectionalLight("#ffffff", 3.2);
  keyLight.position.set(4, 5, 7);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight("#9d8cff", 11);
  fillLight.position.set(-4, 2, 4);
  scene.add(fillLight);

  try {
    const { scene: source } = await new GLTFLoader().loadAsync(withBasePath("/d6.glb"));
    const normalized = normalizeD6(source);
    scene.add(normalized);
    const thumbnails = {} as Record<MilestoneTier, string>;
    for (const tier of TROPHY_GALLERY_TIERS) {
      applyTierMaterials(normalized, tier);
      renderer.render(scene, camera);
      thumbnails[tier] = renderer.domElement.toDataURL("image/png");
    }
    return thumbnails;
  } finally {
    scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const material = (object as THREE.Mesh).material;
      (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose());
    });
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

function normalizeD6(source: THREE.Object3D) {
  const model = source.clone(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 3.1 / Math.max(size.x, size.y, size.z, 1);
  model.position.copy(center.multiplyScalar(-scale));
  model.scale.setScalar(scale);
  model.rotation.set(0.32, -0.55, 0.08);
  return model;
}

function applyTierMaterials(model: THREE.Object3D, tier: MilestoneTier) {
  const definition = TROPHY_TIER_MATERIALS[tier];
  model.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    const previous = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    previous.forEach((material) => material.dispose());
    mesh.material = mesh.name.includes("Material001")
      ? new THREE.MeshStandardMaterial({ color: "#201b2b", metalness: 0.18, roughness: 0.32 })
      : new THREE.MeshStandardMaterial({ color: definition.color, metalness: 0.88, roughness: definition.roughness });
  });
}
