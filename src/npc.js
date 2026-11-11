import * as THREE from 'three';
import { Humanoid } from './humanoid.js';

const _muzzle = new THREE.Vector3();
const _target = new THREE.Vector3();
const _end = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _push = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _shotRay = new THREE.Raycaster();

/** Owns every body in the pit: spawning, armour variants, guns, corpse bookkeeping. */
export class NPCManager {
  constructor({ scene, world, physics, fx, player, debris, organs }) {
    this.scene = scene;
    this.world = world;
    this.physics = physics;
    this.fx = fx;
    this.player = player;
    this.debris = debris;
    this.organs = organs;
    this.npcs = [];
    this.targets = [];
    this.maxAlive = this.world.mapData?.maxAlive ?? 10;
    this.spawnTimer = 0.5;
    this.fightBack = false;
    this.gunMode = false;
    this.building = null;
    this.onGunshot = null;
    this.onWaveStart = null;
    this.onWaveCleared = null;
    this.waveMode = false;
    this.wave = 0;
    this.waveState = 'idle';
    this.waveTimer = 0;
    this.waveSize = 0;
    this._v = new THREE.Vector3();
    const initial = this.world.mapData?.npcCount ?? 9;
    for (let i = 0; i < initial; i++) this.spawn(true);
  }

  spawn(initial = false, at = null, options = {}) {
    const pos = at ? at.clone() : this.world.randomSpawn();
    if (!initial && pos.distanceTo(this.player.pos) < 7) return null;
    const hostile = this.fightBack || this.gunMode || this.waveMode;
    const waveBonus = this.waveMode ? Math.min(0.2, this.wave * 0.018) : 0;
    const armour = options.armour ?? Math.random() < Math.min(0.72, (hostile ? 0.48 : 0.36) + waveBonus);
    const npc = new Humanoid({
      scene: this.scene,
      world: this.world,
      physics: this.physics,
      fx: this.fx,
      debris: this.debris,
      organs: this.organs,
      position: pos,
      yaw: Math.random() * Math.PI * 2,
      armour,
    });
    npc.aggressive = hostile;
    npc.onAttack = (dmg, from, dir) => this.player.damage(dmg, dir);
    npc.onShoot = () => this.shoot(npc);
    if (this.waveMode && this.wave > 0) {
      const bonus = Math.min(90, (this.wave - 1) * 9);
      npc.maxHealth += bonus;
      npc.health += bonus;
    }
    const waveArmed =
      this.waveMode && this.wave >= 2 && Math.random() < Math.min(0.62, 0.13 + this.wave * 0.08);
    if (this.gunMode || waveArmed) {
      const kind = Math.random() < (armour ? 0.6 : 0.3) ? 'smg' : 'pistol';
      npc.equipGun(true, kind);
    }
    this.npcs.push(npc);
    return npc;
  }

  /** Remove every body, for an arena swap. */
  disposeAll() {
    for (const npc of this.npcs) npc.dispose();
    this.npcs.length = 0;
    this.targets.length = 0;
  }

  /** Rebuild the population for the current arena, preserving the mode. */
  reset() {
    this.disposeAll();
    this.spawnTimer = 0.5;
    this.maxAlive = this.world.mapData?.maxAlive ?? 10;
    this.wave = 0;
    this.waveSize = 0;
    if (this.waveMode) {
      this.waveState = 'intermission';
      this.waveTimer = 1.8;
    } else {
      this.waveState = 'idle';
      this.waveTimer = 0;
      const initial = this.world.mapData?.npcCount ?? 9;
      for (let i = 0; i < initial; i++) this.spawn(true);
    }
    this.applyAggro();
  }

  aliveCount() {
    let n = 0;
    for (const npc of this.npcs) if (!npc.dead) n++;
    return n;
  }

  applyAggro() {
    const hostile = this.fightBack || this.gunMode || this.waveMode;
    for (const npc of this.npcs) npc.aggressive = hostile && !npc.dead;
  }

  setWaveMode(on) {
    const next = !!on;
    if (this.waveMode === next) return;
    this.waveMode = next;
    this.wave = 0;
    this.waveSize = 0;
    if (next) {
      this.disposeAll();
      this.waveState = 'intermission';
      this.waveTimer = 1.8;
    } else {
      this.waveState = 'idle';
      this.waveTimer = 0;
      this.spawnTimer = 0.5;
    }
    this.applyAggro();
  }

  startWave() {
    this.wave++;
    this.waveState = 'active';
    this.waveSize = Math.min(12, 4 + Math.ceil(this.wave * 1.7));
    let spawned = 0;
    let attempts = 0;
    while (spawned < this.waveSize && attempts < this.waveSize * 12) {
      attempts++;
      if (this.spawn(false)) spawned++;
    }
    this.waveSize = spawned;
    this.applyAggro();
    this.onWaveStart?.(this.wave, spawned);
  }

  setFightBack(on) {
    this.fightBack = !!on;
    this.applyAggro();
  }

  /** Every living NPC gets a visible sidearm and permission to use it. */
  setGunMode(on) {
    this.gunMode = !!on;
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      const kind = npc.armoured && Math.random() < 0.55 ? 'smg' : 'pistol';
      npc.equipGun(this.gunMode, kind);
    }
    this.applyAggro();
  }

  alert(source) {
    if (this.fightBack || this.gunMode || this.waveMode) return;
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      const d = npc.position.distanceTo(source);
      if (d < 18) npc.fear = Math.max(npc.fear, 3 + Math.random() * 3);
    }
  }

  update(dt, playerPos) {
    if (this.waveMode) {
      if (this.waveState === 'intermission') {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.startWave();
      } else if (this.waveState === 'active' && this.aliveCount() === 0) {
        const cleared = this.wave;
        this.waveState = 'intermission';
        this.waveTimer = 4.5;
        this.onWaveCleared?.(cleared);
      }
    } else {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.aliveCount() < this.maxAlive) {
        this.spawnTimer = this.gunMode ? 1.25 : 1.5;
        this.spawn(false);
      }
    }

    const eyeY = this.player.eyeY ? this.player.eyeY() : playerPos.y + 1.15;
    const bodyY = this.player.bodyCenterY ? this.player.bodyCenterY() : playerPos.y + 1.12;
    for (const npc of this.npcs) {
      // The AI aims at the actual crouched body centre, not a standing chest
      // height that would keep hitting an empty space above the player.
      npc.targetOffsetY = bodyY - playerPos.y;
      if (!npc.dead && npc.armed) {
        const crouchDrop = (npc.crouchAmount || 0) * 0.42;
        _from.set(npc.position.x, npc.position.y + 1.42 - crouchDrop, npc.position.z);
        _to.set(playerPos.x, eyeY, playerPos.z);
        npc.lineOfSight = this.world.hasLineOfSight(_from, _to);
      }
      npc.update(dt, playerPos);
    }
  }

  /**
   * A gunman takes a shot. Accuracy is deliberately range-dependent: close
   * range is dangerous, long range is mostly suppressive fire.
   */
  shoot(npc) {
    if (npc.dead || this.player.dead) return;
    npc.muzzleWorld(_muzzle);
    const bodyY = this.player.bodyCenterY ? this.player.bodyCenterY() : this.player.pos.y + 1.12;
    _target.set(this.player.pos.x, bodyY, this.player.pos.z);
    _dir.copy(_target).sub(_muzzle).normalize();

    const dist = npc.position.distanceTo(this.player.pos);

    // Enemy fire obeys the same physical walls as the player's rounds. If a
    // structure (or the arena) is in the way, the shot hits it and never rolls
    // a hit against the body behind it.
    const reach = _muzzle.distanceTo(_target) + 0.2;
    _shotRay.set(_muzzle, _dir);
    _shotRay.far = reach;
    const blocker = _shotRay.intersectObjects(this.world.raycastTargets, false)[0];
    if (blocker && blocker.distance < reach - 0.25) {
      if (blocker.object.userData.structure) {
        this.building?.damageStructure(
          blocker.object.userData.structure,
          npc.buildBattle ? 16 : 9,
          blocker.point,
          _dir,
        );
      }
      this.onGunshot?.(_muzzle.clone(), blocker.point.clone(), npc.gunKind, false);
      return;
    }

    let chance = npc.buildBattle
      ? THREE.MathUtils.clamp(0.62 - dist * 0.016, 0.24, 0.68)
      : THREE.MathUtils.clamp(0.6 - dist * 0.021, 0.13, 0.56);
    if (npc.gunKind === 'smg') chance *= 0.9;
    if (npc.armoured) chance += 0.06;
    if (this.player.keys.sprint) chance *= 0.88;
    if (this.player.crouchBlend > 0.45) chance *= 0.72;

    const hit = Math.random() < chance;
    _end.copy(_target);
    if (!hit) {
      _end.x += (Math.random() - 0.5) * 1.5;
      _end.y += (Math.random() - 0.5) * 1.1;
      _end.z += (Math.random() - 0.5) * 1.5;
    } else {
      const base = npc.buildBattle ? (npc.gunKind === 'smg' ? 7.5 : 11.5) : npc.gunKind === 'smg' ? 5.5 : 8;
      const dmg = base * (npc.armoured ? 1.15 : 1);
      _push.copy(this.player.pos).sub(npc.position).setY(0);
      if (_push.lengthSq() < 0.001) _push.set(0, 0, 1);
      _push.normalize();
      this.player.damage(dmg, _push);
    }

    this.onGunshot?.(_muzzle.clone(), _end.clone(), npc.gunKind, hit);
  }

  /** Every shootable surface, including already-merged corpses. */
  refreshTargets() {
    this.targets.length = 0;
    for (const npc of this.npcs) {
      for (const part of npc.parts) {
        if (part.mesh) this.targets.push(part.mesh);
      }
      // Bones are exposed through carved voxel holes. They are legitimate
      // shootable surfaces, not decoration, so projectiles can strike the
      // skeleton after the flesh over it has been opened.
      for (const bone of npc.skeleton || []) {
        // Hidden bones are inside intact tissue and cannot be shot through the
        // skin. A carved wound exposes the bone and makes it a real target.
        if (bone.mesh && bone.mesh.visible) this.targets.push(bone.mesh);
      }
      if (npc.corpseMesh) this.targets.push(npc.corpseMesh);
    }
  }
}
