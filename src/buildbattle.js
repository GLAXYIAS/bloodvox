import * as THREE from 'three';
import { BUILD_GRID, BUILD_LEVEL } from './building.js';

const _toPlayer = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * One AI builder. It is deliberately not omniscient: lastSeen only updates
 * while an actual line of sight exists, and every build/fire decision uses
 * that remembered point. Walls, floors and ramps are placed through the same
 * BuildSystem as the player, with the same resource costs.
 */
class BuildBrain {
  constructor({ npc, player, world, building, fx, battle }) {
    this.npc = npc;
    this.player = player;
    this.world = world;
    this.building = building;
    this.fx = fx;
    this.battle = battle;
    this.lastSeen = new THREE.Vector3().copy(player.pos);
    this.lastSeenAt = -10;
    this.buildCooldown = 0.7;
    this.editCooldown = 2.2;
    this.weaponCooldown = 1.5;
    this.wallFireCooldown = 0.8;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 0.8 + Math.random();
    this.stuckTimer = 0;
    this.jumpCooldown = 0;
    this.lastPos = npc.position.clone();
    this.lastCheck = 0;
    this.lastMaterials = { wood: 0, brick: 0, metal: 0 };
    this.actionLabel = 'HOLD';
    this.builtKinds = new Set();
    // Independent opening strategy. This timer starts with the match and does
    // not inspect the player's structures: the AI opens its own fight instead
    // of waiting for somebody else to build first.
    this.openingTime = 0;
    this.openingPhase = 0;
    this.openingCooldown = 0;
  }

  think(dt, playerPos) {
    const npc = this.npc;
    if (npc.dead) return;
    if (npc.physicalDown) {
      npc.speed = 0;
      npc.moveDir.set(0, 0, 0);
      npc.aiming = false;
      return;
    }

    npc.time += dt;
    this.openingTime += dt;
    npc.fear = Math.max(0, npc.fear - dt);
    npc.pain = Math.max(0, npc.pain - dt * 2.2);
    npc.lean += (0 - npc.lean) * Math.min(1, dt * 4);
    npc.staggerT = Math.max(0, npc.staggerT - dt);
    npc.aiming = false;
    if (npc.shootTimer > 0) npc.shootTimer -= dt;
    if (npc.attackCooldown > 0) npc.attackCooldown -= dt;
    npc.playerPos.copy(playerPos);
    this.buildCooldown = Math.max(0, this.buildCooldown - dt);
    this.openingCooldown = Math.max(0, this.openingCooldown - dt);
    this.editCooldown = Math.max(0, this.editCooldown - dt);
    this.weaponCooldown = Math.max(0, this.weaponCooldown - dt);
    this.wallFireCooldown = Math.max(0, this.wallFireCooldown - dt);

    _toPlayer.copy(playerPos).sub(npc.position);
    _toPlayer.y = 0;
    const dist = _toPlayer.length();
    if (dist > 0.001) _toPlayer.divideScalar(dist);

    npc.targetOffsetY = Math.max(0.45, this.player.bodyCenterY() - this.player.pos.y);
    const playerEye = _eye.set(this.player.pos.x, this.player.eyeY(), this.player.pos.z);
    const npcEye = this._npcEye();
    const los = npc.lineOfSight && this.world.hasLineOfSight(npcEye, playerEye);
    if (los) {
      this.lastSeen.copy(playerPos);
      this.lastSeenAt = npc.time;
    }

    const healthRatio = npc.health / Math.max(1, npc.maxHealth);
    const lowHealth = healthRatio < 0.48;
    const recentlyHit = npc.time - npc.lastDamageAt < 1.4;
    const playerAbove = playerPos.y > npc.position.y + 1.4;
    const behindCover = this.hasCoverWall();
    const seenRecently = npc.time - this.lastSeenAt < 4.5;

    // ---- stance ------------------------------------------------------
    // Crouch when using cover, when hurt, or while the player is firing and
    // there is a structure to hide behind. Stand when repositioning in the open.
    const wantCrouch =
      (behindCover && (recentlyHit || lowHealth || npc.shootTimer > 0.32)) ||
      (lowHealth && !los) ||
      (recentlyHit && behindCover);
    npc.crouching = !!wantCrouch;

    // ---- weapon choice ----------------------------------------------
    if (this.weaponCooldown <= 0) {
      if (dist < 5.5 && npc.gunKind !== 'pistol') {
        npc.setGunKind('pistol');
        this.weaponCooldown = 2.1;
      } else if (dist > 8 && npc.gunKind !== 'smg') {
        npc.setGunKind('smg');
        this.weaponCooldown = 2.1;
      }
    }

    // ---- opening build ----------------------------------------------
    // Deliberately independent of the player's build history. The opening
    // wall/ramp is a self-authored plan, so match verification can watch the
    // AI establish height before the human places a single piece.
    this.thinkOpeningBuild({ dist, los, recentlyHit, lowHealth, seenRecently });

    // ---- tactical building ------------------------------------------
    this.thinkBuilding({ dist, los, lowHealth, recentlyHit, playerAbove, behindCover, seenRecently });

    // ---- movement ----------------------------------------------------
    let moveX = 0;
    let moveZ = 0;
    let moveSpeed = 0;
    if (los) {
      if (dist > 15) {
        moveX = _toPlayer.x;
        moveZ = _toPlayer.z;
        moveSpeed = 3.2;
        this.actionLabel = 'CLOSE DISTANCE';
      } else if (dist < 4.5) {
        moveX = -_toPlayer.x;
        moveZ = -_toPlayer.z;
        moveSpeed = 2.1;
        this.actionLabel = 'BACK OFF';
      } else if (!behindCover || recentlyHit || lowHealth) {
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeSign *= -1;
          this.strafeTimer = 0.8 + Math.random() * 1.1;
        }
        moveX = -_toPlayer.z * this.strafeSign;
        moveZ = _toPlayer.x * this.strafeSign;
        moveSpeed = 1.7;
        this.actionLabel = recentlyHit ? 'EVADE' : 'STRAFE';
      } else {
        this.actionLabel = npc.crouching ? 'HOLD COVER' : 'HOLD ANGLE';
      }
    } else if (seenRecently) {
      const dx = this.lastSeen.x - npc.position.x;
      const dz = this.lastSeen.z - npc.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2) {
        moveX = dx / d;
        moveZ = dz / d;
        moveSpeed = 2.9;
        this.actionLabel = 'SEARCH LAST CONTACT';
      } else {
        // The trail went cold at a wall. Cut a firing port or reset the wall,
        // then push through instead of walking into it forever.
        this.actionLabel = 'BREACH';
        if (this.editCooldown <= 0) this.editNearbyWall();
      }
    } else {
      this.actionLabel = 'PATROL';
      moveX = Math.sin(npc.time * 0.7);
      moveZ = Math.cos(npc.time * 0.7);
      moveSpeed = 0.9;
    }

    if (moveSpeed > 0 && (moveX || moveZ)) {
      npc.move({ x: moveX, z: moveZ }, moveSpeed, dt);
    } else {
      npc.speed = 0;
      npc.moveDir.set(0, 0, 0);
    }

    // Tactical vault: if the shared locomotion step reports that cover stopped
    // the body, spend a jump instead of grinding into it. The jump preserves
    // the horizontal velocity already built by the strafe.
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (npc.locomotionGrounded && this.jumpCooldown <= 0 &&
        (npc.locomotionBlocked || playerAbove) && (moveSpeed > 0 || los)) {
      if (npc.jump(playerAbove ? 5.8 : 5.4)) {
        this.jumpCooldown = 1.35;
        this.actionLabel = 'VAULT COVER';
      }
    }

    // ---- aim and fire ------------------------------------------------
    if (los || seenRecently) {
      const face = Math.atan2(
        (los ? playerPos.x : this.lastSeen.x) - npc.position.x,
        (los ? playerPos.z : this.lastSeen.z) - npc.position.z,
      );
      npc.yaw = angleLerp(npc.yaw, face, Math.min(1, dt * 9));
      npc.forward.set(Math.sin(npc.yaw), 0, Math.cos(npc.yaw));
      npc.right.set(Math.cos(npc.yaw), 0, -Math.sin(npc.yaw));
    }

    if (los) {
      npc.aimPoint.set(playerPos.x, this.player.bodyCenterY(), playerPos.z);
      npc.aiming = true;
      if (dist < 28 && npc.shootTimer <= 0) {
        npc.fireGun();
        // The shared NPC fire helper is tuned for slow, readable sandbox
        // duels. A 1v1 builder has to apply real pressure, so keep its cadence
        // tight while still leaving reaction windows between bursts.
        npc.shootTimer = npc.gunKind === 'smg'
          ? 0.34 + Math.random() * 0.22
          : 0.52 + Math.random() * 0.26;
        this.actionLabel = 'FIRE';
      }
    } else if (seenRecently && this.wallFireCooldown <= 0) {
      // Suppress the remembered position. The NPC manager raycasts its own
      // muzzle line, so this damages a player wall in the way and cannot cheat
      // a hit through it.
      npc.aimPoint.set(this.lastSeen.x, this.player.bodyCenterY(), this.lastSeen.z);
      npc.aiming = true;
      npc.fireGun();
      npc.shootTimer = 0.5 + Math.random() * 0.3;
      this.wallFireCooldown = 1.4;
      this.actionLabel = 'SUPPRESS WALL';
    }

    // ---- trapped / stuck detection -----------------------------------
    this.stuckTimer += dt;
    if (this.stuckTimer > 0.8) {
      const moved = npc.position.distanceTo(this.lastPos);
      if (moved < 0.06 && npc.speed > 0.2 && this.editCooldown <= 0) {
        // A blocked doorway is sometimes lower than the NPC's shoulder: try a
        // real jump before spending a ramp, then edit or build if still stuck.
        if (!(npc.locomotionGrounded && npc.jump(5.6))) {
          // Try a wall port, then a real floor/roof rotation hole, then spend
          // resources on a ramp. Each branch is an actual section edit.
          if (!this.editNearbyWall() && !this.editFloorForRotation()) {
            this.buildRampToward(this.lastSeen, 'ESCAPE RAMP');
          }
        } else {
          this.actionLabel = 'JUMP ESCAPE';
        }
      }
      this.lastPos.copy(npc.position);
      this.stuckTimer = 0;
    }
  }

  _npcEye() {
    const crouch = this.npc.crouchAmount || 0;
    return new THREE.Vector3(
      this.npc.position.x,
      this.npc.position.y + 1.42 - crouch * 0.42,
      this.npc.position.z,
    );
  }

  hasCoverWall() {
    const npc = this.npc;
    // Assess cover against the last observed player position, not the real one.
    // A wall is still useful when the trail is cold, but the AI must not gain
    // free knowledge of the player's current location through this decision.
    const dx = this.lastSeen.x - npc.position.x;
    const dz = this.lastSeen.z - npc.position.z;
    const d = Math.hypot(dx, dz) || 1;
    for (const s of this.building.structures) {
      if (s.owner !== 'ai' || s.kind !== 'wall' || s.variant === 'door') continue;
      const sx = s.mesh.position.x - npc.position.x;
      const sz = s.mesh.position.z - npc.position.z;
      const sd = Math.hypot(sx, sz);
      if (sd > 4.2 || sd < 0.2) continue;
      if ((sx * dx + sz * dz) / (sd * d) > 0.35) return true;
    }
    return false;
  }

  thinkOpeningBuild({ dist, los, recentlyHit, lowHealth, seenRecently }) {
    if (this.openingPhase >= 2 || this.openingCooldown > 0) return false;
    if (this.openingTime < 1.15) return false;
    if (!los && !seenRecently && !recentlyHit) {
      // Keep the opening simple when the player has not yet been seen: a
      // forward wall is still useful against the last known contact point.
      if (this.openingTime < 2.2) return false;
    }
    const threat = los ? this.player.pos : this.lastSeen;
    if (this.openingPhase === 0) {
      if (this.buildWallToward(threat, 'wood')) {
        this.openingPhase = 1;
        this.openingCooldown = 1.25;
        this.buildCooldown = Math.max(this.buildCooldown, 1.25);
        this.actionLabel = 'OPENING WALL';
        return true;
      }
      // A duplicated opening cell is possible when both fighters start close.
      // Shift the plan instead of spinning on the same blocked cell.
      const dx = threat.x - this.npc.position.x;
      const dz = threat.z - this.npc.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const side = this.strafeSign;
      if (this.building.place('ai', 'wall', 'wood', this.npc.position, { x: dx / d + side * 0.35, z: dz / d }, null, 0)) {
        this.openingPhase = 1;
        this.openingCooldown = 1.25;
        this.buildCooldown = Math.max(this.buildCooldown, 1.25);
        this.actionLabel = 'OPENING WALL';
        return true;
      }
      return false;
    }
    if (this.openingPhase === 1 && this.openingTime > 2.35) {
      if (this.buildRampToward(threat, 'OPENING RAMP')) {
        this.openingPhase = 2;
        this.openingCooldown = 1.4;
        this.buildCooldown = Math.max(this.buildCooldown, 1.4);
        return true;
      }
      // If the exact ramp cell is occupied (often by the new wall), step to
      // the side and preserve the plan rather than abandoning it.
      const side = this.strafeSign;
      if (this.building.place('ai', 'ramp', 'wood', this.npc.position, { x: side, z: 0 }, null, 0)) {
        this.openingPhase = 2;
        this.openingCooldown = 1.4;
        this.buildCooldown = Math.max(this.buildCooldown, 1.4);
        this.actionLabel = 'OPENING RAMP';
        return true;
      }
    }
    return false;
  }

  thinkBuilding(ctx) {
    const npc = this.npc;
    if (this.buildCooldown > 0) return;
    const { dist, los, lowHealth, recentlyHit, playerAbove, behindCover, seenRecently } = ctx;
    const material = this.building.chooseMaterial('ai', 'wall', lowHealth);
    if (!material) return;

    // 1. Immediate defence: a wall between the AI and the shooter. While the
    // player is out of sight, build against the last confirmed contact point.
    const threat = los ? this.player.pos : this.lastSeen;
    if ((recentlyHit || lowHealth) && !behindCover && (los || seenRecently) && dist < 20) {
      if (this.buildWallToward(threat, lowHealth ? 'brick' : material)) {
        this.buildCooldown = 1.15;
        return;
      }
    }

    // 2. Vertical disadvantage or no sightline: ramp up to a new angle.
    if ((playerAbove || (!los && seenRecently)) && dist > 4 && dist < 24) {
      if (this.buildRampToward(playerAbove ? this.player.pos : this.lastSeen)) {
        this.buildCooldown = 1.6;
        return;
      }
    }

    // 3. Overhead cover while hurt or under fire.
    if ((lowHealth || recentlyHit) && !this.hasRoofOverhead() && dist < 18) {
      if (this.buildRoofOverhead()) {
        this.buildCooldown = 1.7;
        return;
      }
    }

    // 4. Extend an existing high platform so the AI can push on its own
    //    structure rather than standing on a single ramp.
    if (npc.position.y > 0.55 && los && dist > 5 && !this.hasFloorAhead()) {
      if (this.buildFloorToward(this.player.pos)) {
        this.buildCooldown = 1.9;
        return;
      }
    }

    // 5. If a player wall is blocking the angle, cut a window in our own wall
    //    or suppress the player's structure. Nothing is built at random.
    if (!los && seenRecently && this.editCooldown <= 0) {
      this.editNearbyWall();
    }
  }

  buildWallToward(target, material = null) {
    const npc = this.npc;
    const dx = target.x - npc.position.x;
    const dz = target.z - npc.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / d, z: dz / d };
    const mat = material || this.building.chooseMaterial('ai', 'wall');
    if (!mat) return false;
    const s = this.building.place('ai', 'wall', mat, npc.position, dir);
    if (s) {
      this.builtKinds.add('wall');
      this.actionLabel = 'DEFENSIVE WALL';
      return true;
    }
    return false;
  }

  buildRampToward(target, label = 'HEIGHT RAMP') {
    const npc = this.npc;
    const dx = target.x - npc.position.x;
    const dz = target.z - npc.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / d, z: dz / d };
    const mat = this.building.chooseMaterial('ai', 'ramp');
    if (!mat) return false;
    const s = this.building.place('ai', 'ramp', mat, npc.position, dir);
    if (s) {
      this.builtKinds.add('ramp');
      this.actionLabel = label;
      return true;
    }
    return false;
  }

  buildFloorToward(target) {
    const npc = this.npc;
    const dx = target.x - npc.position.x;
    const dz = target.z - npc.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / d, z: dz / d };
    const mat = this.building.chooseMaterial('ai', 'floor');
    if (!mat) return false;
    const s = this.building.place('ai', 'floor', mat, npc.position, dir);
    if (s) {
      this.builtKinds.add('floor');
      this.actionLabel = 'EXTEND PLATFORM';
      return true;
    }
    return false;
  }

  buildRoofOverhead() {
    const npc = this.npc;
    const cellX = Math.round(npc.position.x / BUILD_GRID);
    const cellZ = Math.round(npc.position.z / BUILD_GRID);
    const level = Math.max(0, Math.min(5, Math.floor(npc.position.y / BUILD_LEVEL)));
    const mat = this.building.chooseMaterial('ai', 'roof', true);
    if (!mat) return false;
    const s = this.building.placeAt('ai', 'roof', mat, cellX, cellZ, level, 0);
    if (s) {
      this.builtKinds.add('roof');
      this.actionLabel = 'OVERHEAD COVER';
      return true;
    }
    return false;
  }

  hasRoofOverhead() {
    const npc = this.npc;
    const cellX = Math.round(npc.position.x / BUILD_GRID);
    const cellZ = Math.round(npc.position.z / BUILD_GRID);
    const level = Math.max(0, Math.min(5, Math.floor(npc.position.y / BUILD_LEVEL)));
    return this.building.structures.some(
      (s) => s.owner === 'ai' && s.kind === 'roof' && s.cellX === cellX && s.cellZ === cellZ && s.level === level,
    );
  }

  hasFloorAhead() {
    const npc = this.npc;
    const len = Math.hypot(this.player.pos.x - npc.position.x, this.player.pos.z - npc.position.z) || 1;
    const dx = (this.player.pos.x - npc.position.x) / len;
    const dz = (this.player.pos.z - npc.position.z) / len;
    const cellX = Math.round((npc.position.x + dx * BUILD_GRID) / BUILD_GRID);
    const cellZ = Math.round((npc.position.z + dz * BUILD_GRID) / BUILD_GRID);
    const level = Math.max(0, Math.min(5, Math.round(npc.position.y / BUILD_LEVEL)));
    return this.building.structures.some(
      (s) => s.kind === 'floor' && s.cellX === cellX && s.cellZ === cellZ && s.level === level,
    );
  }

  editNearbyWall() {
    if (this.editCooldown > 0) return false;
    const wall = this.building.nearestStructure(this.npc.position, 'ai', 5, 'wall');
    if (!wall) return false;
    const injured = this.npc.health < this.npc.maxHealth * 0.55;
    const sections = injured ? [6, 7, 8] : [4];
    this.building.setEditSections(wall, sections);
    this.editCooldown = 2.6;
    this.actionLabel = injured ? 'CUT ESCAPE DOOR' : 'CUT FIRING PORT';
    return true;
  }

  editFloorForRotation() {
    if (this.editCooldown > 0) return false;
    const floor = this.building.nearestStructure(this.npc.position, 'ai', 4, 'floor')
      || this.building.nearestStructure(this.npc.position, 'ai', 4, 'roof');
    if (!floor) return false;
    this.building.setEditSections(floor, [4]);
    this.editCooldown = 2.8;
    this.actionLabel = 'CUT ROTATION HOLE';
    return true;
  }
}

/**
 * Match controller: spawn, resources, win/loss, restart and the shared build
 * preview. The arena rebuild is owned by main.js; this class owns the fight.
 */
export class BuildBattle {
  constructor({ scene, world, building, player, npcs, fx, sound = null }) {
    this.scene = scene;
    this.world = world;
    this.building = building;
    this.player = player;
    this.npcs = npcs;
    this.fx = fx;
    this.sound = sound;
    this.active = false;
    this.state = 'idle';
    this.result = null;
    this.resultShown = false;
    this.resultDelay = 0;
    this.matchTime = 0;
    this.ai = null;
    this.brain = null;
    this.onResult = null;
    this.onHud = null;
    this.onStart = null;
    this.onStop = null;
    this.playerHealth = 150;
    this.aiHealth = 150;
    this.startPos = new THREE.Vector3(0, 0, 11);
    this.aiPos = new THREE.Vector3(0, 0, -11);
  }

  start() {
    if (this.active) this.stop({ restorePlayer: false });
    this.building.resetAll();
    this.building.resetResources();
    this.player.configureMatch({
      spawn: this.startPos.clone(),
      yaw: 0,
      maxHealth: this.playerHealth,
      regenRate: 0,
    });
    // Face the AI and select the rifle slot when one exists, without changing
    // the player's saved loadout.
    const rifle = this.player.weapons.findIndex((w) => w.id === 'rifle');
    if (rifle >= 0) {
      this.player.weaponIndex = rifle;
      this.player.weapon = this.player.weapons[rifle];
      this.player.magSize = this.player.weapon.magSize;
      this.player.mag = this.player.weapon.magSize;
      this.player.weapon.mag = this.player.mag;
      this.player.buildGunModel?.();
      this.player.onWeapon?.();
      this.player.onAmmo?.();
    }

    const ai = this.npcs.spawn(true, this.aiPos.clone(), { armour: false });
    if (!ai) return false;
    this.ai = ai;
    ai.buildBattle = true;
    ai.aggressive = true;
    ai.armed = true;
    ai.maxHealth = this.aiHealth;
    ai.health = this.aiHealth;
    ai.maxHealth = this.aiHealth;
    ai.equipGun(true, 'smg');
    ai.crouching = false;
    ai.targetOffsetY = this.player.bodyCenterY() - this.player.pos.y;
    ai.label = 'BOT';
    this.brain = new BuildBrain({
      npc: ai,
      player: this.player,
      world: this.world,
      building: this.building,
      fx: this.fx,
      battle: this,
    });
    ai.think = (dt, playerPos) => this.brain.think(dt, playerPos);

    this.active = true;
    this.state = 'fight';
    this.result = null;
    this.resultShown = false;
    this.resultDelay = 0;
    this.matchTime = 0;
    this.onStart?.();
    this.onHud?.(this.snapshot());
    return true;
  }

  stop({ restorePlayer = true } = {}) {
    if (this.ai) {
      this.ai.think = () => {};
      this.ai.dispose?.();
      const i = this.npcs.npcs.indexOf(this.ai);
      if (i >= 0) this.npcs.npcs.splice(i, 1);
      this.ai = null;
      this.brain = null;
    }
    this.building.resetAll();
    this.building.hidePreview();
    this.active = false;
    this.state = 'idle';
    this.result = null;
    this.resultShown = false;
    if (restorePlayer) this.player.restoreSandbox();
    this.onStop?.();
    this.onHud?.(this.snapshot());
  }

  restart() {
    this.stop({ restorePlayer: false });
    return this.start();
  }

  update(dt) {
    if (!this.active) return;
    this.matchTime += dt;
    this.building.update(dt);
    if (this.state === 'fight') {
      if (this.player.dead) {
        // The normal sandbox respawn must not quietly erase a loss.
        this.player.respawnT = 999;
        this.finish('defeat');
      } else if (this.ai?.dead) {
        this.finish('victory');
      }
    } else if (this.state === 'ending') {
      this.player.respawnT = 999;
      this.resultDelay -= dt;
      if (this.resultDelay <= 0 && !this.resultShown) {
        this.resultShown = true;
        this.onResult?.(this.result, this.snapshot());
      }
    }
    this.onHud?.(this.snapshot());
  }

  finish(result) {
    if (this.state !== 'fight') return;
    this.state = 'ending';
    this.result = result;
    this.resultDelay = 1.25;
    this.player.releaseTrigger?.();
    this.player.cancelAim?.();
  }

  snapshot() {
    return {
      active: this.active,
      state: this.state,
      result: this.result,
      resultShown: this.resultShown,
      time: this.matchTime,
      playerHealth: this.player.health,
      playerMax: this.player.maxHealth,
      aiHealth: this.ai?.health ?? 0,
      aiMax: this.ai?.maxHealth ?? this.aiHealth,
      aiCrouching: !!this.ai?.crouching,
      aiAction: this.brain?.actionLabel || '',
      aiBuilt: this.brain ? [...this.brain.builtKinds] : [],
      resources: this.building.resources,
      structures: this.building.structures.length,
    };
  }
}
