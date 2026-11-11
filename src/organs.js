import * as THREE from 'three';
import { makeVoxelPart, buildVoxelGeometry, srgb } from './voxel.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

const ORGAN_DEFS = [
  {
    name: 'heart',
    w: 0.17,
    h: 0.2,
    d: 0.15,
    voxel: 0.035,
    radius: 0.085,
    paint: () => (Math.random() < 0.16 ? srgb(0.24, 0.03, 0.04) : srgb(0.5, 0.07, 0.09)),
  },
  {
    name: 'lungs',
    w: 0.26,
    h: 0.24,
    d: 0.17,
    voxel: 0.04,
    radius: 0.1,
    paint: (u) => {
      if (Math.abs(u) < 0.09) return srgb(0.16, 0.05, 0.05);
      return Math.random() < 0.12 ? srgb(0.34, 0.12, 0.14) : srgb(0.62, 0.29, 0.31);
    },
  },
  {
    name: 'liver',
    w: 0.27,
    h: 0.16,
    d: 0.18,
    voxel: 0.045,
    radius: 0.095,
    paint: () => (Math.random() < 0.2 ? srgb(0.2, 0.05, 0.04) : srgb(0.34, 0.09, 0.07)),
  },
  {
    name: 'intestines',
    w: 0.36,
    h: 0.13,
    d: 0.15,
    voxel: 0.035,
    radius: 0.1,
    paint: (u) => (Math.sin(u * 34) > 0.6 ? srgb(0.4, 0.16, 0.14) : srgb(0.6, 0.32, 0.28)),
  },
  {
    name: 'brain',
    w: 0.22,
    h: 0.18,
    d: 0.22,
    voxel: 0.035,
    radius: 0.09,
    paint: (u, v, w) => {
      const wrinkle = Math.sin(u * 26 + v * 13) * Math.cos(w * 21) > 0.55;
      return wrinkle ? srgb(0.46, 0.28, 0.3) : srgb(0.68, 0.48, 0.48);
    },
  },
];

// carve each block into a rough organ-shaped ellipsoid
function organGeometry(def, seed) {
  const built = makeVoxelPart(def.w, def.h, def.d, def.paint, def.voxel, seed);
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const v of built.voxels) {
    mx = Math.max(mx, Math.abs(v.x));
    my = Math.max(my, Math.abs(v.y));
    mz = Math.max(mz, Math.abs(v.z));
  }
  const half = def.voxel * 0.5;
  const kept = built.voxels.filter((v) => {
    const a = v.x / (mx + half);
    const b = v.y / (my + half);
    const c = v.z / (mz + half);
    return a * a + b * b + c * c <= 1.02;
  });
  return buildVoxelGeometry(kept, def.voxel);
}

export function createOrgans() {
  return ORGAN_DEFS.map((def, i) => ({
    name: def.name,
    radius: def.radius,
    geometry: organGeometry(def, 300 + i * 17),
  }));
}

export function makeOrganMesh(organ) {
  const mesh = new THREE.Mesh(organ.geometry, MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
