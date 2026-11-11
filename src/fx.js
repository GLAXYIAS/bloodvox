import * as THREE from 'three';
import {
  bloodParticleScale,
  bloodSprayScale,
  bloodDecalScale,
  bloodPersistenceSeconds,
  bloodVisualsEnabled,
  impactVisualsEnabled,
  goreEnabled,
  violenceScale,
} from './settings.js';

const BLOOD_HEX = [0x8e1218, 0x7a0c12, 0xa81a1f, 0x5c070c, 0x6b0f14, 0x9c1015];
const DUST_HEX = [0x6b6459, 0x4e4a44, 0x7c756a];
const FIRE_HEX = [0xffdd9a, 0xff9d42, 0xff5d24, 0xffcb6e];
const SMOKE_HEX = [0x1c1a18, 0x2b2925, 0x46413a];
const HOLE_NORMAL = new THREE.Vector3(0, 0, 1);

function makeBloodTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 19;
    const x = 32 + Math.cos(a) * Math.random() * 15;
    const y = 32 + Math.sin(a) * Math.random() * 15;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.35 + Math.random() * 0.5), r * (0.2 + Math.random() * 0.4), a, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 13; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 14 + Math.random() * 16;
    const x = 32 + Math.cos(a) * r;
    const y = 32 + Math.sin(a) * r;
    const s = 0.7 + Math.random() * 2.1;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * (0.55 + Math.random() * 0.65), a, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(cv);
}

function makeHoleTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(1, 1, 1, 1)');
  grad.addColorStop(0.18, 'rgba(4, 3, 3, 0.98)');
  grad.addColorStop(0.36, 'rgba(18, 15, 13, 0.9)');
  grad.addColorStop(0.56, 'rgba(74, 66, 56, 0.52)');
  grad.addColorStop(0.78, 'rgba(112, 102, 87, 0.16)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 17;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(cv);
}

/**
 * Gore + debris system. Flying chunks are instanced boxes; blood that hits the
 * floor bakes into a persistent voxel splat. Gib chunks stay where they land.
 */
export class FX {
  constructor(scene, world = null) {
    this.scene = scene;
    this.world = world;
    this.maxChunks = 1700;
    this.maxDecals = 2800;
    this.maxHoles = 720;
    this.maxBloodSplats = 1100;
    this.chunks = [];
    this.cursor = 0;
    this.decalCursor = 0;
    this.holeCursor = 0;
    this.bloodCursor = 0;
    this.gibCount = 0;
    this.decalCount = 0;
    this.bulletHoleCount = 0;
    this.bloodSplatCount = 0;
    this.dirtyChunks = false;
    this.dirtyDecals = false;
    this.dirtyHoles = false;
    this.dirtyBlood = false;
    this.decalAges = new Float32Array(this.maxDecals);
    this.decalLives = new Float32Array(this.maxDecals);
    this.splatAges = new Float32Array(this.maxBloodSplats);
    this.splatLives = new Float32Array(this.maxBloodSplats);
    this.decalClock = 0;
    this.blasts = [];
    this.dummy = new THREE.Object3D();
    this.tmpColor = new THREE.Color();
    this._p = new THREE.Vector3();
    this._v = new THREE.Vector3();

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();

    this.chunkMesh = new THREE.InstancedMesh(geo, mat, this.maxChunks);
    this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.count = this.maxChunks;

    this.decalMesh = new THREE.InstancedMesh(geo.clone(), mat.clone(), this.maxDecals);
    this.decalMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decalMesh.frustumCulled = false;
    this.decalMesh.count = this.maxDecals;
    this.decalMesh.receiveShadow = true;

    this.dummy.position.set(0, -500, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();

    // Bullet holes are glued to arbitrary surfaces, unlike the flat floor
    // decals used for blood. A single instanced quad keeps them nearly free.
    this.holeMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: makeHoleTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      this.maxHoles,
    );
    this.holeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.holeMesh.frustumCulled = false;
    this.holeMesh.renderOrder = 2;
    this.holeMesh.count = this.maxHoles;
    for (let i = 0; i < this.maxHoles; i++) this.holeMesh.setMatrixAt(i, this.dummy.matrix);

    // Blood that strikes a wall, crate or door needs to stay there. These are
    // world-space quads oriented to the struck surface, separate from the
    // horizontal pools so the same decal budget is not consumed twice.
    this.bloodMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: makeBloodTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        side: THREE.DoubleSide,
        vertexColors: false,
        toneMapped: true,
      }),
      this.maxBloodSplats,
    );
    this.bloodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bloodMesh.frustumCulled = false;
    this.bloodMesh.renderOrder = 2;
    this.bloodMesh.count = this.maxBloodSplats;
    for (let i = 0; i < this.maxBloodSplats; i++) this.bloodMesh.setMatrixAt(i, this.dummy.matrix);

    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < this.maxChunks; i++) {
      this.chunkMesh.setMatrixAt(i, this.dummy.matrix);
      this.chunkMesh.setColorAt(i, white);
      this.chunks.push({
        active: false,
        resting: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Quaternion(),
        size: 0.04,
        mode: 'blood',
        life: 0,
        color: null,
      });
    }
    for (let i = 0; i < this.maxDecals; i++) {
      this.decalMesh.setMatrixAt(i, this.dummy.matrix);
      this.decalMesh.setColorAt(i, white);
    }
    for (let i = 0; i < this.maxBloodSplats; i++) this.bloodMesh.setColorAt(i, white);

    this.chunkMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.decalMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.bloodMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    scene.add(this.chunkMesh);
    scene.add(this.decalMesh);
    scene.add(this.holeMesh);
    scene.add(this.bloodMesh);
  }

  setInstColor(mesh, index, color) {
    if (Array.isArray(color)) this.tmpColor.setRGB(color[0], color[1], color[2]);
    else this.tmpColor.setHex(color);
    mesh.setColorAt(index, this.tmpColor);
  }

  writeChunk(i, c) {
    this.dummy.position.copy(c.pos);
    this.dummy.quaternion.copy(c.rot);
    this.dummy.scale.setScalar(c.size);
    this.dummy.updateMatrix();
    this.chunkMesh.setMatrixAt(i, this.dummy.matrix);
    this.dirtyChunks = true;
  }

  killChunk(i) {
    const c = this.chunks[i];
    c.active = false;
    c.resting = false;
    this.dummy.position.set(0, -500, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.chunkMesh.setMatrixAt(i, this.dummy.matrix);
    this.dirtyChunks = true;
  }

  spawnChunk(pos, vel, size, color, mode, life) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.maxChunks;
    const c = this.chunks[i];
    c.active = true;
    c.resting = false;
    c.mode = mode;
    c.pos.copy(pos);
    c.vel.copy(vel);
    c.size = size;
    c.life = life;
    c.color = color;
    c.rot.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    ).normalize();
    this.setInstColor(this.chunkMesh, i, color);
    this.writeChunk(i, c);
    return c;
  }

  addDecal(pos, color, size, blood = false) {
    const amount = bloodDecalScale();
    if (blood) {
      if (amount <= 0.01 || Math.random() > Math.min(1, amount)) return;
      size *= 1 + Math.max(0, amount - 1) * 0.55;
    }
    const i = this.decalCursor;
    this.decalCursor = (this.decalCursor + 1) % this.maxDecals;
    this.decalAges[i] = 0;
    this.decalLives[i] = blood ? bloodPersistenceSeconds() : 0;
    this.dummy.position.set(pos.x, 0.012, pos.z);
    this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.dummy.scale.set(size, 0.02, size * (0.55 + Math.random() * 0.9));
    this.dummy.updateMatrix();
    this.decalMesh.setMatrixAt(i, this.dummy.matrix);
    if (Array.isArray(color)) this.tmpColor.setRGB(color[0] * 0.75, color[1] * 0.75, color[2] * 0.75);
    else this.tmpColor.setHex(color).multiplyScalar(0.8);
    this.decalMesh.setColorAt(i, this.tmpColor);
    this.dirtyDecals = true;
    this.decalCount++;
    if (this.decalCount > 99999) this.decalCount = 99999;
  }

  /** A dark, ragged hole punched into any world surface. */
  bulletHole(point, normal, scale = 0.075) {
    if (!impactVisualsEnabled()) return;
    const i = this.holeCursor;
    this.holeCursor = (this.holeCursor + 1) % this.maxHoles;
    this.dummy.position.copy(point).addScaledVector(normal, 0.008);
    this.dummy.quaternion.setFromUnitVectors(HOLE_NORMAL, normal);
    this.dummy.rotateZ(Math.random() * Math.PI * 2);
    this.dummy.scale.set(scale * (1.3 + Math.random() * 0.5), scale * (1.1 + Math.random() * 0.6), 1);
    this.dummy.updateMatrix();
    this.holeMesh.setMatrixAt(i, this.dummy.matrix);
    this.dirtyHoles = true;
    this.bulletHoleCount++;
    if (this.bulletHoleCount > 99999) this.bulletHoleCount = 99999;
  }

  /** Persistent blood sticking to a vertical or arbitrary world surface. */
  bloodSplat(point, normal, size = 0.18) {
    if (!bloodVisualsEnabled()) return;
    const amount = bloodDecalScale();
    if (amount <= 0.01 || Math.random() > Math.min(1, amount)) return;
    size *= 1 + Math.max(0, amount - 1) * 0.55;
    const i = this.bloodCursor;
    this.bloodCursor = (this.bloodCursor + 1) % this.maxBloodSplats;
    this.splatAges[i] = 0;
    this.splatLives[i] = bloodPersistenceSeconds();
    this.dummy.position.copy(point).addScaledVector(normal, 0.006);
    this.dummy.quaternion.setFromUnitVectors(HOLE_NORMAL, normal);
    this.dummy.rotateZ(Math.random() * Math.PI * 2);
    this.dummy.scale.set(
      size * (1.2 + Math.random() * 1.8),
      size * (0.7 + Math.random() * 1.3),
      1,
    );
    this.dummy.updateMatrix();
    this.bloodMesh.setMatrixAt(i, this.dummy.matrix);
    this.tmpColor.setHex(BLOOD_HEX[(Math.random() * BLOOD_HEX.length) | 0]).multiplyScalar(0.72);
    this.bloodMesh.setColorAt(i, this.tmpColor);
    this.dirtyBlood = true;
    this.bloodSplatCount++;
    if (this.bloodSplatCount > 99999) this.bloodSplatCount = 99999;
  }

  /** A pressure-fed directional jet from an actual wound, with fine mist. */
  arterial(point, dir, power = 1) {
    if (!bloodVisualsEnabled()) return;
    const particles = bloodParticleScale();
    const spray = bloodSprayScale();
    if (particles <= 0.01 || spray <= 0.01) return;
    const count = Math.round((10 + power * 14) * particles);
    for (let i = 0; i < count; i++) {
      this._v.copy(dir)
        .multiplyScalar((3.5 + Math.random() * 7) * (0.55 + spray * 0.55))
        .add(this._p.set((Math.random() - 0.5) * 2.2, Math.random() * 2.1, (Math.random() - 0.5) * 2.2));
      this._v.multiplyScalar(0.72 + Math.random() * 0.6 * power);
      this._p.copy(point).addScaledVector(dir, Math.random() * 0.055);
      this.spawnChunk(
        this._p,
        this._v,
        0.014 + Math.random() * 0.032,
        BLOOD_HEX[(Math.random() * BLOOD_HEX.length) | 0],
        'blood',
        2.2 + Math.random() * 2.4,
      );
    }
    for (let i = 0; i < Math.round((5 + power * 5) * particles); i++) {
      this._v.copy(dir).multiplyScalar((1.4 + Math.random() * 3.2) * (0.55 + spray * 0.55));
      this._v.x += (Math.random() - 0.5) * 1.1;
      this._v.y += (Math.random() - 0.2) * 0.9;
      this._v.z += (Math.random() - 0.5) * 1.1;
      this.spawnChunk(point, this._v, 0.008 + Math.random() * 0.012, BLOOD_HEX[0], 'blood', 0.5 + Math.random() * 0.6);
    }
  }

  /** Grenade blast: fire, smoke, an expanding flash and a black scorch. */
  explosion(point, radius = 3.8) {
    for (let i = 0; i < 30; i++) {
      this._v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(3 + Math.random() * 10);
      this._p.copy(point).add(new THREE.Vector3(0, 0.3 + Math.random() * 0.4, 0));
      this.spawnChunk(
        this._p,
        this._v,
        0.025 + Math.random() * 0.065,
        FIRE_HEX[(Math.random() * FIRE_HEX.length) | 0],
        'gib',
        0.18 + Math.random() * 0.35,
      );
    }
    for (let i = 0; i < 24; i++) {
      this._v.set(Math.random() - 0.5, 0.4 + Math.random() * 1.2, Math.random() - 0.5)
        .multiplyScalar(1.2 + Math.random() * 3.4);
      this._p.copy(point).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6));
      this.spawnChunk(
        this._p,
        this._v,
        0.06 + Math.random() * 0.16,
        SMOKE_HEX[(Math.random() * SMOKE_HEX.length) | 0],
        'gib',
        0.65 + Math.random() * 1.25,
      );
    }
    for (let i = 0; i < 4; i++) {
      this.addDecal(
        { x: point.x + (Math.random() - 0.5) * radius * 0.55, z: point.z + (Math.random() - 0.5) * radius * 0.55 },
        0x070605,
        0.35 + Math.random() * 0.65,
      );
    }
    const light = new THREE.PointLight(0xff9a52, 95, radius * 4.5, 2);
    light.position.copy(point).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(light);
    this.blasts.push({ light, life: 0.34, max: 0.34 });
  }

  /** Irregular blood pool forming on the floor under a leaking body. */
  pool(pos, radius = 0.25) {
    if (!bloodVisualsEnabled() || bloodDecalScale() <= 0.01) return;
    const n = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.85;
      this.addDecal(
        { x: pos.x + Math.cos(a) * r, z: pos.z + Math.sin(a) * r },
        BLOOD_HEX[(Math.random() * BLOOD_HEX.length) | 0],
        radius * (0.8 + Math.random() * 0.9),
        true,
      );
    }
  }

  bloodBurst(point, dir, power = 1) {
    if (!bloodVisualsEnabled() || violenceScale() <= 0) return;
    const particles = bloodParticleScale();
    const spray = bloodSprayScale();
    if (particles <= 0.01) return;
    const count = Math.round(26 * power * particles);
    for (let i = 0; i < count; i++) {
      this._v.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.9, Math.random() - 0.5);
      this._v.normalize().multiplyScalar(1.1);
      this._v.addScaledVector(dir, 0.75 + Math.random() * 1.15);
      this._v.normalize().multiplyScalar((2.5 + Math.random() * 8.5) * Math.min(1.6, power) * (0.15 + spray * 0.85));
      this._p.set(
        point.x + (Math.random() - 0.5) * 0.09,
        point.y + (Math.random() - 0.5) * 0.09,
        point.z + (Math.random() - 0.5) * 0.09,
      );
      this.spawnChunk(
        this._p,
        this._v,
        0.018 + Math.random() * 0.04,
        BLOOD_HEX[(Math.random() * BLOOD_HEX.length) | 0],
        'blood',
        1.6 + Math.random() * 2.4,
      );
    }
    // fine mist
    for (let i = 0; i < Math.round(12 * power * particles); i++) {
      this._v.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize();
      this._v.addScaledVector(dir, 1.6).normalize().multiplyScalar((4 + Math.random() * 8) * (0.15 + spray * 0.85));
      this._p.set(point.x, point.y, point.z);
      this.spawnChunk(this._p, this._v, 0.012 + Math.random() * 0.014, BLOOD_HEX[0], 'blood', 0.5 + Math.random() * 0.6);
    }
  }

  gib(pos, dir, colorArr) {
    if (!goreEnabled() || !bloodVisualsEnabled() || violenceScale() <= 0) return;
    this._v.copy(dir).multiplyScalar(2.2 + Math.random() * 4);
    this._v.x += (Math.random() - 0.5) * 4.5;
    this._v.y += Math.random() * 4 + 2;
    this._v.z += (Math.random() - 0.5) * 4.5;
    this.spawnChunk(pos, this._v, 0.045 + Math.random() * 0.045, colorArr, 'gib', 5 + Math.random() * 5);
    this.gibCount++;
  }

  /** Big chunk of flying meat: severed limb bits, skull fragments, torso slabs. */
  meatChunk(pos, dir, color, power = 1) {
    if (!goreEnabled() || !bloodVisualsEnabled() || violenceScale() <= 0) return;
    this._v.copy(dir).multiplyScalar((1.8 + Math.random() * 4) * power);
    this._v.x += (Math.random() - 0.5) * 5 * power;
    this._v.y += (1.4 + Math.random() * 4) * power;
    this._v.z += (Math.random() - 0.5) * 5 * power;
    this.spawnChunk(pos, this._v, 0.09 + Math.random() * 0.11, color, 'gib', 7 + Math.random() * 6);
    this.gibCount++;
  }

  decay(pos, dir) {
    if (!goreEnabled() || !bloodVisualsEnabled()) return;
    this._v.copy(dir).multiplyScalar(0.8 + Math.random() * 1.5);
    this._v.x += (Math.random() - 0.5) * 2;
    this._v.y += Math.random() * 2 + 0.6;
    this._v.z += (Math.random() - 0.5) * 2;
    this.spawnChunk(pos, this._v, 0.03 + Math.random() * 0.03, 0x2a1614, 'gib', 4 + Math.random() * 3);
  }

  dropBlood(pos) {
    if (!bloodVisualsEnabled()) return;
    if (bloodParticleScale() <= 0.01 || Math.random() > Math.min(1, bloodParticleScale())) return;
    this._v.set((Math.random() - 0.5) * 0.2, -0.4, (Math.random() - 0.5) * 0.2);
    this.spawnChunk(pos, this._v, 0.02 + Math.random() * 0.025, BLOOD_HEX[(Math.random() * BLOOD_HEX.length) | 0], 'blood', 5);
  }

  impact(point, normal) {
    if (!impactVisualsEnabled()) return;
    for (let i = 0; i < 6; i++) {
      this._v.copy(normal)
        .multiplyScalar(1 + Math.random() * 2.5)
        .add(this._p.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5));
      this.spawnChunk(point, this._v, 0.02 + Math.random() * 0.05, DUST_HEX[(Math.random() * DUST_HEX.length) | 0], 'gib', 1 + Math.random());
    }
  }

  /** Hot metal chips off armour or a helmet. */
  sparks(point, normal) {
    if (!impactVisualsEnabled()) return;
    for (let i = 0; i < 11; i++) {
      this._v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5)
        .addScaledVector(normal, 1.4)
        .normalize()
        .multiplyScalar(2 + Math.random() * 5);
      this.spawnChunk(
        point,
        this._v,
        0.012 + Math.random() * 0.018,
        i % 3 === 0 ? 0xfff3cf : 0xffb64a,
        'gib',
        0.16 + Math.random() * 0.22,
      );
    }
  }

  shell(pos, right) {
    if (!impactVisualsEnabled()) return;
    this._v.copy(right).multiplyScalar(2.2 + Math.random() * 1.4);
    this._v.y += 1.6 + Math.random();
    this._v.z += (Math.random() - 0.5);
    this.spawnChunk(pos, this._v, 0.018, 0xb0893a, 'gib', 4);
  }

  /** Wipe gore, bullet holes and blast lights when changing arenas. */
  clear() {
    this.dummy.position.set(0, -500, 0);
    this.dummy.quaternion.identity();
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.maxChunks; i++) {
      this.chunks[i].active = false;
      this.chunks[i].resting = false;
      this.chunkMesh.setMatrixAt(i, this.dummy.matrix);
    }
    for (let i = 0; i < this.maxDecals; i++) this.decalMesh.setMatrixAt(i, this.dummy.matrix);
    for (let i = 0; i < this.maxHoles; i++) this.holeMesh.setMatrixAt(i, this.dummy.matrix);
    for (let i = 0; i < this.maxBloodSplats; i++) this.bloodMesh.setMatrixAt(i, this.dummy.matrix);
    this.chunkMesh.instanceMatrix.needsUpdate = true;
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.holeMesh.instanceMatrix.needsUpdate = true;
    this.bloodMesh.instanceMatrix.needsUpdate = true;
    for (const blast of this.blasts) {
      this.scene.remove(blast.light);
      blast.light.dispose?.();
    }
    this.blasts.length = 0;
    this.cursor = 0;
    this.decalCursor = 0;
    this.holeCursor = 0;
    this.bloodCursor = 0;
    this.gibCount = 0;
    this.decalCount = 0;
    this.bulletHoleCount = 0;
    this.bloodSplatCount = 0;
    this.decalAges.fill(0);
    this.decalLives.fill(0);
    this.splatAges.fill(0);
    this.splatLives.fill(0);
    this.decalClock = 0;
    this.dirtyChunks = false;
    this.dirtyDecals = false;
    this.dirtyHoles = false;
    this.dirtyBlood = false;
  }

  expireBloodDecals(dt) {
    this.decalClock += dt;
    if (this.decalClock < 0.25) return;
    const step = this.decalClock;
    this.decalClock = 0;
    this.dummy.position.set(0, -500, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.maxDecals; i++) {
      if (this.decalLives[i] <= 0) continue;
      this.decalAges[i] += step;
      if (this.decalAges[i] < this.decalLives[i]) continue;
      this.decalLives[i] = 0;
      this.decalMesh.setMatrixAt(i, this.dummy.matrix);
      this.dirtyDecals = true;
    }
    for (let i = 0; i < this.maxBloodSplats; i++) {
      if (this.splatLives[i] <= 0) continue;
      this.splatAges[i] += step;
      if (this.splatAges[i] < this.splatLives[i]) continue;
      this.splatLives[i] = 0;
      this.bloodMesh.setMatrixAt(i, this.dummy.matrix);
      this.dirtyBlood = true;
    }
  }

  update(dt) {
    this.expireBloodDecals(dt);
    for (const blast of this.blasts) {
      blast.life -= dt;
      blast.light.intensity = Math.max(0, (blast.life / blast.max) * 95);
    }
    while (this.blasts.length && this.blasts[0].life <= 0) {
      const blast = this.blasts.shift();
      this.scene.remove(blast.light);
      blast.light.dispose?.();
    }

    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c.active || c.resting) continue;
      c.life -= dt;
      if (c.life <= 0) {
        this.killChunk(i);
        continue;
      }
      c.vel.y -= 26 * dt;
      c.vel.multiplyScalar(Math.max(0, 1 - 0.9 * dt));
      c.pos.addScaledVector(c.vel, dt);
      // Blood droplets obey the same world shell as bodies and props. The
      // first surface they enter receives an oriented, persistent splat.
      if (c.mode === 'blood' && this.world?.boxes) {
        let wall = false;
        const r = Math.max(0.012, c.size * 0.5);
        for (const box of this.world.boxes) {
          const cx = Math.max(box.min.x, Math.min(c.pos.x, box.max.x));
          const cy = Math.max(box.min.y, Math.min(c.pos.y, box.max.y));
          const cz = Math.max(box.min.z, Math.min(c.pos.z, box.max.z));
          const dx = c.pos.x - cx;
          const dy = c.pos.y - cy;
          const dz = c.pos.z - cz;
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          let nx = 0;
          let ny = 0;
          let nz = 0;
          if (dx * dx + dy * dy + dz * dz > 1e-8) {
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            nx = dx / d;
            ny = dy / d;
            nz = dz / d;
          } else {
            const px = Math.min(c.pos.x - box.min.x, box.max.x - c.pos.x);
            const py = Math.min(c.pos.y - box.min.y, box.max.y - c.pos.y);
            const pz = Math.min(c.pos.z - box.min.z, box.max.z - c.pos.z);
            if (px <= py && px <= pz) nx = c.pos.x < (box.min.x + box.max.x) * 0.5 ? -1 : 1;
            else if (py <= pz) ny = c.pos.y < (box.min.y + box.max.y) * 0.5 ? -1 : 1;
            else nz = c.pos.z < (box.min.z + box.max.z) * 0.5 ? -1 : 1;
          }
          this.bloodSplat(c.pos, this._v.set(nx, ny, nz).normalize(), c.size * 4.2);
          this.killChunk(i);
          wall = true;
          break;
        }
        if (wall) continue;
      }
      if (c.pos.y <= c.size * 0.5) {
        c.pos.y = c.size * 0.5;
        if (c.mode === 'blood') {
          this.addDecal(c.pos, c.color, c.size * 2.6 + 0.03, true);
          this.killChunk(i);
          continue;
        }
        c.resting = true;
        c.vel.set(0, 0, 0);
      }
      this.writeChunk(i, c);
    }
    if (this.dirtyChunks) {
      this.chunkMesh.instanceMatrix.needsUpdate = true;
      if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;
      this.dirtyChunks = false;
    }
    if (this.dirtyDecals) {
      this.decalMesh.instanceMatrix.needsUpdate = true;
      if (this.decalMesh.instanceColor) this.decalMesh.instanceColor.needsUpdate = true;
      this.dirtyDecals = false;
    }
    if (this.dirtyHoles) {
      this.holeMesh.instanceMatrix.needsUpdate = true;
      this.dirtyHoles = false;
    }
    if (this.dirtyBlood) {
      this.bloodMesh.instanceMatrix.needsUpdate = true;
      if (this.bloodMesh.instanceColor) this.bloodMesh.instanceColor.needsUpdate = true;
      this.dirtyBlood = false;
    }
  }
}
