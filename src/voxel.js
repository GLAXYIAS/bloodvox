import * as THREE from 'three';

export const VOXEL = 0.06;

// Each face: outward normal, brightness multiplier (baked voxel shading) and 4 corners.
const FACES = [
  { n: [1, 0, 0], shade: 0.86, v: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { n: [-1, 0, 0], shade: 0.72, v: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { n: [0, 1, 0], shade: 1.0, v: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { n: [0, -1, 0], shade: 0.5, v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { n: [0, 0, 1], shade: 0.93, v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { n: [0, 0, -1], shade: 0.66, v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
];
const TRI = [0, 1, 2, 0, 2, 3];

/** sRGB 0..1 -> linear working space, so baked voxel colours look right. */
export function srgb(r, g, b) {
  const c = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return [c(r), c(g), c(b)];
}

export function buildVoxelGeometry(voxels, size = VOXEL) {
  const n = voxels.length;
  const positions = new Float32Array(n * 108);
  const normals = new Float32Array(n * 108);
  const colors = new Float32Array(n * 108);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const vx = voxels[i];
    const cr = vx.color[0];
    const cg = vx.color[1];
    const cb = vx.color[2];
    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const sh = face.shade;
      for (let t = 0; t < 6; t++) {
        const corner = face.v[TRI[t]];
        positions[o] = vx.x + corner[0] * size;
        positions[o + 1] = vx.y + corner[1] * size;
        positions[o + 2] = vx.z + corner[2] * size;
        normals[o] = face.n[0];
        normals[o + 1] = face.n[1];
        normals[o + 2] = face.n[2];
        colors[o] = cr * sh;
        colors[o + 1] = cg * sh;
        colors[o + 2] = cb * sh;
        o += 3;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Fill a box with cube voxels. `paint(u,v,w)` returns an sRGB-ish [r,g,b] for a
 * cell; u/v/w are 0..1 positions inside the box, w = 1 is the local +Z (front).
 */
export function makeVoxelPart(w, h, d, paint, voxel = VOXEL, seed = 1) {
  const nx = Math.max(1, Math.round(w / voxel));
  const ny = Math.max(1, Math.round(h / voxel));
  const nz = Math.max(1, Math.round(d / voxel));
  const W = nx * voxel;
  const H = ny * voxel;
  const D = nz * voxel;
  const voxels = [];
  let s = (seed * 9301 + 49297) % 233280 || 7;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const u = (i + 0.5) / nx - 0.5;
        const v = (j + 0.5) / ny - 0.5;
        const ww = (k + 0.5) / nz - 0.5;
        const col = paint(u, v, ww) || [0.7, 0.7, 0.7];
        const t = 0.9 + rand() * 0.2;
        voxels.push({
          x: (i + 0.5) * voxel - W / 2,
          y: (j + 0.5) * voxel - H / 2,
          z: (k + 0.5) * voxel - D / 2,
          color: [toLin(col[0] * t), toLin(col[1] * t), toLin(col[2] * t)],
        });
      }
    }
  }
  return { voxels, w: W, h: H, d: D };
}

/** Remove every voxel within `radius` of a local-space point. */
export function carveVoxels(voxels, point, radius) {
  const r2 = radius * radius;
  const kept = [];
  const removed = [];
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    const dx = v.x - point.x;
    const dy = v.y - point.y;
    const dz = v.z - point.z;
    if (dx * dx + dy * dy + dz * dz <= r2) removed.push(v);
    else kept.push(v);
  }
  return { kept, removed };
}

/**
 * Blood soaking into the flesh around a wound: tints nearby voxels towards a
 * dark wet red with a soft falloff, so every hole gets a bloody rim.
 */
export function soakVoxels(voxels, point, radius, strength = 0.8) {
  const r2 = radius * radius;
  const br = 0.13;
  const bg = 0.008;
  const bb = 0.008;
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    const dx = v.x - point.x;
    const dy = v.y - point.y;
    const dz = v.z - point.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) continue;
    const f = 1 - Math.sqrt(d2) / radius;
    const k = strength * f * f;
    v.color[0] += (br - v.color[0]) * k;
    v.color[1] += (bg - v.color[1]) * k;
    v.color[2] += (bb - v.color[2]) * k;
  }
}
