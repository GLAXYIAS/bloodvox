import * as THREE from 'three';
import { makeVoxelPart, buildVoxelGeometry } from './voxel.js';

/**
 * Voxel build system for BUILD BATTLE.
 *
 * Pieces are real voxel meshes with real world collision boxes. Player and AI
 * place through the same API, pay the same resource costs and obey the same
 * grid. Editing rebuilds both the visible voxels and the collision volume, so
 * a window is something a bullet can pass through rather than a decal.
 */

export const BUILD_GRID = 2.4;
export const BUILD_LEVEL = 2.7;
// Build Battle lives inside a compact arena, but the shared grid also has to
// cover the 152 m Battle Royale island so forts can be raised anywhere the
// player can stand. Ten cells in each direction was the old hard limit; 28
// still keeps every structure inside the island bounds.
export const BUILD_CELL_LIMIT = 28;

export const BUILD_MATERIALS = {
  wood: {
    label: 'WOOD',
    hp: 170,
    cost: 10,
    dust: 0x8a6a42,
    base: [0.48, 0.32, 0.17],
    accent: [0.31, 0.2, 0.1],
  },
  brick: {
    label: 'BRICK',
    hp: 285,
    cost: 16,
    dust: 0x9c5b44,
    base: [0.45, 0.18, 0.13],
    accent: [0.68, 0.6, 0.5],
  },
  metal: {
    label: 'METAL',
    hp: 430,
    cost: 24,
    dust: 0x8c99a2,
    base: [0.3, 0.34, 0.38],
    accent: [0.57, 0.62, 0.66],
  },
};

export const BUILD_PIECES = {
  wall: { label: 'WALL', height: 2.7, width: 2.4, depth: 0.16, costMul: 1, hpMul: 1 },
  floor: { label: 'FLOOR', height: 0.16, width: 2.4, depth: 2.4, costMul: 0.8, hpMul: 0.8 },
  ramp: { label: 'RAMP', height: 2.7, width: 2.4, depth: 2.4, costMul: 1.1, hpMul: 0.9 },
  roof: { label: 'ROOF', height: 0.16, width: 2.4, depth: 2.4, costMul: 0.8, hpMul: 0.75 },
};

const PIECE_ORDER = ['wall', 'floor', 'ramp', 'roof'];
const MATERIAL_ORDER = ['wood', 'brick', 'metal'];
const geometryCache = new Map();
const previewMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
  color: 0x8fe3a8,
});
const shardGeometry = new THREE.BoxGeometry(1, 1, 1);
const shardMaterials = new Map();

const _raycaster = new THREE.Raycaster();
const _normal = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function materialShardMat(key) {
  let mat = shardMaterials.get(key);
  if (!mat) {
    const m = BUILD_MATERIALS[key];
    mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(m.base[0], m.base[1], m.base[2]) });
    shardMaterials.set(key, mat);
  }
  return mat;
}

function hash(a, b, c) {
  let n = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function paintPiece(material, kind, u, v, w) {
  const m = BUILD_MATERIALS[material];
  const base = m.base;
  const accent = m.accent;
  const grain = 0.94 + hash(Math.round(u * 20), Math.round(v * 20), Math.round(w * 8)) * 0.12;
  if (material === 'wood') {
    const plankRow = Math.floor((v + 0.5) * 9);
    const seam = Math.abs(((v + 0.5) * 9) % 1 - 0.5) > 0.44 ? 0.72 : 1;
    const knot = hash(Math.round(u * 9), plankRow, 3) > 0.93 ? 0.68 : 1;
    const k = grain * seam * knot;
    return [base[0] * k, base[1] * k, base[2] * k];
  }
  if (material === 'brick') {
    const row = Math.floor((v + 0.5) * 10);
    const offset = row % 2 ? 0.5 : 0;
    const brickX = ((u + 0.5) * 6 + offset) % 1;
    const mortarY = Math.abs(((v + 0.5) * 10) % 1 - 0.5) > 0.42;
    const mortarX = Math.abs(brickX - 0.5) > 0.45;
    if (mortarX || mortarY) {
      const k = 0.85 * grain;
      return [accent[0] * k, accent[1] * k, accent[2] * k];
    }
    const chip = hash(Math.round(u * 15), row, 7) > 0.9 ? 0.82 : 1;
    const k = grain * chip;
    const warm = 0.92 + hash(Math.round(u * 4), row, 1) * 0.16;
    return [base[0] * k * warm, base[1] * k, base[2] * k];
  }
  // metal panels with seams, rivets and a little rust on the lower edge.
  const seamX = Math.abs(((u + 0.5) * 4) % 1 - 0.5) > 0.46;
  const seamY = Math.abs(((v + 0.5) * 5) % 1 - 0.5) > 0.47;
  if (seamX || seamY) {
    const k = 0.7 * grain;
    return [base[0] * k, base[1] * k, base[2] * k];
  }
  const rivet =
    Math.abs(Math.abs(u) - 0.36) < 0.06 && Math.abs(Math.abs(v) - 0.36) < 0.07;
  if (rivet) {
    const k = 1.35;
    return [accent[0] * k, accent[1] * k, accent[2] * k];
  }
  const rust = hash(Math.round(u * 18), Math.round(v * 18), 9) > 0.965 ? 0.72 : 1;
  const k = grain * rust;
  return [
    base[0] * k + (rust < 1 ? 0.08 : 0),
    base[1] * k + (rust < 1 ? 0.015 : 0),
    base[2] * k,
  ];
}

/**
 * Build the voxel geometry for one piece/variant. Geometry is cached because
 * every wall of the same material and edit state is geometrically identical.
 */
const maskSections = (variant) => {
  if (typeof variant !== 'string' || !variant.startsWith('mask:')) return null;
  const raw = variant.slice(5);
  if (!raw) return new Set();
  return new Set(raw.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 9));
};

function sectionIndex(kind, cell, def) {
  if (kind === 'wall') {
    const col = Math.max(0, Math.min(2, Math.floor(((cell.x + def.width / 2) / def.width) * 3)));
    const row = Math.max(0, Math.min(2, Math.floor(((cell.y + def.height / 2) / def.height) * 3)));
    return row * 3 + col;
  }
  const col = Math.max(0, Math.min(2, Math.floor(((cell.x + def.width / 2) / def.width) * 3)));
  const row = Math.max(0, Math.min(2, Math.floor(((cell.z + def.depth / 2) / def.depth) * 3)));
  return row * 3 + col;
}

/** Preset sections make the AI and keyboard shortcuts use the same edit model. */
export function presetEditSections(kind, preset) {
  if (preset === 'window') return [4];
  if (preset === 'door') return [6, 7, 8];
  if (preset === 'hole') return [4];
  if (preset === 'half') return 'half';
  return [];
}

export function buildPieceGeometry(kind, material, variant = 'full') {
  const key = `${kind}:${material}:${variant}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;
  const def = BUILD_PIECES[kind] || BUILD_PIECES.wall;
  const voxel = kind === 'wall' ? 0.12 : 0.14;
  const built = makeVoxelPart(
    def.width,
    def.height,
    def.depth,
    (u, v, w) => paintPiece(material, kind, u, v, w),
    voxel,
    97 + PIECE_ORDER.indexOf(kind) * 31 + MATERIAL_ORDER.indexOf(material) * 7,
  );
  let voxels = built.voxels;
  if (kind === 'ramp') {
    const H = built.h;
    const D = built.d;
    const heightFactor = variant === 'half' ? 0.52 : 1;
    voxels = voxels.filter((cell) => {
      const zNorm = (cell.z + D / 2) / D; // 0 at the high (-Z) end
      const surface = (1 - zNorm) * H * heightFactor;
      return cell.y + H / 2 <= surface + 1e-4;
    });
  } else if (kind === 'wall' && (variant === 'window' || variant === 'door')) {
    const minY = variant === 'window' ? -0.08 : -1.45;
    const maxY = variant === 'window' ? 0.86 : 0.76;
    voxels = voxels.filter(
      (cell) => !(Math.abs(cell.x) < 0.63 && cell.y > minY && cell.y < maxY),
    );
  } else if ((kind === 'floor' || kind === 'roof') && variant === 'hole') {
    voxels = voxels.filter(
      (cell) => !(Math.abs(cell.x) < 0.64 && Math.abs(cell.z) < 0.64),
    );
  }
  const removed = maskSections(variant);
  if (removed) {
    voxels = voxels.filter((cell) => !removed.has(sectionIndex(kind, cell, def)));
  }
  const geo = buildVoxelGeometry(voxels, voxel);
  geo.computeBoundingSphere();
  geometryCache.set(key, geo);
  return geo;
}

/** Rotate a local axis-aligned rectangle into a world AABB (cardinal yaw). */
function rotatedExtent(cx, cz, yaw, lx0, lx1, lz0, lz1) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const lx of [lx0, lx1]) {
    for (const lz of [lz0, lz1]) {
      const x = cx + lx * c + lz * s;
      const z = cz - lx * s + lz * c;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  return { minX, maxX, minZ, maxZ };
}

function pieceBaseY(level) {
  return level * BUILD_LEVEL;
}

function pieceCenterY(kind, level) {
  if (kind === 'roof') return pieceBaseY(level) + BUILD_LEVEL - BUILD_PIECES.roof.height / 2;
  if (kind === 'floor') return pieceBaseY(level) + BUILD_PIECES.floor.height / 2;
  return pieceBaseY(level) + BUILD_PIECES[kind].height / 2;
}

function snapCardinal(yaw) {
  return Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
}

export class BuildSystem {
  constructor({ scene, world, fx, sound = null, onEvent = null }) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.sound = sound;
    this.onEvent = onEvent;
    this.structures = [];
    this.meshes = [];
    this.pieces = new Map();
    this.resources = {
      player: { wood: 240, brick: 160, metal: 100 },
      ai: { wood: 240, brick: 160, metal: 100 },
    };
    this.shards = [];
    this.lastPlaced = null;
    this.raycaster = new THREE.Raycaster();
    this.preview = null;

    const group = new THREE.Group();
    group.name = 'build-preview';
    group.visible = false;
    scene.add(group);
    this.previewGroup = group;
    this.previewMesh = new THREE.Mesh(buildPieceGeometry('wall', 'wood', 'full'), previewMaterial.clone());
    this.previewMesh.castShadow = false;
    this.previewMesh.receiveShadow = false;
    group.add(this.previewMesh);
    this.previewCandidate = null;
    this.previewInfo = null;
    this.editGroup = new THREE.Group();
    this.editGroup.name = 'build-edit-grid';
    this.editGroup.visible = false;
    scene.add(this.editGroup);
    this.editCells = [];
    const cellMat = new THREE.MeshBasicMaterial({
      color: 0xf4b942, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
    });
    for (let i = 0; i < 9; i++) {
      const mat = cellMat.clone();
      const cell = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      cell.renderOrder = 30;
      cell.userData.section = i;
      this.editCells.push(cell);
      this.editGroup.add(cell);
    }
    this.editLines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-.5, -.5, 0), new THREE.Vector3(-.5, .5, 0),
        new THREE.Vector3(-.5, .5, 0), new THREE.Vector3(.5, .5, 0),
        new THREE.Vector3(.5, .5, 0), new THREE.Vector3(.5, -.5, 0),
        new THREE.Vector3(.5, -.5, 0), new THREE.Vector3(-.5, -.5, 0),
        new THREE.Vector3(-1 / 6, -.5, 0), new THREE.Vector3(-1 / 6, .5, 0),
        new THREE.Vector3(1 / 6, -.5, 0), new THREE.Vector3(1 / 6, .5, 0),
        new THREE.Vector3(-.5, -1 / 6, 0), new THREE.Vector3(.5, -1 / 6, 0),
        new THREE.Vector3(-.5, 1 / 6, 0), new THREE.Vector3(.5, 1 / 6, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthTest: false }),
    );
    this.editLines.renderOrder = 31;
    this.editGroup.add(this.editLines);
  }

  /** World hit -> one of the nine selectable edit sections. */
  sectionAtPoint(structure, point) {
    if (!structure?.mesh) return -1;
    const local = structure.mesh.worldToLocal(point.clone());
    const def = BUILD_PIECES[structure.kind];
    return sectionIndex(structure.kind, { x: local.x, y: local.y, z: local.z }, def);
  }

  /** Show the three-by-three edit grid directly on the aimed piece. */
  showEditGrid(structure, selected = new Set()) {
    if (!structure?.mesh) return;
    const def = BUILD_PIECES[structure.kind];
    const wall = structure.kind === 'wall';
    this.editGroup.position.copy(structure.mesh.position);
    this.editGroup.rotation.copy(structure.mesh.rotation);
    const width = def.width * 0.96;
    const height = (wall ? def.height : def.depth) * 0.96;
    for (let i = 0; i < 9; i++) {
      const cell = this.editCells[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      cell.scale.set(width / 3, height / 3, 1);
      if (wall) {
        cell.position.set((col - 1) * width / 3, (1 - row) * height / 3, 0.095);
      } else {
        cell.rotation.x = -Math.PI / 2;
        cell.position.set((col - 1) * width / 3, 0.095, (row - 1) * height / 3);
      }
      cell.material.opacity = selected.has(i) ? 0.68 : 0.16;
      cell.material.color.setHex(selected.has(i) ? 0xff9b32 : 0xf4b942);
      cell.visible = true;
    }
    this.editLines.rotation.set(wall ? 0 : -Math.PI / 2, 0, 0);
    this.editLines.scale.set(width, height, 1);
    this.editLines.position.set(0, 0, wall ? 0.1 : 0);
    this.editGroup.visible = true;
  }

  hideEditGrid() {
    this.editGroup.visible = false;
  }

  /** Apply a section mask without changing material, HP or ownership. */
  setEditSections(structure, sections) {
    if (!structure || structure.destroyed) return false;
    const clean = [...new Set((sections || []).filter((n) => Number.isInteger(n) && n >= 0 && n < 9))].sort((a, b) => a - b);
    const variant = clean.length ? `mask:${clean.join(',')}` : 'full';
    if (structure.variant === variant) return true;
    structure.editSections = clean;
    structure.variant = variant;
    structure.mesh.geometry = buildPieceGeometry(structure.kind, structure.material, variant);
    this.rebuildCollision(structure);
    this.onEvent?.({ type: 'edit', owner: structure.owner, structure, variant, sections: clean });
    return true;
  }

  previewEdit(structure, sections) {
    if (!structure?.mesh || structure.destroyed) return;
    const clean = [...new Set(sections || [])].sort((a, b) => a - b);
    structure.mesh.geometry = buildPieceGeometry(
      structure.kind, structure.material, clean.length ? `mask:${clean.join(',')}` : 'full',
    );
    this.showEditGrid(structure, new Set(clean));
  }

  restoreEditPreview(structure) {
    if (!structure?.mesh || structure.destroyed) return;
    structure.mesh.geometry = buildPieceGeometry(structure.kind, structure.material, structure.variant);
  }

  resetResources(owner = null) {
    const owners = owner ? [owner] : ['player', 'ai'];
    for (const id of owners) this.resources[id] = { wood: 240, brick: 160, metal: 100 };
    this.onEvent?.({ type: 'resources', owner, resources: this.resources });
  }

  /** Give a temporary owner (Battle Royale bot) its own material pool. */
  setResources(owner, values) {
    if (!owner) return;
    this.resources[owner] = {
      wood: Math.max(0, Math.round(values?.wood || 0)),
      brick: Math.max(0, Math.round(values?.brick || 0)),
      metal: Math.max(0, Math.round(values?.metal || 0)),
    };
  }

  resourcesFor(owner) {
    return this.resources[owner] || { wood: 0, brick: 0, metal: 0 };
  }

  structuresFor(owner) {
    if (!owner) return this.structures;
    return this.structures.filter((s) => s.owner === owner);
  }

  /** Drop a temporary owner and its structures without touching either duelist. */
  clearOwner(owner) {
    if (!owner) return;
    for (const structure of [...this.structures]) {
      if (structure.owner === owner) this.destroy(structure);
    }
    delete this.resources[owner];
  }

  costFor(material, kind) {
    const m = BUILD_MATERIALS[material];
    const p = BUILD_PIECES[kind];
    if (!m || !p) return Infinity;
    return Math.round(m.cost * p.costMul);
  }

  canAfford(owner, material, kind) {
    const res = this.resourcesFor(owner);
    return (res[material] || 0) >= this.costFor(material, kind);
  }

  /** Choose the strongest affordable material, preferring wood at full health. */
  chooseMaterial(owner, kind, preferStrong = false) {
    const order = preferStrong ? ['metal', 'brick', 'wood'] : ['wood', 'brick', 'metal'];
    for (const material of order) if (this.canAfford(owner, material, kind)) return material;
    return null;
  }

  structureKey(cellX, cellZ, level, kind) {
    return `${cellX}|${cellZ}|${level}|${kind}`;
  }

  computeCandidate(origin, dir, kind, level = null, yawOffset = 0) {
    const cellX = Math.round((origin.x + dir.x * BUILD_GRID) / BUILD_GRID);
    const cellZ = Math.round((origin.z + dir.z * BUILD_GRID) / BUILD_GRID);
    const yaw = Math.atan2(-dir.x, -dir.z) + yawOffset;
    const lvl =
      level === null
        ? Math.max(0, Math.min(8, Math.round(origin.y / BUILD_LEVEL)))
        : Math.max(0, Math.min(8, Math.round(level)));
    return {
      cellX: Math.max(-BUILD_CELL_LIMIT, Math.min(BUILD_CELL_LIMIT, cellX)),
      cellZ: Math.max(-BUILD_CELL_LIMIT, Math.min(BUILD_CELL_LIMIT, cellZ)),
      level: lvl,
      yaw: snapCardinal(yaw),
    };
  }

  canPlace(owner, kind, material, candidate) {
    if (!BUILD_PIECES[kind] || !BUILD_MATERIALS[material]) return { ok: false, reason: 'INVALID' };
    if (!this.canAfford(owner, material, kind)) return { ok: false, reason: 'NO MATERIALS' };
    const key = this.structureKey(candidate.cellX, candidate.cellZ, candidate.level, kind);
    if (this.pieces.has(key)) return { ok: false, reason: 'OCCUPIED' };
    if (kind === 'roof') {
      const floorKey = this.structureKey(candidate.cellX, candidate.cellZ, candidate.level, 'roof');
      if (this.pieces.has(floorKey)) return { ok: false, reason: 'OCCUPIED' };
    }
    return { ok: true, reason: '' };
  }

  /** Place one piece in front of an owner along a world-space direction. */
  place(owner, kind, material, origin, dir, level = null, yawOffset = 0) {
    const candidate = this.computeCandidate(origin, dir, kind, level, yawOffset);
    const check = this.canPlace(owner, kind, material, candidate);
    if (!check.ok) return null;
    return this.placeAt(owner, kind, material, candidate.cellX, candidate.cellZ, candidate.level, candidate.yaw);
  }

  /** Place a piece at explicit grid coordinates (AI editing/build tests). */
  placeAt(owner, kind, material, cellX, cellZ, level, yaw = 0) {
    if (!BUILD_PIECES[kind] || !BUILD_MATERIALS[material]) return null;
    if (Math.abs(cellX) > BUILD_CELL_LIMIT || Math.abs(cellZ) > BUILD_CELL_LIMIT) return null;
    const lvl = Math.max(0, Math.min(8, Math.round(level)));
    const snapped = snapCardinal(yaw);
    const candidate = { cellX, cellZ, level: lvl, yaw: snapped };
    if (!this.canPlace(owner, kind, material, candidate).ok) return null;

    const cost = this.costFor(material, kind);
    this.resourcesFor(owner)[material] -= cost;
    const maxHp = Math.round(
      BUILD_MATERIALS[material].hp * BUILD_PIECES[kind].hpMul,
    );
    const structure = {
      id: `b${this.structures.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
      owner,
      kind,
      material,
      variant: 'full',
      cellX,
      cellZ,
      level: lvl,
      yaw: snapped,
      hp: maxHp,
      maxHp,
      boxes: [],
      mesh: null,
      destroyed: false,
      createdAt: performance.now(),
    };
    structure.mesh = new THREE.Mesh(
      buildPieceGeometry(kind, material, 'full'),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    structure.mesh.position.set(cellX * BUILD_GRID, pieceCenterY(kind, lvl), cellZ * BUILD_GRID);
    structure.mesh.rotation.y = snapped;
    structure.mesh.castShadow = true;
    structure.mesh.receiveShadow = true;
    structure.mesh.userData.structure = structure;
    this.world.root.add(structure.mesh);
    this.world.raycastTargets.push(structure.mesh);
    this.meshes.push(structure.mesh);
    this.structures.push(structure);
    this.pieces.set(this.structureKey(cellX, cellZ, lvl, kind), structure);
    this.rebuildCollision(structure);
    this.lastPlaced = { owner, structure, at: performance.now() };
    this.sound?.impact?.();
    this.onEvent?.({ type: 'place', owner, structure });
    return structure;
  }

  removeCollision(structure) {
    if (!structure.boxes.length) return;
    const set = new Set(structure.boxes);
    for (let i = this.world.boxes.length - 1; i >= 0; i--) {
      if (set.has(this.world.boxes[i])) this.world.boxes.splice(i, 1);
    }
    structure.boxes.length = 0;
  }

  addCollisionBox(structure, lx0, lx1, lz0, lz1, y0, y1) {
    const world0 = structure.cellX * BUILD_GRID;
    const world1 = structure.cellZ * BUILD_GRID;
    const r = rotatedExtent(world0, world1, structure.yaw, lx0, lx1, lz0, lz1);
    this.world.addBox(r.minX, y0, r.minZ, r.maxX, y1, r.maxZ);
    structure.boxes.push(this.world.boxes[this.world.boxes.length - 1]);
  }

  /** Rebuild the collision volume to exactly match the visible variant. */
  rebuildCollision(structure) {
    this.removeCollision(structure);
    const base = pieceBaseY(structure.level);
    const h = BUILD_PIECES[structure.kind].height;
    const removed = maskSections(structure.variant);
    if (removed) {
      const cols = [-1.2, -0.4, 0.4, 1.2];
      if (structure.kind === 'wall') {
        const rows = [0, 0.9, 1.8, 2.7];
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
          if (removed.has(row * 3 + col)) continue;
          this.addCollisionBox(structure, cols[col], cols[col + 1], -0.08, 0.08, base + rows[row], base + rows[row + 1]);
        }
      } else if (structure.kind === 'floor' || structure.kind === 'roof') {
        const y0 = structure.kind === 'roof' ? base + BUILD_LEVEL - h : base;
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
          if (removed.has(row * 3 + col)) continue;
          this.addCollisionBox(structure, cols[col], cols[col + 1], cols[row], cols[row + 1], y0, y0 + h);
        }
      } else {
        const steps = 9;
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps, t1 = (i + 1) / steps;
          const z0 = 1.2 - (i + 1) * (2.4 / steps);
          const z1 = 1.2 - i * (2.4 / steps);
          const sectionRow = Math.min(2, Math.floor(i / 3));
          for (let col = 0; col < 3; col++) {
            if (removed.has(sectionRow * 3 + col)) continue;
            this.addCollisionBox(structure, cols[col], cols[col + 1], z0, z1, base + h * t0, base + h * t1);
          }
        }
      }
      return;
    }
    if (structure.kind === 'wall') {
      const variant = structure.variant;
      if (variant === 'full') {
        this.addCollisionBox(structure, -1.2, 1.2, -0.08, 0.08, base, base + h);
      } else if (variant === 'window') {
        // opening from base+1.25 to base+2.2, 1.24 m wide
        this.addCollisionBox(structure, -1.2, -0.63, -0.08, 0.08, base, base + h);
        this.addCollisionBox(structure, 0.63, 1.2, -0.08, 0.08, base, base + h);
        this.addCollisionBox(structure, -0.63, 0.63, -0.08, 0.08, base, base + 1.25);
        this.addCollisionBox(structure, -0.63, 0.63, -0.08, 0.08, base + 2.2, base + h);
      } else {
        // doorway from the floor to base+2.1
        this.addCollisionBox(structure, -1.2, -0.63, -0.08, 0.08, base, base + h);
        this.addCollisionBox(structure, 0.63, 1.2, -0.08, 0.08, base, base + h);
        this.addCollisionBox(structure, -0.63, 0.63, -0.08, 0.08, base + 2.1, base + h);
      }
      return;
    }
    if (structure.kind === 'floor' || structure.kind === 'roof') {
      const y0 = structure.kind === 'roof' ? base + BUILD_LEVEL - h : base;
      if (structure.variant === 'hole') {
        this.addCollisionBox(structure, -1.2, -0.64, -1.2, 1.2, y0, y0 + h);
        this.addCollisionBox(structure, 0.64, 1.2, -1.2, 1.2, y0, y0 + h);
        this.addCollisionBox(structure, -0.64, 0.64, -1.2, -0.64, y0, y0 + h);
        this.addCollisionBox(structure, -0.64, 0.64, 0.64, 1.2, y0, y0 + h);
      } else {
        this.addCollisionBox(structure, -1.2, 1.2, -1.2, 1.2, y0, y0 + h);
      }
      return;
    }
    // Ramp: the visible staircase and the collision staircase share steps.
    const steps = structure.variant === 'half' ? 6 : 9;
    const height = h * (structure.variant === 'half' ? 0.52 : 1);
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const z0 = 1.2 - (i + 1) * (2.4 / steps);
      const z1 = 1.2 - i * (2.4 / steps);
      this.addCollisionBox(
        structure,
        -1.2,
        1.2,
        z0,
        z1,
        base + height * t0,
        base + height * t1,
      );
    }
  }

  setVariant(structure, variant) {
    if (!structure || structure.destroyed) return false;
    if (variant === 'full') return this.setEditSections(structure, []);
    if (variant === 'window' || variant === 'door' || variant === 'hole') {
      return this.setEditSections(structure, presetEditSections(structure.kind, variant));
    }
    structure.editSections = [];
    structure.variant = variant;
    structure.mesh.geometry = buildPieceGeometry(structure.kind, structure.material, variant);
    structure.mesh.position.y = pieceCenterY(structure.kind, structure.level);
    this.rebuildCollision(structure);
    this.onEvent?.({ type: 'edit', owner: structure.owner, structure, variant });
    return true;
  }

  /** Cycle the quick-edit state for a piece (window, door, hole, half-ramp). */
  cycleEdit(structure) {
    if (!structure || structure.destroyed) return false;
    if (structure.kind === 'wall') {
      return this.setVariant(structure, structure.variant === 'full' ? 'window' : structure.variant === 'window' ? 'door' : 'full');
    }
    if (structure.kind === 'floor' || structure.kind === 'roof') {
      return this.setVariant(structure, structure.variant === 'full' ? 'hole' : 'full');
    }
    if (structure.kind === 'ramp') {
      return this.setVariant(structure, structure.variant === 'full' ? 'half' : 'full');
    }
    return false;
  }

  resetEdit(structure) {
    if (!structure || structure.destroyed) return false;
    if (structure.variant === 'full') return false;
    return this.setVariant(structure, 'full');
  }

  damageStructure(structure, amount, point = null, dir = null) {
    if (!structure || structure.destroyed || !(amount > 0)) return false;
    structure.hp -= amount;
    const ratio = Math.max(0, structure.hp / structure.maxHp);
    if (structure.mesh) {
      structure.mesh.material.color.setScalar(0.62 + ratio * 0.38);
    }
    if (point) {
      _normal.copy(dir || new THREE.Vector3(0, 1, 0)).negate();
      this.fx?.impact(point, _normal);
      if (structure.material === 'metal') this.fx?.sparks(point, _normal);
    }
    this.onEvent?.({ type: 'damage', owner: structure.owner, structure, amount });
    if (structure.hp <= 0) {
      this.destroy(structure, point, dir);
      return true;
    }
    return false;
  }

  destroy(structure, point = null, dir = null) {
    if (!structure || structure.destroyed) return;
    structure.destroyed = true;
    const at = point ? point.clone() : structure.mesh.position.clone();
    this.removeCollision(structure);
    const mesh = structure.mesh;
    if (mesh) {
      if (mesh.parent) mesh.parent.remove(mesh);
      const mi = this.world.raycastTargets.indexOf(mesh);
      if (mi >= 0) this.world.raycastTargets.splice(mi, 1);
      const li = this.meshes.indexOf(mesh);
      if (li >= 0) this.meshes.splice(li, 1);
      mesh.material?.dispose();
      structure.mesh = null;
    }
    const key = this.structureKey(structure.cellX, structure.cellZ, structure.level, structure.kind);
    if (this.pieces.get(key) === structure) this.pieces.delete(key);
    const si = this.structures.indexOf(structure);
    if (si >= 0) this.structures.splice(si, 1);
    this.spawnShards(structure, at, dir);
    this.fx?.impact(at, new THREE.Vector3(0, 1, 0));
    this.fx?.sparks?.(at, new THREE.Vector3(0, 1, 0));
    this.sound?.impact?.();
    this.onEvent?.({ type: 'destroy', owner: structure.owner, structure });
  }

  spawnShards(structure, at, dir) {
    const def = BUILD_MATERIALS[structure.material];
    const push = dir ? dir.clone().setY(0.3).normalize() : new THREE.Vector3(0, 1, 0);
    const count = 7 + ((Math.random() * 4) | 0);
    for (let i = 0; i < count; i++) {
      const size = 0.1 + Math.random() * 0.18;
      const mesh = new THREE.Mesh(shardGeometry, materialShardMat(structure.material));
      mesh.scale.set(size, size * (0.6 + Math.random() * 0.8), size);
      mesh.position.copy(at).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 1.4,
          Math.random() * 1.2,
          (Math.random() - 0.5) * 1.4,
        ),
      );
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.shards.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4 + push.x * 2,
          1.2 + Math.random() * 3,
          (Math.random() - 0.5) * 4 + push.z * 2,
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
        ),
        life: 1.2 + Math.random() * 0.8,
        dust: def.dust,
      });
    }
  }

  nearestStructure(position, owner = null, maxDist = 5, kind = null) {
    let best = null;
    let bestD = maxDist;
    for (const s of this.structures) {
      if (owner && s.owner !== owner) continue;
      if (kind && s.kind !== kind) continue;
      const d = s.mesh.position.distanceTo(position);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  aimedStructure(origin, dir, maxDist = 8, owner = null) {
    if (!this.meshes.length) return null;
    this.raycaster.set(origin, dir);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    for (const hit of hits) {
      const s = hit.object.userData.structure;
      if (s && (!owner || s.owner === owner)) return s;
    }
    return null;
  }

  showPreview(owner, kind, material, origin, dir, yawOffset = 0) {
    if (!BUILD_PIECES[kind] || !BUILD_MATERIALS[material]) return;
    const candidate = this.computeCandidate(origin, dir, kind, null, yawOffset);
    const check = this.canPlace(owner, kind, material, candidate);
    this.previewCandidate = candidate;
    this.previewInfo = check;
    this.previewMesh.geometry = buildPieceGeometry(kind, material, 'full');
    this.previewMesh.position.set(
      candidate.cellX * BUILD_GRID,
      pieceCenterY(kind, candidate.level),
      candidate.cellZ * BUILD_GRID,
    );
    this.previewMesh.rotation.y = candidate.yaw;
    this.previewMesh.material.color.setHex(check.ok ? 0x8fe3a8 : 0xff5b48);
    this.previewMesh.material.opacity = check.ok ? 0.42 : 0.3;
    this.previewGroup.visible = true;
  }

  hidePreview() {
    this.previewGroup.visible = false;
  }

  update(dt) {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shards.splice(i, 1);
        continue;
      }
      s.vel.y -= 15 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      const ground = this.world.sampleGround(s.mesh.position.x, s.mesh.position.z, s.mesh.position.y);
      if (s.mesh.position.y < ground + 0.05) {
        s.mesh.position.y = ground + 0.05;
        s.vel.multiplyScalar(0.45);
        s.vel.y = Math.abs(s.vel.y) * 0.3;
        s.spin.multiplyScalar(0.7);
      }
    }
  }

  resetAll() {
    this.hideEditGrid();
    for (const structure of [...this.structures]) {
      this.removeCollision(structure);
      const mesh = structure.mesh;
      if (mesh) {
        if (mesh.parent) mesh.parent.remove(mesh);
        const mi = this.world.raycastTargets.indexOf(mesh);
        if (mi >= 0) this.world.raycastTargets.splice(mi, 1);
        mesh.material?.dispose();
      }
      structure.destroyed = true;
      structure.mesh = null;
    }
    this.structures.length = 0;
    this.meshes.length = 0;
    this.pieces.clear();
    for (const s of this.shards) this.scene.remove(s.mesh);
    this.shards.length = 0;
    this.hidePreview();
    this.lastPlaced = null;
    this.onEvent?.({ type: 'reset' });
  }

  snapshot() {
    return this.structures.map((s) => ({
      owner: s.owner,
      kind: s.kind,
      material: s.material,
      variant: s.variant,
      cellX: s.cellX,
      cellZ: s.cellZ,
      level: s.level,
      hp: s.hp,
      maxHp: s.maxHp,
    }));
  }
}

export { PIECE_ORDER, MATERIAL_ORDER };
