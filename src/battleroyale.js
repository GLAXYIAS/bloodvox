import * as THREE from 'three';
import { MELEE_WEAPONS, WEAPONS } from './player.js';
import { ATTACHMENTS, compatibleAttachments, applyWeaponMods } from './attachments.js';
import { Humanoid } from './humanoid.js';

/**
 * Battle Royale controller.
 *
 * 100 bots are real match actors with health, inventories, targets, storm
 * avoidance, chest ownership and elimination credit. They are rendered from a
 * small set of InstancedMeshes and their decisions run at distance-scaled
 * frequencies. The player continues to use the existing Player, weapon,
 * ballistics and damage systems.
 */

const TOTAL_BOTS = 100;
const MAX_SLOTS = 6;
const EYE = 1.55;
// Nearby bots use the normal, fully articulated Humanoid model. The distance
// silhouettes remain as a cheap LOD, but the close model is never a special
// Battle Royale shape.
const FULL_BODY_RANGE = 46;
const MAX_FULL_BODIES = 22;
const BOT_BUILD_LIMIT = 4;
const GLOBAL_BUILD_LIMIT = 90;
const RARITIES = [
  { key: 'common', label: 'COMMON', color: 0xaeb4b8, weight: 40, mult: 1.0, ammo: 18 },
  { key: 'uncommon', label: 'UNCOMMON', color: 0x6ad47d, weight: 28, mult: 1.08, ammo: 24 },
  { key: 'rare', label: 'RARE', color: 0x63b7ff, weight: 18, mult: 1.16, ammo: 30 },
  { key: 'epic', label: 'EPIC', color: 0xc98cff, weight: 10, mult: 1.26, ammo: 36 },
  { key: 'legendary', label: 'LEGENDARY', color: 0xffb84f, weight: 4, mult: 1.4, ammo: 48 },
];
const PHASES = [
  { center: [-6, 8], radius: 98, hold: 34, shrink: 26, damage: 2.5 },
  { center: [18, -22], radius: 72, hold: 24, shrink: 22, damage: 4 },
  { center: [-18, 22], radius: 45, hold: 19, shrink: 18, damage: 6 },
  { center: [2, 0], radius: 23, hold: 14, shrink: 13, damage: 9 },
  { center: [0, 0], radius: 2.8, hold: 999, shrink: 0, damage: 15 },
];
const BOT_COLORS = [0x8f6a52, 0xb58665, 0x6d4b3d, 0xc19a7d, 0x55433a, 0x9b7860];
const GUN_IDS = ['pistol', 'smg', 'shotgun', 'carbine', 'rifle', 'magnum', 'crossbow', 'sawedoff', 'lmg', 'minigun', 'thumper', 'impaler', 'nailer', 'scatter', 'hammer', 'siege'];
const GUN_WEIGHTS = { pistol: 22, smg: 18, shotgun: 15, carbine: 13, rifle: 9, magnum: 8, crossbow: 5, sawedoff: 5, lmg: 3, minigun: 1, thumper: 1, impaler: 3, nailer: 3, scatter: 2, hammer: 1, siege: 1 };
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _root = new THREE.Matrix4();
const _scale = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3(0, 0, 0);

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function pickWeighted(entries, random = Math.random) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let n = random() * total;
  for (const entry of entries) {
    n -= entry.weight;
    if (n <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function rarityRoll(random = Math.random) {
  return pickWeighted(RARITIES, random);
}

function timeText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function boxGeometry(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

/** Uniform grid used for local AI queries instead of scanning all 100 actors. */
class SpatialHash {
  constructor(cell = 5) {
    this.cell = cell;
    this.cells = new Map();
    this.size = 0;
  }

  clear() {
    this.cells.clear();
    this.size = 0;
  }

  insert(obj) {
    const cx = Math.floor(obj.pos.x / this.cell);
    const cz = Math.floor(obj.pos.z / this.cell);
    const key = `${cx},${cz}`;
    let bucket = this.cells.get(key);
    if (!bucket) this.cells.set(key, bucket = []);
    bucket.push(obj);
    this.size++;
  }

  near(pos, radius) {
    const out = [];
    const minX = Math.floor((pos.x - radius) / this.cell);
    const maxX = Math.floor((pos.x + radius) / this.cell);
    const minZ = Math.floor((pos.z - radius) / this.cell);
    const maxZ = Math.floor((pos.z + radius) / this.cell);
    const r2 = radius * radius;
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const bucket = this.cells.get(`${cx},${cz}`);
        if (!bucket) continue;
        for (const obj of bucket) {
          const dx = obj.pos.x - pos.x;
          const dz = obj.pos.z - pos.z;
          if (dx * dx + dz * dz <= r2) out.push(obj);
        }
      }
    }
    return out;
  }
}

export class BattleRoyale {
  constructor({ scene, world, player, fx, sound, ui, physics = null, debris = null, organs = null, building = null }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.fx = fx;
    this.sound = sound;
    this.ui = ui;
    this.physics = physics;
    this.debris = debris;
    this.organs = organs;
    this.building = building;
    this.bodies = [];
    this.bodyTargets = [];
    this.active = false;
    this.state = 'idle';
    this.result = null;
    this.resultShown = false;
    this.resultDelay = 0;
    this.matchTime = 0;
    this.time = 0;
    this.bots = [];
    this.chests = [];
    this.loot = [];
    this.botGrid = new SpatialHash(4);
    this.chestGrid = new SpatialHash(8);
    this.botGroup = null;
    this.botParts = [];
    this.chestMeshes = null;
    this.chestGroup = null;
    this.stormGroup = null;
    this.stormWall = null;
    this.stormRing = null;
    this.storm = null;
    this.playerElims = 0;
    this.saved = null;
    this.hudTimer = 0;
    this.minimapTimer = 0;
    this.visualTimer = 0;
    this.feed = [];
    this.perf = {
      aiTicks: 0,
      nearTicks: 0,
      midTicks: 0,
      farTicks: 0,
      simMs: 0,
      simSamples: 0,
      lastSimMs: 0,
      lastFps: 0,
      bots: 0,
      fullBodies: 0,
      bodyMs: 0,
      buildMs: 0,
    };
    this.onResult = null;
    this.onStart = null;
    this.onStop = null;
    this.onHud = null;
    this.onBotHit = null;
    this.onTracer = null;
    this._lastFrameTime = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._lastHud = 0;
    this._minimapCtx = null;
    this._dummy = new THREE.Object3D();
    this._buildStaticAssets();
  }

  // ---------------------------------------------------------------- setup
  _buildStaticAssets() {
    this.axe = {
      ...MELEE_WEAPONS.find((w) => w.id === 'fireaxe'),
      name: 'HARVEST AXE',
      desc: 'A gathering axe. The only thing between you and the drop.',
      id: 'fireaxe',
      damage: 48,
      cooldown: 0.62,
      range: 2.25,
      swing: 0.48,
      drawTime: 0.2,
      brItem: true,
    };

    this.botGeo = {
      torso: boxGeometry(0.5, 0.7, 0.3),
      head: boxGeometry(0.34, 0.34, 0.34),
      arm: boxGeometry(0.13, 0.58, 0.14),
      leg: boxGeometry(0.16, 0.68, 0.18),
      gun: boxGeometry(0.12, 0.12, 0.56),
      pack: boxGeometry(0.4, 0.26, 0.2),
    };
    this.chestGeo = {
      base: boxGeometry(0.9, 0.46, 0.56),
      lid: boxGeometry(0.92, 0.16, 0.58),
      trim: boxGeometry(0.16, 0.2, 0.055),
      latch: boxGeometry(0.2, 0.18, 0.07),
      hinge: boxGeometry(0.18, 0.055, 0.06),
    };
    this.chestMat = new THREE.MeshLambertMaterial({ color: 0x4b3321 });
    this.chestLidMat = new THREE.MeshLambertMaterial({ color: 0x6d482b });
    this.chestTrimMat = new THREE.MeshLambertMaterial({ color: 0x8a7048 });
    this.chestHardwareMat = new THREE.MeshLambertMaterial({ color: 0xb18a45 });
    this.stormMat = new THREE.MeshBasicMaterial({
      color: 0x7558ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    this.stormRingMat = new THREE.MeshBasicMaterial({
      color: 0xb48cff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
  }

  start() {
    if (this.active) this.stop({ restorePlayer: true });
    if (!this.world.royaleData) {
      console.warn('Battle Royale map data missing');
      return false;
    }
    if (!this._preserveSave) this._savePlayer();
    this.active = true;
    this.building?.resetAll();
    this.building?.setResources('player', { wood: 240, brick: 120, metal: 60 });
    this.state = 'fight';
    this.result = null;
    this.resultShown = false;
    this.resultDelay = 0;
    this.matchTime = 0;
    this.time = 0;
    this.playerElims = 0;
    this.feed = [];
    this.bots.length = 0;
    this.chests.length = 0;
    this.loot.length = 0;

    this.player.configureMatch({
      spawn: new THREE.Vector3(this.world.mapData.spawn[0], 0, this.world.mapData.spawn[1]),
      yaw: 0,
      maxHealth: 100,
      regenRate: 0,
      maxShield: 50,
    });
    this.player.brMode = true;
    this.player.weapons = [{ ...this.axe, attachments: {}, mag: 0 }];
    this.player.weaponIndex = 0;
    this.player.weapon = this.player.weapons[0];
    this.player.magSize = 0;
    this.player.mag = 0;
    this.player.buildGunModel?.();
    this.player.onWeapon?.();
    this.player.onAmmo?.();
    this.player.onHealth?.(this.player.health);

    this._buildBots();
    this._buildChests();
    this._buildStorm();
    this._updateHud(true);
    this._drawMinimap();
    this.onStart?.(this);
    this.onHud?.(this.snapshot());
    return true;
  }

  _savePlayer() {
    this.saved = {
      weapons: this.player.weapons.map((w) => ({ ...w, attachments: { ...(w.attachments || {}) } })),
      weaponIndex: this.player.weaponIndex,
      maxHealth: this.player.maxHealth,
      health: this.player.health,
      regenRate: this.player.regenRate,
      spawn: this.player.spawn.clone(),
      ammoMode: this.player.brMode,
    };
  }

  stop({ restorePlayer = true } = {}) {
    const wasActive = this.active;
    if (this.building) this.building.resetAll();
    this._disposeBots();
    this._disposeChests();
    this._disposeLoot();
    this._disposeStorm();
    this.active = false;
    this.state = 'idle';
    this.result = null;
    this.resultShown = false;
    this.resultDelay = 0;
    this.bots.length = 0;
    this.chests.length = 0;
    this.loot.length = 0;
    this.player.brMode = false;
    if (restorePlayer && this.saved) {
      this.player.weapons = this.saved.weapons.map((w) => ({ ...w, attachments: { ...(w.attachments || {}) } }));
      this.player.weaponIndex = Math.max(0, Math.min(this.player.weapons.length - 1, this.saved.weaponIndex || 0));
      this.player.weapon = this.player.weapons[this.player.weaponIndex];
      this.player.magSize = this.player.weapon?.magSize || 0;
      this.player.mag = this.player.weapon?.mag || 0;
      this.player.brMode = false;
      this.player.restoreSandbox();
      this.player.buildGunModel?.();
      this.player.onWeapon?.();
      this.player.onAmmo?.();
      this.player.onAim?.();
      this.player.health = Math.max(1, Math.min(100, this.saved.health || 100));
      this.player.spawn.copy(this.saved.spawn);
      this.player.pos.copy(this.saved.spawn);
      this.player.maxHealth = 100;
      this.player.regenRate = 3.5;
      this.player.onHealth?.(this.player.health);
      this.saved = null;
    }
    this._updateHud(true);
    this.ui?.brHud?.classList.add('off');
    this.ui?.brMinimap?.classList.add('off');
    this.ui?.brShield?.classList.add('off');
    this.ui?.brPrompt?.classList.add('off');
    if (wasActive) this.onStop?.(this);
  }

  restart() {
    const saved = this.saved;
    this.stop({ restorePlayer: false });
    this.saved = saved;
    this._preserveSave = true;
    const ok = this.start();
    this._preserveSave = false;
    return ok;
  }

  _updateHud(force = false) {
    const remaining = this.aliveCount() + (this.player.dead ? 0 : 1);
    if (this.ui?.brAlive) this.ui.brAlive.textContent = String(remaining);
    if (this.ui?.brElim) this.ui.brElim.textContent = String(this.playerElims);
    if (this.ui?.brBots) this.ui.brBots.textContent = String(this.aliveCount());
    if (this.ui?.brPhase) this.ui.brPhase.textContent = `ZONE ${Math.min(PHASES.length, this.storm?.phase + 1 || 1)}/${PHASES.length}`;
    if (this.ui?.brStorm) {
      this.ui.brStorm.textContent = this.storm
        ? this.storm.state === 'shrink'
          ? `SHRINKING ${timeText(Math.max(0, this.storm.shrinkT || 0))}`
          : `SHRINK IN ${timeText(this.storm.timer)}`
        : '--:--';
    }
    const outside = this.storm ? this.player.pos.distanceTo(this.storm.center) > this.storm.radius : false;
    this.ui?.brWarning?.classList.toggle('on', outside && this.active);
    if (this.ui?.brWarning) {
      this.ui.brWarning.textContent = outside ? 'STORM DAMAGE · GET INSIDE THE CIRCLE' : 'INSIDE THE SAFE ZONE';
    }
    if (this.ui?.brMinimap) this.ui.brMinimap.classList.toggle('off', !this.active);
    if (this.ui?.brHud) this.ui.brHud.classList.toggle('off', !this.active);
    if (this.ui?.brShield) this.ui.brShield.classList.toggle('off', !(this.player.maxShield > 0));
    if (this.ui?.brShieldFill) {
      this.ui.brShieldFill.style.width = `${clamp((this.player.shield / Math.max(1, this.player.maxShield)) * 100, 0, 100)}%`;
    }
    if (this.ui?.brShieldText) this.ui.brShieldText.textContent = String(Math.ceil(this.player.shield || 0));
    if (this.ui?.brInventory) {
      const slots = this.player.weapons.map((w, i) => {
        const selected = i === this.player.weaponIndex ? ' selected' : '';
        const label = w?.melee ? 'MELEE' : `${w?.mag ?? 0}/${w?.brReserve ?? 0}`;
        const rdef = RARITIES.find((r) => r.key === w?.brRarity);
        const rarity = rdef ? `<small style="color:#${rdef.color.toString(16).padStart(6, '0')}">${rdef.label}</small>` : '';
        return `<div class="br-inv-slot${selected}"><b>${i + 1}</b><span>${w?.name || 'EMPTY'}${rarity}</span><em>${label}</em></div>`;
      });
      this.ui.brInventory.innerHTML = slots.join('');
    }
    if (this.ui?.brPrompt) {
      const prompt = this.interactionPrompt();
      this.ui.brPrompt.textContent = prompt || '';
      this.ui.brPrompt.classList.toggle('off', !prompt);
    }
    if (this.ui?.brFeed) {
      this.ui.brFeed.innerHTML = this.feed.slice(-4).map((line) => `<div>${line}</div>`).join('');
    }
    if (force) this.hudTimer = 0;
  }

  aliveCount() {
    let n = 0;
    for (const bot of this.bots) if (bot.alive) n++;
    return n;
  }

  snapshot() {
    return {
      active: this.active,
      state: this.state,
      result: this.result,
      resultShown: this.resultShown,
      time: this.matchTime,
      remaining: this.aliveCount() + (this.player.dead ? 0 : 1),
      botsAlive: this.aliveCount(),
      bots: this.bots.length,
      eliminations: this.playerElims,
      playerHealth: this.player.health,
      playerShield: this.player.shield,
      playerMax: this.player.maxHealth,
      chests: this.chests.length,
      chestsOpened: this.chests.filter((c) => c.opened).length,
      storm: this.storm ? {
        phase: this.storm.phase,
        radius: this.storm.radius,
        center: { x: this.storm.center.x, z: this.storm.center.z },
        state: this.storm.state,
        timer: this.storm.timer,
      } : null,
      perf: { ...this.perf },
    };
  }

  // ---------------------------------------------------------------- bots
  _areaWaypoint(area, from = null) {
    const B = (this.world.bounds || 118) - 8;
    for (let tries = 0; tries < 90; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (area.radius || 12);
      const x = clamp(area.x + Math.cos(a) * r, -B, B);
      const z = clamp(area.z + Math.sin(a) * r, -B, B);
      if (from && Math.hypot(x - from.x, z - from.z) < 3.5) continue;
      const inside = this.world.royaleData?.buildings?.some(
        (b) => Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 2,
      );
      if (inside) continue;
      if (z < -47 && z > -68 && Math.abs(x) > 7) continue;
      const y = this.world.sampleGround(x, z, 0.8);
      if (y > 8) continue;
      return new THREE.Vector3(x, y, z);
    }
    return new THREE.Vector3(area.x, this.world.sampleGround(area.x, area.z, 0.8), area.z);
  }

  _spawnPoint(index, area = null) {
    const zones = this.world.royaleData?.spawnAreas || [];
    const zone = area || zones[index % Math.max(1, zones.length)] || { x: 0, z: 0, radius: 15, label: 'ISLAND' };
    const player = this.player.pos;
    const B = (this.world.bounds || 118) - 7;
    for (let tries = 0; tries < 150; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (zone.radius || 15);
      const x = clamp(zone.x + Math.cos(a) * r, -B, B);
      const z = clamp(zone.z + Math.sin(a) * r, -B, B);
      if (Math.hypot(x - player.x, z - player.z) < 9) continue;
      if (this.world.royaleData?.buildings?.some(
        (b) => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3,
      )) continue;
      // The river is a real barrier; only the bridge strip is walkable.
      if (z < -47 && z > -68 && Math.abs(x) > 7) continue;
      if (this.bots.some((bot) => Math.hypot(bot.pos.x - x, bot.pos.z - z) < 4.4)) continue;
      const y = this.world.sampleGround(x, z, 0.8);
      if (y > 8) continue;
      return new THREE.Vector3(x, y, z);
    }
    // Deterministic spread fallback: ring around the assigned district. It
    // still preserves both district balance and minimum separation.
    for (let step = 0; step < 24; step++) {
      const a = (step / 24) * Math.PI * 2 + index * 0.61;
      const r = 4 + (step % 5) * 2.2;
      const x = clamp(zone.x + Math.cos(a) * r, -B, B);
      const z = clamp(zone.z + Math.sin(a) * r, -B, B);
      if (this.bots.some((bot) => Math.hypot(bot.pos.x - x, bot.pos.z - z) < 3.8)) continue;
      return new THREE.Vector3(x, this.world.sampleGround(x, z, 0.8), z);
    }
    return new THREE.Vector3(zone.x, this.world.sampleGround(zone.x, zone.z, 0.8), zone.z);
  }

  _enforceSpawnSeparation(minDist = 3.8) {
    const bots = this.bots;
    for (let pass = 0; pass < 10; pass++) {
      let moved = false;
      for (let i = 0; i < bots.length; i++) {
        const a = bots[i];
        for (let j = i + 1; j < bots.length; j++) {
          const b = bots[j];
          let dx = b.pos.x - a.pos.x;
          let dz = b.pos.z - a.pos.z;
          let d = Math.hypot(dx, dz);
          if (d >= minDist) continue;
          if (d < 1e-4) {
            const angle = (i * 2.399963 + j * 0.71) % (Math.PI * 2);
            dx = Math.cos(angle);
            dz = Math.sin(angle);
            d = 1;
            a.pos.x -= dx * 0.01;
            a.pos.z -= dz * 0.01;
          }
          const push = (minDist - Math.min(d, minDist)) * 0.53;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const spawnB = (this.world.bounds || 118) - 7;
    for (const bot of bots) {
      bot.pos.x = clamp(bot.pos.x, -spawnB, spawnB);
      bot.pos.z = clamp(bot.pos.z, -spawnB, spawnB);
      this.world.resolveCircle(bot.pos, 0.32, bot.pos.y);
      bot.pos.y = this.world.sampleGround(bot.pos.x, bot.pos.z, bot.pos.y + 0.35);
    }
    // World collision resolution runs after the first separation pass and can
    // push a pair back together at a doorway. Finish with a short, static pass
    // so the opening frame has both terrain-safe positions and spacing; no AI
    // movement has happened yet, so this cannot fight the movement solver.
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (let i = 0; i < bots.length; i++) {
        const a = bots[i];
        for (let j = i + 1; j < bots.length; j++) {
          const b = bots[j];
          let dx = b.pos.x - a.pos.x;
          let dz = b.pos.z - a.pos.z;
          let d = Math.hypot(dx, dz);
          if (d >= 3.6) continue;
          if (d < 1e-4) {
            const angle = (i * 2.399963 + j * 0.71) % (Math.PI * 2);
            dx = Math.cos(angle);
            dz = Math.sin(angle);
            d = 1;
          }
          const push = (3.6 - Math.min(d, 3.6)) * 0.53;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (const bot of bots) {
      bot.pos.x = clamp(bot.pos.x, -spawnB, spawnB);
      bot.pos.z = clamp(bot.pos.z, -spawnB, spawnB);
      bot.pos.y = this.world.sampleGround(bot.pos.x, bot.pos.z, bot.pos.y + 0.35);
      bot.visualPos.copy(bot.pos);
    }
  }

  _createBot(index, area = null) {
    const zones = this.world.royaleData?.spawnAreas || [];
    const zone = area || zones[index % Math.max(1, zones.length)] || { x: 0, z: 0, radius: 15, label: 'ISLAND' };
    const pos = this._spawnPoint(index, zone);
    const destination = this._areaWaypoint(zone, pos);
    return {
      id: index + 1,
      index,
      area: zone.label,
      initialArea: zone,
      pos,
      visualPos: pos.clone(),
      yaw: Math.random() * Math.PI * 2,
      health: 100,
      maxHealth: 100,
      shield: 0,
      maxShield: 50,
      armoured: index % 3 === 0,
      alive: true,
      // Everyone starts with the same harvesting axe. Guns and armour must be
      // found, which makes the chest interaction consequential for every bot.
      weapon: this._cloneMelee(this.axe),
      ammo: 0,
      reserve: 0,
      reloadT: 0,
      fireCooldown: 0.7 + Math.random() * 1.4,
      meleeCooldown: 0.4,
      target: null,
      targetId: null,
      targetIsPlayer: false,
      lastSeen: pos.clone(),
      lastSeenAt: -99,
      thinkT: Math.random() * 0.9,
      band: 'far',
      state: 'loot',
      action: 'SEARCHING',
      destination,
      moveDir: new THREE.Vector3(),
      speed: 2.2,
      crouching: false,
      strafe: Math.random() < 0.5 ? -1 : 1,
      hitT: 0,
      hitDir: new THREE.Vector3(0, 0, 1),
      deadAt: 0,
      kills: 0,
      chest: null,
      lootT: 0,
      lootChest: null,
      lootTick: 0,
      lastChest: null,
      color: BOT_COLORS[index % BOT_COLORS.length],
      anim: Math.random() * 6,
      reaction: 0,
      buildOwner: `br-bot-${index + 1}`,
      buildCooldown: 5.5 + Math.random() * 7.5,
      // The opening is a loot race, not a ten-way axe brawl in every district.
      // A staggered grace gives bots time to reach real caches; any bot that is
      // shot or finds a gun immediately rejoins combat.
      lootGrace: 18 + Math.random() * 14,
      buildCount: 0,
      stuckT: 0,
      lastStuckPos: pos.clone(),
      body: null,
      bodyVisible: false,
      bodyDead: false,
      bodyEvictedAt: 0,
    };
  }

  _buildBots() {
    this._disposeBots();
    const zones = this.world.royaleData?.spawnAreas || [];
    for (let i = 0; i < TOTAL_BOTS; i++) {
      const bot = this._createBot(i, zones[i % Math.max(1, zones.length)]);
      this.bots.push(bot);
      this.building?.setResources(bot.buildOwner, { wood: 70, brick: 28, metal: 12 });
    }
    // The fallback spawn branch can still hand two actors the same pocket when
    // a district is crowded by buildings. Resolve those collisions before the
    // first frame so the drop never starts with an overlapping pair.
    this._enforceSpawnSeparation();
    this.botGroup = new THREE.Group();
    this.botGroup.name = 'royale-bots';
    this.scene.add(this.botGroup);
    const parts = [
      ['torso', 0, 1.16, 0, 0.5, 0.7, 0.3],
      ['head', 0, 1.66, 0, 0.34, 0.34, 0.34],
      ['armL', -0.32, 1.28, 0, 0.13, 0.58, 0.14],
      ['armR', 0.32, 1.28, 0, 0.13, 0.58, 0.14],
      ['legL', -0.14, 0.46, 0, 0.16, 0.68, 0.18],
      ['legR', 0.14, 0.46, 0, 0.16, 0.68, 0.18],
      ['gun', 0.31, 1.17, -0.2, 0.12, 0.12, 0.56],
    ];
    this.botParts = [];
    for (const [name, ox, oy, oz, w, h, d] of parts) {
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(this.botGeo[name === 'armL' || name === 'armR' ? 'arm' : name === 'legL' || name === 'legR' ? 'leg' : name], material, TOTAL_BOTS);
      mesh.name = `royale-bot-${name}`;
      mesh.castShadow = name === 'torso' || name === 'head' || name === 'legL' || name === 'legR';
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.userData.br = true;
      mesh.userData.brPart = name;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 110);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.botParts.push({ name, mesh, ox, oy, oz, w, h, d, mat: material });
      this.botGroup.add(mesh);
    }
    this.bots.forEach((bot, i) => {
      for (const part of this.botParts) {
        if (!part.mesh.instanceColor) {
          // InstancedMesh creates instanceColor on the first setColorAt.
        }
        part.mesh.setColorAt(i, new THREE.Color(bot.color));
      }
      this._writeBotMatrices(bot, i, false);
    });
    for (const part of this.botParts) {
      part.mesh.instanceMatrix.needsUpdate = true;
      if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    }
    this.perf.bots = this.bots.length;
  }

  _disposeBots() {
    for (const bot of this.bots) this._disposeBody(bot);
    this.bodies.length = 0;
    this.bodyTargets.length = 0;
    if (this.botGroup) {
      this.scene.remove(this.botGroup);
      for (const part of this.botParts) part.material?.dispose?.();
    }
    this.botGroup = null;
    this.botParts = [];
  }

  _writeBotMatrices(bot, index, dead = !bot.alive) {
    if (bot.body && bot.bodyVisible) {
      // The articulated model is on screen. Zero the instanced LOD for this one
      // bot so there is never a second silhouette inside the body.
      _local.compose(_v2.set(0, 0, 0), new THREE.Quaternion(), _scale.set(0, 0, 0));
      for (const part of this.botParts) {
        part.mesh.setMatrixAt(index, _local);
      }
      return;
    }
    const pos = bot.visualPos || bot.pos;
    const yaw = bot.yaw || 0;
    const y = pos.y;
    if (dead) {
      // A simple settled corpse. Dead bots stop simulating immediately and do
      // not enter the expensive Humanoid ragdoll solver.
      _e.set(Math.PI / 2, yaw, 0.16, 'YXZ');
      _q.setFromEuler(_e);
      _root.compose(_v.set(pos.x, y + 0.22, pos.z), _q, _scale.set(1, 1, 1));
      for (const part of this.botParts) {
        if (part.name === 'gun') {
          _local.compose(_v2.set(0.4, 0.2, 0.2), new THREE.Quaternion(), _scale.set(0, 0, 0));
        } else {
          _local.compose(_v2.set(0, 0.1, 0), new THREE.Quaternion(), _scale.set(1, 1, 1));
        }
        _m.multiplyMatrices(_root, _local);
        part.mesh.setMatrixAt(index, _m);
      }
      return;
    }
    const crouch = bot.crouching ? 0.2 : 0;
    const walk = Math.sin(bot.anim) * (bot.speed > 0.4 ? 0.55 : 0.06);
    _e.set(0, yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    _root.compose(_v.set(pos.x, y + crouch, pos.z), _q, _scale.set(1, 1, 1));
    for (const part of this.botParts) {
      let ox = part.ox;
      let oy = part.oy - crouch * 0.45;
      let oz = part.oz;
      let rotX = 0;
      let rotZ = 0;
      if (part.name === 'legL' || part.name === 'legR') rotX = walk * (part.name === 'legL' ? 1 : -1);
      if (part.name === 'armL' || part.name === 'armR') {
        rotX = -walk * (part.name === 'armL' ? 0.8 : 0.55);
        if (bot.weapon && !bot.weapon.melee && bot.target) rotX = -0.45;
      }
      if (part.name === 'gun') {
        ox = 0.3;
        oy = 1.1 - crouch * 0.45;
        oz = -0.34;
        rotX = -0.06;
      }
      _e.set(rotX, 0, rotZ, 'XYZ');
      _q.setFromEuler(_e);
      _local.compose(_v2.set(ox, oy, oz), _q, _scale.set(1, 1, 1));
      _m.multiplyMatrices(_root, _local);
      part.mesh.setMatrixAt(index, _m);
    }
  }

  _makeFullBody(bot) {
    if (!this.physics || !this.debris || !this.organs) return null;
    const body = new Humanoid({
      scene: this.scene,
      world: this.world,
      physics: this.physics,
      fx: this.fx,
      debris: this.debris,
      organs: this.organs,
      position: bot.pos,
      yaw: bot.yaw,
      armour: !!bot.armoured,
    });
    body.brBot = bot;
    body.brVisual = true;
    body.think = () => {};
    body.aggressive = false;
    if (bot.weapon && !bot.weapon.melee) body.equipGun(true, bot.weapon.auto ? 'smg' : 'pistol');
    else body.equipMelee('fireaxe');
    // Hide after equipping: equipGun/equipMelee create and show their own mesh,
    // and a hidden LOD body must not leave a floating weapon in the scene.
    body.setVisible(false);
    for (const part of body.parts) {
      if (!part.mesh) continue;
      part.mesh.userData.brBot = bot;
      part.mesh.userData.brPart = part.name;
      part.mesh.userData.br = true;
    }
    bot.body = body;
    this.bodies.push(body);
    return body;
  }

  _disposeBody(bot) {
    if (!bot?.body) return;
    const i = this.bodies.indexOf(bot.body);
    if (i >= 0) this.bodies.splice(i, 1);
    bot.body.dispose?.();
    bot.body = null;
    bot.bodyVisible = false;
  }

  _evictBody() {
    let victim = null;
    let best = -Infinity;
    for (const body of this.bodies) {
      const bot = body.brBot;
      if (!bot) continue;
      const d = bot.pos.distanceTo(this.player.pos);
      const score = (!bot.alive ? 100 : 0) + d + (bot.bodyVisible ? 0 : 30);
      if (score > best) {
        best = score;
        victim = body;
      }
    }
    if (!victim?.brBot) return false;
    this._disposeBody(victim.brBot);
    return true;
  }

  _updateFullBodies(dt) {
    if (!this.physics) return;
    const active = [];
    for (const bot of this.bots) {
      const d = bot.pos.distanceTo(this.player.pos);
      if (bot.alive && d <= FULL_BODY_RANGE) active.push({ bot, d });
      if (!bot.alive && bot.body && this.time - bot.deadAt > 16) this._disposeBody(bot);
    }
    active.sort((a, b) => a.d - b.d);
    const activeSet = new Set(active.map((a) => a.bot));
    // Recycle a body from a far or expired actor if the near set is larger than
    // the LOD budget. The body is a visual only; loot/storm state is untouched.
    for (const { bot } of active) {
      if (bot.body) continue;
      if (this.bodies.length >= MAX_FULL_BODIES && !this._evictBody()) break;
      this._makeFullBody(bot);
    }
    for (const bot of this.bots) {
      if (!bot.body) continue;
      const visible = bot.alive ? activeSet.has(bot) : this.time - bot.deadAt < 16 && bot.pos.distanceTo(this.player.pos) < 58;
      if (visible !== bot.bodyVisible) {
        bot.bodyVisible = visible;
        bot.body.setVisible(visible);
      }
      if (!visible) continue;
      if (!bot.alive) continue;
      const body = bot.body;
      body.position.copy(bot.pos);
      body.position.y = bot.pos.y;
      body.yaw = bot.yaw;
      body.forward.set(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
      body.right.set(Math.cos(bot.yaw), 0, -Math.sin(bot.yaw));
      body.speed = bot.speed;
      body.moveDir.copy(bot.moveDir);
      body.moveIntent = bot.speed > 0.1;
      body.crouching = !!bot.crouching;
      body.aggressive = !!bot.target;
      body.aiming = !!bot.target && !!(bot.weapon && !bot.weapon.melee);
      const target = bot.target ? (bot.targetIsPlayer ? this.player.pos : bot.target.pos) : null;
      if (target) body.aimPoint.set(target.x, target.y + (bot.targetIsPlayer ? 1.25 : 1.2), target.z);
      else body.aimPoint.copy(body.position).addScaledVector(body.forward, 4).setY(body.position.y + 1.35);
      if (bot.weapon && !bot.weapon.melee) {
        if (!body.armed) body.equipGun(true, bot.weapon.auto ? 'smg' : 'pistol');
        if (body.gunKind !== (bot.weapon.auto ? 'smg' : 'pistol')) body.setGunKind(bot.weapon.auto ? 'smg' : 'pistol');
      } else if (!body.meleeMesh || body.armed) {
        body.equipMelee('fireaxe');
      }
      body.meleeSwingT = bot.attackAnimT > 0 ? Math.min(1, bot.attackAnimT / 0.4) : 0;
      if (bot.fireFlashT > 0) {
        body.flashT = bot.fireFlashT;
        bot.fireFlashT = 0;
      }
      body.updateAnimatedBody(dt, this.player.pos);
    }
    this.bodyTargets.length = 0;
    for (const bot of this.bots) {
      if (!bot.alive || !bot.body || !bot.bodyVisible) continue;
      for (const part of bot.body.parts) if (part.mesh) this.bodyTargets.push(part.mesh);
    }
    this.perf.fullBodies = this.bodies.length;
  }

  afterPhysics() {
    for (const body of this.bodies) {
      if (body.physicsDriven) body.afterPhysics();
    }
  }

  _updateBotVisuals(dt) {
    this.visualTimer += dt;
    if (this.visualTimer < 0.075) return;
    const elapsed = this.visualTimer;
    this.visualTimer = 0;
    this._updateFullBodies(elapsed);
    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i];
      const d = bot.pos.distanceTo(this.player.pos);
      const interval = d < 32 ? 0.075 : d < 65 ? 0.22 : 0.5;
      if (bot._visualWait === undefined) bot._visualWait = 0;
      bot._visualWait += elapsed;
      if (bot._visualWait < interval && elapsed < 0.3) continue;
      bot._visualWait = 0;
      if (bot.alive) {
        bot.anim += dt * (bot.speed > 0.4 ? 7 : 1.5);
        // The body interpolates toward its logical position even when the AI
        // decision rate is low, so a distant bot never pops when it comes into
        // view again.
        bot.visualPos.lerp(bot.pos, 1 - Math.exp(-dt * 7));
      }
      this._writeBotMatrices(bot, i);
    }
    for (const part of this.botParts) part.mesh.instanceMatrix.needsUpdate = true;
  }

  _randomWaypoint(anchor = null, preferredArea = null) {
    const data = this.world.royaleData;
    const zones = data?.spawnAreas || [];
    const area = preferredArea || zones[Math.floor(Math.random() * Math.max(1, zones.length))];
    if (area && (!anchor || Math.hypot(anchor.x - area.x, anchor.z - area.z) > 8)) {
      return this._areaWaypoint(area, anchor);
    }
    const points = data?.lootSpawns || [];
    if (points.length && Math.random() < 0.45) {
      const p = points[Math.floor(Math.random() * points.length)];
      return new THREE.Vector3(p.x, this.world.sampleGround(p.x, p.z, 0.8), p.z);
    }
    return this._areaWaypoint(area || { x: 0, z: 0, radius: (this.world.bounds || 118) - 16 }, anchor);
  }

  _cloneMelee(base) {
    return {
      ...base,
      attachments: {},
      brItem: true,
      brRarity: 'common',
      magSize: 0,
      mag: 0,
      brReserve: 0,
    };
  }

  _makeGun(base, rarity) {
    if (!base) return null;
    const mult = rarity.mult;
    return {
      ...base,
      attachments: {},
      brItem: true,
      brRarity: rarity.key,
      damage: Math.round(base.damage * mult),
      brReserve: Math.max(1, Math.round((base.magSize || 1) * 2 * (1 + (mult - 1) * 0.5))),
      magSize: base.magSize,
      mag: base.magSize,
    };
  }

  _makeBotWeapon() {
    const gunRoll = Math.random();
    if (gunRoll < 0.38) {
      const id = pickWeighted(GUN_IDS.map((id) => ({ id, weight: GUN_WEIGHTS[id] }))).id;
      return this._makeGun(WEAPONS.find((w) => w.id === id), rarityRoll());
    }
    const base = MELEE_WEAPONS.find((w) => w.id === (Math.random() < 0.5 ? 'knife' : 'machete')) || MELEE_WEAPONS[0];
    return this._cloneMelee(base);
  }

  _botWeaponScore(weapon) {
    if (!weapon) return 0;
    if (weapon.melee) return 10 + (weapon.damage || 0) * 0.2;
    const rarity = Math.max(0, RARITIES.findIndex((r) => r.key === weapon.brRarity));
    const mods = Object.keys(weapon.attachments || {}).length;
    return 25 + (weapon.damage || 0) * 0.6 + rarity * 7 + mods * 3 + (weapon.auto ? 8 : 0);
  }

  _giveBotWeapon(bot, weapon) {
    if (!weapon) return;
    if (!bot.weapon || this._botWeaponScore(weapon) > this._botWeaponScore(bot.weapon)) {
      bot.weapon = weapon;
      bot.ammo = weapon.melee ? 0 : weapon.magSize;
      bot.reserve = weapon.melee ? 0 : weapon.brReserve || weapon.magSize;
      bot.reloadT = 0;
      bot.action = `EQUIPPED ${weapon.name}`;
    }
  }

  _nearestChest(pos, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    const source = Number.isFinite(maxDist) && this.chestGrid
      ? this.chestGrid.near(pos, maxDist)
      : this.chests;
    for (const chest of source) {
      if (chest.opened) continue;
      const d = chest.pos.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = chest;
      }
    }
    return best;
  }

  _updateBots(dt) {
    const playerAlive = !this.player.dead;
    this.separateTimer = (this.separateTimer || 0) + dt;
    this.botGrid.clear();
    for (const bot of this.bots) if (bot.alive) this.botGrid.insert(bot);
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const distToPlayer = bot.pos.distanceTo(this.player.pos);
      const band = distToPlayer < 32 ? 'near' : distToPlayer < 68 ? 'mid' : 'far';
      if (band !== bot.band) {
        bot.band = band;
        bot.perfBand = band;
      }
      const tickRate = band === 'near' ? 0.12 : band === 'mid' ? 0.38 : 0.95;
      bot.thinkT -= dt;
      if (bot.thinkT <= 0) {
        bot.thinkT += tickRate * (0.8 + Math.random() * 0.4);
        this._thinkBot(bot, playerAlive);
        this.perf.aiTicks++;
        if (band === 'near') this.perf.nearTicks++;
        else if (band === 'mid') this.perf.midTicks++;
        else this.perf.farTicks++;
      }
      const moveHz = band === 'near' ? 30 : band === 'mid' ? 12 : 4;
      bot.moveAccum = (bot.moveAccum || 0) + dt;
      if (bot.moveAccum >= 1 / moveHz) {
        this._moveBot(bot, Math.min(0.35, bot.moveAccum));
        bot.moveAccum = 0;
      }
      bot.anim += dt * (bot.speed > 0.5 ? 5.5 : 1);
      if (bot.fireCooldown > 0) bot.fireCooldown -= dt;
      if (bot.meleeCooldown > 0) bot.meleeCooldown -= dt;
      if (bot.reloadT > 0) {
        bot.reloadT -= dt;
        if (bot.reloadT <= 0 && bot.weapon && !bot.weapon.melee && bot.reserve > 0) {
          const need = Math.max(1, bot.weapon.magSize - bot.ammo);
          bot.ammo = bot.weapon.magSize;
          bot.reserve = Math.max(0, bot.reserve - need);
        }
      }
      if (bot.hitT > 0) bot.hitT -= dt;
      if (bot.reaction > 0) bot.reaction -= dt;
      if (bot.attackAnimT > 0) bot.attackAnimT -= dt;
      if (bot.buildCooldown > 0) bot.buildCooldown -= dt;
      if (bot.lootT > 0) {
        bot.lootT -= dt;
        if (bot.lootT <= 0) {
          const chest = bot.lootChest;
          bot.lootChest = null;
          if (chest && !chest.opened && bot.pos.distanceTo(chest.pos) < 2.6) {
            this._openChest(chest, bot);
          }
        }
      }
    }
    if (this.separateTimer >= 0.22) {
      this.separateTimer = 0;
      this._separateBots();
    }
  }

  _thinkBot(bot, playerAlive) {
    if (!bot.alive) return;
    if (bot.lootT > 0) {
      bot.speed = 0;
      bot.moveDir.set(0, 0, 0);
      bot.action = `OPENING ${bot.lootChest?.rarity?.label || 'CACHE'}`;
      return;
    }
    const storm = this.storm;
    const outside = storm && bot.pos.distanceTo(storm.center) > storm.radius - 1.5;
    if (outside) {
      bot.state = 'storm';
      bot.action = 'RUN TO SAFE ZONE';
      bot.crouching = false;
      _v.copy(storm.center).sub(bot.pos);
      _v.y = 0;
      if (_v.lengthSq() < 1) _v.set(0, 0, 1);
      bot.destination.copy(storm.center).addScaledVector(_v.normalize(), -Math.min(storm.radius * 0.5, 3));
      bot.moveDir.copy(bot.destination).sub(bot.pos).setY(0).normalize();
      bot.speed = 5.0;
      if (bot.target && !bot.targetIsPlayer && bot.target.alive) this._tryBotAttack(bot);
      return;
    }

    // Acquire a new target when needed. This is deliberately local: bots do
    // not receive the player's coordinates through the storm or HUD.
    if (!bot.target || (bot.targetIsPlayer ? !playerAlive : !bot.target.alive) || this.time - bot.lastSeenAt > 5.5) {
      this._pickBotTarget(bot, playerAlive);
    }
    const target = bot.target;
    if (target) {
      const targetPos = bot.targetIsPlayer ? this.player.pos : target.pos;
      const d = bot.pos.distanceTo(targetPos);
      const eye = _v2.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
      const targetEye = bot.targetIsPlayer
        ? _v.set(this.player.pos.x, this.player.bodyCenterY(), this.player.pos.z)
        : _v.set(target.pos.x, target.pos.y + 1.2, target.pos.z);
      const los = d < 34 && this.world.hasLineOfSight(eye, targetEye);
      if (los) {
        bot.lastSeen.copy(targetPos);
        bot.lastSeenAt = this.time;
      }
      const remembered = this.time - bot.lastSeenAt < 4.5;
      if (d < 2.4 && (!bot.weapon || bot.weapon.melee || bot.ammo <= 0)) {
        bot.state = 'fight';
        bot.action = 'MELEE';
        bot.crouching = false;
        bot.destination.copy(targetPos);
        bot.moveDir.copy(targetPos).sub(bot.pos).setY(0).normalize();
        bot.speed = 3.4;
        if (bot.meleeCooldown <= 0) this._botMelee(bot, target, targetPos);
      } else if (los || remembered) {
        bot.state = 'fight';
        const toward = _v.copy(targetPos).sub(bot.pos).setY(0);
        const dist = toward.length() || 1;
        toward.divideScalar(dist);
        if (!los && remembered) {
          bot.action = 'SEARCH LAST CONTACT';
          bot.destination.copy(bot.lastSeen);
          bot.moveDir.copy(bot.lastSeen).sub(bot.pos).setY(0).normalize();
          bot.speed = 3.6;
        } else if (dist > 12) {
          bot.action = 'PUSH';
          bot.destination.copy(targetPos);
          bot.moveDir.copy(toward);
          bot.speed = 4.0;
          bot.crouching = false;
        } else if (dist < 4.2) {
          bot.action = 'BACK OFF';
          bot.destination.copy(bot.pos).addScaledVector(toward, -3);
          bot.moveDir.copy(toward).multiplyScalar(-1);
          bot.speed = 2.7;
          bot.crouching = Math.random() < 0.4;
        } else {
          bot.action = 'STRAFE';
          bot.strafe = Math.sin(this.time * 1.7 + bot.id) > 0 ? 1 : -1;
          bot.moveDir.set(-toward.z * bot.strafe, 0, toward.x * bot.strafe);
          bot.speed = 2.4;
          bot.crouching = Math.random() < 0.22;
          bot.destination.copy(bot.pos).addScaledVector(bot.moveDir, 3);
        }
        if (los && bot.fireCooldown <= 0) this._tryBotAttack(bot);
      } else {
        bot.target = null;
      }
    }

    if (!bot.target) {
      this._thinkBotLoot(bot);
      this._thinkBotBuilding(bot);
      return;
    }
    this._thinkBotBuilding(bot);
  }

  _botCanLoot(bot) {
    // A crowd of friendly-looking silhouettes is not a reason to freeze. Only
    // an actual nearby threat suspends looting: a live target, the player, or
    // a bot that is close enough to force a fight. This keeps the opening
    // rotation moving while still making bots take cover under pressure.
    const eye = new THREE.Vector3(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
    if (bot.target?.alive) {
      const targetPos = bot.targetIsPlayer ? this.player.pos : bot.target.pos;
      if (bot.pos.distanceTo(targetPos) < 11) return false;
    }
    if (!this.player.dead && bot.pos.distanceTo(this.player.pos) < 11) {
      if (this.world.hasLineOfSight(eye, this.player.pos.clone().setY(this.player.bodyCenterY()))) return false;
    }
    const nearby = this.botGrid ? this.botGrid.near(bot.pos, 2.6) : this.bots;
    for (const other of nearby) {
      if (other === bot || !other.alive) continue;
      if (this.world.hasLineOfSight(eye, _v.set(other.pos.x, other.pos.y + 1.2, other.pos.z))) return false;
    }
    return true;
  }

  _thinkBotLoot(bot) {
    bot.chest = null;
    if (!this._botCanLoot(bot)) {
      // Stay behind the nearest cover instead of walking into a chest while a
      // fight is happening in the room.
      bot.state = 'alert';
      bot.action = 'HOLD COVER';
      bot.speed = 0;
      bot.moveDir.set(0, 0, 0);
      return;
    }
    const ground = this._nearestLoot(bot.pos, 16);
    if (ground) {
      if (bot.pos.distanceTo(ground.position) < 1.55) {
        this._collectBotLoot(bot, ground);
      } else {
        bot.state = 'loot';
        bot.action = ground.type === 'weapon' ? 'MOVING TO WEAPON' : 'COLLECTING LOOT';
        bot.destination.copy(ground.position);
        bot.moveDir.copy(ground.position).sub(bot.pos).setY(0).normalize();
        bot.speed = 3.2;
        return;
      }
    }
    const chest = this._nearestChest(bot.pos, 40);
    if (chest) {
      bot.chest = chest;
      bot.state = 'loot';
      const d = bot.pos.distanceTo(chest.pos);
      if (d < 2.3) {
        bot.lootT = 0.85;
        bot.lootChest = chest;
        bot.action = `OPENING ${chest.rarity?.label || 'CACHE'}`;
        bot.speed = 0;
        bot.moveDir.set(0, 0, 0);
      } else {
        bot.action = 'SEARCHING CACHE';
        bot.destination.copy(chest.pos);
        bot.moveDir.copy(chest.pos).sub(bot.pos).setY(0).normalize();
        bot.speed = 3.1;
      }
      return;
    }
    if (bot.destination.distanceTo(bot.pos) < 2.2 || Math.random() < 0.045) {
      bot.state = 'loot';
      bot.action = 'ROAMING ' + (bot.area || 'THE ISLAND');
      bot.destination.copy(this._randomWaypoint(bot.pos, bot.initialArea));
      bot.moveDir.copy(bot.destination).sub(bot.pos).setY(0).normalize();
      bot.speed = 2.5;
    } else {
      bot.moveDir.copy(bot.destination).sub(bot.pos).setY(0);
      if (bot.moveDir.lengthSq() > 1) bot.moveDir.normalize();
      bot.speed = 2.5;
    }
  }

  _collectBotLoot(bot, item) {
    if (!item?.available) return;
    item.available = false;
    if (item.type === 'weapon') {
      this._giveBotWeapon(bot, item.weapon);
    } else if (item.type === 'ammo') {
      bot.reserve = (bot.reserve || 0) + item.amount;
      bot.action = `PICKED UP ${item.amount} AMMO`;
    } else if (item.type === 'attachment') {
      const gun = bot.weapon;
      if (gun && !gun.melee && item.attachment && compatibleAttachments(gun).some((a) => a.id === item.attachment.id)) {
        gun.attachments = { ...(gun.attachments || {}), [item.attachment.slot]: item.attachment.id };
        applyWeaponMods(gun);
        bot.action = `ATTACHED ${item.attachment.name}`;
      } else {
        bot.reserve = (bot.reserve || 0) + 18;
      }
    } else if (item.type === 'shield') {
      bot.shield = Math.min(bot.maxShield || 50, (bot.shield || 0) + item.amount);
      bot.action = `COLLECTED ${item.rarity?.label || ''} SHIELD`;
    } else if (item.type === 'health') {
      bot.health = Math.min(100, bot.health + item.amount);
      bot.action = 'USED MEDKIT';
    }
    this._feed(`BOT ${String(bot.id).padStart(3, '0')} COLLECTED ${item.rarity?.label || ''} LOOT`);
    this._removeLootItem(item);
  }

  // ---------------------------------------------------------------- bot building
  _thinkBotBuilding(bot) {
    if (!this.building || bot.buildCooldown > 0) return;
    if (this.building.structures.length >= GLOBAL_BUILD_LIMIT) return;
    const own = this.building.structuresFor(bot.buildOwner);
    if (own.length >= BOT_BUILD_LIMIT) return;
    const threat = bot.target ? (bot.targetIsPlayer ? this.player.pos : bot.target.pos) : bot.lastSeen;
    const seen = bot.target || this.time - bot.lastSeenAt < 4.5;
    const underFire = bot.hitT > 0 || this.time - (bot.lastDamageAt || -99) < 1.6;
    const distance = bot.pos.distanceTo(threat);
    if (!seen || distance < 2.2 || distance > 30) return;
    // A wall is a reaction to danger or an aggressive push, not a reflex that
    // fires every time a target exists. This keeps the island from being
    // walled off by 100 bots and leaves the global structure budget for fights.
    const hasCover = own.some((s) => {
      if (s.kind !== 'wall' || s.variant === 'door') return false;
      const dx = s.mesh.position.x - bot.pos.x;
      const dz = s.mesh.position.z - bot.pos.z;
      const sd = Math.hypot(dx, dz);
      if (sd > 4.5 || sd < 0.2) return false;
      return (dx * (threat.x - bot.pos.x) + dz * (threat.z - bot.pos.z)) / (sd * distance) > 0.25;
    });
    const heightPressure = bot.target && threat.y > bot.pos.y + 1.25;
    const exposedPush = bot.target && distance < 11 && !hasCover && own.length < 2;
    if (!underFire && bot.health >= 65 && !heightPressure && !exposedPush) return;
    const lowHealth = bot.health < 48;
    const material = this.building.chooseMaterial(bot.buildOwner, 'wall', lowHealth);
    if (!material) return;
    const dx = threat.x - bot.pos.x;
    const dz = threat.z - bot.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / d, z: dz / d };
    let built = null;
    if (underFire || own.length === 0) {
      built = this.building.place(bot.buildOwner, 'wall', material, bot.pos, dir);
    } else if (threat.y > bot.pos.y + 1.3 || own.some((s) => s.kind === 'wall')) {
      const rampMat = this.building.chooseMaterial(bot.buildOwner, 'ramp', lowHealth);
      if (rampMat) built = this.building.place(bot.buildOwner, 'ramp', rampMat, bot.pos, dir);
    }
    if (!built && bot.hitT > 0) {
      const roofMat = this.building.chooseMaterial(bot.buildOwner, 'roof', true);
      if (roofMat) {
        const cellX = Math.round(bot.pos.x / 2.4);
        const cellZ = Math.round(bot.pos.z / 2.4);
        const level = Math.max(0, Math.min(8, Math.floor(bot.pos.y / 2.7)));
        built = this.building.placeAt(bot.buildOwner, 'roof', roofMat, cellX, cellZ, level, 0);
      }
    }
    if (!built) return;
    bot.buildCount++;
    bot.buildCooldown = 5.0 + Math.random() * 6.5;
    bot.action = built.kind === 'ramp' ? 'BUILDING HEIGHT' : built.kind === 'roof' ? 'BUILDING COVER' : 'BUILDING WALL';
    if (own.length >= 2) {
      const wall = own.find((s) => s.kind === 'wall' && s.variant === 'full');
      if (wall) {
        // Wounded bots cut a real escape door; healthy bots make a firing port.
        this.building.setEditSections(wall, bot.health < 58 ? [6, 7, 8] : [4]);
      }
    }
  }

  _pickBotTarget(bot, playerAlive) {
    let best = null;
    // An axe-only bot is cautious: it will defend itself at close range but
    // prefers to find a gun before picking a fight across a field.
    let bestD = bot.weapon?.melee ? 9 : 28;
    let bestIsPlayer = false;
    const eye = _v2.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
    // During the staggered opening a bot with only an axe is looking for a
    // chest, not for another unarmed drop. Once it finds a gun, is attacked,
    // or its grace expires, normal target acquisition resumes.
    const openingLoot = bot.weapon?.melee &&
      (this.time < (bot.lootGrace || 0) || !!this._nearestChest(bot.pos, 22));
    if (!openingLoot) {
      const candidates = this.botGrid ? this.botGrid.near(bot.pos, bestD) : this.bots;
      for (const other of candidates) {
        if (other === bot || !other.alive) continue;
        const d = bot.pos.distanceTo(other.pos);
        if (d >= bestD) continue;
        if (d > 12 && !this.world.hasLineOfSight(eye, _v.set(other.pos.x, other.pos.y + 1.2, other.pos.z))) continue;
        bestD = d;
        best = other;
        bestIsPlayer = false;
      }
    }
    if (playerAlive) {
      const d = bot.pos.distanceTo(this.player.pos);
      if (d < bestD && d < (bot.weapon?.melee ? 10 : 28) &&
          this.world.hasLineOfSight(eye, _v.set(this.player.pos.x, this.player.bodyCenterY(), this.player.pos.z))) {
        best = this.player;
        bestD = d;
        bestIsPlayer = true;
      }
    }
    bot.target = best;
    bot.targetIsPlayer = bestIsPlayer;
    if (best) {
      bot.lastSeen.copy(bestIsPlayer ? this.player.pos : best.pos);
      bot.lastSeenAt = this.time;
      bot.state = 'fight';
      bot.action = `TARGET ${bestIsPlayer ? 'PLAYER' : 'BOT'}`;
    } else {
      bot.target = null;
      bot.action = 'SEARCHING';
    }
  }

  _tryBotAttack(bot) {
    const target = bot.target;
    if (!target || bot.fireCooldown > 0 || !bot.weapon) return;
    const targetIsPlayer = bot.targetIsPlayer;
    const targetPos = targetIsPlayer ? this.player.pos : target.pos;
    if (!targetIsPlayer && !target.alive) return;
    const d = bot.pos.distanceTo(targetPos);
    if (d > 32) return;
    const targetEye = targetIsPlayer
      ? _v.set(this.player.pos.x, this.player.bodyCenterY(), this.player.pos.z)
      : _v.set(target.pos.x, target.pos.y + 1.2, target.pos.z);
    const eye = _v2.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
    if (!this.world.hasLineOfSight(eye, targetEye)) return;

    if (bot.weapon.melee) {
      if (d <= Math.max(2.3, bot.weapon.range || 2.3)) this._botMelee(bot, target, targetPos);
      return;
    }
    if (bot.ammo <= 0) {
      if (d < 2.8) this._botMelee(bot, target, targetPos);
      if (bot.reserve > 0 && bot.reloadT <= 0) bot.reloadT = 1.1 + Math.random() * 0.7;
      return;
    }
    bot.ammo--;
    bot.fireCooldown = (bot.weapon.cooldown || 0.5) + 0.45 + Math.random() * 0.7;
    bot.fireFlashT = 0.06;
    const chance = clamp(0.4 - d * 0.009 + (bot.crouching ? 0.03 : 0) - (this.player.crouching ? 0.04 : 0), 0.08, 0.42);
    const hit = Math.random() < chance;
    _v.copy(targetEye).sub(eye).normalize();
    const impact = new THREE.Vector3().copy(targetEye);
    if (!hit) {
      impact.x += (Math.random() - 0.5) * 1.8;
      impact.y += (Math.random() - 0.5) * 1.2;
      impact.z += (Math.random() - 0.5) * 1.8;
    }
    const near = bot.pos.distanceTo(this.player.pos) < 42;
    if (this.onTracer) this.onTracer(eye.clone(), impact, bot.weapon.sound || 'pistol', near);
    if (near) this.sound?.enemyShot?.(bot.weapon.sound || 'pistol');
    if (hit) {
      const damage = 3.5 + (bot.weapon.damage || 20) * 0.11 + (bot.weapon.melee ? 0 : 1);
      _v.copy(targetPos).sub(bot.pos).setY(0).normalize();
      if (targetIsPlayer) this._hurtPlayer(damage, _v);
      else this.hitBot(target, damage, impact, _v, bot, { botShot: true });
    }
  }

  _botMelee(bot, target, targetPos) {
    if (bot.meleeCooldown > 0) return;
    bot.meleeCooldown = 0.9 + Math.random() * 0.8;
    bot.attackAnimT = 0.4;
    bot.action = 'MELEE';
    const damage = 12 + (bot.weapon?.damage || 20) * 0.22;
    _v.copy(targetPos).sub(bot.pos).setY(0).normalize();
    if (bot.targetIsPlayer) this._hurtPlayer(damage, _v);
    else this.hitBot(target, damage, new THREE.Vector3(targetPos.x, targetPos.y + 1.2, targetPos.z), _v, bot, { melee: true });
    if (bot.pos.distanceTo(this.player.pos) < 6) this.sound?.punch?.();
  }

  _moveBot(bot, dt) {
    if (!bot.alive) return;
    if (!bot.moveDir || bot.moveDir.lengthSq() < 0.0001) {
      bot.speed = 0;
      return;
    }
    const step = Math.min(dt, 0.14) * bot.speed;
    bot.pos.x += bot.moveDir.x * step;
    bot.pos.z += bot.moveDir.z * step;
    const moveB = (this.world.bounds || 118) - 4;
    bot.pos.x = clamp(bot.pos.x, -moveB, moveB);
    bot.pos.z = clamp(bot.pos.z, -moveB, moveB);
    const ground = this.world.sampleGround(bot.pos.x, bot.pos.z, bot.pos.y + 0.35);
    if (ground > bot.pos.y + 0.5) {
      // Too tall to step up: stop applying that direction until the next
      // decision and let the bot pick a different route.
      bot.moveDir.multiplyScalar(-0.25);
      bot.pos.x += bot.moveDir.x * step * 1.2;
      bot.pos.z += bot.moveDir.z * step * 1.2;
    } else {
      bot.pos.y = ground;
    }
    this.world.resolveCircle(bot.pos, 0.3, bot.pos.y);
    // If a doorway or another body is blocking the route, sidestep and pick a
    // fresh local waypoint instead of adding to a permanent door queue.
    bot.stuckT += dt;
    if (bot.stuckT > 0.7) {
      if (bot.pos.distanceTo(bot.lastStuckPos) < 0.18 && bot.speed > 0.4) {
        const side = Math.random() < 0.5 ? -1 : 1;
        bot.moveDir.set(-bot.moveDir.z * side, 0, bot.moveDir.x * side);
        bot.destination.copy(bot.pos).addScaledVector(bot.moveDir, 6);
        bot.action = 'ROUTE AROUND';
      }
      bot.lastStuckPos.copy(bot.pos);
      bot.stuckT = 0;
    }
    if (bot.pos.distanceTo(bot.destination) < 1.0) {
      bot.moveDir.set(0, 0, 0);
      bot.speed = 0;
    }
  }

  _separateBots() {
    // Spatial broad phase: only actors in adjacent 4m cells are compared, so
    // the 100-bot simulation does not pay for 4,950 distant pairs per tick.
    if (!this.botGrid) return;
    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i];
      if (!a.alive) continue;
      for (const b of this.botGrid.near(a.pos, 1.5)) {
        if (b.index <= a.index || !b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 2.25 || d2 < 1e-5) continue;
        const d = Math.sqrt(d2);
        const push = (1.5 - d) * 0.1;
        a.pos.x -= (dx / d) * push;
        a.pos.z -= (dz / d) * push;
        b.pos.x += (dx / d) * push;
        b.pos.z += (dz / d) * push;
      }
    }
  }

  // ---------------------------------------------------------------- combat
  botForInstance(mesh, instanceId) {
    if (!mesh?.userData?.br || instanceId == null) return null;
    const bot = this.bots[instanceId];
    return bot?.alive ? bot : null;
  }

  hitBot(bot, amount, point, dir, source = null, options = {}) {
    if (!this.active || !bot?.alive) return false;
    const before = bot.health;
    let remaining = Math.max(0, Number(amount) || 0);
    if (bot.shield > 0) {
      const absorbed = Math.min(bot.shield, remaining);
      bot.shield -= absorbed;
      remaining -= absorbed;
    }
    bot.health = Math.max(0, bot.health - remaining);
    bot.hitT = 0.22;
    bot.lootT = 0;
    bot.lootChest = null;
    bot.hitDir.copy(dir || _v.set(0, 0, 1));
    bot.target = source;
    bot.targetIsPlayer = source === this.player;
    bot.state = 'fight';
    if (source === this.player) {
      this.onBotHit?.(bot, point, options, before, bot.health);
    }
    const d = point?.distanceTo(this.player.pos) ?? 99;
    if (d < 22 && this.fx) {
      this.fx.bloodBurst(point, dir || new THREE.Vector3(0, 1, 0), options.melee ? 0.8 : 0.45);
    }
    if (source) bot.lastDamageAt = this.time;
    if (bot.health <= 0) {
      this._killBot(bot, source, options.weapon || (options.melee ? 'MELEE' : 'WEAPON'), point, dir);
    }
    return true;
  }

  blast(point, radius, damage, force = 2) {
    if (!this.active) return;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const d = bot.pos.distanceTo(point);
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      _v.copy(bot.pos).sub(point).setY(0);
      if (_v.lengthSq() < 0.001) _v.set(0, 1, 0);
      _v.normalize();
      this.hitBot(bot, damage * (0.45 + falloff * 0.55), new THREE.Vector3(bot.pos.x, bot.pos.y + 1.1, bot.pos.z), _v, this.player, { weapon: 'EXPLOSIVE' });
    }
  }

  _killBot(bot, killer, weapon, point = null, dir = null) {
    if (!bot.alive) return;
    bot.alive = false;
    bot.deadAt = this.time;
    bot.health = 0;
    bot.target = null;
    bot.lootT = 0;
    bot.lootChest = null;
    if (bot.body) {
      const deathDir = (dir || new THREE.Vector3(0, 1, 0)).clone().normalize();
      const at = point ? point.clone() : new THREE.Vector3(bot.pos.x, bot.pos.y + 1.1, bot.pos.z);
      bot.body.die(deathDir, at, 1.2, 'torso');
      bot.bodyDead = true;
      bot.bodyVisible = true;
      bot.body.setVisible(true);
    }
    if (killer === this.player) {
      this.playerElims++;
      this._feed(`YOU ELIMINATED BOT ${String(bot.id).padStart(3, '0')}`);
    } else if (killer?.id) {
      killer.kills++;
      this._feed(`BOT ${String(killer.id).padStart(3, '0')} ELIMINATED BOT ${String(bot.id).padStart(3, '0')}`);
    } else {
      this._feed(`BOT ${String(bot.id).padStart(3, '0')} LOST TO THE STORM`);
    }
    if (bot.pos.distanceTo(this.player.pos) < 55) {
      this._dropBotLoot(bot);
      if (this.fx) this.fx.bloodBurst(new THREE.Vector3(bot.pos.x, bot.pos.y + 1.1, bot.pos.z), new THREE.Vector3(0, 1, 0), 1.1);
    }
    this._updateHud(true);
    if (this.aliveCount() === 0 && !this.player.dead) this._finish('victory');
  }

  _hurtPlayer(amount, dir) {
    if (!this.active || this.player.dead) return;
    this.player.damage(amount, dir);
    this.ui?.hurt?.classList.remove('on');
    if (this.ui?.hurt) void this.ui.hurt.offsetWidth;
    this.ui?.hurt?.classList.add('on');
    if (this.player.dead) this._finish('defeat');
  }

  _feed(text) {
    this.feed.push(text);
    if (this.feed.length > 12) this.feed.shift();
  }

  // ---------------------------------------------------------------- chests / loot
  _buildChests() {
    this._disposeChests();
    const spawns = this.world.royaleData?.lootSpawns || [];
    const chosen = [];
    for (const spawn of spawns) {
      if (chosen.length >= 64) break;
      const p = new THREE.Vector3(spawn.x, this.world.sampleGround(spawn.x, spawn.z, 0.45), spawn.z);
      if (chosen.some((c) => c.pos.distanceTo(p) < 2.6)) continue;
      const loot = this._rollChestLoot();
      chosen.push({
        id: chosen.length,
        pos: p,
        yaw: Math.random() * Math.PI * 2,
        opened: false,
        by: null,
        lidT: 0,
        rarity: loot.rarity,
        loot,
      });
    }
    // Every drop gets a reachable outdoor cache. The interior caches are more
    // valuable, but a direct-line bot can reach these without solving a house
    // doorway first, so the opening loot phase produces actual gear.
    for (const area of this.world.royaleData?.spawnAreas || []) {
      let added = 0;
      for (let tries = 0; tries < 30 && added < 3; tries++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 5.2 + Math.random() * 8;
        const chestB = (this.world.bounds || 118) - 8;
        const x = clamp(area.x + Math.cos(angle) * radius, -chestB, chestB);
        const z = clamp(area.z + Math.sin(angle) * radius, -chestB, chestB);
        if (this.world.royaleData.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 1.2 && Math.abs(z - b.z) < b.d / 2 + 1.2)) continue;
        const p = new THREE.Vector3(x, this.world.sampleGround(x, z, 0.45), z);
        if (chosen.some((c) => c.pos.distanceTo(p) < 3.4)) continue;
        const loot = this._rollChestLoot();
        chosen.push({ id: chosen.length, pos: p, yaw: Math.random() * Math.PI * 2, opened: false, by: null, lidT: 0, rarity: loot.rarity, loot });
        added++;
      }
    }
    // A guaranteed close cache so the first test/player interaction is not a
    // long walk across the island.
    const guaranteed = new THREE.Vector3(3.2, 0, 58.5);
    guaranteed.y = this.world.sampleGround(guaranteed.x, guaranteed.z, 0.5);
    if (!chosen.some((c) => c.pos.distanceTo(guaranteed) < 3)) {
      const loot = this._rollChestLoot();
      chosen.unshift({ id: chosen.length, pos: guaranteed, yaw: 0.3, opened: false, by: null, lidT: 0, rarity: loot.rarity, loot });
    }
    this.chests = chosen;
    this.chestGrid = new SpatialHash(8);
    for (const chest of this.chests) this.chestGrid.insert(chest);

    this.chestGroup = new THREE.Group();
    this.chestGroup.name = 'royale-chests';
    this.scene.add(this.chestGroup);
    const count = this.chests.length;
    this.chestMeshes = {
      base: new THREE.InstancedMesh(this.chestGeo.base, this.chestMat, count),
      lid: new THREE.InstancedMesh(this.chestGeo.lid, this.chestLidMat, count),
      trim: new THREE.InstancedMesh(this.chestGeo.trim, this.chestTrimMat, count),
      latch: new THREE.InstancedMesh(this.chestGeo.latch, this.chestHardwareMat, count),
      hinge: new THREE.InstancedMesh(this.chestGeo.hinge, this.chestHardwareMat, count * 2),
    };
    for (const [key, mesh] of Object.entries(this.chestMeshes)) {
      mesh.name = `royale-chest-${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.chestGroup.add(mesh);
    }
    this._writeChestMatrices(true);
  }

  _disposeChests() {
    if (this.chestGroup) {
      this.scene.remove(this.chestGroup);
      // Chest geometries/materials are shared across rematches and owned for
      // the lifetime of the controller.
    }
    this.chestGroup = null;
    this.chestMeshes = null;
    this.chests.length = 0;
  }

  _writeChestMatrices() {
    if (!this.chestMeshes) return;
    for (let i = 0; i < this.chests.length; i++) {
      const chest = this.chests[i];
      const open = chest.lidT;
      _q.setFromEuler(_e.set(0, chest.yaw, 0));
      _root.compose(_v.set(chest.pos.x, chest.pos.y + 0.23, chest.pos.z), _q, _scale.set(1, 1, 1));
      _local.compose(_v2.set(0, 0, 0), new THREE.Quaternion(), _scale.set(1, 1, 1));
      _m.multiplyMatrices(_root, _local);
      this.chestMeshes.base.setMatrixAt(i, _m);
      _q.setFromEuler(_e.set(-open * 1.7, chest.yaw, 0, 'YXZ'));
      _root.compose(_v.set(chest.pos.x, chest.pos.y + 0.51, chest.pos.z - 0.02), _q, _scale.set(1, 1, 1));
      _local.compose(_v2.set(0, 0, -0.2), new THREE.Quaternion(), _scale.set(1, 1, 1));
      _m.multiplyMatrices(_root, _local);
      this.chestMeshes.lid.setMatrixAt(i, _m);
      const cos = Math.cos(chest.yaw);
      const sin = Math.sin(chest.yaw);
      const put = (mesh, index, lx, ly, lz, sx = 1, sy = 1, sz = 1) => {
        _q.setFromEuler(_e.set(0, chest.yaw, 0));
        _m.compose(
          _v.set(chest.pos.x + lx * cos + lz * sin, chest.pos.y + ly, chest.pos.z - lx * sin + lz * cos),
          _q,
          _scale.set(sx, sy, sz),
        );
        mesh.setMatrixAt(index, _m);
      };
      put(this.chestMeshes.trim, i, 0, 0.29, 0.3);
      put(this.chestMeshes.latch, i, 0, 0.36, 0.315);
      put(this.chestMeshes.hinge, i * 2, -0.31, 0.48, -0.295);
      put(this.chestMeshes.hinge, i * 2 + 1, 0.31, 0.48, -0.295);
    }
    for (const mesh of Object.values(this.chestMeshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  _openChest(chest, by) {
    if (!chest || chest.opened) return false;
    chest.opened = true;
    chest.by = by === this.player ? 'player' : by?.id ? `bot-${by.id}` : 'unknown';
    chest.lidT = 0.02;
    chest.rarity = chest.rarity || chest.loot?.rarity || RARITIES[0];
    this.sound?.chest?.();
    if (by === this.player) {
      this._spawnChestLoot(chest);
      this._feed(`${chest.rarity.label} CACHE OPENED`);
      if (this.onLoot) this.onLoot(chest);
    } else if (by) {
      this._giveBotChestLoot(by, chest);
    }
    this._writeChestMatrices();
    this._updateHud(true);
    return true;
  }

  _rollChestLoot(random = Math.random) {
    const rarity = rarityRoll(random);
    let weapon;
    if (random() < 0.24) {
      const base = MELEE_WEAPONS[Math.floor(random() * MELEE_WEAPONS.length)];
      weapon = {
        ...base,
        attachments: {},
        brItem: true,
        brRarity: rarity.key,
        damage: Math.round(base.damage * (1 + (rarity.mult - 1) * 0.55)),
        magSize: 0,
        mag: 0,
        brReserve: 0,
      };
    } else {
      const bases = WEAPONS.filter((w) => !w.melee && GUN_IDS.includes(w.id));
      const picked = pickWeighted(bases.map((w) => ({ ...w, weight: GUN_WEIGHTS[w.id] || 1 })), random);
      weapon = this._makeGun(picked, rarity) || this._makeGun(WEAPONS[0], rarity);
    }
    let attachment = null;
    if (!weapon.melee && random() < 0.42) {
      const options = compatibleAttachments(weapon);
      if (options.length) {
        const base = options[Math.floor(random() * options.length)];
        attachment = { ...base, brRarity: rarity.key, brColor: rarity.color };
      }
    }
    const ammo = rarity.ammo + Math.floor(random() * 12);
    const consumable = random() < 0.5 ? 'shield' : 'health';
    const amount = 22 + RARITIES.findIndex((r) => r.key === rarity.key) * 5;
    return { weapon, ammo, rarity, consumable, amount, attachment };
  }

  _giveBotChestLoot(bot, chest) {
    const loot = chest.loot;
    if (loot?.weapon) this._giveBotWeapon(bot, loot.weapon);
    bot.reserve = (bot.reserve || 0) + (loot?.ammo || 20);
    if (loot?.attachment && bot.weapon && !bot.weapon.melee) {
      const fits = compatibleAttachments(bot.weapon).some((a) => a.id === loot.attachment.id);
      if (fits) {
        bot.weapon.attachments = { ...(bot.weapon.attachments || {}), [loot.attachment.slot]: loot.attachment.id };
        applyWeaponMods(bot.weapon);
      }
    }
    if (loot?.consumable === 'shield') bot.shield = Math.min(bot.maxShield || 50, (bot.shield || 0) + (loot.amount || 25));
    else bot.health = Math.min(100, bot.health + (loot.amount || 25));
    bot.action = `LOOTED ${loot?.rarity?.label || ''} ${loot?.weapon?.name || 'CACHE'}`;
  }

  _spawnChestLoot(chest) {
    const loot = chest.loot;
    if (!loot) return;
    const items = [];
    items.push({ type: 'weapon', weapon: loot.weapon, rarity: loot.rarity });
    items.push({ type: 'ammo', amount: loot.ammo, rarity: loot.rarity });
    items.push({ type: loot.consumable, amount: loot.amount || 25, rarity: loot.rarity });
    if (loot.attachment) items.push({ type: 'attachment', attachment: loot.attachment, rarity: loot.rarity });
    items.forEach((item, i) => {
      const angle = (i / items.length) * Math.PI * 2 + chest.yaw;
      const pos = new THREE.Vector3(chest.pos.x + Math.cos(angle) * 1.15, chest.pos.y + 0.35, chest.pos.z + Math.sin(angle) * 1.15);
      // Keep the drop out of nearby walls, then let the normal ground solve
      // settle it. The small upward velocity is what makes the reveal physical.
      this.world.resolveCircle(pos, 0.22, pos.y);
      pos.y = this.world.sampleGround(pos.x, pos.z, pos.y) + 0.3;
      this._makeLootItem(item, pos);
    });
  }

  _buildDroppedWeapon(weapon, group) {
    const dark = new THREE.MeshLambertMaterial({ color: 0x252a2c });
    const steel = new THREE.MeshLambertMaterial({ color: 0x818c91 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x5a3a20 });
    const add = (w, h, d, x, y, z, mat, rx = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      group.add(mesh);
      return mesh;
    };
    const id = String(weapon?.model || weapon?.id || '').toLowerCase();
    if (weapon?.melee) {
      add(0.055, 0.055, 0.78, 0, 0.06, 0, wood);
      add(0.24, 0.18, 0.045, 0, 0.06, -0.38, steel);
      add(0.14, 0.06, 0.06, 0.11, 0.06, -0.38, new THREE.MeshLambertMaterial({ color: 0xb33b2d }));
      return;
    }
    if (/pistol|magnum|hammer/.test(id)) {
      add(0.38, 0.075, 0.1, 0, 0.06, -0.03, dark);
      add(0.1, 0.2, 0.09, -0.12, -0.08, 0.02, wood, 0, -0.18);
      add(0.09, 0.045, 0.08, 0, 0.11, -0.02, steel);
      return;
    }
    if (/shotgun|scatter|sawedoff/.test(id)) {
      add(0.22, 0.1, 0.2, 0.25, 0.04, 0.01, wood, 0, -0.12);
      add(0.26, 0.11, 0.13, 0.02, 0.06, 0, dark);
      add(0.5, 0.055, 0.055, -0.34, 0.08, 0, steel);
      add(0.18, 0.085, 0.12, -0.25, 0.015, 0, wood);
      return;
    }
    if (/smg|vector|nailer/.test(id)) {
      add(0.32, 0.11, 0.12, 0, 0.06, 0, dark);
      add(0.09, 0.2, 0.08, -0.06, -0.1, 0.02, dark, 0, -0.1);
      add(0.08, 0.2, 0.07, 0.02, -0.09, -0.08, steel);
      add(0.22, 0.07, 0.055, -0.26, 0.07, 0, steel);
      return;
    }
    // Long guns: rifle, carbine, LMG, sniper and launcher silhouettes.
    add(0.24, 0.1, 0.18, 0.3, 0.05, 0, wood, 0, -0.06);
    add(0.46, 0.11, 0.13, 0, 0.06, 0, dark);
    add(0.42, 0.045, 0.045, -0.42, 0.07, 0, steel);
    add(0.1, 0.22, 0.08, 0.02, -0.1, 0.03, steel, 0, -0.08);
    if (/sniper|rifle|longshot|railbow/.test(id)) add(0.22, 0.055, 0.06, -0.03, 0.145, 0, steel);
    if (/lmg|minigun|thumper|siege/.test(id)) add(0.22, 0.15, 0.15, 0.02, -0.04, 0.1, dark);
  }

  _makeLootItem(data, pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const color = data.rarity?.color ?? 0xaaaaaa;
    if (data.type === 'weapon') {
      this._buildDroppedWeapon(data.weapon, group);
    } else if (data.type === 'ammo') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.19), new THREE.MeshLambertMaterial({ color: 0x6d5634 }));
      box.position.y = 0.06;
      group.add(box);
      const brass = new THREE.MeshLambertMaterial({ color: 0xc9a44d });
      for (let i = 0; i < 4; i++) {
        const round = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.13, 6), brass);
        round.rotation.z = Math.PI / 2;
        round.position.set(-0.09 + i * 0.06, 0.17, 0);
        group.add(round);
      }
    } else if (data.type === 'attachment') {
      const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0x30383c }));
      optic.rotation.z = Math.PI / 2;
      optic.position.set(0, 0.12, 0);
      group.add(optic);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 8), new THREE.MeshLambertMaterial({ color: 0x6e9aa2 }));
      lens.rotation.z = Math.PI / 2;
      lens.position.set(-0.115, 0.12, 0);
      group.add(lens);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.1), new THREE.MeshLambertMaterial({ color: 0x232b30 }));
      clamp.position.y = 0.02;
      group.add(clamp);
    } else if (data.type === 'shield') {
      const cell = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.18), new THREE.MeshLambertMaterial({ color: 0x307cae, emissive: 0x061c2c }));
      cell.position.y = 0.13;
      group.add(cell);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.04, 0.19), new THREE.MeshLambertMaterial({ color: 0xa8e7ff }));
      band.position.y = 0.13;
      group.add(band);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.2), new THREE.MeshLambertMaterial({ color: 0xe8e1d3 }));
      box.position.y = 0.12;
      group.add(box);
      const red = new THREE.MeshLambertMaterial({ color: 0xb93636 });
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.01), red)).position.set(0, 0.13, 0.106);
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.01), red)).position.set(0, 0.13, 0.107);
    }
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.44, 20), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.07;
    group.add(ring);
    group.rotation.y = Math.random() * Math.PI * 2;
    const angle = Math.random() * Math.PI * 2;
    this.scene.add(group);
    const item = {
      ...data, group, ring, age: 0, available: true, settled: false,
      position: group.position,
      vel: new THREE.Vector3(Math.cos(angle) * (0.6 + Math.random() * 0.8), 1.5 + Math.random() * 1.5, Math.sin(angle) * (0.6 + Math.random() * 0.8)),
    };
    this.loot.push(item);
    return item;
  }

  _removeLootItem(item) {
    const i = this.loot.indexOf(item);
    if (i >= 0) this.loot.splice(i, 1);
    if (item.group) {
      this.scene.remove(item.group);
      item.group.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
    }
  }

  _disposeLoot() {
    for (const item of this.loot) this._removeLootItem(item);
    this.loot.length = 0;
  }

  _updateLoot(dt) {
    for (const item of this.loot) {
      item.age += dt;
      item.ring.material.opacity = 0.26 + Math.sin(item.age * 3) * 0.1;
      if (item.settled) continue;
      item.vel.y -= 13 * dt;
      item.group.position.addScaledVector(item.vel, dt);
      const ground = this.world.sampleGround(item.group.position.x, item.group.position.z, item.group.position.y + 0.25);
      const rest = ground + 0.11;
      if (item.group.position.y <= rest) {
        item.group.position.y = rest;
        item.vel.y = Math.abs(item.vel.y) * 0.26;
        item.vel.x *= 0.52;
        item.vel.z *= 0.52;
        if (Math.abs(item.vel.y) < 0.55 && Math.hypot(item.vel.x, item.vel.z) < 0.18) {
          item.vel.set(0, 0, 0);
          item.restY = rest;
          item.settled = true;
          item.group.rotation.x = 0;
        }
      }
    }
    let chestDirty = false;
    for (const chest of this.chests) {
      if (chest.lidT > 0 && chest.lidT < 1) {
        chest.lidT = Math.min(1, chest.lidT + dt * 3.2);
        chestDirty = true;
      }
    }
    if (chestDirty) this._writeChestMatrices();
  }

  _dropBotLoot(bot) {
    if (bot.weapon?.brItem) {
      const item = { type: bot.weapon.melee ? 'weapon' : 'weapon', weapon: bot.weapon, rarity: RARITIES.find((r) => r.key === bot.weapon.brRarity) || RARITIES[0] };
      this._makeLootItem(item, new THREE.Vector3(bot.pos.x + 0.6, bot.pos.y + 0.2, bot.pos.z));
    }
    if (bot.reserve > 0) this._makeLootItem({ type: 'ammo', amount: Math.max(12, Math.min(42, bot.reserve)), rarity: RARITIES[0] }, new THREE.Vector3(bot.pos.x - 0.5, bot.pos.y + 0.2, bot.pos.z + 0.4));
    if (bot.weapon?.attachments) {
      for (const id of Object.values(bot.weapon.attachments)) {
        const attachment = ATTACHMENTS.find((a) => a.id === id);
        if (attachment) this._makeLootItem({ type: 'attachment', attachment, rarity: RARITIES.find((r) => r.key === (attachment.brRarity || 'rare')) || RARITIES[2] }, new THREE.Vector3(bot.pos.x + 0.3, bot.pos.y + 0.2, bot.pos.z - 0.5));
      }
    }
  }

  hearGunshot(pos) {
    if (!this.active) return;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const d = bot.pos.distanceTo(pos);
      if (d > 38) continue;
      bot.reaction = 2.4;
      if (!bot.target) {
        bot.lastSeen.copy(pos);
        bot.lastSeenAt = this.time;
        if (d < 22) {
          bot.destination.copy(pos);
          bot.action = 'INVESTIGATING GUNFIRE';
          bot.moveDir.copy(pos).sub(bot.pos).setY(0).normalize();
          bot.speed = 3.6;
        }
      }
    }
  }

  interactionPrompt() {
    if (!this.active) return '';
    const nearLoot = this._nearestLoot(this.player.pos, 2.25);
    if (nearLoot) {
      if (nearLoot.type === 'weapon') return `E  PICK UP ${nearLoot.rarity?.label || ''} ${nearLoot.weapon?.name || 'WEAPON'}`;
      if (nearLoot.type === 'ammo') return `E  PICK UP ${nearLoot.amount} ${nearLoot.rarity?.label || ''} AMMO`;
      if (nearLoot.type === 'attachment') return `E  PICK UP ${nearLoot.rarity?.label || ''} ${nearLoot.attachment?.name || 'ATTACHMENT'}`;
      return `E  USE ${nearLoot.rarity?.label || ''} ${nearLoot.type === 'shield' ? 'SHIELD' : 'MEDKIT'} +${nearLoot.amount}`;
    }
    const chest = this._nearestChest(this.player.pos, 2.4);
    if (chest) return `E  OPEN ${chest.rarity?.label || ''} CACHE`;
    return '';
  }

  _nearestLoot(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const item of this.loot) {
      if (!item.available) continue;
      const d = item.position.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  interact() {
    if (!this.active) return false;
    const item = this._nearestLoot(this.player.pos, 2.25);
    if (item) {
      this._pickupLoot(item);
      return true;
    }
    const chest = this._nearestChest(this.player.pos, 2.4);
    if (chest) return this._openChest(chest, this.player);
    this.player.onEmpty?.();
    return false;
  }

  _pickupLoot(item) {
    if (!item?.available) return;
    item.available = false;
    if (item.type === 'weapon') {
      this._givePlayerWeapon(item.weapon);
    } else if (item.type === 'ammo') {
      const gun = this.player.weapon;
      if (gun && !gun.melee) {
        gun.brReserve = (gun.brReserve || 0) + item.amount;
      } else {
        const firstGun = this.player.weapons.find((w) => w && !w.melee);
        if (firstGun) firstGun.brReserve = (firstGun.brReserve || 0) + item.amount;
        else this.player.onAmmo?.();
      }
      this.player.onAmmo?.();
    } else if (item.type === 'attachment') {
      const gun = this.player.weapon;
      if (gun && !gun.melee && item.attachment) {
        const fits = compatibleAttachments(gun).some((a) => a.id === item.attachment.id);
        if (fits) {
          gun.attachments = { ...(gun.attachments || {}), [item.attachment.slot]: item.attachment.id };
          applyWeaponMods(gun);
          this.player.onWeapon?.();
          this.player.onAim?.();
          this._feed(`ATTACHED ${item.rarity?.label || ''} ${item.attachment.name}`);
        } else {
          this._feed('ATTACHMENT DOES NOT FIT');
          item.available = true;
          return;
        }
      }
    } else if (item.type === 'health') {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + item.amount);
      this.player.onHealth?.(this.player.health);
    } else if (item.type === 'shield') {
      this.player.shield = Math.min(this.player.maxShield || 50, this.player.shield + item.amount);
      this.player.onHealth?.(this.player.health);
    }
    this._feed(item.type === 'weapon' ? `PICKED UP ${item.weapon?.name || 'WEAPON'}` : `PICKED UP ${item.type.toUpperCase()}`);
    this._removeLootItem(item);
    this._updateHud(true);
  }

  _givePlayerWeapon(weapon) {
    if (!weapon) return;
    const slotCount = this.player.weapons.length;
    const copy = { ...weapon, attachments: {} };
    if (slotCount < MAX_SLOTS) {
      this.player.weapons.push(copy);
      const index = this.player.weapons.length - 1;
      this.player.switchWeapon(index);
    } else {
      const replace = this.player.weaponIndex === 0 ? 1 : this.player.weaponIndex;
      this.player.weapons[replace] = copy;
      this.player.weaponIndex = replace;
      this.player.weapon = copy;
      this.player.magSize = copy.magSize;
      this.player.mag = copy.mag;
      this.player.buildGunModel?.();
      this.player.onWeapon?.();
      this.player.onAmmo?.();
    }
    this._feed(`EQUIPPED ${weapon.name}`);
  }

  // ---------------------------------------------------------------- storm
  _buildStorm() {
    this._disposeStorm();
    this.stormGroup = new THREE.Group();
    this.stormGroup.name = 'royale-storm';
    this.scene.add(this.stormGroup);
    const wallGeo = new THREE.CylinderGeometry(1, 1, 28, 80, 1, true);
    this.stormWall = new THREE.Mesh(wallGeo, this.stormMat);
    this.stormWall.position.y = 13;
    this.stormWall.renderOrder = 4;
    this.stormGroup.add(this.stormWall);
    const ringGeo = new THREE.RingGeometry(0.94, 1, 100);
    this.stormRing = new THREE.Mesh(ringGeo, this.stormRingMat);
    this.stormRing.rotation.x = -Math.PI / 2;
    this.stormRing.position.y = 0.12;
    this.stormGroup.add(this.stormRing);
    const first = PHASES[0];
    this.storm = {
      phase: 0,
      center: new THREE.Vector3(0, 0, 0),
      radius: (this.world.bounds || 118) - 6,
      state: 'hold',
      timer: 34,
      nextCenter: new THREE.Vector3(first.center[0], 0, first.center[1]),
      nextRadius: first.radius,
      phaseDamage: 17,
      damage: first.damage,
      shrinkDuration: first.shrink,
      shrinkT: 0,
      shrinkFromCenter: new THREE.Vector3(0, 0, 0),
      shrinkFromRadius: (this.world.bounds || 118) - 6,
      shrinkToCenter: new THREE.Vector3(first.center[0], 0, first.center[1]),
      shrinkToRadius: first.radius,
    };
    this._updateStormVisual();
  }

  _disposeStorm() {
    if (this.stormGroup) {
      this.scene.remove(this.stormGroup);
      this.stormGroup.traverse((o) => {
        o.geometry?.dispose?.();
      });
    }
    this.stormGroup = null;
    this.stormWall = null;
    this.stormRing = null;
    this.storm = null;
  }

  _updateStorm(dt) {
    const storm = this.storm;
    if (!storm) return;
    storm.timer -= dt;
    if (storm.state === 'hold' && storm.timer <= 0) {
      storm.state = 'shrink';
      storm.shrinkT = storm.shrinkDuration;
      storm.shrinkFromCenter.copy(storm.center);
      storm.shrinkFromRadius = storm.radius;
      storm.shrinkToCenter.copy(storm.nextCenter);
      storm.shrinkToRadius = storm.nextRadius;
      this._feed('THE STORM IS CLOSING');
    } else if (storm.state === 'shrink') {
      const t = 1 - Math.max(0, storm.shrinkT) / Math.max(0.001, storm.shrinkDuration);
      storm.radius = THREE.MathUtils.lerp(storm.shrinkFromRadius, storm.shrinkToRadius, t);
      storm.center.lerpVectors(storm.shrinkFromCenter, storm.shrinkToCenter, t);
      storm.shrinkT -= dt;
      if (storm.shrinkT <= 0) {
        storm.center.copy(storm.shrinkToCenter);
        storm.radius = storm.shrinkToRadius;
        storm.phase = Math.min(PHASES.length - 1, storm.phase + 1);
        const next = PHASES[storm.phase];
        storm.state = 'hold';
        storm.timer = next.hold;
        storm.damage = next.damage;
        storm.nextCenter.set(next.center[0], 0, next.center[1]);
        storm.nextRadius = next.radius;
        storm.shrinkDuration = next.shrink;
      }
    }
    storm.phaseDamage -= dt;
    if (storm.phaseDamage <= 0) {
      storm.phaseDamage = 0.9;
      if (this.player.pos.distanceTo(storm.center) > storm.radius) {
        this._hurtPlayer(storm.damage, null);
      }
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        if (bot.pos.distanceTo(storm.center) > storm.radius) {
          this.hitBot(bot, storm.damage, new THREE.Vector3(bot.pos.x, bot.pos.y + 1.1, bot.pos.z), null, null, { storm: true, weapon: 'STORM' });
        }
      }
    }
    this._updateStormVisual();
  }

  _updateStormVisual() {
    if (!this.storm || !this.stormWall) return;
    const s = this.storm;
    this.stormWall.position.set(s.center.x, 13, s.center.z);
    this.stormWall.scale.set(s.radius, 1, s.radius);
    this.stormRing.position.set(s.center.x, 0.12, s.center.z);
    this.stormRing.scale.set(s.radius, s.radius, 1);
    this.stormRing.rotation.z += 0.001;
    this.stormWall.material.opacity = 0.13 + Math.sin(this.time * 1.8) * 0.025;
  }

  // ---------------------------------------------------------------- minimap
  _drawMinimap() {
    const canvas = this.ui?.brMinimapCanvas;
    if (!canvas) return;
    if (!this._minimapCtx) this._minimapCtx = canvas.getContext('2d');
    const ctx = this._minimapCtx;
    const size = canvas.width;
    const B = this.world.bounds || 118;
    const toX = (x) => ((x + B) / (B * 2)) * size;
    const toY = (z) => ((z + B) / (B * 2)) * size;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#111a1c';
    ctx.fillRect(0, 0, size, size);

    const data = this.world.royaleData;
    for (const road of data?.roads || []) {
      if (road.type === 'water') {
        ctx.fillStyle = 'rgba(38,75,89,.75)';
        ctx.fillRect(toX(road.x - road.w / 2), toY(road.z - road.d / 2), (road.w / (B * 2)) * size, (road.d / (B * 2)) * size);
      } else {
        ctx.fillStyle = '#31332d';
        ctx.fillRect(toX(road.x - road.w / 2), toY(road.z - road.d / 2), (road.w / (B * 2)) * size, (road.d / (B * 2)) * size);
      }
    }
    for (const b of data?.buildings || []) {
      ctx.fillStyle = b.kind === 'large' ? '#6f5942' : '#554d40';
      ctx.fillRect(toX(b.x - b.w / 2), toY(b.z - b.d / 2), (b.w / (B * 2)) * size, (b.d / (B * 2)) * size);
      ctx.strokeStyle = 'rgba(220,190,140,.35)';
      ctx.strokeRect(toX(b.x - b.w / 2), toY(b.z - b.d / 2), (b.w / (B * 2)) * size, (b.d / (B * 2)) * size);
    }
    // chests near the player, not every cache on the island.
    for (const chest of this.chests) {
      if (chest.opened || chest.pos.distanceTo(this.player.pos) > 42) continue;
      ctx.fillStyle = '#d8b75f';
      ctx.fillRect(toX(chest.pos.x) - 1.5, toY(chest.pos.z) - 1.5, 3, 3);
    }

    if (this.storm) {
      const { center, radius, nextCenter, nextRadius } = this.storm;
      ctx.beginPath();
      ctx.arc(toX(center.x), toY(center.z), (radius / (B * 2)) * size, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(171,124,255,.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(100,65,180,.08)';
      ctx.fill();
      if (nextRadius > 0) {
        ctx.beginPath();
        ctx.arc(toX(nextCenter.x), toY(nextCenter.z), (nextRadius / (B * 2)) * size, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245,245,230,.7)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(245,245,230,.8)';
        ctx.font = '9px monospace';
        ctx.fillText('NEXT', toX(nextCenter.x) + 4, toY(nextCenter.z) - 4);
      }
    }

    const px = toX(this.player.pos.x);
    const py = toY(this.player.pos.z);
    const angle = Math.atan2(-Math.cos(this.player.yaw), -Math.sin(this.player.yaw));
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#f4ead8';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(220,230,225,.8)';
    ctx.font = '10px monospace';
    ctx.fillText('N', 6, 13);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillText(`${this.aliveCount()} BOTS`, 6, size - 7);
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (!this.active) return;
    const t0 = performance.now();
    this.matchTime += dt;
    this.time += dt;
    if (this.state === 'ending') {
      this.player.respawnT = 999;
      this.resultDelay -= dt;
      if (this.resultDelay <= 0 && !this.resultShown) {
        this.resultShown = true;
        this.onResult?.(this.result, this.snapshot());
      }
      this._updateBotVisuals(dt);
      this._drawMinimap();
      return;
    }
    if (this.player.dead) {
      this.player.respawnT = 999;
      this._finish('defeat');
      return;
    }
    this._updateStorm(dt);
    this._updateBots(dt);
    this._updateLoot(dt);
    this._updateBotVisuals(dt);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.15;
      this._updateHud();
    }
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.2;
      this._drawMinimap();
    }
    const ms = performance.now() - t0;
    this.perf.simMs += ms;
    this.perf.simSamples++;
    this.perf.lastSimMs = ms;
    if (this.perf.simSamples >= 30) {
      this.perf.simMs /= this.perf.simSamples;
      this.perf.simSamples = 0;
    }
    this.onHud?.(this.snapshot());
    if (this.aliveCount() === 0 && !this.player.dead) this._finish('victory');
  }

  _finish(result) {
    if (this.state !== 'fight') return;
    this.state = 'ending';
    this.result = result;
    this.resultDelay = 1.1;
    this.player.releaseTrigger?.();
    this.player.cancelAim?.();
    this.player.respawnT = 999;
    this._updateHud(true);
    if (result === 'victory') this._feed('LAST ONE STANDING');
    else this._feed('ELIMINATED');
  }
}
