import * as THREE from 'three';

/**
 * Battle Royale world builder.
 *
 * The arena is deliberately assembled from the same voxel and collision
 * primitives as the rest of BLOODVOX. Nothing here is a separate renderer:
 * buildings become merged world geometry and collision boxes, and the chest
 * anchors are consumed by BattleRoyale.
 */

export const ROYALE_SIZE = 236;
export const ROYALE_BOUNDS = 118;

export const ROYALE_LANDMARKS = [
  { x: 0, z: -2, label: 'FORT VOX', kind: 'large' },
  { x: -48, z: 38, label: 'WESTGATE', kind: 'town' },
  { x: 52, z: 39, label: 'EASTBOROUGH', kind: 'town' },
  { x: -50, z: -34, label: 'SAWMILL', kind: 'large' },
  { x: 50, z: -34, label: 'QUARRY', kind: 'large' },
  { x: -2, z: 59, label: 'SOUTH DROP', kind: 'drop' },
  { x: -58, z: 4, label: 'NORTH RIDGE', kind: 'hamlet' },
  { x: 58, z: 2, label: 'EAST RIDGE', kind: 'hamlet' },
  { x: -2, z: -47, label: 'CROSSING', kind: 'hamlet' },
  { x: 0, z: -100, label: 'NORTH FARM', kind: 'farm' },
  { x: 100, z: 2, label: 'EAST JUNCTION', kind: 'town' },
  { x: 0, z: 100, label: 'SOUTH MILL', kind: 'industrial' },
  { x: -100, z: 0, label: 'WEST OBSERVATORY', kind: 'large' },
  { x: 86, z: 86, label: 'SOUTHEAST FARM', kind: 'farm' },
  { x: -84, z: -84, label: 'NORTHWEST CABINS', kind: 'hamlet' },
];

// Ten landing areas, each roughly ten bots. The south drop sits close to the
// player's insertion; the other nine force the population out across every
// district instead of funnelling all 100 actors through the centre.
export const ROYALE_SPAWN_AREAS = [
  { x: -2, z: 58, label: 'SOUTH DROP', radius: 15 },
  { x: -48, z: 38, label: 'WESTGATE', radius: 15 },
  { x: 52, z: 39, label: 'EASTBOROUGH', radius: 15 },
  { x: -58, z: 4, label: 'NORTH RIDGE', radius: 14 },
  { x: 58, z: 2, label: 'EAST RIDGE', radius: 14 },
  { x: -50, z: -34, label: 'SAWMILL', radius: 14 },
  { x: 50, z: -34, label: 'QUARRY', radius: 14 },
  { x: -2, z: -47, label: 'CROSSING', radius: 14 },
  { x: -30, z: 15, label: 'WEST FIELDS', radius: 18 },
  { x: 30, z: 15, label: 'EAST FIELDS', radius: 18 },
  { x: 0, z: -99, label: 'NORTH FARM', radius: 16 },
  { x: 100, z: 2, label: 'EAST JUNCTION', radius: 15 },
  { x: 0, z: 99, label: 'SOUTH MILL', radius: 16 },
  { x: -99, z: 0, label: 'WEST OBSERVATORY', radius: 15 },
  { x: 86, z: 86, label: 'SOUTHEAST FARM', radius: 14 },
  { x: -84, z: -84, label: 'NORTHWEST CABINS', radius: 14 },
];

export const ROYALE_ROADS = [
  { x: 0, z: 0, w: 5.2, d: 224, type: 'road' },
  { x: 0, z: 0, w: 224, d: 5.2, type: 'road' },
  { x: 0, z: -100, w: 4.5, d: 42, type: 'road' },
  { x: 0, z: 100, w: 4.5, d: 42, type: 'road' },
  { x: 100, z: 0, w: 42, d: 4.5, type: 'road' },
  { x: -100, z: 0, w: 42, d: 4.5, type: 'road' },
  { x: 86, z: 86, w: 38, d: 4.5, type: 'road' },
  { x: -84, z: -84, w: 38, d: 4.5, type: 'road' },
  { x: -35, z: 38, w: 48, d: 3.8, type: 'road' },
  { x: 36, z: 39, w: 44, d: 3.8, type: 'road' },
  { x: -32, z: -34, w: 48, d: 3.8, type: 'road' },
  { x: 32, z: -34, w: 44, d: 3.8, type: 'road' },
  { x: -58, z: 4, w: 3.5, d: 48, type: 'road' },
  { x: 58, z: 2, w: 3.5, d: 44, type: 'road' },
  { x: 0, z: -47, w: 112, d: 3.2, type: 'road' },
  { x: 0, z: -57, w: 150, d: 18, type: 'water' },
];

const BUILDING_SPECS = [
  // A fortified centre, five separated hamlets and industrial landmarks. The
  // gaps between these clusters are deliberately large enough for vehicle-free
  // rotations, long fights and unrestricted build battles.
  { x: 0, z: -2, w: 22, d: 14, h: 6.6, floors: 2, label: 'FORT VOX', kind: 'large', style: 'fort' },
  { x: -55, z: 46, w: 12, d: 9, h: 3.4, label: 'WESTGATE HOUSE', kind: 'house', style: 'house' },
  { x: -39, z: 48, w: 11, d: 8, h: 3.4, label: 'WESTGATE COTTAGE', kind: 'house', style: 'house' },
  { x: -58, z: 28, w: 10, d: 8, h: 3.4, label: 'WESTGATE SHOP', kind: 'house', style: 'shop' },
  { x: -34, z: 32, w: 9, d: 7, h: 3.2, label: 'WESTGATE SHED', kind: 'house', style: 'shed' },
  { x: 54, z: 49, w: 12, d: 9, h: 3.4, label: 'EASTBOROUGH HOUSE', kind: 'house', style: 'house' },
  { x: 66, z: 38, w: 10, d: 8, h: 3.4, label: 'EASTBOROUGH COTTAGE', kind: 'house', style: 'house' },
  { x: 43, z: 30, w: 11, d: 8, h: 3.4, label: 'EASTBOROUGH SHOP', kind: 'house', style: 'shop' },
  { x: 62, z: 19, w: 9, d: 7, h: 3.2, label: 'EASTBOROUGH SHED', kind: 'house', style: 'shed' },
  { x: -51, z: -34, w: 21, d: 14, h: 5.2, floors: 2, label: 'SAWMILL', kind: 'large', style: 'industrial' },
  { x: -65, z: -46, w: 10, d: 8, h: 3.2, label: 'SAWMILL SHED', kind: 'house', style: 'shed' },
  { x: -30, z: -42, w: 9, d: 7, h: 3.2, label: 'LOG STACK', kind: 'house', style: 'shed' },
  { x: 51, z: -34, w: 18, d: 13, h: 5.0, floors: 2, label: 'QUARRY OFFICE', kind: 'large', style: 'industrial' },
  { x: 64, z: -20, w: 9, d: 7, h: 3.2, label: 'QUARRY SHED', kind: 'house', style: 'shed' },
  { x: -60, z: 3, w: 11, d: 8, h: 3.4, label: 'NORTH RIDGE CABIN', kind: 'house', style: 'house' },
  { x: 60, z: 2, w: 11, d: 8, h: 3.4, label: 'EAST RIDGE CABIN', kind: 'house', style: 'house' },
  { x: -17, z: 23, w: 9, d: 7, h: 3.2, label: 'ORCHARD SHED', kind: 'house', style: 'shed' },
  { x: 28, z: 59, w: 10, d: 8, h: 3.4, label: 'SOUTHGATE STORE', kind: 'house', style: 'shop' },
  { x: -31, z: 62, w: 10, d: 8, h: 3.4, label: 'SOUTHGATE HOUSE', kind: 'house', style: 'house' },
  { x: -6, z: -48, w: 9, d: 7, h: 3.2, label: 'WEATHER STATION', kind: 'house', style: 'industrial' },
  // The outer ring is deliberately not a scaled copy of the old village: it
  // adds working farms, an observatory, a mill, crossroads and separated
  // cabins on flat valley pads carved from the new rolling terrain.
  { x: 0, z: -99, w: 18, d: 12, h: 5.2, floors: 2, label: 'NORTH FARM BARN', kind: 'large', style: 'industrial' },
  { x: -14, z: -91, w: 10, d: 8, h: 3.4, label: 'NORTH FARMHOUSE', kind: 'house', style: 'house' },
  { x: 14, z: -91, w: 10, d: 7, h: 3.2, label: 'NORTH GRANARY', kind: 'house', style: 'shed' },
  { x: 100, z: 6, w: 13, d: 9, h: 3.6, label: 'EAST JUNCTION STORE', kind: 'house', style: 'shop' },
  { x: 100, z: 22, w: 11, d: 8, h: 3.4, label: 'EAST JUNCTION HOUSE', kind: 'house', style: 'house' },
  { x: 0, z: 100, w: 18, d: 13, h: 5.4, floors: 2, label: 'SOUTH MILL', kind: 'large', style: 'industrial' },
  { x: 15, z: 91, w: 10, d: 8, h: 3.4, label: 'SOUTH MILL OFFICE', kind: 'house', style: 'shop' },
  { x: -100, z: 0, w: 16, d: 11, h: 4.7, floors: 2, label: 'WEST OBSERVATORY', kind: 'large', style: 'fort' },
  { x: -91, z: -16, w: 9, d: 7, h: 3.2, label: 'OBSERVATORY SHED', kind: 'house', style: 'shed' },
  { x: 86, z: 86, w: 17, d: 12, h: 5.0, floors: 2, label: 'SOUTHEAST BARN', kind: 'large', style: 'industrial' },
  { x: 74, z: 79, w: 10, d: 8, h: 3.4, label: 'SOUTHEAST COTTAGE', kind: 'house', style: 'house' },
  { x: -84, z: -84, w: 11, d: 8, h: 3.4, label: 'NORTHWEST CABIN', kind: 'house', style: 'house' },
  { x: -73, z: -92, w: 9, d: 7, h: 3.2, label: 'NORTHWEST SHED', kind: 'house', style: 'shed' },
];

const PALETTES = {
  house: {
    wall: [0.45, 0.43, 0.36],
    wall2: [0.37, 0.34, 0.28],
    floor: [0.27, 0.2, 0.13],
    roof: [0.22, 0.13, 0.1],
    trim: [0.68, 0.64, 0.54],
  },
  shop: {
    wall: [0.32, 0.38, 0.37],
    wall2: [0.24, 0.29, 0.29],
    floor: [0.24, 0.23, 0.19],
    roof: [0.18, 0.19, 0.17],
    trim: [0.77, 0.62, 0.35],
  },
  industrial: {
    wall: [0.32, 0.32, 0.29],
    wall2: [0.25, 0.26, 0.25],
    floor: [0.2, 0.2, 0.18],
    roof: [0.16, 0.17, 0.16],
    trim: [0.52, 0.4, 0.26],
  },
  fort: {
    wall: [0.36, 0.35, 0.3],
    wall2: [0.28, 0.28, 0.25],
    floor: [0.23, 0.22, 0.19],
    roof: [0.18, 0.18, 0.17],
    trim: [0.7, 0.48, 0.24],
  },
  shed: {
    wall: [0.31, 0.29, 0.23],
    wall2: [0.24, 0.23, 0.19],
    floor: [0.2, 0.17, 0.12],
    roof: [0.17, 0.14, 0.11],
    trim: [0.5, 0.36, 0.22],
  },
};

function seeded(seed) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shade(color, n) {
  return color.map((v) => Math.max(0.03, Math.min(1, v + n)));
}

function insideRect(x, z, r, pad = 0) {
  return x > r.x - r.w / 2 - pad && x < r.x + r.w / 2 + pad &&
    z > r.z - r.d / 2 - pad && z < r.z + r.d / 2 + pad;
}

const smooth01 = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / Math.max(0.001, b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Deterministic island heightfield. The original villages sit in the flat
 * central basin; the expansion adds rolling hills, a few steep ridges and
 * level valley pads for the outer settlements. Roads are flattened corridors,
 * so a road is never a floating decal or a random cliff.
 */
export function royaleHeightAt(x, z) {
  const d = Math.hypot(x, z);
  if (d < 78) return 0;
  const rise = smooth01(78, 112, d);
  let h = rise * 3.4;
  h += Math.sin(x * 0.055 + 1.7) * Math.cos(z * 0.048 - 0.4) * 2.8 * rise;
  h += Math.sin(x * 0.11 - z * 0.07 + 2.1) * 0.75 * rise;
  const peak = (px, pz, amp, wx, wz) => {
    const u = (x - px) / wx;
    const v = (z - pz) / wz;
    h += amp * Math.exp(-(u * u + v * v) * 2.2) * rise;
  };
  peak(-96, 46, 9.5, 28, 22);
  peak(96, 54, 8.5, 25, 24);
  peak(62, -92, 8.0, 24, 20);
  peak(-62, -88, 7.0, 22, 20);
  peak(0, 64, 4.5, 34, 18);
  // The map edge rises into a rocky rim. It is smooth enough to walk and
  // build on, but reads as a natural boundary rather than an invisible wall.
  h += Math.max(0, d - 108) * 0.38;

  // Level road corridors through the outer hills.
  for (const road of ROYALE_ROADS) {
    if (road.type !== 'road') continue;
    const dx = Math.max(0, Math.abs(x - road.x) - road.w / 2);
    const dz = Math.max(0, Math.abs(z - road.z) - road.d / 2);
    const outside = Math.hypot(dx, dz);
    if (outside < 6) h *= smooth01(0, 6, outside);
  }
  // Level pads for every building, so structures are embedded in terrain
  // instead of floating or being swallowed by a hillside.
  for (const b of BUILDING_SPECS) {
    const dx = Math.max(0, Math.abs(x - b.x) - b.w / 2);
    const dz = Math.max(0, Math.abs(z - b.z) - b.d / 2);
    const outside = Math.hypot(dx, dz);
    if (outside < 6.5) h *= smooth01(0, 6.5, outside);
  }
  return Math.max(0, h);
}

export function buildRoyaleMap(world) {
  const rand = seeded(78123);
  const lootSpawns = [];
  const buildings = [];

  world.root.name = 'battle-royale-map';
  world.bounds = ROYALE_BOUNDS;

  // ---------------------------------------------------------------- terrain
  // Real chunked terrain geometry with deterministic heights. Collision is a
  // separate cheap heightfield query; the 25 chunk meshes only provide pixels.
  world.heightAt = royaleHeightAt;
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'royale-terrain-chunks';
  world.root.add(terrainGroup);
  const CHUNKS = 5;
  const RES = 12;
  const chunkSize = ROYALE_SIZE / CHUNKS;
  const halfSize = ROYALE_SIZE / 2;
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const positions = [];
      const colors = [];
      const indices = [];
      const c0x = -halfSize + cx * chunkSize;
      const c0z = -halfSize + cz * chunkSize;
      for (let iz = 0; iz <= RES; iz++) {
        for (let ix = 0; ix <= RES; ix++) {
          const x = c0x + (ix / RES) * chunkSize;
          const z = c0z + (iz / RES) * chunkSize;
          const y = royaleHeightAt(x, z);
          positions.push(x - (c0x + chunkSize / 2), y, z - (c0z + chunkSize / 2));
          const rock = smooth01(5.5, 9.5, y);
          const dirt = smooth01(1.2, 3.8, y) * (1 - rock);
          const grain = (rand() - 0.5) * 0.035;
          const r = (0.085 + grain) * (1 - dirt - rock) + 0.25 * dirt + 0.27 * rock;
          const g = (0.145 + grain) * (1 - dirt - rock) + 0.21 * dirt + 0.285 * rock;
          const b = (0.075 + grain) * (1 - dirt - rock) + 0.12 * dirt + 0.275 * rock;
          colors.push(r, g, b);
        }
      }
      for (let iz = 0; iz < RES; iz++) for (let ix = 0; ix < RES; ix++) {
        const a = iz * (RES + 1) + ix;
        const b = a + 1;
        const c = a + RES + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, terrainMat);
      mesh.name = `terrain-${cx}-${cz}`;
      mesh.position.set(c0x + chunkSize / 2, 0, c0z + chunkSize / 2);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.terrain = true;
      terrainGroup.add(mesh);
      world.raycastTargets.push(mesh);
    }
  }

  // ---------------------------------------------------------------- roads
  for (const road of ROYALE_ROADS) {
    if (road.type === 'water') continue;
    const paint = () => {
      const n = (rand() - 0.5) * 0.03;
      return [0.22 + n, 0.215 + n, 0.195 + n];
    };
    world.addVoxels(road.w, 0.06, road.d, road.x, 0.03, road.z, 0.5, paint, 2200 + road.x + road.z);
    // worn centre dashes
    const alongZ = road.d > road.w;
    const length = alongZ ? road.d : road.w;
    for (let s = -length / 2 + 4; s < length / 2 - 2; s += 7) {
      const x = alongZ ? road.x : road.x + s;
      const z = alongZ ? road.z + s : road.z;
      world.addVoxels(alongZ ? 0.28 : 2.4, 0.012, alongZ ? 2.4 : 0.28, x, 0.07, z, 0.2, () => [0.62, 0.53, 0.25], 2300 + s);
    }
  }

  // shallow river under the bridge, with banks left visible
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x16394a,
    specular: 0x7fb6c8,
    shininess: 105,
    transparent: true,
    opacity: 0.82,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(150, 18), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.055, -57);
  world.root.add(water);
  for (let x = -74; x < 74; x += 4) {
    world.addBox(x, 0, -67, x + 4, 0.6, -65.7);
    world.addBox(x, 0, -48.3, x + 4, 0.6, -47);
  }
  // bridge over the river
  const bridge = { x: 0, z: -57, w: 8, d: 22 };
  world.addVoxels(8, 0.34, 22, 0, 0.18, -57, 0.5, () => [0.31, 0.24, 0.15], 2501);
  world.addBox(-4, 0, -68, 4, 0.35, -46);
  for (const side of [-1, 1]) {
    world.addVoxels(0.22, 1.0, 22, side * 4.1, 0.72, -57, 0.22, () => [0.2, 0.17, 0.13], 2510 + side);
    world.addBox(side * 4.15, 0.3, -68, side * 4.35, 1.25, -46);
  }

  // ---------------------------------------------------------------- perimeter
  const edgePaint = (u, v) => {
    const n = (rand() - 0.5) * 0.04;
    return [0.18 + n, 0.19 + n, 0.17 + n];
  };
  for (const [x, z, w, d] of [[0, -117.2, 234, 2.4], [0, 117.2, 234, 2.4], [-117.2, 0, 2.4, 234], [117.2, 0, 2.4, 234]]) {
    world.addVoxels(w, 9.0, d, x, 4.5, z, 0.8, edgePaint, 2600 + x + z);
    world.addBox(x - w / 2, 0, z - d / 2, x + w / 2, 9.0, z + d / 2);
  }

  // ---------------------------------------------------------------- hills
  const hill = (cx, cz, radius, levels) => {
    for (let i = 0; i < levels; i++) {
      const s = radius - i * 2.4;
      const top = 0.42 + i * 0.34;
      const color = shade([0.13, 0.18, 0.1], i * 0.012);
      world.addRoomBlock(cx - s, 0, cz - s, cx + s, top, cz + s, color, 3000 + i * 17 + cx);
    }
  };
  hill(-57, -15, 14, 3);
  hill(58, 58, 11, 2);
  hill(-67, 58, 9, 2);
  hill(9, 32, 15, 2);
  hill(-14, 6, 10, 2);
  hill(33, -55, 12, 3);

  // ---------------------------------------------------------------- buildings
  const addDoor = (x, z, ry, palette) => {
    const mat = new THREE.MeshLambertMaterial({ color: palette.trim });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.08), mat);
    door.position.set(x, 1.15, z);
    door.rotation.y = ry;
    door.castShadow = true;
    world.root.add(door);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xd8b46a }));
    knob.position.set(x + Math.cos(ry) * 0.32, 1.15, z - Math.sin(ry) * 0.32);
    world.root.add(knob);
  };
  const addWindow = (x, z, ry, w = 1.2, h = 1.15) => {
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.035),
      new THREE.MeshPhongMaterial({ color: 0x91b9c5, emissive: 0x0b1820, transparent: true, opacity: 0.6 }),
    );
    glass.position.set(x, 1.48, z);
    glass.rotation.y = ry;
    world.root.add(glass);
  };

  const wallBlock = (x1, z1, x2, z2, y1, y2, color, seed) => {
    world.addRoomBlock(x1, y1, z1, x2, y2, z2, color, seed);
  };

  const buildWall = (spec, axis, fixed, from, to, openings, palette, seed) => {
    const cursorOpenings = [...openings].sort((a, b) => a.a - b.a);
    let cursor = from;
    let n = seed;
    const solidSegment = (a, b, y1, y2) => {
      if (b - a < 0.08 || y2 - y1 < 0.08) return;
      if (axis === 'x') wallBlock(a, fixed - 0.16, b, fixed + 0.16, y1, y2, shade(palette.wall, (n++ % 5) * 0.012), n * 11);
      else wallBlock(fixed - 0.16, a, fixed + 0.16, b, y1, y2, shade(palette.wall, (n++ % 5) * 0.012), n * 11);
    };
    for (const opening of cursorOpenings) {
      solidSegment(cursor, opening.a, 0.2, spec.h);
      if (opening.type === 'window') {
        solidSegment(opening.a, opening.b, 0.2, 0.84);
        solidSegment(opening.a, opening.b, 2.08, spec.h);
      } else {
        solidSegment(opening.a, opening.b, 2.28, spec.h);
      }
      cursor = Math.max(cursor, opening.b);
    }
    solidSegment(cursor, to, 0.2, spec.h);

    // Real glass panes and frames in the openings. The frame below is also the
    // collision sill; the hole above it is genuinely open to bullets.
    for (const opening of cursorOpenings) {
      if (opening.type !== 'window') continue;
      const mid = (opening.a + opening.b) / 2;
      if (axis === 'x') addWindow(mid, fixed, 0);
      else addWindow(fixed, mid, Math.PI / 2);
      if (axis === 'x') {
        world.addVoxels(0.12, 0.08, 0.34, opening.a, 2.08, fixed, 0.12, () => palette.trim, seed + 1);
        world.addVoxels(0.12, 0.08, 0.34, opening.b, 2.08, fixed, 0.12, () => palette.trim, seed + 2);
      } else {
        world.addVoxels(0.34, 0.08, 0.12, fixed, 2.08, opening.a, 0.12, () => palette.trim, seed + 1);
        world.addVoxels(0.34, 0.08, 0.12, fixed, 2.08, opening.b, 0.12, () => palette.trim, seed + 2);
      }
    }
  };

  const buildStairs = (spec, palette, seed) => {
    const count = 9;
    const stepH = 0.34;
    const stepD = 0.55;
    const x = spec.x + spec.w / 2 - 3.2;
    const z0 = spec.z + spec.d / 2 - 1.2;
    for (let i = 0; i < count; i++) {
      world.addRoomBlock(
        x - 1.2, i * stepH, z0 - i * stepD,
        x + 1.2, (i + 1) * stepH, z0 - i * stepD + stepD,
        shade(palette.floor, 0.03 + i * 0.006), seed + i,
      );
    }
    // landing at the top of the staircase
    world.addRoomBlock(x - 1.4, count * stepH, z0 - (count - 1) * stepD - 1.8, x + 1.4, count * stepH + 0.18, z0 - (count - 1) * stepD, shade(palette.floor, 0.07), seed + 40);
  };

  for (let bi = 0; bi < BUILDING_SPECS.length; bi++) {
    const spec = BUILDING_SPECS[bi];
    const palette = PALETTES[spec.style] || PALETTES.house;
    const x0 = spec.x - spec.w / 2;
    const x1 = spec.x + spec.w / 2;
    const z0 = spec.z - spec.d / 2;
    const z1 = spec.z + spec.d / 2;
    const seed = 5000 + bi * 37;

    // foundation and interior floor
    world.addRoomBlock(x0, 0, z0, x1, 0.2, z1, palette.floor, seed);
    // roof / upper floor
    if (spec.floors > 1) {
      // leave a stairwell opening on the east side
      const sx0 = x1 - 4.6;
      const sx1 = x1 - 1.6;
      const sz0 = z1 - 6.0;
      const sz1 = z1 - 1.4;
      world.addRoomBlock(x0, 2.95, z0, sx0, 3.15, z1, palette.floor, seed + 2);
      world.addRoomBlock(sx1, 2.95, z0, x1, 3.15, z1, palette.floor, seed + 3);
      world.addRoomBlock(sx0, 2.95, z0, sx1, 3.15, sz0, palette.floor, seed + 4);
      world.addRoomBlock(sx0, 2.95, sz1, sx1, 3.15, z1, palette.floor, seed + 5);
      buildStairs(spec, palette, seed + 10);
      world.addRoomBlock(x0, spec.h - 0.25, z0, x1, spec.h, z1, palette.roof, seed + 6);
    } else {
      world.addRoomBlock(x0, spec.h - 0.25, z0, x1, spec.h, z1, palette.roof, seed + 6);
    }

    const doorW = 1.7;
    const frontDoor = [x0 + 2.2, x0 + 2.2 + doorW];
    const backDoor = [x1 - 3.7, x1 - 3.7 + doorW];
    const frontWindows = [
      { a: x0 + 5.0, b: x0 + 6.3, type: 'window' },
      { a: x1 - 3.9, b: x1 - 2.6, type: 'window' },
    ];
    const backWindows = [
      { a: x0 + 4.2, b: x0 + 5.5, type: 'window' },
    ];
    const leftWindows = [
      { a: z0 + 2.0, b: z0 + 3.3, type: 'window' },
      { a: z1 - 3.4, b: z1 - 2.1, type: 'window' },
    ];
    const rightWindows = [
      { a: z0 + 2.0, b: z0 + 3.3, type: 'window' },
    ];
    buildWall(spec, 'x', z1, x0, x1, [{ a: frontDoor[0], b: frontDoor[1], type: 'door' }, ...frontWindows], palette, seed + 20);
    buildWall(spec, 'x', z0, x0, x1, [{ a: backDoor[0], b: backDoor[1], type: 'door' }, ...backWindows], palette, seed + 21);
    buildWall(spec, 'z', x0, z0, z1, leftWindows, palette, seed + 22);
    buildWall(spec, 'z', x1, z0, z1, rightWindows, palette, seed + 23);
    addDoor((frontDoor[0] + frontDoor[1]) / 2, z1, -1.1, palette);
    addDoor((backDoor[0] + backDoor[1]) / 2, z0, 1.1, palette);

    // Interior partition with a genuine doorway.
    if (spec.w > 9) {
      const px = spec.x + 1.2;
      world.addRoomBlock(px, 0.2, z0 + 0.3, px + 0.22, 2.6, spec.z - 1.6, palette.wall2, seed + 30);
      world.addBox(px, 0.2, z0 + 0.3, px + 0.22, 2.6, spec.z - 1.6);
      world.addRoomBlock(px, 0.2, spec.z + 0.7, px + 0.22, 2.6, z1 - 0.3, palette.wall2, seed + 31);
      world.addBox(px, 0.2, spec.z + 0.7, px + 0.22, 2.6, z1 - 0.3);
    }

    // Furniture, counters and cover.
    const furniture = (fx, fz, fw, fd, fh, color, solid = true) => {
      world.addRoomBlock(fx, 0.2, fz, fx + fw, 0.2 + fh, fz + fd, color, seed + 50, false);
      if (solid) world.addBox(fx, 0.2, fz, fx + fw, 0.2 + fh, fz + fd);
    };
    furniture(x0 + 1.2, z0 + 1.1, 2.4, 0.8, 0.8, [0.28, 0.19, 0.11]);
    furniture(x1 - 3.0, z1 - 2.2, 1.8, 1.0, 0.6, [0.29, 0.24, 0.18]);
    if (spec.style === 'shop') {
      furniture(x0 + 1.0, spec.z - 1.0, 4.0, 0.8, 0.9, [0.34, 0.28, 0.2]);
      furniture(x0 + 1.0, spec.z + 1.2, 4.0, 0.8, 0.9, [0.34, 0.28, 0.2]);
    }
    if (spec.style === 'industrial') {
      for (let i = 0; i < 3; i++) {
        furniture(x0 + 2 + i * 2.4, z0 + 2.0, 1.2, 1.2, 0.9, [0.32, 0.3, 0.25]);
      }
    }

    // A low warm light in each interior, not one per room.
    world.addRoomLight(spec.x, spec.h - 0.55, spec.z, 0xffc27b, 8, 9);

    // Loot anchors: interior corners and the central room.
    const anchors = [
      [x0 + 2.3, z0 + 2.2], [x1 - 2.5, z0 + 2.2], [x0 + 2.3, z1 - 2.2],
      [x1 - 2.5, z1 - 2.2],
    ];
    if (spec.w > 14) anchors.push([spec.x, spec.z + 3.2], [spec.x, spec.z - 3.2]);
    for (const [ax, az] of anchors) {
      lootSpawns.push({ x: ax, y: 0.24, z: az, indoor: true, building: spec.label });
    }
    buildings.push({ x: spec.x, z: spec.z, w: spec.w, d: spec.d, label: spec.label, kind: spec.kind });
  }

  // ---------------------------------------------------------------- fields
  // Broad working fields and orchards break up the grass with readable
  // districts, but are kept flat and open so they remain good fight space.
  const fields = [
    { x: -30, z: 16, w: 27, d: 17, kind: 'wheat' },
    { x: 30, z: 14, w: 24, d: 16, kind: 'hay' },
    { x: -4, z: 35, w: 18, d: 12, kind: 'orchard' },
    { x: 25, z: -16, w: 20, d: 14, kind: 'wheat' },
    { x: -20, z: -19, w: 18, d: 12, kind: 'fallow' },
    { x: 0, z: -83, w: 32, d: 16, kind: 'wheat' },
    { x: 82, z: 4, w: 16, d: 24, kind: 'hay' },
    { x: -86, z: 22, w: 18, d: 20, kind: 'fallow' },
    { x: 0, z: 83, w: 28, d: 15, kind: 'orchard' },
    { x: 68, z: 70, w: 22, d: 16, kind: 'wheat' },
    { x: -70, z: -66, w: 18, d: 15, kind: 'hay' },
  ];
  for (const field of fields) {
    const base = field.kind === 'wheat' ? [0.34, 0.31, 0.13] : field.kind === 'hay' ? [0.4, 0.32, 0.15] : field.kind === 'orchard' ? [0.14, 0.23, 0.1] : [0.22, 0.2, 0.13];
    world.addVoxels(field.w, 0.035, field.d, field.x, 0.075, field.z, 0.9, (_u, _v, w) => shade(base, (w - 0.5) * 0.04), 8100 + field.x);
    for (let row = -field.d / 2 + 1.3; row < field.d / 2; row += 2.2) {
      world.addVoxels(field.w - 1.2, 0.04, 0.16, field.x, 0.1, field.z + row, 0.3, () => shade(base, -0.045), 8200 + row + field.z);
    }
  }

  // ---------------------------------------------------------------- trees
  const inRoad = (x, z) => ROYALE_ROADS.some((r) => r.type === 'road' && insideRect(x, z, r, 2.5));
  const inBuilding = (x, z, pad = 2) => buildings.some((b) => insideRect(x, z, b, pad));
  const tree = (x, z) => {
    const base = royaleHeightAt(x, z);
    const h = 3.8 + rand() * 3.5;
    const trunk = shade([0.24, 0.16, 0.09], (rand() - 0.5) * 0.03);
    world.addVoxels(0.5, h, 0.5, x, base + h / 2, z, 0.5, () => trunk, 6000 + x + z);
    world.addBox(x - 0.3, base, z - 0.3, x + 0.3, base + h, z + 0.3);
    const leafColor = [0.08, 0.16, 0.075];
    for (let i = 0; i < 3; i++) {
      const s = 2.7 - i * 0.55;
      world.addVoxels(s, 1.1, s, x, base + h - 0.4 + i * 1.05, z, 0.65, () => shade(leafColor, (rand() - 0.5) * 0.03), 6100 + x + z + i);
    }
  };
  // Trees form woodland belts instead of an even sprinkle. The middle of each
  // field, every road and all settlement interiors stay clear.
  const forests = [
    { x: -55, z: 12, r: 22, n: 24, label: 'WEST WOODS' },
    { x: 52, z: 11, r: 20, n: 20, label: 'EAST WOODS' },
    { x: -18, z: -38, r: 17, n: 16, label: 'NORTH WOODS' },
    { x: -56, z: 62, r: 17, n: 14, label: 'SOUTH WOODS' },
    { x: 22, z: -61, r: 15, n: 12, label: 'RIVER PINES' },
    { x: -92, z: 54, r: 27, n: 26, label: 'WEST HIGHLANDS' },
    { x: 94, z: 48, r: 25, n: 24, label: 'EAST HIGHLANDS' },
    { x: 66, z: -84, r: 23, n: 22, label: 'NORTH PINES' },
    { x: -68, z: -78, r: 21, n: 20, label: 'NORTHWEST WOODS' },
    { x: 38, z: 94, r: 19, n: 16, label: 'SOUTH GROVE' },
  ];
  let placed = 0;
  for (const grove of forests) {
    for (let i = 0; i < 120 && placed < 220; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * grove.r;
      const x = grove.x + Math.cos(a) * r;
      const z = grove.z + Math.sin(a) * r;
      if (Math.abs(x) > 112 || Math.abs(z) > 112) continue;
      if (inRoad(x, z) || inBuilding(x, z, 2.5) || Math.abs(z + 57) < 12) continue;
      if (fields.some((f) => insideRect(x, z, f, 1.5))) continue;
      if (royaleHeightAt(x, z) > 10) continue;
      tree(x, z);
      placed++;
    }
  }

  // rocks and quarry boulders
  for (let i = 0; i < 78; i++) {
    const x = (rand() * 2 - 1) * 111;
    const z = (rand() * 2 - 1) * 111;
    if (inRoad(x, z) || inBuilding(x, z, 2)) continue;
    const base = royaleHeightAt(x, z);
    const s = 0.8 + rand() * 1.8;
    world.addVoxels(s, s, s, x, base + s / 2, z, 0.45, () => shade([0.26, 0.27, 0.25], (rand() - 0.5) * 0.08), 7000 + i);
    world.addBox(x - s / 2, base, z - s / 2, x + s / 2, base + s, z + s / 2);
  }

  // ---------------------------------------------------------------- outdoor loot
  const outdoor = [
    [-58, 42], [-18, 50], [16, 50], [58, 44], [-58, 12], [58, 14],
    [-18, 18], [18, 18], [-10, -18], [12, -20], [-63, -12], [62, -10],
    [0, -43], [-36, -57], [36, -56], [0, 43], [-48, 64], [48, 62],
    [0, -84], [8, -110], [96, 0], [108, 20], [0, 84], [-8, 108],
    [-96, 0], [-110, 26], [86, 78], [72, 94], [-84, -78], [-68, -94],
  ];
  for (const [x, z] of outdoor) {
    if (!inBuilding(x, z, 1.2)) lootSpawns.push({ x, y: 0.3, z, indoor: false, building: 'OPEN GROUND' });
  }

  // A few guaranteed high-value anchors in landmarks.
  lootSpawns.push({ x: 0, y: 0.24, z: 0, indoor: true, building: 'FORT VOX' });
  lootSpawns.push({ x: -42, y: 0.24, z: -34, indoor: true, building: 'SAWMILL' });
  lootSpawns.push({ x: 44, y: 0.24, z: -39, indoor: true, building: 'QUARRY OFFICE' });

  // Deduplicate anchors that landed too close together.
  const filtered = [];
  for (const p of lootSpawns) {
    if (filtered.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.4)) continue;
    filtered.push(p);
  }

  const landmarks = [
    ...buildings.map((b) => ({ ...b, kind: b.kind === 'large' ? 'large' : 'building' })),
    ...ROYALE_LANDMARKS,
    { x: 0, z: -57, w: 8, d: 22, label: 'CROSSING BRIDGE', kind: 'bridge' },
  ];

  return {
    size: ROYALE_SIZE,
    bounds: ROYALE_BOUNDS,
    lootSpawns: filtered,
    landmarks,
    fields,
    forests,
    spawnAreas: ROYALE_SPAWN_AREAS,
    roads: ROYALE_ROADS,
    buildings,
    trees: placed,
    rocks: 78,
    terrainChunks: CHUNKS * CHUNKS,
    heightAt: royaleHeightAt,
  };
}
