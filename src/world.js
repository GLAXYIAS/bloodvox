import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeVoxelPart, buildVoxelGeometry } from './voxel.js';
import { buildRoyaleMap } from './royale-map.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

/** Arena metadata shared by the menu, player spawn and NPC population. */
export const MAPS = {
  pit: {
    label: 'THE PIT',
    short: 'THE PIT',
    description: 'Open concrete kill yard',
    spawn: [0, 14],
    npcCount: 9,
    maxAlive: 10,
    background: 0x293340,
    fog: 0x334153,
    fogDensity: 0.0066,
    floorIn: 0.225,
    floorOut: 0.145,
    floorX: 18,
    floorZ: 18,
    wallBase: 0.265,
  },
  house: {
    label: 'BLACKWOOD HOUSE',
    short: 'THE HOUSE',
    description: 'Craftsman house with a covered porch and yard',
    spawn: [0, 16.2],
    npcCount: 8,
    maxAlive: 9,
    background: 0x252720,
    fog: 0x3b3a2e,
    fogDensity: 0.0088,
    floorIn: 0.21,
    floorOut: 0.085,
    floorX: 15,
    floorZ: 12,
    wallBase: 0.24,
  },
  hospital: {
    label: 'ST. VITUS HOSPITAL',
    short: 'ST. VITUS',
    description: 'Corridors, wards and reception',
    spawn: [0, 20],
    npcCount: 9,
    maxAlive: 10,
    background: 0x222b32,
    fog: 0x33434e,
    fogDensity: 0.0086,
    floorIn: 0.26,
    floorOut: 0.105,
    floorX: 20,
    floorZ: 15,
    wallBase: 0.3,
  },
  build: {
    label: 'BUILD ARENA',
    short: 'BUILD ARENA',
    description: 'Symmetrical 1v1 voxel building arena',
    spawn: [0, 11],
    npcCount: 0,
    maxAlive: 0,
    background: 0x1c2732,
    fog: 0x2b3a47,
    fogDensity: 0.0058,
    floorIn: 0.21,
    floorOut: 0.135,
    floorX: 16,
    floorZ: 16,
    wallBase: 0.235,
  },
  royale: {
    label: 'BATTLE ROYALE',
    short: 'THE ISLAND',
    description: '100 bots, loot towns, a shrinking storm and one survivor',
    spawn: [0, 63],
    npcCount: 0,
    maxAlive: 0,
    background: 0x202b31,
    fog: 0x35464c,
    fogDensity: 0.0048,
    floorIn: 0.2,
    floorOut: 0.12,
    floorX: 76,
    floorZ: 76,
    wallBase: 0.24,
  },
};

/** The sandbox lot: scene shell, collisions, props and arena-specific geometry. */
export class World {
  constructor(scene, map = 'pit') {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'arena';
    this.scene.add(this.root);
    this.boxes = [];
    this.raycastTargets = [];
    this.bounds = 29.2;
    this.heightAt = null;
    this.geos = [];
    this.glowGeos = [];
    this.lights = [];
    this.time = 0;
    this.map = 'pit';
    this.mapData = MAPS.pit;
    this.buildMap(map);
  }

  buildMap(name) {
    const key = MAPS[name] ? name : 'pit';
    this.clearRoot();
    this.map = key;
    this.mapData = MAPS[key];
    this.boxes.length = 0;
    this.raycastTargets.length = 0;
    this.heightAt = null;
    this.geos = [];
    this.glowGeos = [];
    this.lights.length = 0;
    this.mesh = null;
    this.dust = null;
    this.city = null;
    this.time = 0;

    // The build arena has its own inner barrier. Keep player/vehicle motion
    // inside that barrier instead of the old open-lot bounds.
    this.bounds = key === 'build' ? 16.15 : key === 'royale' ? 118 : 29.2;
    this.scene.background = new THREE.Color(this.mapData.background);
    const fog = new THREE.FogExp2(this.mapData.fog, this.mapData.fogDensity);
    this.scene.fog = fog;

    this.buildSky();
    if (key === 'royale') {
      this.royaleData = buildRoyaleMap(this);
    } else {
      this.royaleData = null;
      this.buildGround();
      this.buildWalls();
      if (key === 'house') this.buildHouse();
      else if (key === 'hospital') this.buildHospital();
      else if (key === 'build') this.buildBuildArena();
      else this.buildProps();
      this.buildSkyline();
      this.buildDust();
    }
    this.merge();
  }

  /** Remove everything belonging to the previous arena without leaking its GPU data. */
  clearRoot() {
    const geos = new Set();
    const mats = new Set();
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      child.traverse?.((o) => {
        if (o.geometry) geos.add(o.geometry);
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m));
          else mats.add(o.material);
        }
      });
    }
    for (const g of geos) g.dispose();
    for (const m of mats) {
      if (m === MAT || m === GLOW_MAT) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  }

  addBox(x1, y1, z1, x2, y2, z2) {
    this.boxes.push({
      min: new THREE.Vector3(x1, y1, z1),
      max: new THREE.Vector3(x2, y2, z2),
    });
  }

  addVoxels(w, h, d, x, y, z, voxel, paint, seed, glow = false) {
    const built = makeVoxelPart(w, h, d, paint, voxel, seed);
    const geo = buildVoxelGeometry(built.voxels, voxel);
    geo.translate(x, y, z);
    (glow ? this.glowGeos : this.geos).push(geo);
    return built;
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(260, 32, 18);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x080d16).convertSRGBToLinear();
    const mid = new THREE.Color(0x26303d).convertSRGBToLinear();
    const bottom = new THREE.Color(0x6a5440).convertSRGBToLinear();
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 260;
      if (y >= 0) c.copy(mid).lerp(top, Math.min(1, y * 1.5));
      else c.copy(bottom).lerp(mid, Math.min(1, 1 + y * 1.8));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.root.add(sky);

    // stars
    const starPositions = [];
    for (let i = 0; i < 280; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.12 + Math.random() * 0.85;
      const r = Math.sqrt(1 - y * y) * 240;
      starPositions.push(Math.cos(a) * r, y * 240, Math.sin(a) * r);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xd6e0f2,
        size: 0.55,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        fog: false,
      }),
    );
    stars.renderOrder = -9;
    this.root.add(stars);

    // moon
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,250,238,1)');
    grad.addColorStop(0.28, 'rgba(240,242,238,0.95)');
    grad.addColorStop(0.55, 'rgba(200,214,230,0.25)');
    grad.addColorStop(1, 'rgba(160,180,210,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const moonMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    const moon = new THREE.Sprite(moonMat);
    moon.scale.set(16, 16, 1);
    moon.position.set(-62, 46, -86);
    moon.renderOrder = -8;
    this.root.add(moon);

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshLambertMaterial({ color: 0x10141a }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.08;
    this.root.add(outer);
  }

  buildGround() {
    const size = 4;
    for (let ix = -30; ix < 30; ix += size) {
      for (let iz = -30; iz < 30; iz += size) {
        const cfg = this.mapData;
        const inPad = Math.abs(ix + size / 2) < cfg.floorX && Math.abs(iz + size / 2) < cfg.floorZ;
        const base = inPad ? cfg.floorIn : cfg.floorOut;
        const seed = (ix + 100) * 71 + (iz + 100) * 13 + 3;
        const paint = () => {
          const n = (Math.random() - 0.5) * 0.045;
          if (this.map === 'house' && inPad) {
            const plank = Math.sin((iz + 30) * 2.4) * 0.018;
            return [base + n + plank, base * 0.74 + n, base * 0.47 + n * 0.7];
          }
          if (this.map === 'house') {
            const grass = Math.random();
            return [(0.065 + n) * (grass < 0.18 ? 1.4 : 1), (0.115 + n) * (grass < 0.18 ? 1.25 : 1), 0.055 + n * 0.4];
          }
          if (this.map === 'hospital') {
            const checker = (Math.floor((ix + 30) / 2) + Math.floor((iz + 30) / 2)) % 2 ? 1 : 0.91;
            const stain = Math.random() < 0.04 ? 0.7 : 1;
            return [base * checker * stain + n, base * checker * stain + n, base * checker * stain * 1.02 + n];
          }
          const r = Math.random();
          if (r < 0.035) return [0.055, 0.06, 0.065];
          if (r < 0.075) return [base * 0.55, base * 0.58, base * 0.62];
          if (r < 0.11) return [base * 0.85, base * 0.82, base * 0.74];
          return [base + n, base + n, base + n * 0.8];
        };
        this.addVoxels(size, 1, size, ix + size / 2, -0.5, iz + size / 2, 1, paint, seed);
      }
    }

    if (this.map !== 'pit') return;

    // expansion joints
    const joints = [];
    for (let i = -30; i <= 30; i += 4) {
      joints.push(-30, 0.012, i, 30, 0.012, i);
      joints.push(i, 0.012, -30, i, 0.012, 30);
    }
    const jointGeo = new THREE.BufferGeometry();
    jointGeo.setAttribute('position', new THREE.Float32BufferAttribute(joints, 3));
    const jointMat = new THREE.LineBasicMaterial({ color: 0x0a0b0d, transparent: true, opacity: 0.55 });
    this.root.add(new THREE.LineSegments(jointGeo, jointMat));

    // faded road dashes near the walls
    const dash = () => {
      const n = (Math.random() - 0.5) * 0.04;
      return [0.46 + n, 0.38 + n, 0.19 + n];
    };
    for (let z = -24; z <= 24; z += 4) {
      this.addVoxels(0.5, 0.25, 2, 26.5, -0.115, z, 0.25, dash, 300 + z);
      this.addVoxels(0.5, 0.25, 2, -26.5, -0.115, z, 0.25, dash, 400 + z);
    }

    // manhole + puddles
    const manhole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.04, 20),
      new THREE.MeshLambertMaterial({ color: 0x1b1d1f }),
    );
    manhole.position.set(3.4, 0.02, -3.2);
    manhole.receiveShadow = true;
    this.root.add(manhole);

    const puddleMat = new THREE.MeshPhongMaterial({
      color: 0x0a0e14,
      specular: 0x5a6a7a,
      shininess: 90,
      transparent: true,
      opacity: 0.92,
    });
    for (const [x, z, r] of [
      [-8.4, -1.8, 2.3],
      [6.1, -11.2, 1.7],
      [14.2, 9.4, 2.9],
      [-13.6, 13.2, 1.9],
      [-23.5, -18.2, 2.6],
      [21.4, 22.6, 2.2],
      [24.2, -7.8, 1.8],
      [-24.8, 16.1, 2.1],
    ]) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(r, 18), puddleMat);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(x, 0.014, z);
      puddle.scale.z = 0.55 + Math.random() * 0.4;
      this.root.add(puddle);
    }
  }

  buildWalls() {
    const paint = (u, v) => {
      const m = ((u * 42) % 4 + 4) % 4;
      const seam = m < 0.4 ? 0.7 : 1;
      const stain = v < -0.28 && Math.random() < 0.3 ? 0.62 : 1;
      const wet = Math.random() < 0.04 ? 0.8 : 1;
      const g = (this.mapData.wallBase + Math.random() * 0.045) * seam * stain * wet;
      if (this.map === 'house') {
        if (Math.random() < 0.08) return [g * 0.9, g * 0.55, g * 0.42];
        return [g * 1.04, g * 0.9, g * 0.73];
      }
      if (this.map === 'hospital') {
        if (Math.random() < 0.035) return [g * 0.66, g * 0.72, g * 0.66];
        return [g * 0.9, g * 0.96, g];
      }
      if (Math.random() < 0.014) return [g * 0.55, g * 0.34, g * 0.3];
      if (Math.random() < 0.008) return [g * 0.32, g * 0.45, g * 0.42];
      return [g, g * 0.99, g * 0.93];
    };
    this.addVoxels(62, 5, 1, 0, 2.5, -30.5, 1, paint, 11);
    this.addVoxels(62, 5, 1, 0, 2.5, 30.5, 1, paint, 12);
    this.addVoxels(1, 5, 62, -30.5, 2.5, 0, 1, paint, 13);
    this.addVoxels(1, 5, 62, 30.5, 2.5, 0, 1, paint, 14);

    const cap = () => {
      const g = 0.16 + Math.random() * 0.03;
      return [g, g * 0.98, g * 0.92];
    };
    this.addVoxels(62.4, 0.4, 1.3, 0, 5.05, -30.5, 0.7, cap, 15);
    this.addVoxels(62.4, 0.4, 1.3, 0, 5.05, 30.5, 0.7, cap, 16);
    this.addVoxels(1.3, 0.4, 62.4, -30.5, 5.05, 0, 0.7, cap, 17);
    this.addVoxels(1.3, 0.4, 62.4, 30.5, 5.05, 0, 0.7, cap, 18);

    this.addBox(-31, 0, -31, 31, 5, -30);
    this.addBox(-31, 0, 30, 31, 5, 31);
    this.addBox(-31, 0, -31, -30, 5, 31);
    this.addBox(30, 0, -31, 31, 5, 31);
  }

  /**
   * Symmetrical two-spawn arena. It is deliberately open: the only cover in
   * the first seconds is what the two builders make. The low pads and grid
   * markers are visual, so they never create invisible collision for a piece.
   */
  buildBuildArena() {
    const wallPaint = () => {
      const n = (Math.random() - 0.5) * 0.05;
      if (Math.random() < 0.035) return [0.38 + n, 0.16 + n, 0.1 + n];
      if (Math.random() < 0.045) return [0.11 + n, 0.2 + n, 0.22 + n];
      return [0.19 + n, 0.225 + n, 0.255 + n];
    };
    // Inner containment walls, four thin panels with a bright cap.
    this.addVoxels(34, 5, 0.7, 0, 2.5, -16.4, 0.7, wallPaint, 61);
    this.addVoxels(34, 5, 0.7, 0, 2.5, 16.4, 0.7, wallPaint, 62);
    this.addVoxels(0.7, 5, 34, -16.4, 2.5, 0, 0.7, wallPaint, 63);
    this.addVoxels(0.7, 5, 34, 16.4, 2.5, 0, 0.7, wallPaint, 64);
    this.addBox(-16.8, 0, -16.8, 16.8, 5, -16.05);
    this.addBox(-16.8, 0, 16.05, 16.8, 5, 16.8);
    this.addBox(-16.8, 0, -16.8, -16.05, 5, 16.8);
    this.addBox(16.05, 0, -16.8, 16.8, 5, 16.8);

    const pad = (z, warm) => {
      const paint = (u, v, w) => {
        const stripe = Math.abs(((u + 0.5) * 10) % 1 - 0.5) > 0.4 ? 1.35 : 1;
        const base = warm ? [0.42, 0.15, 0.1] : [0.12, 0.25, 0.4];
        return [base[0] * stripe, base[1] * stripe, base[2] * stripe];
      };
      this.addVoxels(5, 0.06, 3.2, 0, 0.035, z, 0.25, paint, warm ? 88 : 89);
      // "1" and "2" markers at the pads.
      const mark = warm ? [0.82, 0.65, 0.38] : [0.58, 0.78, 0.95];
      const px = warm ? -2.3 : 2.3;
      this.addVoxels(0.5, 0.02, 2.1, px, 0.075, z, 0.1, () => mark, 90);
    };
    pad(-11, false);
    pad(11, true);

    // Centre circle and cross, useful for orienting during a fight.
    const linePaint = () => [0.42, 0.34, 0.19];
    this.addVoxels(8, 0.02, 0.18, 0, 0.025, 0, 0.18, linePaint, 91);
    this.addVoxels(0.18, 0.02, 8, 0, 0.025, 0, 0.18, linePaint, 92);
    const cornerPaint = () => [0.27, 0.32, 0.36];
    for (const [x, z] of [
      [-13.2, -13.2], [13.2, -13.2], [-13.2, 13.2], [13.2, 13.2],
    ]) {
      this.addVoxels(2.4, 0.02, 0.12, x, 0.025, z, 0.12, cornerPaint, 93 + x + z);
    }
  }

  buildProps() {
    const crate = (x, y, z, size = 2, seed = 1) => {
      const paint = (u, v, w) => {
        const edge = Math.abs(u) > 0.34 || Math.abs(v) > 0.34 || Math.abs(w) > 0.34;
        const n = (Math.random() - 0.5) * 0.05;
        if (edge) return [0.25 + n, 0.18 + n, 0.11 + n];
        const wet = Math.random() < 0.06 ? 0.75 : 1;
        return [(0.37 + n) * wet, (0.27 + n) * wet, (0.16 + n) * wet];
      };
      this.addVoxels(size, size, size, x, y, z, 0.5, paint, seed);
      this.addBox(x - size / 2, y - size / 2, z - size / 2, x + size / 2, y + size / 2, z + size / 2);
    };

    const barrier = (x, z, rot, seed) => {
      const paint = () => {
        const n = (Math.random() - 0.5) * 0.05;
        if (Math.random() < 0.3) return [0.32 + n, 0.07 + n, 0.05 + n];
        return Math.random() < 0.2 ? [0.4 + n, 0.31 + n, 0.09 + n] : [0.24 + n, 0.25 + n, 0.22 + n];
      };
      const w = rot ? 1 : 5;
      const d = rot ? 5 : 1;
      this.addVoxels(w, 1.2, d, x, 0.6, z, 0.6, paint, seed);
      this.addBox(x - w / 2, 0, z - d / 2, x + w / 2, 1.2, z + d / 2);
    };

    crate(-8, 1, -6, 2, 21);
    crate(-6, 1, -6, 2, 22);
    crate(-7, 3, -6, 2, 23);
    crate(7, 1, -9, 2, 24);
    crate(7, 1, -7, 2, 25);
    crate(0, 1, -15, 2, 26);
    crate(0, 3, -15, 2, 27);
    crate(12, 1, 5, 2, 28);
    crate(13.6, 1, 6.2, 1.6, 29);
    crate(-13, 1, 9, 2, 30);
    crate(-14.6, 1, 7.6, 1.6, 31);
    crate(15, 1, -14, 2, 32);
    crate(-22, 1, -18, 2, 33);
    crate(-23.6, 1, -16.8, 1.6, 34);
    crate(21, 1, 20, 2, 35);
    crate(22.4, 1, 18.6, 1.6, 36);
    crate(-20, 1, 21, 2, 37);
    crate(23, 1, -5, 2, 38);
    crate(24.3, 1, -3.8, 1.5, 39);

    barrier(-3, 7, false, 41);
    barrier(9, 1, true, 42);
    barrier(-11, -13, false, 43);
    barrier(4, 14, true, 44);
    barrier(16, 12, false, 45);
    barrier(22, 12, false, 46);
    barrier(-22, 8, true, 47);
    barrier(18, -22, false, 48);
    barrier(-18, 22, true, 49);
    barrier(0, 24, false, 50);
    barrier(24, -15, true, 51);

    // dumpster
    const dumpPaint = () => {
      const n = (Math.random() - 0.5) * 0.05;
      if (Math.random() < 0.12) return [0.11 + n, 0.09 + n, 0.08 + n];
      return [0.1 + n, 0.19 + n, 0.14 + n];
    };
    this.addVoxels(2.6, 1.4, 1.4, -15.4, 0.72, 5, 0.35, dumpPaint, 61);
    this.addVoxels(2.7, 0.14, 1.5, -15.4, 1.5, 5, 0.35, () => [0.07, 0.09, 0.08], 62);
    this.addBox(-16.7, 0, 4.3, -14.1, 1.6, 5.7);

    // oil drums
    for (const [dx, dz, seed] of [[10.6, -5.2, 71], [11.5, -4.6, 72], [9.9, -4.4, 73]]) {
      this.addVoxels(0.85, 1.15, 0.85, dx, 0.58, dz, 0.28, () => {
        const n = (Math.random() - 0.5) * 0.04;
        return Math.random() < 0.2 ? [0.24 + n, 0.1 + n, 0.05 + n] : [0.16 + n, 0.19 + n, 0.18 + n];
      }, seed);
      this.addBox(dx - 0.45, 0, dz - 0.45, dx + 0.45, 1.15, dz + 0.45);
    }

    // pallets
    for (const y of [0.08, 0.24]) {
      this.addVoxels(1.6, 0.12, 1.15, 5.4, y, 10.6, 0.25, () => {
        const n = (Math.random() - 0.5) * 0.04;
        return [0.3 + n, 0.21 + n, 0.12 + n];
      }, 81 + y * 10);
    }
    this.addBox(4.6, 0, 10, 6.2, 0.3, 11.2);

    // sandbag wall
    const sand = () => {
      const n = (Math.random() - 0.5) * 0.04;
      return [0.33 + n, 0.28 + n, 0.18 + n];
    };
    this.addVoxels(2.6, 0.5, 1, -5, 0.28, 13.5, 0.3, sand, 91);
    this.addVoxels(2.2, 0.45, 0.9, -5.1, 0.72, 13.5, 0.3, sand, 92);
    this.addVoxels(1.7, 0.4, 0.8, -5.2, 1.1, 13.5, 0.3, sand, 93);
    this.addBox(-6.3, 0, 13, -3.7, 1.3, 14);

    // traffic cones
    const cone = (x, z, seed) => {
      this.addVoxels(0.34, 0.66, 0.34, x, 0.35, z, 0.16, (u, v) => {
        if (v > 0.05 && v < 0.25) return [0.7, 0.6, 0.5];
        return [0.62, 0.16, 0.05];
      }, seed);
    };
    cone(1.6, 7.4, 101);
    cone(2.5, 7.9, 102);
    cone(-9.4, 3.2, 103);

    // burnt car
    const carPaint = (u, v, w) => {
      const n = (Math.random() - 0.5) * 0.04;
      if (Math.abs(v) > 0.32) return [0.09 + n, 0.09 + n, 0.1 + n];
      if (Math.random() < 0.22) return [0.06 + n, 0.05 + n, 0.045 + n];
      return [0.17 + n, 0.075 + n, 0.05 + n];
    };
    this.addVoxels(4.2, 1.05, 1.9, 13.5, 0.66, 8.6, 0.35, carPaint, 111);
    this.addVoxels(2.1, 0.75, 1.7, 13.8, 1.55, 8.6, 0.35, (u, v) => {
      if (Math.abs(v) < 0.2) return [0.08, 0.1, 0.12];
      return [0.08, 0.06, 0.05];
    }, 112);
    for (const wx of [12.2, 14.9]) {
      for (const wz of [7.7, 9.5]) {
        this.addVoxels(0.7, 0.7, 0.35, wx, 0.35, wz, 0.35, () => [0.05, 0.05, 0.055], 120 + wx);
      }
    }
    this.addBox(11.3, 0, 7.5, 15.7, 2, 9.7);

    // streetlights + cables
    const heads = [];
    const lamp = (x, z, seed) => {
      this.addVoxels(0.22, 6, 0.22, x, 3, z, 0.22, () => {
        const g = 0.1 + Math.random() * 0.03;
        return [g, g, g * 1.05];
      }, seed);
      const ax = x + (x < 0 ? 1.3 : -1.3);
      this.addVoxels(1.3, 0.14, 0.14, (x + ax) / 2, 5.95, z, 0.14, () => [0.09, 0.09, 0.1], seed + 1);
      this.addVoxels(0.6, 0.16, 0.32, ax, 5.84, z, 0.16, () => [1.0, 0.62, 0.24], seed + 2, true);
      const light = new THREE.PointLight(0xffb877, 24, 20, 2);
      light.position.set(ax, 5.7, z);
      light.userData.base = 24;
      light.userData.phase = Math.random() * 6.28;
      this.root.add(light);
      this.lights.push(light);
      this.addBox(x - 0.13, 0, z - 0.13, x + 0.13, 6, z + 0.13);
      heads.push(new THREE.Vector3(ax, 5.78, z));
    };
    lamp(-16, -4, 131);
    lamp(15, -13, 141);
    lamp(4, 16, 151);
    lamp(-25, 20, 161);
    lamp(25, -20, 171);

    const cableMat = new THREE.LineBasicMaterial({ color: 0x0a0b0d, transparent: true, opacity: 0.8 });
    for (let i = 0; i < heads.length - 1; i++) {
      const a = heads[i];
      const b = heads[i + 1];
      const pts = [];
      for (let s = 0; s <= 12; s++) {
        const t = s / 12;
        pts.push(
          new THREE.Vector3(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * 0.85,
            a.z + (b.z - a.z) * t,
          ),
        );
      }
      this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
    }

    // support pillars
    const pillars = [
      [-18, -18],
      [18, -18],
      [-18, 18],
      [18, 18],
      [-27, -3],
      [27, 4],
      [-4, 27],
      [5, -27],
    ];
    pillars.forEach(([px, pz], i) => {
      this.addVoxels(1.4, 5, 1.4, px, 2.5, pz, 0.7, () => {
        const g = 0.27 + Math.random() * 0.03;
        return [g, g, g * 0.94];
      }, 50 + i);
      this.addBox(px - 0.7, 0, pz - 0.7, px + 0.7, 5, pz + 0.7);
    });
  }

  /** A solid room wall with an arbitrary custom paint pass. */
  wallSegment(x1, z1, x2, z2, height = 3.2, seed = 1, paint = null) {
    const ax = Math.min(x1, x2);
    const bx = Math.max(x1, x2);
    const az = Math.min(z1, z2);
    const bz = Math.max(z1, z2);
    const w = Math.max(0.5, bx - ax);
    const d = Math.max(0.5, bz - az);
    const wallpaper =
      paint ||
      ((u, v) => {
        const n = (Math.random() - 0.5) * 0.04;
        if (v < -0.32) return [0.16 + n, 0.13 + n, 0.1 + n];
        if (this.map === 'hospital' && Math.abs(v) > 0.43) return [0.34 + n, 0.43 + n, 0.38 + n];
        return [0.39 + n, 0.36 + n, 0.3 + n];
      });
    this.addVoxels(w, height, d, (ax + bx) / 2, height / 2, (az + bz) / 2, 0.55, wallpaper, seed);
    this.addBox(ax, 0, az, bx, height, bz);
  }

  addRoomBlock(x1, y1, z1, x2, y2, z2, color, seed = 1, solid = true) {
    const w = Math.max(0.08, x2 - x1);
    const h = Math.max(0.08, y2 - y1);
    const d = Math.max(0.08, z2 - z1);
    this.addVoxels(w, h, d, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, 0.4, () => {
      const n = (Math.random() - 0.5) * 0.05;
      return [color[0] + n, color[1] + n, color[2] + n];
    }, seed);
    if (solid) this.addBox(x1, y1, z1, x2, y2, z2);
  }

  addRoomLight(x, y, z, color = 0xffc58b, intensity = 18, distance = 14) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    light.userData.base = intensity;
    light.userData.phase = Math.random() * 6.28;
    this.root.add(light);
    this.lights.push(light);
  }

  wallRunX(x, zStart, zEnd, gaps, seed, paint = null) {
    let start = zStart;
    for (const [a, b] of gaps) {
      if (a > start) this.wallSegment(x - 0.28, start, x + 0.28, a, 3.2, seed++, paint);
      start = Math.max(start, b);
    }
    if (start < zEnd) this.wallSegment(x - 0.28, start, x + 0.28, zEnd, 3.2, seed++, paint);
  }

  /** A real suburban house: siding, pitched roof, glazed windows and a porch. */
  buildHouse() {
    const exterior = (u, v) => {
      const n = (Math.random() - 0.5) * 0.035;
      if (v < -0.36) return [0.2 + n, 0.19 + n, 0.17 + n];
      const course = ((v + 0.5) * 13) % 1;
      const edge = course < 0.13 ? 0.72 : 1;
      const weather = Math.random() < 0.07 ? 0.84 : 1;
      const g = (0.35 + n) * edge * weather;
      return [g * 0.94, g * 1.04, g * 0.98];
    };
    const interior = (u, v) => {
      const n = (Math.random() - 0.5) * 0.03;
      if (v < -0.34) return [0.16 + n, 0.12 + n, 0.08 + n];
      if (Math.random() < 0.04) return [0.34 + n, 0.29 + n, 0.22 + n];
      return [0.5 + n, 0.46 + n, 0.38 + n];
    };

    const lambert = (color) => new THREE.MeshLambertMaterial({ color });
    const mats = {
      trim: lambert(0xd6d2c5),
      foundation: lambert(0x4a4a45),
      stone: lambert(0x665f54),
      roof: null,
      roofRidge: lambert(0x242729),
      gable: lambert(0x596159),
      glass: new THREE.MeshPhongMaterial({
        color: 0x1c2b34,
        specular: 0x9fb9c8,
        shininess: 110,
        transparent: true,
        opacity: 0.62,
      }),
      curtain: lambert(0x6d6750),
      curtain2: lambert(0x584e3e),
      metal: lambert(0x2e3030),
      wood: lambert(0x5c3c24),
      woodDark: lambert(0x392619),
      fabric: lambert(0x393a34),
      fabric2: lambert(0x503a2d),
      paper: lambert(0x8f866f),
      bulb: new THREE.MeshBasicMaterial({ color: 0xffd49a, toneMapped: false }),
      brick: lambert(0x573b31),
      leaf: lambert(0x283d27),
      leaf2: lambert(0x31502f),
      bark: lambert(0x3b2d21),
      path: lambert(0x77746a),
      car: lambert(0x342b26),
    };

    const meshBox = (w, h, d, x, y, z, material, opts = {}) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.rotation.x = opts.rx || 0;
      mesh.rotation.y = opts.ry || 0;
      mesh.rotation.z = opts.rz || 0;
      mesh.castShadow = opts.castShadow !== false;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh;
    };

    // Siding, clapboard seams and a stone skirt give the shell a house profile.
    const skirt = (x1, z1, x2, z2) => {
      meshBox(Math.abs(x2 - x1), 0.5, Math.abs(z2 - z1), (x1 + x2) / 2, 0.25, (z1 + z2) / 2, mats.stone);
    };
    skirt(-14.65, 11.25, 14.65, 11.82);
    skirt(-14.65, -11.82, 14.65, -11.25);
    skirt(-14.82, -11.82, -14.25, 11.82);
    skirt(14.25, -11.82, 14.82, 11.82);

    const partialWall = (x1, z1, x2, z2, y1, y2, seed) => {
      const ax = Math.min(x1, x2);
      const bx = Math.max(x1, x2);
      const az = Math.min(z1, z2);
      const bz = Math.max(z1, z2);
      const h = Math.max(0.1, y2 - y1);
      this.addVoxels(
        Math.max(0.5, bx - ax),
        h,
        Math.max(0.5, bz - az),
        (ax + bx) / 2,
        (y1 + y2) / 2,
        (az + bz) / 2,
        0.55,
        exterior,
        seed,
      );
      // A window sill blocks the body but must stay low enough to see over.
      if (y1 < 0.8) this.addBox(ax, y1, az, bx, y2, bz);
    };

    // ---------- exterior shell, with real window and door openings ----------
    // front (z = +11.5)
    this.wallSegment(-14.5, 11.5, -10.5, 11.5, 3.25, 501, exterior);
    partialWall(-10.5, 11.25, -7.8, 11.75, 0, 0.88, 502);
    partialWall(-10.5, 11.25, -7.8, 11.75, 2.2, 3.25, 503);
    this.wallSegment(-7.8, 11.5, -0.95, 11.5, 3.25, 504, exterior);
    partialWall(-0.95, 11.25, 0.95, 11.75, 2.42, 3.25, 505);
    this.wallSegment(0.95, 11.5, 5.8, 11.5, 3.25, 506, exterior);
    partialWall(5.8, 11.25, 8.5, 11.75, 0, 0.88, 507);
    partialWall(5.8, 11.25, 8.5, 11.75, 2.2, 3.25, 508);
    this.wallSegment(8.5, 11.5, 14.5, 11.5, 3.25, 509, exterior);

    // back (z = -11.5)
    this.wallSegment(-14.5, -11.5, -12.4, -11.5, 3.25, 510, exterior);
    partialWall(-12.4, -11.75, -9.8, -11.25, 0, 0.88, 511);
    partialWall(-12.4, -11.75, -9.8, -11.25, 2.2, 3.25, 512);
    this.wallSegment(-9.8, -11.5, 2.9, -11.5, 3.25, 513, exterior);
    partialWall(2.9, -11.75, 5.7, -11.25, 0, 0.88, 514);
    partialWall(2.9, -11.75, 5.7, -11.25, 2.2, 3.25, 515);
    this.wallSegment(5.7, -11.5, 8.7, -11.5, 3.25, 516, exterior);
    partialWall(8.7, -11.75, 10.9, -11.25, 2.42, 3.25, 517);
    this.wallSegment(10.9, -11.5, 14.5, -11.5, 3.25, 518, exterior);

    // left and right walls
    this.wallSegment(-14.5, -11.5, -14.5, -8.1, 3.25, 519, exterior);
    partialWall(-14.75, -8.1, -14.25, -5.4, 0, 0.88, 520);
    partialWall(-14.75, -8.1, -14.25, -5.4, 2.2, 3.25, 521);
    this.wallSegment(-14.5, -5.4, -14.5, 4.0, 3.25, 522, exterior);
    partialWall(-14.75, 4.0, -14.25, 6.8, 0, 0.88, 523);
    partialWall(-14.75, 4.0, -14.25, 6.8, 2.2, 3.25, 524);
    this.wallSegment(-14.5, 6.8, -14.5, 11.5, 3.25, 525, exterior);

    this.wallSegment(14.5, -11.5, 14.5, -8.6, 3.25, 526, exterior);
    partialWall(14.25, -8.6, 14.75, -5.9, 0, 0.88, 527);
    partialWall(14.25, -8.6, 14.75, -5.9, 2.2, 3.25, 528);
    this.wallSegment(14.5, -5.9, 14.5, 4.4, 3.25, 529, exterior);
    partialWall(14.25, 4.4, 14.75, 7.2, 0, 0.88, 530);
    partialWall(14.25, 4.4, 14.75, 7.2, 2.2, 3.25, 531);
    this.wallSegment(14.5, 7.2, 14.5, 11.5, 3.25, 532, exterior);

    // white corner boards and a continuous eave band
    for (const [x, z] of [[-14.56, 11.56], [14.56, 11.56], [-14.56, -11.56], [14.56, -11.56]]) {
      meshBox(0.16, 3.22, 0.16, x, 1.61, z, mats.trim);
    }
    meshBox(29.4, 0.18, 0.16, 0, 3.19, 11.78, mats.trim);
    meshBox(29.4, 0.18, 0.16, 0, 3.19, -11.78, mats.trim);
    meshBox(0.16, 0.18, 23.4, -14.78, 3.19, 0, mats.trim);
    meshBox(0.16, 0.18, 23.4, 14.78, 3.19, 0, mats.trim);

    // ---------- windows ----------
    const trimWindow = (facing, at, center, width, outDir, upper) => {
      const sill = 0.88;
      const top = 2.2;
      const h = top - sill;
      const mid = (top + sill) / 2;
      const face = at + outDir * 0.34;
      const inside = at - outDir * 0.32;
      if (facing === 'z') {
        meshBox(width, h, 0.035, center, mid, at, mats.glass, { castShadow: false });
        meshBox(width + 0.28, 0.13, 0.18, center, sill - 0.02, face, mats.trim);
        meshBox(width + 0.28, 0.13, 0.18, center, top + 0.02, face, mats.trim);
        meshBox(0.13, h + 0.28, 0.18, center - width / 2 - 0.07, mid, face, mats.trim);
        meshBox(0.13, h + 0.28, 0.18, center + width / 2 + 0.07, mid, face, mats.trim);
        meshBox(0.055, h, 0.08, center, mid, face + outDir * 0.025, mats.trim);
        meshBox(width, 0.055, 0.08, center, mid, face + outDir * 0.025, mats.trim);
        meshBox(width + 0.44, 0.055, 0.055, center, top + 0.17, inside, mats.metal);
        meshBox(width * 0.22, h * 0.94, 0.06, center - width * 0.31, mid, inside, upper ? mats.curtain2 : mats.curtain);
        meshBox(width * 0.22, h * 0.94, 0.06, center + width * 0.31, mid, inside, upper ? mats.curtain2 : mats.curtain);
      } else {
        meshBox(0.035, h, width, at, mid, center, mats.glass, { castShadow: false });
        meshBox(0.18, 0.13, width + 0.28, face, sill - 0.02, center, mats.trim);
        meshBox(0.18, 0.13, width + 0.28, face, top + 0.02, center, mats.trim);
        meshBox(0.18, h + 0.28, 0.13, face, mid, center - width / 2 - 0.07, mats.trim);
        meshBox(0.18, h + 0.28, 0.13, face, mid, center + width / 2 + 0.07, mats.trim);
        meshBox(0.08, h, 0.055, face + outDir * 0.025, mid, center, mats.trim);
        meshBox(0.08, 0.055, width, face + outDir * 0.025, mid, center, mats.trim);
        meshBox(0.055, 0.055, width + 0.44, inside, top + 0.17, center, mats.metal);
        meshBox(0.06, h * 0.94, width * 0.22, inside, mid, center - width * 0.31, upper ? mats.curtain2 : mats.curtain);
        meshBox(0.06, h * 0.94, width * 0.22, inside, mid, center + width * 0.31, upper ? mats.curtain2 : mats.curtain);
      }
    };
    trimWindow('z', 11.5, -9.15, 2.3, 1, false);
    trimWindow('z', 11.5, 7.15, 2.3, 1, false);
    trimWindow('z', -11.5, -11.1, 2.2, -1, false);
    trimWindow('z', -11.5, 4.3, 2.4, -1, true);
    trimWindow('x', -14.5, -6.75, 2.3, -1, false);
    trimWindow('x', -14.5, 5.4, 2.4, -1, false);
    trimWindow('x', 14.5, -7.25, 2.3, 1, true);
    trimWindow('x', 14.5, 5.8, 2.4, 1, false);

    // ---------- front door, frames and trim ----------
    for (const x of [-1.04, 1.04]) meshBox(0.14, 2.58, 0.18, x, 1.29, 11.82, mats.trim);
    meshBox(2.22, 0.14, 0.18, 0, 2.51, 11.82, mats.trim);
    meshBox(2.0, 0.08, 0.5, 0, 0.04, 11.5, mats.woodDark);
    const doorPivot = new THREE.Group();
    doorPivot.position.set(0.93, 0, 11.37);
    doorPivot.rotation.y = -1.18;
    this.root.add(doorPivot);
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.28, 0.075), mats.wood);
    doorLeaf.position.set(-0.46, 1.16, 0);
    doorLeaf.castShadow = true;
    doorLeaf.receiveShadow = true;
    doorPivot.add(doorLeaf);
    for (const [py, ph] of [[0.73, 0.68], [1.6, 0.92]]) {
      const inset = new THREE.Mesh(new THREE.BoxGeometry(0.64, ph, 0.025), mats.woodDark);
      inset.position.set(-0.46, py, 0.05);
      doorPivot.add(inset);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mats.metal);
    knob.position.set(-0.82, 1.02, 0.075);
    doorPivot.add(knob);

    // back door frame
    for (const x of [8.6, 11.0]) meshBox(0.14, 2.58, 0.18, x, 1.29, -11.82, mats.trim);
    meshBox(2.4, 0.14, 0.18, 9.8, 2.51, -11.82, mats.trim);
    const backDoor = new THREE.Group();
    backDoor.position.set(8.8, 0, -11.37);
    backDoor.rotation.y = 0.96;
    this.root.add(backDoor);
    const backLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.26, 0.07), mats.wood);
    backLeaf.position.set(0.525, 1.15, 0);
    backLeaf.castShadow = true;
    backDoor.add(backLeaf);

    // ---------- interior partitions and casings ----------
    this.wallSegment(-14.5, 2.2, -2.1, 2.2, 3.2, 540, interior);
    this.wallSegment(2.1, 2.2, 14.5, 2.2, 3.2, 541, interior);
    this.wallSegment(-0.28, -11.5, 0.28, -4.2, 3.2, 542, interior);
    this.wallSegment(-0.28, -1.8, 0.28, 2.2, 3.2, 543, interior);
    this.wallSegment(-0.28, 2.2, 0.28, 6.2, 3.2, 544, interior);
    this.wallSegment(-0.28, 8.6, 0.28, 11.5, 3.2, 545, interior);

    const doorCaseZ = (x, z1, z2) => {
      for (const z of [z1, z2]) meshBox(0.16, 2.32, 0.12, x, 1.16, z, mats.trim);
      meshBox(0.16, 0.12, Math.abs(z2 - z1), x, 2.3, (z1 + z2) / 2, mats.trim);
    };
    doorCaseZ(0, -4.2, -1.8);
    doorCaseZ(0, 6.2, 8.6);
    for (const x of [-2.1, 2.1]) meshBox(0.12, 2.32, 0.16, x, 1.16, 2.2, mats.trim);
    meshBox(4.2, 0.12, 0.16, 0, 2.3, 2.2, mats.trim);
    // Fill the wall above each in-house doorway so the openings read as doors,
    // not open slots running up into the ceiling.
    this.addVoxels(0.55, 0.9, 2.4, 0, 2.76, -3.0, 0.5, interior, 546);
    this.addVoxels(0.55, 0.9, 2.4, 0, 2.76, 7.4, 0.5, interior, 547);
    this.addVoxels(4.2, 0.9, 0.55, 0, 2.76, 2.2, 0.5, interior, 548);

    // interior doors, folded back against the wall
    const interiorDoor = (x, z, ry) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0, z);
      pivot.rotation.y = ry;
      this.root.add(pivot);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.18, 0.065), mats.wood);
      leaf.position.set(0.46, 1.09, 0);
      leaf.castShadow = true;
      pivot.add(leaf);
    };
    interiorDoor(0.18, -2.0, -1.32);
    interiorDoor(-0.18, 6.4, 1.32);
    interiorDoor(-2.0, 2.12, 1.42);

    // ---------- ceiling, roof and gables ----------
    meshBox(28.6, 0.09, 22.6, 0, 3.25, 0, mats.paper, { castShadow: false });
    // crown moulding and baseboards make the rooms read as finished interior space
    for (const z of [11.18, -11.18]) {
      meshBox(28.2, 0.14, 0.1, 0, 3.12, z, mats.trim, { castShadow: false });
      meshBox(28.2, 0.16, 0.1, 0, 0.09, z, mats.trim, { castShadow: false });
    }
    for (const x of [-14.18, 14.18]) {
      meshBox(0.1, 0.14, 22.2, x, 3.12, 0, mats.trim, { castShadow: false });
      meshBox(0.1, 0.16, 22.2, x, 0.09, 0, mats.trim, { castShadow: false });
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#24282a';
    ctx.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      const y = row * 16;
      ctx.fillStyle = row % 2 ? '#2e3233' : '#292d2f';
      ctx.fillRect(0, y + 1, 128, 14);
      ctx.strokeStyle = '#15181a';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y);
      ctx.stroke();
      for (let col = row % 2 ? 10 : 26; col < 128; col += 32) {
        ctx.beginPath();
        ctx.moveTo(col, y + 2);
        ctx.lineTo(col, y + 15);
        ctx.stroke();
      }
    }
    const shingle = new THREE.CanvasTexture(canvas);
    shingle.wrapS = shingle.wrapT = THREE.RepeatWrapping;
    shingle.repeat.set(7, 3);
    shingle.colorSpace = THREE.SRGBColorSpace;
    mats.roof = new THREE.MeshLambertMaterial({ map: shingle, color: 0x8a8b84 });

    const rise = 3.1;
    const run = 15.35;
    const slope = Math.hypot(run, rise);
    const angle = Math.atan2(rise, run);
    const roofDepth = 25.2;
    const roof = (side) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.17, roofDepth), mats.roof);
      panel.position.set(side * run * 0.5, 3.3 + rise * 0.5, 0);
      panel.rotation.z = -side * angle;
      panel.castShadow = true;
      panel.receiveShadow = true;
      this.root.add(panel);
      return panel;
    };
    roof(1);
    roof(-1);
    meshBox(0.38, 0.2, roofDepth + 0.15, 0, 3.3 + rise, 0, mats.roofRidge);
    meshBox(0.17, 0.24, roofDepth, 15.38, 3.22, 0, mats.trim);
    meshBox(0.17, 0.24, roofDepth, -15.38, 3.22, 0, mats.trim);
    meshBox(0.2, 0.15, roofDepth, 15.47, 3.36, 0, mats.metal);
    meshBox(0.2, 0.15, roofDepth, -15.47, 3.36, 0, mats.metal);

    const gable = (z, facing) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-14.5, 3.25, z, 14.5, 3.25, z, 0, 6.35, z], 3),
      );
      geo.setIndex(facing > 0 ? [0, 1, 2] : [2, 1, 0]);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x566057, side: THREE.DoubleSide }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    };
    gable(11.79, 1);
    gable(-11.79, -1);
    for (const z of [11.88, -11.88]) {
      meshBox(0.16, 3.0, 0.16, 0, 4.8, z, mats.trim);
      meshBox(0.7, 0.52, 0.08, 0, 4.45, z + (z > 0 ? 0.02 : -0.02), mats.woodDark, { castShadow: false });
      for (let i = 0; i < 4; i++) meshBox(0.58, 0.035, 0.1, 0, 4.27 + i * 0.1, z + (z > 0 ? 0.07 : -0.07), mats.metal, { castShadow: false });
    }
    for (const side of [-1, 1]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(15.0, 0.15, 0.18), mats.trim);
      trim.position.set((side * run) / 2, 4.8, 11.86);
      trim.rotation.z = -side * angle;
      trim.castShadow = true;
      this.root.add(trim);
      const backTrim = trim.clone();
      backTrim.position.z = -11.86;
      this.root.add(backTrim);
    }

    // brick chimney and a capped flue
    meshBox(1.2, 4.0, 1.3, -7.2, 4.75, -2.4, mats.brick);
    meshBox(1.45, 0.2, 1.5, -7.2, 6.8, -2.4, mats.stone);
    meshBox(0.55, 0.75, 0.55, -7.2, 7.25, -2.4, mats.metal);

    // ---------- covered porch and front steps ----------
    meshBox(7.7, 0.34, 3.0, 0, 0.17, 13.0, mats.woodDark);
    this.addBox(-3.85, 0, 11.5, 3.85, 0.34, 14.5);
    meshBox(2.4, 0.17, 0.55, 0, 0.085, 14.78, mats.path);
    this.addBox(-1.2, 0, 14.5, 1.2, 0.17, 15.05);
    for (const x of [-3.55, 3.55]) {
      meshBox(0.18, 3.05, 0.18, x, 1.52, 14.16, mats.trim);
      this.addBox(x - 0.09, 0, 14.07, x + 0.09, 3.05, 14.25);
    }
    meshBox(7.65, 0.17, 0.17, 0, 3.04, 14.16, mats.trim);
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.14, 3.55), mats.roof);
    porchRoof.position.set(0, 3.28, 13.24);
    porchRoof.rotation.x = 0.115;
    porchRoof.castShadow = true;
    porchRoof.receiveShadow = true;
    this.root.add(porchRoof);
    meshBox(7.9, 0.05, 0.1, 0, 3.02, 14.9, mats.metal);
    const porchLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.28, 8), mats.bulb);
    porchLamp.position.set(0, 2.84, 12.4);
    this.root.add(porchLamp);
    this.addRoomLight(0, 2.7, 13.1, 0xffc27b, 22, 11);

    // brass house number beside the door
    meshBox(0.48, 0.28, 0.04, -1.55, 1.82, 11.82, mats.woodDark, { castShadow: false });
    for (let i = 0; i < 2; i++) meshBox(0.1, 0.16, 0.02, -1.67 + i * 0.16, 1.82, 11.845, mats.trim, { castShadow: false });

    // ---------- walkway, landscaping and yard detail ----------
    for (let i = 0; i < 8; i++) {
      const z = 15.2 + i * 1.25;
      const x = (i % 2 ? 0.18 : -0.18);
      meshBox(2.15 - (i % 3) * 0.09, 0.07, 0.92, x, 0.035, z, mats.path, { castShadow: false });
    }
    const shrub = (x, z, s, seed) => {
      const geo = new THREE.IcosahedronGeometry(s, 1);
      const mesh = new THREE.Mesh(geo, seed % 2 ? mats.leaf : mats.leaf2);
      mesh.position.set(x, s * 0.7, z);
      mesh.scale.y = 0.78;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    };
    for (const [x, z, s] of [[-11.5, 12.1, 0.52], [-8.5, 12.15, 0.44], [-4.4, 12.05, 0.38], [4.5, 12.1, 0.5], [9.5, 12.15, 0.42], [12.4, 12.1, 0.35]]) shrub(x, z, s, Math.floor(x * 10));

    const tree = (x, z, h, seed) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 7), mats.bark);
      trunk.position.set(x, h / 2, z);
      trunk.castShadow = true;
      this.root.add(trunk);
      for (let i = 0; i < 3; i++) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55 - i * 0.2, 1), seed % 2 ? mats.leaf : mats.leaf2);
        crown.position.set(x + (Math.random() - 0.5) * 0.9, h * 0.74 + i * 0.6, z + (Math.random() - 0.5) * 0.9);
        crown.castShadow = true;
        crown.receiveShadow = true;
        this.root.add(crown);
      }
    };
    tree(-20.5, 18.5, 5.4, 1);
    tree(20.5, 19.2, 4.8, 2);
    tree(-19.5, -17.5, 5.9, 3);
    tree(18.4, -18.4, 4.4, 4);

    // mailbox, driveway and a rusting garden shed silhouette
    meshBox(0.16, 1.25, 0.16, 3.3, 0.63, 20.2, mats.wood);
    meshBox(0.62, 0.42, 0.95, 3.3, 1.18, 20.2, mats.metal);
    meshBox(0.06, 0.32, 0.06, 3.55, 1.55, 20.2, mats.metal);
    meshBox(6.6, 0.045, 12.0, 10.8, 0.02, 18.2, mats.path, { castShadow: false });
    meshBox(4.2, 2.4, 3.6, -21.0, 1.2, 21.4, mats.woodDark);
    const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.16, 4.0), mats.roof);
    shedRoof.position.set(-21.0, 2.55, 21.4);
    shedRoof.rotation.z = 0.06;
    shedRoof.castShadow = true;
    this.root.add(shedRoof);
    this.addBox(-23.1, 0, 19.6, -18.9, 2.4, 23.2);

    // ---------- furniture: living room ----------
    meshBox(5.4, 0.035, 4.1, -8.0, 0.045, 8.0, mats.fabric2, { castShadow: false });
    this.addRoomBlock(-10.4, 0, 6.3, -5.6, 0.55, 7.5, [0.2, 0.23, 0.24], 601);
    this.addRoomBlock(-10.4, 0.55, 7.1, -5.6, 1.25, 7.8, [0.16, 0.19, 0.2], 602, false);
    this.addRoomBlock(-9.9, 0.55, 6.2, -9.2, 1.0, 7.0, [0.18, 0.21, 0.22], 603, false);
    this.addRoomBlock(-6.8, 0.55, 6.2, -6.1, 1.0, 7.0, [0.18, 0.21, 0.22], 604, false);
    this.addRoomBlock(-9.4, 0, 4.7, -6.6, 0.42, 5.8, [0.25, 0.18, 0.12], 605);
    this.addRoomBlock(-10.5, 0, 10.9, -6.0, 0.7, 11.35, [0.13, 0.12, 0.11], 606);
    this.addRoomBlock(-9.8, 0.7, 11.05, -6.7, 1.65, 11.18, [0.06, 0.07, 0.08], 607, false);
    meshBox(0.14, 2.0, 0.14, -12.1, 1.0, 8.7, mats.metal);
    meshBox(0.75, 0.52, 0.75, -12.1, 2.1, 8.7, mats.curtain);
    this.addRoomLight(-12.1, 2.05, 8.7, 0xffb96d, 7, 5);
    meshBox(3.9, 1.7, 0.34, -13.95, 0.85, 5.1, mats.woodDark);
    for (let shelf = 0; shelf < 4; shelf++) meshBox(3.7, 0.06, 0.38, -13.95, 0.25 + shelf * 0.43, 5.1, mats.wood);
    for (let b = 0; b < 15; b++) meshBox(0.2, 0.28, 0.18, -15.1 + b * 0.24, 0.48 + (b % 2) * 0.43, 4.9, b % 3 ? mats.fabric : mats.paper, { castShadow: false });
    meshBox(2.6, 1.25, 0.1, -8.0, 2.15, 11.16, mats.woodDark, { castShadow: false });
    meshBox(2.35, 1.0, 0.06, -8.0, 2.15, 11.1, mats.curtain, { castShadow: false });

    // ---------- furniture: dining room ----------
    this.addRoomBlock(4.8, 0.7, 6.5, 10.2, 0.88, 8.7, [0.3, 0.19, 0.11], 611);
    this.addRoomBlock(5.1, 0, 6.8, 5.55, 0.7, 8.4, [0.19, 0.12, 0.075], 612, false);
    this.addRoomBlock(9.45, 0, 6.8, 9.9, 0.7, 8.4, [0.19, 0.12, 0.075], 613, false);
    for (const [x, z] of [[5.8, 9.5], [8.8, 9.5], [5.8, 5.8], [8.8, 5.8]]) {
      this.addRoomBlock(x, 0, z, x + 0.85, 0.48, z + 0.75, [0.2, 0.14, 0.09], 640 + x, false);
      this.addRoomBlock(x, 0.48, z + 0.58, x + 0.85, 1.2, z + 0.75, [0.2, 0.14, 0.09], 650 + x, false);
    }
    meshBox(0.1, 0.42, 2.1, 7.55, 2.5, 7.6, mats.metal);
    meshBox(0.8, 0.28, 0.8, 7.55, 2.2, 7.6, mats.curtain);
    this.addRoomLight(7.5, 2.1, 7.6, 0xffc88f, 12, 8);
    this.addRoomBlock(12.5, 0, 5.0, 14.05, 1.05, 6.2, [0.23, 0.15, 0.1], 660);
    meshBox(1.3, 0.9, 0.08, 13.3, 2.1, 5.95, mats.woodDark, { castShadow: false });
    meshBox(1.1, 0.72, 0.05, 13.3, 2.1, 5.9, mats.paper, { castShadow: false });

    // ---------- kitchen ----------
    this.addRoomBlock(-13.9, 0, -11.0, -2.0, 0.92, -10.1, [0.34, 0.31, 0.26], 621);
    this.addRoomBlock(-13.9, 0.92, -11.05, -2.0, 1.0, -10.15, [0.18, 0.16, 0.14], 622, false);
    for (let i = 0; i < 8; i++) {
      const x = -13.4 + i * 1.35;
      this.addRoomBlock(x, 1.75, -11.2, x + 1.15, 2.62, -10.45, [0.31, 0.27, 0.21], 670 + i);
    }
    this.addRoomBlock(-13.7, 0, -8.4, -11.9, 1.85, -7.0, [0.22, 0.25, 0.24], 623);
    meshBox(0.95, 0.06, 0.6, -13.8, 1.9, -7.7, mats.metal);
    this.addRoomBlock(-13.3, 0.92, -10.6, -11.6, 0.98, -9.9, [0.16, 0.18, 0.18], 624, false);
    meshBox(1.1, 0.06, 0.42, -12.45, 1.03, -10.2, mats.metal);
    meshBox(0.55, 0.3, 0.42, -12.55, 1.08, -10.2, mats.metal);
    for (const x of [-8.5, -7.4]) meshBox(0.54, 0.06, 0.54, x, 0.96, -10.5, mats.metal);
    for (const x of [-8.45, -7.45]) for (const z of [-10.55, -10.45]) meshBox(0.12, 0.05, 0.12, x, 1.02, z, mats.roofRidge);
    this.addRoomBlock(-9.6, 0, -7.9, -4.4, 0.86, -6.6, [0.3, 0.23, 0.16], 625);
    this.addRoomBlock(-9.4, 0.86, -7.75, -4.6, 0.94, -6.75, [0.47, 0.4, 0.31], 626, false);
    for (const x of [-7.7, -6.8, -5.9]) {
      meshBox(0.08, 0.6, 0.08, x, 1.24, -6.9, mats.metal);
      meshBox(0.5, 0.1, 0.5, x, 1.55, -6.9, mats.curtain2);
    }
    this.addRoomLight(-7.1, 2.25, -7.1, 0xffbd79, 13, 8);

    // ---------- bedroom ----------
    this.addRoomBlock(2.2, 0, -10.4, 5.7, 0.55, -5.4, [0.18, 0.16, 0.16], 631);
    this.addRoomBlock(2.35, 0.55, -10.2, 5.55, 0.86, -5.6, [0.5, 0.44, 0.37], 632, false);
    this.addRoomBlock(2.1, 0.5, -10.45, 5.8, 1.25, -10.2, [0.24, 0.16, 0.11], 633, false);
    meshBox(2.65, 0.055, 1.0, 3.95, 0.92, -6.2, mats.fabric, { castShadow: false });
    meshBox(0.7, 0.16, 0.42, 2.85, 0.83, -9.9, mats.trim);
    meshBox(0.65, 0.13, 0.38, 5.0, 0.82, -9.9, mats.trim);
    this.addRoomBlock(11.2, 0, -10.9, 13.9, 1.9, -9.7, [0.27, 0.21, 0.15], 634);
    this.addRoomBlock(12.8, 0, -7.4, 14.1, 2.28, -5.9, [0.22, 0.16, 0.11], 635);
    meshBox(5.0, 0.035, 3.5, 7.9, 0.045, -7.7, mats.fabric2, { castShadow: false });
    meshBox(0.14, 1.6, 0.14, 10.6, 0.8, -7.4, mats.metal);
    meshBox(0.62, 0.42, 0.62, 10.6, 1.7, -7.4, mats.curtain);
    this.addRoomLight(10.6, 1.65, -7.4, 0xffb46c, 7, 5);
    meshBox(1.6, 1.2, 0.08, 3.0, 2.0, -11.16, mats.woodDark, { castShadow: false });
    meshBox(1.4, 1.0, 0.05, 3.0, 2.0, -11.1, mats.curtain, { castShadow: false });

    // hallway console and a mirror
    meshBox(1.6, 0.72, 0.4, 0.7, 0.36, 9.5, mats.wood);
    meshBox(0.45, 0.72, 0.08, 0.7, 1.75, 11.16, mats.woodDark, { castShadow: false });
    meshBox(0.32, 0.55, 0.04, 0.7, 1.75, 11.1, mats.glass, { castShadow: false });
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.26, 8), mats.curtain);
    vase.position.set(0.35, 0.84, 9.5);
    this.root.add(vase);

    // room lights tucked under the new ceiling
    this.addRoomLight(-7.5, 2.72, 7.2, 0xffbd7b, 24, 13);
    this.addRoomLight(7.0, 2.72, 5.0, 0xffc489, 21, 13);
    this.addRoomLight(-7.0, 2.72, -5.5, 0xffd09a, 19, 12);
    this.addRoomLight(8.0, 2.72, -5.2, 0xffad73, 18, 11);
    this.addRoomLight(-7.0, 2.72, -9.0, 0xffd5a3, 16, 10);
    for (const [x, z] of [[-7.5, 7.2], [7.0, 5.0], [-7.0, -5.5], [8.0, -5.2]]) {
      meshBox(0.5, 0.1, 0.5, x, 3.1, z, mats.metal);
      const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), mats.bulb);
      bulb.position.set(x, 2.98, z);
      this.root.add(bulb);
    }
  }

  buildHospital() {
    const wall = (u, v) => {
      const n = (Math.random() - 0.5) * 0.03;
      if (v < -0.35) return [0.17 + n, 0.21 + n, 0.19 + n];
      if (Math.random() < 0.035) return [0.27 + n, 0.31 + n, 0.28 + n];
      return [0.43 + n, 0.47 + n, 0.45 + n];
    };
    const tileGreen = (u, v) => {
      const n = (Math.random() - 0.5) * 0.03;
      if (v > 0.4) return [0.19 + n, 0.34 + n, 0.29 + n];
      return [0.38 + n, 0.43 + n, 0.4 + n];
    };

    // main shell, wide emergency entrance at the front
    this.wallSegment(-19, 14.5, -3.1, 14.5, 3.4, 701, wall);
    this.wallSegment(3.1, 14.5, 19, 14.5, 3.4, 702, wall);
    this.wallSegment(-19, -14.5, 19, -14.5, 3.4, 703, wall);
    this.wallSegment(-19, -14.5, -19, 14.5, 3.4, 704, wall);
    this.wallSegment(19, -14.5, 19, 14.5, 3.4, 705, wall);

    // twin ward walls with multiple doorways onto the central corridor
    this.wallRunX(-4.6, -14.5, 14.5, [[-10, -7.5], [-2.2, 0.2], [5.5, 8.2]], 710, wall);
    this.wallRunX(4.6, -14.5, 14.5, [[-11, -8.5], [-4.6, -2.1], [3.0, 5.8], [10.0, 12.5]], 730, wall);

    // ward dividers leave broad rooms and keep sightlines broken
    this.wallSegment(-19, -7.8, -6.1, -7.8, 3.0, 750, wall);
    this.wallSegment(-19, 3.4, -6.1, 3.4, 3.0, 751, wall);
    this.wallSegment(6.1, -8.2, 19, -8.2, 3.0, 752, wall);
    this.wallSegment(6.1, 4.1, 19, 4.1, 3.0, 753, wall);

    // reception counter and waiting chairs
    this.addRoomBlock(5.2, 0, 8.0, 12.2, 1.15, 9.0, [0.34, 0.28, 0.2], 760);
    this.addRoomBlock(5.7, 1.15, 8.12, 11.7, 1.25, 8.95, [0.18, 0.15, 0.12], 761, false);
    for (const x of [-10.5, -8.8, -7.1]) {
      this.addRoomBlock(x, 0, 11.8, x + 1.1, 0.55, 12.7, [0.15, 0.25, 0.28], 770 + x * 10);
      this.addRoomBlock(x, 0.55, 12.45, x + 1.1, 1.15, 12.75, [0.12, 0.2, 0.24], 780 + x * 10);
    }

    // beds, gurneys and IV stands
    const bed = (x, z, seed, turned = false) => {
      const w = turned ? 2.5 : 1.15;
      const d = turned ? 1.15 : 2.5;
      this.addRoomBlock(x - w / 2, 0.35, z - d / 2, x + w / 2, 0.6, z + d / 2, [0.52, 0.53, 0.5], seed);
      this.addRoomBlock(x - w / 2 + 0.08, 0.6, z - d / 2 + 0.08, x + w / 2 - 0.08, 0.69, z + d / 2 - 0.08, [0.62, 0.61, 0.56], seed + 1, false);
      this.addRoomBlock(x - w / 2 - 0.04, 0, z - d / 2 - 0.04, x - w / 2 + 0.04, 0.55, z + d / 2 + 0.04, [0.2, 0.24, 0.24], seed + 2, false);
      this.addRoomBlock(x + w / 2 - 0.04, 0, z - d / 2 - 0.04, x + w / 2 + 0.04, 0.55, z + d / 2 + 0.04, [0.2, 0.24, 0.24], seed + 3, false);
    };
    bed(-13, -10.6, 801);
    bed(-9.5, -10.6, 811);
    bed(-13, -3.5, 821);
    bed(-9.5, -3.5, 831);
    bed(-13, 0.4, 841);
    bed(-9.5, 0.4, 851);
    bed(-13, 8.0, 861);
    bed(-9.5, 8.0, 871);
    bed(13, -11.0, 881);
    bed(16.5, -11.0, 891);
    bed(13, -3.0, 901);
    bed(16.5, -3.0, 911);
    bed(13, 8.8, 921);
    bed(16.5, 8.8, 931);
    this.addRoomBlock(-2.0, 0.45, 4.6, 2.0, 0.95, 6.0, [0.35, 0.38, 0.35], 941);
    this.addRoomBlock(-1.5, 0.95, 4.9, 1.5, 1.05, 5.7, [0.53, 0.54, 0.5], 942, false);
    this.addRoomBlock(1.5, 0, 1.0, 1.7, 1.5, 1.2, [0.22, 0.3, 0.3], 950, false);
    this.addRoomBlock(1.55, 1.5, 0.95, 1.65, 1.6, 1.25, [0.35, 0.48, 0.46], 951, false);

    // curtain rails, cabinets and hospital signage
    for (const z of [-10.8, -3.2, 8.6]) {
      this.addRoomBlock(-17.7, 2.65, z, -6.0, 2.75, z + 0.12, [0.24, 0.27, 0.25], 960 + z * 5, false);
    }
    this.addRoomBlock(-17.8, 0, -14.1, -6.2, 1.7, -13.4, [0.24, 0.3, 0.28], 971);
    this.addRoomBlock(-2.8, 2.75, 13.9, 2.8, 2.85, 14.0, [0.9, 0.18, 0.12], 981, false);
    this.addVoxels(0.45, 0.8, 0.16, 0, 2.2, 14.12, 0.16, () => [0.8, 0.08, 0.05], 982, true);
    this.addVoxels(0.8, 0.45, 0.16, 0, 2.2, 14.12, 0.16, () => [0.8, 0.08, 0.05], 983, true);

    // fluorescent strips and green corridor light
    for (const z of [-10, -4, 2, 8]) {
      this.addVoxels(5.6, 0.1, 0.35, 0, 3.25, z, 0.2, () => [0.78, 0.9, 0.86], 990 + z, true);
      this.addRoomLight(0, 3.05, z, 0xcfe7dc, 17, 12);
    }
    this.addRoomLight(-11, 2.7, 9, 0xa9d3c1, 12, 11);
    this.addRoomLight(12, 2.7, -9, 0xa9d3c1, 12, 11);
  }

  buildSkyline() {
    const city = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const windows = [];
    const count = 30;

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.14;
      const r = 34 + Math.random() * 34;
      const bx = Math.cos(a) * r;
      const bz = Math.sin(a) * r;
      const w = 5 + Math.random() * 9;
      const d = 5 + Math.random() * 9;
      const h = 7 + Math.random() * 24;
      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color().setHSL(0.6, 0.05 + Math.random() * 0.05, 0.07 + Math.random() * 0.06),
      });
      const b = new THREE.Mesh(boxGeo, mat);
      b.position.set(bx, h / 2 - 0.6, bz);
      b.scale.set(w, h, d);
      city.add(b);

      // ruffled rooftop
      if (Math.random() < 0.6) {
        const top = new THREE.Mesh(boxGeo, mat);
        top.position.set(bx + (Math.random() - 0.5) * w * 0.3, h - 0.4, bz);
        top.scale.set(w * 0.35, 1.4, d * 0.35);
        city.add(top);
      }

      const alongX = Math.abs(bx) > Math.abs(bz);
      const nx = alongX ? -Math.sign(bx) : 0;
      const nz = alongX ? 0 : -Math.sign(bz);
      const faceW = alongX ? d : w;
      const cols = Math.max(2, Math.floor(faceW / 2.1));
      const rows = Math.max(2, Math.floor(h / 2.6));
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (Math.random() > 0.42) continue;
          const off = (col + 0.5) / cols - 0.5;
          const px = alongX ? bx + nx * (w / 2 + 0.04) : bx + off * w * 0.8;
          const pz = alongX ? bz + off * d * 0.8 : bz + nz * (d / 2 + 0.04);
          windows.push({
            x: px,
            y: 1.8 + row * 2.5,
            z: pz,
            ry: alongX ? (nx > 0 ? Math.PI / 2 : -Math.PI / 2) : nz > 0 ? 0 : Math.PI,
            warm: Math.random() < 0.7,
          });
          if (windows.length > 620) break;
        }
        if (windows.length > 620) break;
      }
    }

    this.root.add(city);
    this.city = city;

    if (!windows.length) return;
    const winGeo = new THREE.BoxGeometry(0.5, 0.78, 0.09);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const inst = new THREE.InstancedMesh(winGeo, winMat, windows.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    windows.forEach((win, i) => {
      dummy.position.set(win.x, win.y, win.z);
      dummy.rotation.set(0, win.ry, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      col.setHex(win.warm ? 0xffc27a : 0x9fc3ff);
      col.multiplyScalar(0.55 + Math.random() * 0.6);
      inst.setColorAt(i, col);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
    this.root.add(inst);
  }

  buildDust() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 19;
      pos[i * 3 + 1] = 0.3 + Math.random() * 6.5;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * 19;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xc7d2e0,
      size: 0.035,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(geo, mat);
    this.root.add(dust);
    this.dust = dust;
  }

  merge() {
    if (this.map === 'royale' && this.mergeRoyaleChunks()) return;
    const merged = mergeGeometries(this.geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, MAT);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'world';
      this.root.add(mesh);
      this.mesh = mesh;
      this.raycastTargets.push(mesh);
    }
    for (const g of this.geos) g.dispose();
    this.geos = [];

    if (this.glowGeos.length) {
      const glow = mergeGeometries(this.glowGeos, false);
      if (glow) {
        const mesh = new THREE.Mesh(glow, GLOW_MAT);
        mesh.name = 'glow';
        this.root.add(mesh);
      }
    }
    for (const g of this.glowGeos) g.dispose();
    this.glowGeos = [];
  }

  /**
   * The Battle Royale island is too large for one merged draw call: a single
   * mesh would submit every building and every ground voxel even when the
   * player is looking the other way. Merge into a 28m spatial grid instead,
   * preserving the same world/raycast API while letting the renderer and the
   * shadow frustum cull whole districts.
   */
  mergeRoyaleChunks() {
    const groups = new Map();
    for (const geo of this.geos) {
      geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(new THREE.Vector3());
      const key = `${Math.floor(c.x / 28)},${Math.floor(c.z / 28)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(geo);
    }
    let first = null;
    for (const geos of groups.values()) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, MAT);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'world-royale-chunk';
      this.root.add(mesh);
      this.raycastTargets.push(mesh);
      if (!first) first = mesh;
    }
    this.geos = [];
    this.mesh = first;
    if (this.glowGeos.length) {
      const glow = mergeGeometries(this.glowGeos, false);
      if (glow) {
        const mesh = new THREE.Mesh(glow, GLOW_MAT);
        mesh.name = 'glow';
        mesh.frustumCulled = false;
        this.root.add(mesh);
      }
      for (const g of this.glowGeos) g.dispose();
      this.glowGeos = [];
    }
    return true;
  }

  update(dt, focus = null) {
    this.time += dt;
    // Forward rendering pays for every visible point light. Only keep the
    // lights in the player's district active on the large island.
    for (const l of this.lights) {
      if (focus) l.visible = l.position.distanceToSquared(focus) < 42 * 42;
    }
    if (this.dust) this.dust.rotation.y += dt * 0.008;
    for (const l of this.lights) {
      l.intensity = l.userData.base * (0.94 + Math.sin(this.time * 2.6 + l.userData.phase) * 0.05);
    }
  }

  /** True when no solid prop or wall cuts the segment between two points. */
  hasLineOfSight(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    // Hills are real line-of-sight blockers even though their collision is a
    // heightfield rather than thousands of steep voxel boxes.
    if (this.heightAt) {
      for (let i = 1; i < 10; i++) {
        const t = i / 10;
        const hx = a.x + dx * t;
        const hz = a.z + dz * t;
        if (this.heightAt(hx, hz) > a.y + dy * t + 0.25) return false;
      }
    }
    for (const box of this.boxes) {
      if (box.max.y < 0.25) continue;
      let tmin = 0;
      let tmax = 1;
      let misses = false;
      for (const axis of ['x', 'y', 'z']) {
        const start = axis === 'x' ? a.x : axis === 'y' ? a.y : a.z;
        const delta = axis === 'x' ? dx : axis === 'y' ? dy : dz;
        const min = box.min[axis];
        const max = box.max[axis];
        if (Math.abs(delta) < 1e-6) {
          if (start < min || start > max) {
            misses = true;
            break;
          }
          continue;
        }
        let t1 = (min - start) / delta;
        let t2 = (max - start) / delta;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
          misses = true;
          break;
        }
      }
      if (!misses) return false;
    }
    return true;
  }

  /** Highest walkable surface under a circle at (x,z) not above feetY + step. */
  sampleGround(x, z, feetY) {
    let g = this.heightAt ? this.heightAt(x, z) : 0;
    for (const b of this.boxes) {
      if (
        x > b.min.x - 0.3 &&
        x < b.max.x + 0.3 &&
        z > b.min.z - 0.3 &&
        z < b.max.z + 0.3 &&
        b.max.y <= feetY + 0.45 &&
        b.max.y > g
      ) {
        g = b.max.y;
      }
    }
    return g;
  }

  /** Push a circle (XZ) out of solid boxes that are taller than the feet. */
  resolveCircle(pos, radius, feetY = 0) {
    for (const b of this.boxes) {
      if (b.max.y <= feetY + 0.4) continue;
      const minX = b.min.x - radius;
      const maxX = b.max.x + radius;
      const minZ = b.min.z - radius;
      const maxZ = b.max.z + radius;
      if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
      const dxl = pos.x - minX;
      const dxr = maxX - pos.x;
      const dzl = pos.z - minZ;
      const dzr = maxZ - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = minX;
      else if (m === dxr) pos.x = maxX;
      else if (m === dzl) pos.z = minZ;
      else pos.z = maxZ;
    }
    const B = this.bounds;
    pos.x = Math.max(-B, Math.min(B, pos.x));
    pos.z = Math.max(-B, Math.min(B, pos.z));
    return pos;
  }

  randomSpawn(rng = Math.random) {
    const B = this.bounds - 2;
    for (let i = 0; i < 40; i++) {
      const x = (rng() * 2 - 1) * B;
      const z = (rng() * 2 - 1) * B;
      let blocked = false;
      for (const b of this.boxes) {
        if (x > b.min.x - 0.8 && x < b.max.x + 0.8 && z > b.min.z - 0.8 && z < b.max.z + 0.8) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return new THREE.Vector3(x, this.heightAt ? this.heightAt(x, z) : 0, z);
    }
    return new THREE.Vector3(0, this.heightAt ? this.heightAt(0, 0) : 0, 0);
  }
}
