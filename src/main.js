import * as THREE from 'three';
import './style.css';
import './slowmo.css';
import './buildbattle.css';
import { World, MAPS } from './world.js';
import { FX } from './fx.js';
import { PhysicsWorld } from './physics.js';
import { NPCManager } from './npc.js';
import { Player, GUN_WEAPONS, SHOP_WEAPONS, MELEE_SHOP_WEAPONS, LOADOUT_SIZE, falloffDamage } from './player.js';
import { Market } from './market.js';
import { Sound } from './audio.js';
import { Debris } from './debris.js';
import { createOrgans } from './organs.js';
import {
  BASE_DECAL_LIFE,
  BLOOD_SETTINGS,
  setBloodSetting,
  GAME_SETTINGS,
  setGameSetting,
  childSafetyEnabled,
  KEYBINDS,
  KEYBIND_DEFS,
  keybindLabel,
  keybindOwner,
  isBindableCode,
  setKeybind,
  resetKeybinds,
} from './settings.js';
import { BuildSystem, buildPieceGeometry } from './building.js';
import { BuildBattle } from './buildbattle.js';
import { BattleRoyale } from './battleroyale.js';

const LAB_MODE = new URLSearchParams(location.search).has('lab');

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const RES_SCALE = 0.9;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202a35);
scene.fog = new THREE.FogExp2(0x2a3542, 0.0081);

const camera = new THREE.PerspectiveCamera(76, 1, 0.05, 230);
camera.rotation.order = 'YXZ';
scene.add(camera);

const headlamp = new THREE.PointLight(0xffe9d2, 21, 24, 2);
headlamp.position.set(0, 0.08, 0.15);
camera.add(headlamp);

// ---------------------------------------------------------------- lighting
const hemi = new THREE.HemisphereLight(0xc3d4f2, 0x5b4935, 2.45);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0x9fb4d3, 1.12);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffe8d0, 3.95);
sun.position.set(14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -26;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const rim = new THREE.DirectionalLight(0x9db8ee, 1.45);
rim.position.set(-16, 10, -14);
scene.add(rim);

const fill = new THREE.PointLight(0xffc38f, 58, 50, 2);
fill.position.set(0, 7, 2);
scene.add(fill);

// ---------------------------------------------------------------- systems
const world = new World(scene, 'pit');
const fx = new FX(scene, world);
const debris = new Debris(scene, world, 240);
const organs = createOrgans();
const physics = new PhysicsWorld();
physics.boxes = world.boxes;
const sound = new Sound();
const player = new Player({ camera, world, sound });
player.pos.set(world.mapData.spawn[0], 0, world.mapData.spawn[1]);
player.spawn.copy(player.pos);
const npcs = new NPCManager({ scene, world, physics, fx, player, debris, organs });

// Shared building system. The player and the Build Battle AI use the same
// placement rules, resource pool and destructible structures.
const building = new BuildSystem({
  scene,
  world,
  fx,
  sound,
  onEvent: (event) => {
    if (event.type === 'resources' || event.type === 'place' || event.type === 'destroy' || event.type === 'reset') {
      refreshBuildResources();
    }
  },
});
npcs.building = building;
const buildBattle = new BuildBattle({ scene, world, building, player, npcs, fx, sound });

// The lab is deliberately one stationary subject. It uses the production NPC,
// weapon and physics paths, but suppresses spawning, aggression and waves so a
// body-part test cannot be interrupted by a second body.
const LAB_TARGET_POS = new THREE.Vector3(0, 0, 9.6);
let labRespawnT = 1.5;

function spawnLabTarget() {
  const npc = npcs.spawn(true, LAB_TARGET_POS, { armour: false });
  if (!npc) return null;
  npc.maxHealth = 5000;
  npc.health = 5000;
  npc.aggressive = false;
  npc.fear = 0;
  npc.state = 'idle';
  npc.stateTimer = 999;
  npc.speed = 0;
  npc.yaw = 0;
  npc.forward.set(0, 0, 1);
  npc.right.set(1, 0, 0);
  npc.target.copy(npc.position);
  npc.think = () => {};
  npc.gunMesh && (npc.gunMesh.visible = false);
  return npc;
}

if (LAB_MODE) {
  npcs.disposeAll();
  npcs.fightBack = false;
  npcs.gunMode = false;
  npcs.waveMode = false;
  npcs.maxAlive = 1;
  npcs.spawnTimer = Infinity;
  player.pos.set(0, 0, 13.2);
  player.spawn.copy(player.pos);
  player.yaw = 0;
  player.pitch = -0.04;
  spawnLabTarget();
}

// ---------------------------------------------------------------- fx helpers
const tracers = [];
function spawnTracer(from, to, life = 0.06, opacity = 0.55) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, life, maxLife: life, opacity });
}

function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / t.maxLife) * t.opacity;
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

function clearTracers() {
  for (const t of tracers) {
    scene.remove(t.line);
    t.line.geometry.dispose();
    t.line.material.dispose();
  }
  tracers.length = 0;
}

// Grenades are real travelling objects, so the Thumper has travel time and
// the blast can throw every ragdoll around the impact point.
const projectiles = [];
const projectileGeo = new THREE.SphereGeometry(0.09, 8, 6);
const projectileMat = new THREE.MeshLambertMaterial({ color: 0x35372f, emissive: 0x180d05 });
const rocketMat = new THREE.MeshLambertMaterial({ color: 0x4a3b2c, emissive: 0x7a2107 });
const projectileRay = new THREE.Raycaster();
const _line = new THREE.Line3();
const _closest = new THREE.Vector3();
const _blastCenter = new THREE.Vector3();
const _blastDir = new THREE.Vector3();
const _rocketDir = new THREE.Vector3();

function launchProjectile(origin, dir, shot) {
  if (projectiles.length >= 12) {
    const old = projectiles.shift();
    scene.remove(old.mesh);
  }
  const mesh = new THREE.Mesh(projectileGeo, shot.projectileType === 'rocket' ? rocketMat : projectileMat);
  mesh.position.copy(origin);
  mesh.castShadow = true;
  if (shot.projectileType === 'rocket') mesh.scale.set(1.35, 1.35, 2.9);
  scene.add(mesh);
  projectiles.push({
    mesh,
    vel: dir.clone().multiplyScalar(shot.projectileSpeed || 31),
    gravity: shot.projectileGravity ?? 15,
    life: shot.projectileType === 'rocket' ? 6 : 4,
    shot,
    spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
  });
}

function detonateProjectile(projectile) {
  const index = projectiles.indexOf(projectile);
  if (index >= 0) projectiles.splice(index, 1);
  scene.remove(projectile.mesh);
  const point = projectile.mesh.position.clone();
  const blast = projectile.shot.blast || { radius: 3.5, damage: 120, force: 3 };
  fx.explosion(point, blast.radius);
  sound.explosion();
  for (const npc of npcs.npcs) {
    npc.worldCenter(_blastCenter);
    const dist = _blastCenter.distanceTo(point);
    if (dist > blast.radius) continue;
    const falloff = 1 - dist / blast.radius;
    _blastDir.copy(_blastCenter).sub(point);
    if (_blastDir.lengthSq() < 1e-4) _blastDir.set(0, 1, 0);
    _blastDir.normalize();
    const wasDead = npc.dead;
    npc.blast(point, _blastDir, blast.damage * (0.42 + falloff * 0.58), blast.force * (0.4 + falloff * 0.6));
    if (!wasDead && npc.dead) rewardKill(npc);
  }
  if (battleRoyale.active) battleRoyale.blast(point, blast.radius, blast.damage, blast.force);
  // Explosives are not selectively blocked by the builder's own walls. Every
  // piece in radius takes blast damage through the same structure API.
  for (const structure of [...building.structures]) {
    if (!structure.mesh) continue;
    const dist = structure.mesh.position.distanceTo(point);
    if (dist > blast.radius) continue;
    const falloff = 1 - dist / blast.radius;
    const dir = structure.mesh.position.clone().sub(point).normalize();
    building.damageStructure(structure, blast.damage * 0.55 * (0.3 + falloff * 0.7), point, dir);
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      detonateProjectile(p);
      continue;
    }
    const prev = p.mesh.position.clone();
    p.vel.y -= p.gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.shot.projectileType === 'rocket') {
      _rocketDir.copy(p.vel).normalize();
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _rocketDir);
    } else {
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
    }
    const travel = prev.distanceTo(p.mesh.position);

    // Walls and props stop the grenade where it visually strikes them.
    if (travel > 1e-4) {
      projectileRay.set(prev, p.mesh.position.clone().sub(prev).normalize());
      projectileRay.far = travel + 0.12;
      const hit = projectileRay.intersectObjects(world.raycastTargets, false)[0];
      if (hit) {
        p.mesh.position.copy(hit.point);
        detonateProjectile(p);
        continue;
      }
    }

    // Test the swept segment against each body so a fast grenade cannot skip
    // through a torso between two frames.
    let struck = false;
    for (const npc of npcs.npcs) {
      npc.worldCenter(_blastCenter);
      _line.set(prev, p.mesh.position);
      _line.closestPointToPoint(_blastCenter, true, _closest);
      if (_closest.distanceToSquared(_blastCenter) < 0.72 * 0.72) {
        p.mesh.position.copy(_closest);
        detonateProjectile(p);
        struck = true;
        break;
      }
    }
    if (!struck && battleRoyale.active) {
      for (const bot of battleRoyale.bots) {
        if (!bot.alive) continue;
        _blastCenter.set(bot.pos.x, bot.pos.y + 1.1, bot.pos.z);
        _line.set(prev, p.mesh.position);
        _line.closestPointToPoint(_blastCenter, true, _closest);
        if (_closest.distanceToSquared(_blastCenter) < 0.7 * 0.7) {
          p.mesh.position.copy(_closest);
          detonateProjectile(p);
          struck = true;
          break;
        }
      }
    }
    if (struck) continue;

    if (p.mesh.position.y <= 0.12) {
      p.mesh.position.y = 0.1;
      detonateProjectile(p);
    }
  }
}

function clearProjectiles() {
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
}

// ---------------------------------------------------------------- UI
const ui = {
  ammo: document.getElementById('ammo'),
  ammoMax: document.getElementById('ammo-max'),
  weaponName: document.getElementById('weapon-name'),
  pips: document.getElementById('pips'),
  hint: document.getElementById('reload-hint'),
  kills: document.getElementById('kills'),
  gibs: document.getElementById('gibs'),
  fired: document.getElementById('fired'),
  mode: document.getElementById('mode'),
  mapName: document.getElementById('map-name'),
  wave: document.getElementById('wave'),
  mapSelect: document.getElementById('map-select'),
  mapButtons: [...document.querySelectorAll('[data-map]')],
  hitmarker: document.getElementById('hitmarker'),
  callout: document.getElementById('callout'),
  overlay: document.getElementById('overlay'),
  start: document.getElementById('start'),
  slowmo: document.getElementById('slowmo'),
  vignette: document.getElementById('vignette'),
  hurt: document.getElementById('hurt'),
  death: document.getElementById('death'),
  healthNum: document.getElementById('health-num'),
  healthFill: document.getElementById('health-fill'),
  fightBack: document.getElementById('fight-back'),
  armedNpcs: document.getElementById('armed-npcs'),
  waveMode: document.getElementById('wave-mode'),
  bloodAmount: document.getElementById('blood-amount'),
  bloodSpray: document.getElementById('blood-spray'),
  bloodDecals: document.getElementById('blood-decals'),
  bloodParticles: document.getElementById('blood-particles'),
  bloodPersistence: document.getElementById('blood-persistence'),
  bloodLossRate: document.getElementById('blood-loss-rate'),
  credits: document.getElementById('credits'),
  armedMode: document.getElementById('armed-mode'),
  crosshair: document.getElementById('crosshair'),
  scope: document.getElementById('scope'),
  armory: document.getElementById('armory'),
  armoryGrid: document.getElementById('armory-grid'),
  marketGrid: document.getElementById('market-grid'),
  loadoutGrid: document.getElementById('loadout-grid'),
  armoryCredits: document.getElementById('armory-credits'),
  armoryMsg: document.getElementById('armory-msg'),
  armoryClose: document.getElementById('armory-close'),
  armoryButton: document.getElementById('armory-button'),
  weaponSlot: document.getElementById('weapon-slot'),
  scopeInfo: document.querySelector('.scope-info'),
  sight: document.getElementById('sight'),
  sightLabel: document.querySelector('#sight .sight-label'),
  armoryCount: document.getElementById('armory-count'),
  meleeGrid: document.getElementById('melee-grid'),
  meleeCount: document.getElementById('melee-count'),
  modGunList: document.getElementById('mod-gun-list'),
  modAttachmentGrid: document.getElementById('mod-attachment-grid'),
  modName: document.getElementById('mod-name'),
  modStats: document.getElementById('mod-stats'),
  modMsg: document.getElementById('mod-msg'),
  modPreviewCanvas: document.getElementById('mod-preview'),
};

Object.assign(ui, {
  modeSelect: document.getElementById('mode-select'),
  modeButtons: [...document.querySelectorAll('[data-mode]')],
  mapPick: document.getElementById('map-pick'),
  modeNote: document.getElementById('mode-note'),
  settings: document.getElementById('settings'),
  settingsButton: document.getElementById('settings-button'),
  settingsClose: document.getElementById('settings-close'),
  sensitivity: document.getElementById('sensitivity'),
  sensitivityValue: document.getElementById('sensitivity-value'),
  adsSensitivity: document.getElementById('ads-sensitivity'),
  adsSensitivityValue: document.getElementById('ads-sensitivity-value'),
  invertLook: document.getElementById('invert-look'),
  bloodEnabled: document.getElementById('blood-enabled'),
  bloodDecalsEnabled: document.getElementById('blood-decals-enabled'),
  impactEffects: document.getElementById('impact-effects'),
  bloodIntensity: document.getElementById('blood-intensity'),
  bloodIntensityValue: document.getElementById('blood-intensity-value'),
  violence: document.getElementById('violence'),
  violenceValue: document.getElementById('violence-value'),
  childSafety: document.getElementById('child-safety'),
  childNote: document.getElementById('child-note'),
  keybindGrid: document.getElementById('keybind-grid'),
  keybindStatus: document.getElementById('keybind-status'),
  keybindConflict: document.getElementById('keybind-conflict'),
  keybindConflictCopy: document.getElementById('keybind-conflict-copy'),
  keybindSwap: document.getElementById('keybind-swap'),
  keybindConflictCancel: document.getElementById('keybind-conflict-cancel'),
  keybindReset: document.getElementById('keybind-reset'),
  buildHint: document.getElementById('build-hint'),
  battleHud: document.getElementById('battle-hud'),
  battlePlayerFill: document.getElementById('battle-player-fill'),
  battlePlayerHp: document.getElementById('battle-player-hp'),
  battleAiFill: document.getElementById('battle-ai-fill'),
  battleAiHp: document.getElementById('battle-ai-hp'),
  battleStatus: document.getElementById('battle-status'),
  battleAiAction: document.getElementById('battle-ai-action'),
  buildHud: document.getElementById('build-hud'),
  brHud: document.getElementById('br-hud'),
  brAlive: document.getElementById('br-alive'),
  brElim: document.getElementById('br-elim'),
  brBots: document.getElementById('br-bots'),
  brStorm: document.getElementById('br-storm'),
  brPhase: document.getElementById('br-phase'),
  brWarning: document.getElementById('br-warning'),
  brPrompt: document.getElementById('br-prompt'),
  brInventory: document.getElementById('br-inventory'),
  brFeed: document.getElementById('br-feed'),
  brShield: document.getElementById('br-shield'),
  brShieldFill: document.getElementById('br-shield-fill'),
  brShieldText: document.getElementById('br-shield-text'),
  brMinimap: document.getElementById('br-minimap'),
  brMinimapCanvas: document.getElementById('br-minimap-canvas'),
  resultKicker: document.getElementById('result-kicker'),
  resultStatA: document.getElementById('result-stat-a'),
  resultStatB: document.getElementById('result-stat-b'),
  buildPiece: document.getElementById('build-piece'),
  buildMaterial: document.getElementById('build-material'),
  buildButtons: [...document.querySelectorAll('[data-build-piece]')],
  resWood: document.getElementById('res-wood'),
  resBrick: document.getElementById('res-brick'),
  resMetal: document.getElementById('res-metal'),
  stance: document.getElementById('stance'),
  result: document.getElementById('match-result'),
  resultTitle: document.getElementById('result-title'),
  resultSub: document.getElementById('result-sub'),
  resultTime: document.getElementById('result-time'),
  resultStructures: document.getElementById('result-structures'),
  resultBuilds: document.getElementById('result-builds'),
  rematch: document.getElementById('rematch'),
  resultMenu: document.getElementById('result-menu'),
});

// The 100-bot controller shares the live player, prop raycaster and voxel
// world. It is constructed here because its HUD/canvas nodes live in the DOM.
const battleRoyale = new BattleRoyale({ scene, world, player, fx, sound, ui, physics, debris, organs, building });

const pipEls = [];

function rebuildPips() {
  ui.pips.innerHTML = '';
  ui.pips.classList.toggle('dense', player.magSize > 36);
  pipEls.length = 0;
  for (let i = 0; i < player.magSize; i++) {
    const el = document.createElement('span');
    ui.pips.appendChild(el);
    pipEls.push(el);
  }
}

function refreshAmmo() {
  if (player.weapon.melee) {
    ui.ammo.textContent = '∞';
    ui.ammoMax.textContent = 'MELEE';
    ui.ammo.classList.remove('low');
    ui.hint.textContent = player.weapon.block ? '[ LMB ] CHAIN ATTACK · [ RMB ] BLOCK' : '[ LMB ] SWING · [ RMB ] BLOCK';
    ui.hint.classList.add('on');
    return;
  }
  ui.hint.textContent = player.brMode
    ? `[ ${keybindLabel(KEYBINDS.reload)} ] RELOAD · [ ${keybindLabel(KEYBINDS.quickMelee)} ] BASH`
    : `[ ${keybindLabel(KEYBINDS.reload)} ] RELOAD`;
  ui.ammo.textContent = String(player.mag);
  ui.ammoMax.textContent = player.brMode ? `/ ${player.weapon.brReserve ?? 0}` : `/ ${player.magSize}`;
  ui.ammo.classList.toggle('low', player.mag <= Math.max(1, Math.floor(player.magSize * 0.25)));
  for (let i = 0; i < pipEls.length; i++) pipEls[i].classList.toggle('full', i < player.mag);
  ui.hint.classList.toggle('on', !player.reloading && player.mag === 0);
}

function refreshHealth() {
  const pct = Math.max(0, player.health / player.maxHealth);
  ui.healthFill.style.width = `${(pct * 100).toFixed(1)}%`;
  ui.healthNum.textContent = String(Math.ceil(player.health));
  ui.healthFill.classList.toggle('low', pct < 0.35);
}

function refreshStats() {
  ui.kills.textContent = String(kills);
  ui.gibs.textContent = String(fx.gibCount);
  ui.fired.textContent = String(player.fireCount);
}

let kills = 0;
let hitmarkerTimer = 0;

function flashHitmarker(armour = false) {
  ui.hitmarker.classList.remove('on');
  ui.hitmarker.classList.toggle('armour', armour);
  void ui.hitmarker.offsetWidth;
  ui.hitmarker.classList.add('on');
  hitmarkerTimer = 0.2;
}

let calloutTimer = 0;
function callout(text, cls = '') {
  ui.callout.textContent = text;
  ui.callout.className = `on ${cls}`;
  clearTimeout(calloutTimer);
  calloutTimer = window.setTimeout(() => {
    ui.callout.className = '';
  }, 720);
}

function refreshMode() {
  const armed = npcs.gunMode;
  const hostile = npcs.fightBack || armed || npcs.waveMode;
  ui.mode.textContent = LAB_MODE ? 'LAB' : npcs.waveMode ? 'WAVES' : armed ? 'ARMED' : npcs.fightBack ? 'HOSTILE' : 'DOCILE';
  ui.mode.classList.toggle('hostile', hostile);
  ui.armedMode.textContent = armed ? 'PACKING' : 'CLEAN';
  ui.armedMode.classList.toggle('hostile', armed);
}

function setFightBack(on, announce = true) {
  npcs.setFightBack(on);
  ui.fightBack.checked = on;
  refreshMode();
  if (announce) {
    callout(on ? 'THEY FIGHT BACK' : 'DOCILE AGAIN', 'mode');
    sound.switchGun?.();
  }
}

function setArmed(on, announce = true) {
  npcs.setGunMode(on);
  ui.armedNpcs.checked = on;
  refreshMode();
  if (announce) {
    callout(on ? 'NPCs ARE PACKING' : 'NPCs DISARMED', 'mode');
    sound.switchGun?.();
  }
}

function refreshWave() {
  ui.wave.textContent = npcs.waveMode
    ? npcs.waveState === 'active'
      ? `WAVE ${npcs.wave}`
      : npcs.wave > 0
        ? `NEXT ${npcs.wave + 1}`
        : 'INBOUND'
    : 'OFF';
  ui.wave.classList.toggle('on', npcs.waveMode);
}

function setWaveMode(on, announce = true) {
  npcs.setWaveMode(on);
  ui.waveMode.checked = on;
  refreshMode();
  refreshWave();
  if (announce) {
    callout(on ? 'ENDLESS WAVES' : 'WAVES OFF', 'wave');
    sound.switchGun?.();
  }
}

ui.fightBack.addEventListener('change', () => setFightBack(ui.fightBack.checked));
ui.armedNpcs.addEventListener('change', () => setArmed(ui.armedNpcs.checked));
ui.waveMode.addEventListener('change', () => setWaveMode(ui.waveMode.checked));

// ---------------------------------------------------------------- blood settings
const bloodControls = [
  { key: 'amount', input: ui.bloodAmount, output: 'blood-amount-value' },
  { key: 'spray', input: ui.bloodSpray, output: 'blood-spray-value' },
  { key: 'decals', input: ui.bloodDecals, output: 'blood-decals-value' },
  { key: 'particles', input: ui.bloodParticles, output: 'blood-particles-value' },
  { key: 'persistence', input: ui.bloodPersistence, output: 'blood-persistence-value' },
  { key: 'lossRate', input: ui.bloodLossRate, output: 'blood-loss-rate-value' },
];

function bloodValueLabel(key, value) {
  if (key === 'persistence') return `${Math.round(BASE_DECAL_LIFE * value)}S`;
  return `${Math.round(value * 100)}%`;
}

for (const control of bloodControls) {
  if (!control.input) continue;
  const output = document.getElementById(control.output);
  const sync = () => {
    const value = Number(control.input.value);
    setBloodSetting(control.key, value);
    if (output) output.textContent = bloodValueLabel(control.key, BLOOD_SETTINGS[control.key]);
    if (control.key === 'amount') {
      for (const npc of npcs.npcs) npc.refreshBloodCapacity();
    }
  };
  control.input.value = String(BLOOD_SETTINGS[control.key]);
  if (output) output.textContent = bloodValueLabel(control.key, BLOOD_SETTINGS[control.key]);
  control.input.addEventListener('input', sync);
}

// ---------------------------------------------------------------- settings menu
let settingsOpen = false;

function syncSettingsUI() {
  const s = GAME_SETTINGS;
  if (ui.sensitivity) ui.sensitivity.value = String(s.sensitivity);
  if (ui.sensitivityValue) ui.sensitivityValue.textContent = `${s.sensitivity.toFixed(2)}×`;
  if (ui.adsSensitivity) ui.adsSensitivity.value = String(s.adsSensitivity);
  if (ui.adsSensitivityValue) ui.adsSensitivityValue.textContent = `${s.adsSensitivity.toFixed(2)}×`;
  if (ui.invertLook) ui.invertLook.checked = s.invertY;
  if (ui.bloodEnabled) ui.bloodEnabled.checked = s.bloodEnabled;
  if (ui.bloodDecalsEnabled) ui.bloodDecalsEnabled.checked = s.decalsEnabled;
  if (ui.impactEffects) ui.impactEffects.checked = s.impactEffects;
  if (ui.bloodIntensity) ui.bloodIntensity.value = String(s.bloodIntensity);
  if (ui.bloodIntensityValue) ui.bloodIntensityValue.textContent = `${Math.round(s.bloodIntensity * 100)}%`;
  if (ui.violence) ui.violence.value = String(s.violence);
  if (ui.violenceValue) ui.violenceValue.textContent = `${Math.round(s.violence * 100)}%`;
  if (ui.childSafety) ui.childSafety.checked = s.childSafety;
  if (ui.childNote) {
    ui.childNote.textContent = s.childSafety
      ? 'ON: gore, bone exposure, dismemberment, blood and graphic injury visuals are removed from every mode. Combat, damage, physics and AI remain fully active.'
      : 'Off: normal blood settings apply. On: non-graphic impact dust/sparks replace all injury visuals.';
  }
  for (const control of bloodControls) {
    if (control.input) control.input.disabled = s.childSafety;
  }
  if (ui.bloodIntensity) ui.bloodIntensity.disabled = s.childSafety;
  if (ui.violence) ui.violence.disabled = s.childSafety;
}

// ---- configurable keybinds ----
let keybindCapture = null;
let pendingKeybindConflict = null;

function keybindStatus(message, isConflict = false) {
  if (!ui.keybindStatus) return;
  ui.keybindStatus.textContent = message;
  ui.keybindStatus.classList.toggle('conflict', isConflict);
}

function hideKeybindConflict() {
  pendingKeybindConflict = null;
  if (ui.keybindConflict) ui.keybindConflict.hidden = true;
}

function keybindDef(id) {
  return KEYBIND_DEFS.find((def) => def.id === id);
}

function renderKeybinds() {
  if (!ui.keybindGrid) return;
  ui.keybindGrid.innerHTML = '';
  let currentGroup = null;
  for (const def of KEYBIND_DEFS) {
    if (def.group !== currentGroup) {
      currentGroup = def.group;
      const heading = document.createElement('div');
      heading.className = 'keybind-group-title';
      heading.textContent = currentGroup;
      ui.keybindGrid.appendChild(heading);
    }
    const row = document.createElement('div');
    row.className = 'keybind-row';
    const label = document.createElement('span');
    label.textContent = def.label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'keybind-button';
    button.dataset.action = def.id;
    button.textContent = keybindCapture === def.id ? 'PRESS A KEY' : keybindLabel(KEYBINDS[def.id]);
    button.classList.toggle('capturing', keybindCapture === def.id);
    button.setAttribute('aria-label', `Change ${def.label} binding, currently ${keybindLabel(KEYBINDS[def.id])}`);
    button.addEventListener('click', () => startKeybindCapture(def.id));
    row.append(label, button);
    ui.keybindGrid.appendChild(row);
  }
}

function refreshControlHints() {
  if (ui.reloadHint) {
    ui.reloadHint.textContent = battleRoyale?.active
      ? `[ ${keybindLabel(KEYBINDS.reload)} ] RELOAD · [ ${keybindLabel(KEYBINDS.quickMelee)} ] BASH`
      : `[ ${keybindLabel(KEYBINDS.reload)} ] RELOAD`;
  }
  if (ui.buildHint) {
    ui.buildHint.textContent =
      `${keybindLabel(KEYBINDS.shoot)} PLACE · ${keybindLabel(KEYBINDS.edit)} EDIT · ` +
      `${keybindLabel(KEYBINDS.confirmEdit)} CONFIRM · ${keybindLabel(KEYBINDS.resetEdit)} RESET · ` +
      `${keybindLabel(KEYBINDS.rotate)} ROTATE · ${keybindLabel(KEYBINDS.material)} MATERIAL`;
  }
  const pieceKeys = {
    wall: KEYBINDS.buildWall,
    floor: KEYBINDS.buildFloor,
    ramp: KEYBINDS.buildRamp,
    roof: KEYBINDS.buildRoof,
  };
  for (const button of ui.buildButtons || []) {
    const key = button.querySelector('b');
    if (key) key.textContent = keybindLabel(pieceKeys[button.dataset.buildPiece]);
  }
}

function startKeybindCapture(actionId) {
  if (!keybindDef(actionId)) return;
  hideKeybindConflict();
  keybindCapture = actionId;
  keybindStatus(`Press a key, mouse button, or scroll for “${keybindDef(actionId).label}”. Esc cancels.`);
  renderKeybinds();
}

function cancelKeybindCapture() {
  keybindCapture = null;
  hideKeybindConflict();
  renderKeybinds();
  keybindStatus('Binding change cancelled. Existing binding kept.');
}

function completeKeybind(actionId, code) {
  const def = keybindDef(actionId);
  if (!def || !isBindableCode(code)) return;
  setKeybind(actionId, code);
  keybindCapture = null;
  hideKeybindConflict();
  renderKeybinds();
  refreshControlHints();
  clearKeys();
  keybindStatus(`${def.label} bound to ${keybindLabel(code)}. Saved.`);
}

function assignKeybindCandidate(code) {
  if (!keybindCapture || !isBindableCode(code)) return;
  const actionId = keybindCapture;
  const owner = keybindOwner(code, actionId);
  if (owner) {
    const oldCode = KEYBINDS[actionId];
    pendingKeybindConflict = { actionId, code, owner, oldCode };
    keybindCapture = null;
    keybindStatus(
      `${keybindLabel(code)} is already assigned to “${keybindDef(owner)?.label}”. ` +
        `Choose SWAP to exchange the two bindings, or CANCEL.`,
      true,
    );
    if (ui.keybindConflictCopy) {
      ui.keybindConflictCopy.textContent =
        `SWAP “${keybindDef(actionId)?.label}” (${keybindLabel(oldCode)}) with ` +
        `“${keybindDef(owner)?.label}” (${keybindLabel(code)})?`;
    }
    if (ui.keybindConflict) ui.keybindConflict.hidden = false;
    renderKeybinds();
    return;
  }
  completeKeybind(actionId, code);
}

function swapPendingKeybinds() {
  if (!pendingKeybindConflict) return;
  const { actionId, code, owner, oldCode } = pendingKeybindConflict;
  setKeybind(owner, oldCode);
  setKeybind(actionId, code);
  keybindCapture = null;
  hideKeybindConflict();
  renderKeybinds();
  refreshControlHints();
  clearKeys();
  keybindStatus(`Swapped ${keybindDef(actionId)?.label} and ${keybindDef(owner)?.label}. Saved.`);
}

ui.keybindGrid?.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-action]');
  if (button) startKeybindCapture(button.dataset.action);
});
ui.keybindReset?.addEventListener('click', () => {
  resetKeybinds();
  keybindCapture = null;
  hideKeybindConflict();
  renderKeybinds();
  refreshControlHints();
  clearKeys();
  keybindStatus('All bindings restored to defaults.');
});
ui.keybindSwap?.addEventListener('click', swapPendingKeybinds);
ui.keybindConflictCancel?.addEventListener('click', cancelKeybindCapture);

// Capture in the capture phase so a key being assigned cannot also fire a
// gameplay action through the normal input handlers below.
window.addEventListener(
  'keydown',
  (event) => {
    if (!keybindCapture) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      cancelKeybindCapture();
      return;
    }
    if (!isBindableCode(event.code)) {
      keybindStatus('That key cannot be bound. Try a keyboard key, mouse button, or scroll.', true);
      return;
    }
    assignKeybindCandidate(event.code);
  },
  true,
);
window.addEventListener(
  'mousedown',
  (event) => {
    if (!keybindCapture) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button < 0 || event.button > 4) return;
    assignKeybindCandidate(`Mouse${event.button}`);
  },
  true,
);
window.addEventListener(
  'wheel',
  (event) => {
    if (!keybindCapture) return;
    event.preventDefault();
    event.stopPropagation();
    assignKeybindCandidate('Wheel');
  },
  { capture: true, passive: false },
);

function applyChildSafety() {
  for (const npc of npcs.npcs) {
    for (const bone of npc.skeleton || []) {
      bone.exposed = false;
      if (bone.mesh) bone.mesh.visible = false;
    }
  }
  if (childSafetyEnabled()) fx.clear();
  // If the player is configuring the filter from the menu, rebuild the
  // standing population so those bodies are visibly clean immediately.
  if (!buildBattle.active && !running) npcs.reset();
}

const bindToggle = (el, key, after = null) => {
  if (!el) return;
  el.addEventListener('change', () => {
    setGameSetting(key, el.checked);
    after?.();
    syncSettingsUI();
  });
};
bindToggle(ui.bloodEnabled, 'bloodEnabled');
bindToggle(ui.bloodDecalsEnabled, 'decalsEnabled');
bindToggle(ui.impactEffects, 'impactEffects');
bindToggle(ui.invertLook, 'invertY');
bindToggle(ui.childSafety, 'childSafety', applyChildSafety);

if (ui.sensitivity) {
  ui.sensitivity.addEventListener('input', () => {
    setGameSetting('sensitivity', ui.sensitivity.value);
    ui.sensitivityValue.textContent = `${GAME_SETTINGS.sensitivity.toFixed(2)}×`;
  });
}
if (ui.adsSensitivity) {
  ui.adsSensitivity.addEventListener('input', () => {
    setGameSetting('adsSensitivity', ui.adsSensitivity.value);
    ui.adsSensitivityValue.textContent = `${GAME_SETTINGS.adsSensitivity.toFixed(2)}×`;
  });
}
if (ui.bloodIntensity) {
  ui.bloodIntensity.addEventListener('input', () => {
    setGameSetting('bloodIntensity', ui.bloodIntensity.value);
    ui.bloodIntensityValue.textContent = `${Math.round(GAME_SETTINGS.bloodIntensity * 100)}%`;
  });
}
if (ui.violence) {
  ui.violence.addEventListener('input', () => {
    setGameSetting('violence', ui.violence.value);
    ui.violenceValue.textContent = `${Math.round(GAME_SETTINGS.violence * 100)}%`;
  });
}

function openSettings() {
  settingsOpen = true;
  syncSettingsUI();
  renderKeybinds();
  refreshControlHints();
  ui.settings.classList.add('open');
  ui.settings.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  settingsOpen = false;
  keybindCapture = null;
  hideKeybindConflict();
  renderKeybinds();
  ui.settings.classList.remove('open');
  ui.settings.setAttribute('aria-hidden', 'true');
}

function toggleSettings() {
  if (settingsOpen) {
    closeSettings();
    return;
  }
  if (running) {
    document.exitPointerLock?.();
    window.setTimeout(openSettings, 80);
    return;
  }
  openSettings();
}

ui.settingsButton?.addEventListener('click', openSettings);
ui.settingsClose?.addEventListener('click', closeSettings);
ui.settings?.addEventListener('click', (event) => {
  if (event.target === ui.settings) closeSettings();
});

// ---------------------------------------------------------------- modes + arenas
let selectedMode = 'sandbox';
let selectedMap = 'pit';

function updateModeSelection() {
  for (const button of ui.modeButtons) {
    button.classList.toggle('selected', button.dataset.mode === selectedMode);
  }
  const fixedMode = selectedMode === 'buildbattle' || selectedMode === 'royale';
  for (const button of ui.mapButtons) {
    button.classList.toggle('selected', !fixedMode && button.dataset.map === selectedMap);
  }
  ui.mapPick?.classList.toggle('disabled', fixedMode);
  ui.mapPick?.classList.toggle('hidden', selectedMode === 'royale');
  if (ui.modeNote) {
    ui.modeNote.textContent =
      selectedMode === 'buildbattle'
        ? 'BUILD BATTLE uses its own symmetrical arena. You and one AI builder start with equal resources.'
        : selectedMode === 'royale'
          ? 'BATTLE ROYALE drops 101 fighters onto THE ISLAND. One life, 100 bots, a closing storm and a 46-cache loot field.'
          : 'Build Battle and Battle Royale use their own arenas. Choose a sandbox arena above.';
  }
  if (!running && !buildBattle.resultShown && !battleRoyale.resultShown) {
    ui.start.textContent =
      selectedMode === 'buildbattle'
        ? 'ENTER BUILD BATTLE'
        : selectedMode === 'royale'
          ? 'DROP INTO THE ISLAND'
          : `ENTER ${MAPS[selectedMap]?.short || 'ARENA'}`;
  }
}

for (const button of ui.modeButtons) {
  button.addEventListener('click', () => {
    selectedMode = button.dataset.mode === 'royale' ? 'royale' : button.dataset.mode === 'buildbattle' ? 'buildbattle' : 'sandbox';
    updateModeSelection();
  });
}
for (const button of ui.mapButtons) {
  button.addEventListener('click', () => {
    if (selectedMode === 'buildbattle' || selectedMode === 'royale') return;
    selectedMap = MAPS[button.dataset.map] ? button.dataset.map : 'pit';
    updateModeSelection();
  });
}

function loadArena(mapKey) {
  if (!MAPS[mapKey] || world.map === mapKey) return;
  npcs.disposeAll();
  building.resetAll();
  clearBullets();
  clearBolts();
  clearProjectiles();
  clearTracers();
  fx.clear();
  world.buildMap(mapKey);
  physics.boxes = world.boxes;
  player.pos.set(world.mapData.spawn[0], 0, world.mapData.spawn[1]);
  player.spawn.copy(player.pos);
  player.vel.set(0, 0, 0);
  npcs.maxAlive = world.mapData.maxAlive ?? 10;
  npcs.spawnTimer = 0.5;
  npcs.reset();
  ui.mapName.textContent = world.mapData.label;
}

function startSelectedMode() {
  if (LAB_MODE) {
    enterGame();
    return;
  }
  if (selectedMode === 'royale') {
    if (buildBattle.active) buildBattle.stop({ restorePlayer: true });
    if (battleRoyale.active) battleRoyale.stop({ restorePlayer: false });
    if (world.map !== 'royale') loadArena('royale');
    ui.result.classList.add('off');
    if (battleRoyale.start()) {
      ui.death.classList.remove('on');
      callout('BATTLE ROYALE · 101 DROP', 'wave');
    }
  } else if (selectedMode === 'buildbattle') {
    if (battleRoyale.active) battleRoyale.stop({ restorePlayer: true });
    if (world.map !== 'build') loadArena('build');
    setBuildMode(false);
    if (buildBattle.start()) {
      ui.result.classList.add('off');
      refreshBuildResources();
    }
  } else {
    if (battleRoyale.active) battleRoyale.stop({ restorePlayer: true });
    if (buildBattle.active) buildBattle.stop({ restorePlayer: true });
    if (world.map !== selectedMap) loadArena(selectedMap);
  }
  enterGame();
}

function goMainMenu() {
  building.hidePreview();
  battleRoyale.stop({ restorePlayer: true });
  buildBattle.stop();
  selectedMode = 'sandbox';
  selectedMap = 'pit';
  if (world.map !== 'pit') loadArena('pit');
  ui.result.classList.add('off');
  setBuildMode(false);
  closeSettings();
  running = false;
  document.body.classList.remove('locked');
  overlay.classList.remove('hidden');
  overlay.classList.remove('paused');
  overlay.querySelector('h1').innerHTML = 'BLOOD<span>VOX</span>';
  overlay.querySelector('.tag').textContent = 'voxel gore · euphoria ragdolls · no mercy';
  updateModeSelection();
  refreshHealth();
  refreshAmmo();
}

// ---------------------------------------------------------------- build tool
let buildKind = 'wall';
let buildMaterial = 'wood';
let buildYawOffset = 0;
let pendingEdit = null;
const BUILD_KINDS = ['wall', 'floor', 'ramp', 'roof'];
const BUILD_MATERIAL_LIST = ['wood', 'brick', 'metal'];

function refreshBuildResources() {
  if (!ui.resWood) return;
  const r = building.resourcesFor('player');
  ui.resWood.textContent = String(r.wood);
  ui.resBrick.textContent = String(r.brick);
  ui.resMetal.textContent = String(r.metal);
  updateBuildHud();
}

function updateBuildHud() {
  if (!ui.buildPiece) return;
  ui.buildPiece.textContent = buildKind.toUpperCase();
  ui.buildMaterial.textContent = buildMaterial.toUpperCase();
  for (const button of ui.buildButtons) {
    button.classList.toggle('active', button.dataset.buildPiece === buildKind);
  }
}

function setBuildMode(on) {
  const next = !!on && (buildBattle.active || battleRoyale.active) && !player.dead;
  if (!next && !player.buildMode) {
    ui.buildHud?.classList.add('off');
    return;
  }
  if (!next) cancelPendingEdit();
  player.setBuildMode(next);
  ui.buildHud?.classList.toggle('off', !next);
  if (!next) building.hidePreview();
  updateBuildHud();
}

function selectBuildPiece(index) {
  buildKind = BUILD_KINDS[index] || 'wall';
  updateBuildHud();
}

function cycleBuildMaterial(dir = 1) {
  const i = BUILD_MATERIAL_LIST.indexOf(buildMaterial);
  buildMaterial = BUILD_MATERIAL_LIST[(i + dir + BUILD_MATERIAL_LIST.length) % BUILD_MATERIAL_LIST.length];
  updateBuildHud();
  callout(buildMaterial.toUpperCase(), 'mode');
}

function rotateBuildPiece() {
  buildYawOffset = (buildYawOffset + Math.PI / 2) % (Math.PI * 2);
  callout('ROTATE', 'mode');
}

function playerForward(out = new THREE.Vector3()) {
  return out.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
}

function placeBuildPiece() {
  if (!player.buildMode || (!buildBattle.active && !battleRoyale.active) || player.dead) return;
  if (pendingEdit) {
    toggleEditSection();
    return;
  }
  const forward = playerForward();
  const structure = building.place('player', buildKind, buildMaterial, player.pos, forward, null, buildYawOffset);
  if (!structure) {
    const reason = building.previewInfo?.reason || 'CANNOT BUILD';
    callout(reason, 'mode');
    sound.empty?.();
    return;
  }
  refreshBuildResources();
  sound.impact?.();
}

function aimedOwnStructure(origin, dir, maxDist = 8) {
  // Voxel pieces are assembled from separate bricks, so a perfectly centered
  // ray can slip through a mortar seam. Sample a small cross around the
  // crosshair before reporting that no structure is being aimed at.
  const direct = building.aimedStructure(origin, dir, maxDist, 'player');
  if (direct) return direct;
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  for (const [h, v] of [[-0.28, 0], [0.28, 0], [0, -0.24], [0, 0.24]]) {
    const sample = dir.clone().addScaledVector(right, h).addScaledVector(up, v).normalize();
    const hit = building.aimedStructure(origin, sample, maxDist, 'player');
    if (hit) return hit;
  }
  return null;
}

function currentEditSections(structure) {
  if (Array.isArray(structure.editSections)) return [...structure.editSections];
  if (structure.variant === 'window' || structure.variant === 'hole') return [4];
  if (structure.variant === 'door') return [6, 7, 8];
  return [];
}

function cancelPendingEdit() {
  if (!pendingEdit) return;
  building.restoreEditPreview(pendingEdit.structure);
  building.hideEditGrid();
  pendingEdit = null;
}

function editStructureHit(origin, dir, only = null) {
  const offsets = [[0, 0], [-0.06, 0], [0.06, 0], [0, -0.06], [0, 0.06]];
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  for (const [h, v] of offsets) {
    const sample = dir.clone().addScaledVector(right, h).addScaledVector(up, v).normalize();
    building.raycaster.set(origin, sample);
    building.raycaster.far = 8;
    for (const hit of building.raycaster.intersectObjects(building.meshes, false)) {
      const structure = hit.object.userData.structure;
      if (!structure || (only && structure !== only)) continue;
      return { structure, hit };
    }
  }
  return null;
}

function editBuildPiece() {
  if (!player.buildMode) return;
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(origin);
  camera.getWorldDirection(dir);
  const found = editStructureHit(origin, dir);
  if (!found) {
    callout('LOOK AT YOUR STRUCTURE', 'mode');
    return;
  }
  const { structure } = found;
  if (pendingEdit?.structure !== structure) {
    cancelPendingEdit();
    pendingEdit = { structure, sections: new Set(currentEditSections(structure)) };
  }
  building.hidePreview();
  building.restoreEditPreview(structure);
  building.showEditGrid(structure, pendingEdit.sections);
  refreshEditCallout();
  sound.switchGun?.();
}

function refreshEditCallout() {
  if (!pendingEdit) return;
  const n = pendingEdit.sections.size;
  callout(
    `EDIT ${n ? `${n} SECTION${n === 1 ? '' : 'S'}` : 'ORIGINAL'} · ${keybindLabel(KEYBINDS.shoot)} SELECT · ${keybindLabel(KEYBINDS.confirmEdit)} CONFIRM`,
    'mode',
  );
}

function toggleEditSection() {
  if (!pendingEdit) return;
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(origin);
  camera.getWorldDirection(dir);
  const found = editStructureHit(origin, dir, pendingEdit.structure);
  if (!found) {
    callout('AIM AT A GRID SECTION', 'mode');
    return;
  }
  const section = building.sectionAtPoint(found.structure, found.hit.point);
  if (section < 0) return;
  if (pendingEdit.sections.has(section)) pendingEdit.sections.delete(section);
  else pendingEdit.sections.add(section);
  building.previewEdit(pendingEdit.structure, pendingEdit.sections);
  building.showEditGrid(pendingEdit.structure, pendingEdit.sections);
  refreshEditCallout();
  sound.switchGun?.();
}

function confirmBuildEdit() {
  if (!pendingEdit) {
    callout('PRESS ' + keybindLabel(KEYBINDS.edit) + ' TO SELECT AN EDIT', 'mode');
    return;
  }
  const { structure, sections } = pendingEdit;
  if (!structure || structure.destroyed) {
    pendingEdit = null;
    building.hideEditGrid();
    callout('STRUCTURE GONE', 'mode');
    return;
  }
  const clean = [...sections].sort((a, b) => a - b);
  building.setEditSections(structure, clean);
  building.hideEditGrid();
  pendingEdit = null;
  callout(clean.length ? `EDIT CONFIRMED · ${clean.length} SECTIONS REMOVED` : 'STRUCTURE RESET', 'mode');
  refreshBuildResources();
  sound.impact?.();
}

function resetBuildPiece() {
  if (pendingEdit) {
    pendingEdit.sections.clear();
    building.previewEdit(pendingEdit.structure, pendingEdit.sections);
    building.showEditGrid(pendingEdit.structure, pendingEdit.sections);
    refreshEditCallout();
    callout('EDIT RESET · STILL SELECTING', 'mode');
    return;
  }
  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(origin);
  camera.getWorldDirection(dir);
  const structure = aimedOwnStructure(origin, dir);
  if (!structure) {
    callout('LOOK AT YOUR STRUCTURE', 'mode');
    return;
  }
  if (building.resetEdit(structure)) callout('STRUCTURE RESET', 'mode');
  else callout('ALREADY ORIGINAL', 'mode');
}

function updateBuildPreview() {
  if (!player.buildMode || (!buildBattle.active && !battleRoyale.active) || player.dead) return;
  if (pendingEdit) {
    building.hidePreview();
    return;
  }
  const forward = playerForward();
  building.showPreview('player', buildKind, buildMaterial, player.pos, forward, buildYawOffset);
}

function refreshStance() {
  if (!ui.stance) return;
  const crouched = player.crouching;
  ui.stance.textContent = crouched ? 'CROUCHED' : 'STANDING';
  ui.stance.classList.toggle('crouched', crouched);
}

function refreshBattleHud(snap) {
  if (!snap) return;
  ui.battleHud?.classList.toggle('off', !snap.active || snap.resultShown);
  if (ui.battlePlayerFill) {
    ui.battlePlayerFill.style.width = `${Math.max(0, Math.min(100, (snap.playerHealth / Math.max(1, snap.playerMax)) * 100))}%`;
  }
  if (ui.battlePlayerHp) ui.battlePlayerHp.textContent = String(Math.ceil(snap.playerHealth));
  if (ui.battleAiFill) {
    ui.battleAiFill.style.width = `${Math.max(0, Math.min(100, (snap.aiHealth / Math.max(1, snap.aiMax)) * 100))}%`;
  }
  if (ui.battleAiHp) ui.battleAiHp.textContent = String(Math.ceil(snap.aiHealth));
  if (ui.battleStatus) {
    ui.battleStatus.textContent =
      snap.state === 'fight'
        ? `${Math.floor(snap.time)}S · ${snap.structures} BUILD${snap.structures === 1 ? '' : 'S'}`
        : snap.result
          ? snap.result.toUpperCase()
          : '1V1';
  }
  if (ui.battleAiAction) {
    ui.battleAiAction.textContent = `${snap.aiAction || 'HOLD'}${snap.aiCrouching ? ' · CROUCHED' : ''}`;
  }
}

buildBattle.onStart = () => {
  ui.result?.classList.add('off');
  ui.death?.classList.remove('on');
  refreshHealth();
  refreshBuildResources();
  updateModeSelection();
  callout('BUILD BATTLE · 1V1', 'wave');
};

buildBattle.onStop = () => {
  ui.battleHud?.classList.add('off');
  setBuildMode(false);
  refreshBattleHud(buildBattle.snapshot());
};

buildBattle.onHud = (snap) => refreshBattleHud(snap);

buildBattle.onResult = (result, snap) => {
  running = false;
  ui.death?.classList.remove('on');
  document.body.classList.remove('locked');
  if (document.pointerLockElement) document.exitPointerLock?.();
  setBuildMode(false);
  ui.result.classList.remove('off');
  ui.result.classList.toggle('defeat', result !== 'victory');
  if (ui.resultKicker) ui.resultKicker.textContent = 'BUILD BATTLE · 1V1';
  if (ui.resultStatA) ui.resultStatA.textContent = 'STRUCTURES';
  if (ui.resultStatB) ui.resultStatB.textContent = 'ENEMY BUILDS';
  ui.resultTitle.textContent = result === 'victory' ? 'VICTORY' : 'DEFEAT';
  ui.resultSub.textContent =
    result === 'victory'
      ? 'The AI builder is down. The arena is yours.'
      : 'The builder put you on the floor. Adjust and run it back.';
  const seconds = Math.floor(snap?.time || 0);
  ui.resultTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  ui.resultStructures.textContent = String(snap?.structures || 0);
  ui.resultBuilds.textContent = snap?.aiBuilt?.length ? snap.aiBuilt.join(' / ').toUpperCase() : 'NONE';
  refreshBattleHud({ ...snap, resultShown: true });
};

battleRoyale.onStart = () => {
  document.body.classList.add('br-active');
  setBuildMode(false);
  refreshBuildResources();
  ui.result?.classList.add('off');
  ui.death?.classList.remove('on');
  ui.brHud?.classList.remove('off');
  ui.brMinimap?.classList.remove('off');
  ui.brPrompt?.classList.add('off');
  refreshHealth();
  refreshAmmo();
  updateModeSelection();
};

battleRoyale.onStop = () => {
  setBuildMode(false);
  document.body.classList.remove('br-active');
  ui.brHud?.classList.add('off');
  ui.brMinimap?.classList.add('off');
  ui.brShield?.classList.add('off');
  ui.brPrompt?.classList.add('off');
  ui.death?.classList.remove('on');
  refreshHealth();
  refreshAmmo();
  updateModeSelection();
};

battleRoyale.onResult = (result, snap) => {
  running = false;
  setBuildMode(false);
  document.body.classList.remove('locked');
  if (document.pointerLockElement) document.exitPointerLock?.();
  ui.death?.classList.remove('on');
  ui.result.classList.remove('off');
  ui.result.classList.toggle('defeat', result !== 'victory');
  if (ui.resultKicker) ui.resultKicker.textContent = 'BATTLE ROYALE · THE ISLAND';
  if (ui.resultStatA) ui.resultStatA.textContent = 'CACHES OPENED';
  if (ui.resultStatB) ui.resultStatB.textContent = 'BOTS STANDING';
  ui.resultTitle.textContent = result === 'victory' ? 'VICTORY ROYALE' : 'ELIMINATED';
  ui.resultSub.textContent =
    result === 'victory'
      ? 'The island is yours. Last one standing out of 101.'
      : 'The storm or another survivor got you. The match is over.';
  const seconds = Math.floor(snap?.time || 0);
  ui.resultTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  ui.resultStructures.textContent = `${snap?.chestsOpened ?? 0}/${snap?.chests ?? 0}`;
  ui.resultBuilds.textContent = String(snap?.botsAlive ?? 0);
  ui.brPrompt?.classList.add('off');
};

battleRoyale.onBotHit = (bot, point, options, before, after) => {
  flashHitmarker();
  if (options?.botShot) return;
  if (after <= 0) {
    sound.hit();
    callout('ELIMINATED', 'face');
  } else {
    sound.hit();
  }
};

battleRoyale.onTracer = (from, to, kind, near) => {
  if (!near) return;
  spawnTracer(from, to, 0.045, 0.34);
};

ui.rematch?.addEventListener('click', () => {
  ui.result.classList.add('off');
  ui.death.classList.remove('on');
  if (battleRoyale.active || battleRoyale.result) {
    battleRoyale.restart();
    enterGame();
    return;
  }
  buildBattle.restart();
  refreshBuildResources();
  enterGame();
});
ui.resultMenu?.addEventListener('click', goMainMenu);
for (const button of ui.buildButtons) {
  button.addEventListener('click', () => selectBuildPiece(BUILD_KINDS.indexOf(button.dataset.buildPiece)));
}

// ---------------------------------------------------------------- credits + Black Market
const keyLabel = (index) => (index === 9 ? '0' : String(index + 1));
let armoryOpen = false;
let market = null;

function refreshCredits() {
  market?.syncWallet();
}

function openArmory() {
  if (battleRoyale.active) {
    callout('ARMOURY IS CLOSED DURING BATTLE ROYALE', 'mode');
    return;
  }
  if (armoryOpen) return;
  armoryOpen = true;
  if (market) market.resumeOnClose = running;
  market?.open();
}

function closeArmory() {
  if (!armoryOpen) return;
  armoryOpen = false;
  market?.close();
}

market = new Market({
  player,
  sound,
  ui,
  pause: () => pauseGame(),
  refreshAim: () => player.onAim?.(),
  onClose: () => {
    armoryOpen = false;
    if (market.resumeOnClose) enterGame();
  },
});
ui.armoryButton.addEventListener('click', openArmory);
refreshCredits();

// ---------------------------------------------------------------- player hooks
player.onAmmo = refreshAmmo;
player.onReload = refreshAmmo;
player.onEmpty = () => {
  refreshAmmo();
  ui.hint.classList.add('on');
};
player.onWeapon = () => {
  ui.weaponName.textContent = player.weapon.brRarity
    ? `${player.weapon.brRarity.toUpperCase()} · ${player.weapon.name}`
    : player.weapon.name;
  ui.weaponSlot.textContent = `[${keyLabel(player.weaponIndex)}]`;
  rebuildPips();
  refreshAmmo();
};
player.onHealth = refreshHealth;
player.onAim = () => {
  const scoped = player.scoped && !market?.openState;
  const optic = player.weapon?.sight;
  ui.scope.classList.toggle('on', scoped);
  if (ui.scopeInfo) {
    ui.scopeInfo.textContent = `OPTIC ${player.weapon?.magnification || 4}× · HOLD RMB`;
  }
  const dotSight = player.aiming && !scoped && (optic === 'reddot' || optic === 'holo');
  if (ui.sight) {
    ui.sight.classList.toggle('on', dotSight);
    ui.sight.dataset.sight = optic || '';
    if (ui.sightLabel) ui.sightLabel.textContent = optic === 'holo' ? 'HOLOGRAPHIC · HOLD RMB' : '2 MOA RED DOT · HOLD RMB';
  }
  ui.crosshair.classList.toggle('scoped', scoped || dotSight);
  ui.crosshair.classList.toggle('aim', player.aiming && !scoped && !dotSight);
};
player.onBlock = () => {
  callout('BLOCKED', 'armour');
};
player.onDamage = () => {
  ui.hurt.classList.remove('on');
  void ui.hurt.offsetWidth;
  ui.hurt.classList.add('on');
  refreshHealth();
};
player.onDeath = () => {
  ui.death.classList.add('on');
  releaseTrigger();
};
player.onRespawn = () => {
  ui.death.classList.remove('on');
  refreshHealth();
  refreshAmmo();
};

// ---------------------------------------------------------------- slow motion
let slowmoTimer = 0;
let timeScale = 1;
let slowWasActive = false;

function triggerSlowmo(seconds = 1.6) {
  slowmoTimer = Math.max(slowmoTimer, seconds);
}

function releaseTrigger() {
  player.releaseTrigger();
}

function rewardKill(npc, faceKill = false) {
  if (!npc || npc.counted) return 0;
  npc.counted = true;
  kills++;
  const reward = (npc.armoured ? 190 : 120) + (faceKill ? 50 : 0);
  market?.addCredits(reward);
  triggerSlowmo(1.7);
  refreshStats();
  return reward;
}

// ---------------------------------------------------------------- shooting
const raycaster = new THREE.Raycaster();
raycaster.far = 150;
const bulletRaycaster = new THREE.Raycaster();
const _normal = new THREE.Vector3();
const _bulletNext = new THREE.Vector3();
const _bulletDir = new THREE.Vector3();
const _meleeRight = new THREE.Vector3();
const _meleeUp = new THREE.Vector3();
const _meleeDir = new THREE.Vector3();
const _meleeNormal = new THREE.Vector3();
let lastArmourCall = 0;

/**
 * Bullets are data-only travelling projectiles. Each frame advances the round
 * under gravity, then raycasts the swept segment so a 900 m/s rifle round still
 * finds the exact voxel face it crossed between frames.
 */
const bullets = [];
const MAX_BULLETS = 300;

function spawnBullet(origin, dir, shot, muzzle) {
  if (!shot.velocity) return;
  if (bullets.length >= MAX_BULLETS) bullets.shift();
  const speed = shot.velocity;
  bullets.push({
    // origin is the real muzzle, and dir points from that muzzle to the point
    // under the reticle. The tracer starts on the same line, so the sight,
    // bullet and impact point agree instead of converging only at the camera.
    pos: origin.clone(),
    start: origin.clone(),
    trail: muzzle.clone(),
    vel: dir.clone().multiplyScalar(speed),
    gravity: 9.81 * (shot.dropScale ?? 1),
    life: 3.2,
    travel: 0,
    maxRange: shot.maxRange || 120,
    shot,
  });
}

function clearBullets() {
  bullets.length = 0;
}

// Crossbow bolts are real persistent props. They stay in the body/wall and
// inherit the host transform so a bolt follows a staggering or falling NPC.
const bolts = [];
const MAX_BOLTS = 64;
const boltShaftGeo = new THREE.CylinderGeometry(0.009, 0.007, 0.42, 6);
const boltTipGeo = new THREE.ConeGeometry(0.015, 0.065, 6);
const boltFletchGeo = new THREE.BoxGeometry(0.045, 0.008, 0.08);
const boltShaftMat = new THREE.MeshLambertMaterial({ color: 0x3b2a1c });
const boltMetalMat = new THREE.MeshLambertMaterial({ color: 0x747d84 });
const boltFletchMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });

function stickBolt(host, point, dir, length = 0.5) {
  if (bolts.length >= MAX_BOLTS) {
    const oldest = bolts.shift();
    if (oldest.group.parent) oldest.group.parent.remove(oldest.group);
    oldest.group.traverse((o) => { if (o.geometry && o.geometry !== boltShaftGeo && o.geometry !== boltTipGeo && o.geometry !== boltFletchGeo) o.geometry.dispose(); });
  }
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(boltShaftGeo, boltShaftMat);
  shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(boltTipGeo, boltMetalMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = length * 0.5;
  const f1 = new THREE.Mesh(boltFletchGeo, boltFletchMat);
  const f2 = f1.clone();
  f1.position.set(0.018, 0, -length * 0.33);
  f2.position.set(-0.018, 0, -length * 0.33);
  f1.rotation.z = Math.PI / 2;
  f2.rotation.z = Math.PI / 2;
  group.add(shaft, tip, f1, f2);
  const forward = dir.clone().normalize();
  group.position.copy(point).addScaledVector(forward, -length * 0.38);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
  scene.add(group);
  if (host && host.attach) {
    host.updateMatrixWorld(true);
    host.attach(group);
  }
  bolts.push({ group, host });
  return group;
}

function clearBolts() {
  for (const b of bolts) if (b.group.parent) b.group.parent.remove(b.group);
  bolts.length = 0;
}

function impactWorld(hit, dir, shot = null) {
  if (hit.face) _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
  else _normal.set(0, 1, 0);
  fx.impact(hit.point, _normal);
  fx.bulletHole(hit.point, _normal, 0.055 + Math.random() * 0.05);
  if (shot?.bolt) stickBolt(hit.object, hit.point, dir);
  sound.impact();
  return hit.point;
}

function impactBullet(hit, shot, dir, distance) {
  const bodyBot = hit.object.userData.brBot;
  if (bodyBot) {
    const brPart = hit.object.userData.brPart || 'torso';
    const multiplier = brPart === 'head' ? 1.65 : brPart === 'torso' ? 1 : 0.72;
    const damage = falloffDamage(shot.damage, shot.falloff, distance) * multiplier;
    battleRoyale.hitBot(bodyBot, damage, hit.point.clone(), dir.clone(), player, {
      weapon: shot.weapon,
      part: brPart,
      melee: false,
    });
    if (shot.bolt) stickBolt(null, hit.point.clone(), dir.clone());
    sound.hit();
    flashHitmarker();
    return;
  }
  if (hit.object.userData.br) {
    const bot = battleRoyale.botForInstance(hit.object, hit.instanceId);
    if (bot) {
      const brPart = hit.object.userData.brPart;
      const multiplier = brPart === 'head' ? 1.65 : brPart === 'torso' ? 1 : 0.72;
      const damage = falloffDamage(shot.damage, shot.falloff, distance) * multiplier;
      battleRoyale.hitBot(bot, damage, hit.point.clone(), dir.clone(), player, {
        weapon: shot.weapon,
        part: brPart,
        melee: false,
      });
      if (shot.bolt) stickBolt(null, hit.point.clone(), dir.clone());
      sound.hit();
      flashHitmarker();
      return;
    }
    return;
  }
  const structure = hit.object.userData.structure;
  if (structure) {
    const damage = falloffDamage(shot.damage, shot.falloff, distance);
    building.damageStructure(structure, damage, hit.point, dir);
    if (shot.bolt) stickBolt(hit.object, hit.point, dir);
    if (hit.face) _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    else _normal.set(0, 1, 0);
    fx.impact(hit.point, _normal);
    fx.bulletHole(hit.point, _normal, 0.055 + Math.random() * 0.05);
    sound.impact();
    flashHitmarker();
    return;
  }
  const part = hit.object.userData.part;
  if (part && part.npc) {
    const npc = part.npc;
    const wasDead = npc.dead;
    const damage = falloffDamage(shot.damage, shot.falloff, distance);
    // Shotgun momentum also decays with range: a point-blank blast should throw
    // the body far harder than the last stray pellet at the edge of its spread.
    const forceAtRange = falloffDamage(shot.force, shot.falloff, distance);
    npc.hit(part, hit.point.clone(), dir.clone(), damage, shot.ap, forceAtRange, {
      weapon: shot.weapon,
      pellet: shot.pellet,
      pellets: shot.pellets,
      velocity: shot.velocity,
      bone: hit.object.userData.skeletonBone || null,
    });
    if (shot.bolt) stickBolt(hit.object, hit.point, dir);
    const faceKill = npc.faceKill;
    if (faceKill) {
      npc.faceKill = false;
      callout('FACE KILL', 'face');
      sound.face();
      triggerSlowmo(1.35);
    } else if (npc.lastHitArmour) {
      if (performance.now() - lastArmourCall > 320) {
        lastArmourCall = performance.now();
        callout('ARMOUR', 'armour');
      }
      sound.armour();
    } else {
      sound.hit();
    }
    flashHitmarker(npc.lastHitArmour);
    npcs.refreshTargets();
    if (!wasDead && npc.dead) rewardKill(npc, faceKill);
    return;
  }
  if (hit.object.userData.corpse) {
    fx.bloodBurst(hit.point, dir, 0.9);
    fx.meatChunk(hit.point, dir, [0.32, 0.07, 0.07], 1.2);
    sound.hit();
    flashHitmarker();
    return;
  }
  impactWorld(hit, dir, shot);
}

function shotTargets() {
  if (!battleRoyale.active) return npcs.targets.concat(world.raycastTargets);
  return npcs.targets.concat(world.raycastTargets, battleRoyale.botParts.map((part) => part.mesh), battleRoyale.bodyTargets);
}

function updateBullets(dt) {
  if (!bullets.length) return;
  npcs.refreshTargets();
  const objects = shotTargets();
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    if (b.life <= 0) {
      bullets.splice(i, 1);
      continue;
    }
    const prevX = b.pos.x;
    const prevY = b.pos.y;
    const prevZ = b.pos.z;
    b.vel.y -= b.gravity * dt;
    _bulletNext.copy(b.pos).addScaledVector(b.vel, dt);
    _bulletDir.copy(_bulletNext).sub(b.pos);
    const step = _bulletDir.length();
    if (step < 1e-5) continue;
    _bulletDir.divideScalar(step);

    // The exact impact point is the first intersection along this frame's
    // swept segment, including voxel body meshes and the merged world mesh.
    bulletRaycaster.set(b.pos, _bulletDir);
    bulletRaycaster.far = step + 0.001;
    const hit = bulletRaycaster.intersectObjects(objects, false)[0];
    if (hit) {
      spawnTracer(b.trail, hit.point, 0.035, 0.65);
      impactBullet(hit, b.shot, _bulletDir, b.travel + hit.distance);
      bullets.splice(i, 1);
      continue;
    }

    b.pos.copy(_bulletNext);
    b.travel += step;
    spawnTracer(b.trail, b.pos, 0.035, 0.32);
    b.trail.copy(b.pos);

    if (b.pos.y <= 0) {
      const t = Math.max(0, Math.min(1, prevY / Math.max(1e-5, prevY - b.pos.y)));
      const gx = prevX + (b.pos.x - prevX) * t;
      const gz = prevZ + (b.pos.z - prevZ) * t;
      const p = new THREE.Vector3(gx, 0.012, gz);
      fx.impact(p, new THREE.Vector3(0, 1, 0));
      fx.bulletHole(p, new THREE.Vector3(0, 1, 0), 0.06);
      if (b.shot.bolt) stickBolt(null, p, new THREE.Vector3(0, 1, 0));
      bullets.splice(i, 1);
      continue;
    }
    if (b.travel >= b.maxRange) bullets.splice(i, 1);
  }
}

player.onFire = (origin, dir, muzzle, shot) => {
  // Resolve the camera-centre ray to its first real surface. The projectile
  // then starts at the physical muzzle and converges on that exact point.
  npcs.refreshTargets();
  raycaster.set(origin, dir);
  raycaster.far = Math.min(150, shot.maxRange || 120);
  const aimHit = raycaster.intersectObjects(shotTargets(), false)[0];
  raycaster.far = 150;
  const target = aimHit
    ? aimHit.point.clone()
    : origin.clone().addScaledVector(dir, Math.min(150, shot.maxRange || 120));
  const shotDir = target.sub(muzzle);
  if (shotDir.lengthSq() < 0.0004) shotDir.copy(dir);
  else shotDir.normalize();
  if (shot.projectile) {
    launchProjectile(muzzle, shotDir, shot);
  } else {
    spawnBullet(muzzle, shotDir, shot, muzzle);
  }
  if (shot.pellet === 0) {
    if (shot.shell !== false) {
      fx.shell(muzzle, new THREE.Vector3().crossVectors(shotDir, new THREE.Vector3(0, 1, 0)).normalize());
    }
    npcs.alert(player.pos);
    battleRoyale.hearGunshot?.(player.pos);
    refreshStats();
  }
};

// A melee swing samples a real short cone with seven rays. The closest surface
// wins, so a blade cannot cut through a wall and strike a body behind it.
player.onMelee = (origin, dir, def) => {
  npcs.refreshTargets();
  const objects = shotTargets();
  _meleeRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _meleeUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const style = def.style || 'slash';
  const samples = style === 'overhead'
    ? [[0, 0], [0, 0.45], [0, 0.9], [-0.55, 0.25], [0.55, 0.25], [-0.9, 0.1], [0.9, 0.1]]
    : style === 'thrust'
      ? [[0, 0], [-0.12, 0], [0.12, 0], [0, 0.1], [0, -0.1], [-0.6, 0], [0.6, 0]]
      : [[0, 0], [-0.7, 0], [0.7, 0], [-1, 0.35], [1, 0.35], [-1, -0.35], [1, -0.35]];
  let best = null;
  let bestNpc = null;
  let bestEdge = 1;
  let bestDistance = 0;
  for (const [h, v] of samples) {
    _meleeDir.copy(dir)
      .addScaledVector(_meleeRight, h * def.arc)
      .addScaledVector(_meleeUp, v * (style === 'overhead' ? def.arc : 0.03))
      .normalize();
    raycaster.set(origin, _meleeDir);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects(objects, false);
    if (hits.length && (!best || hits[0].distance < best.distance)) {
      best = hits[0];
      bestNpc = hits[0].object.userData.part?.npc || null;
      bestEdge = 1 - Math.min(0.28, (Math.abs(h) + Math.abs(v)) * 0.11);
      bestDistance = hits[0].distance;
    }
  }
  raycaster.far = 150;
  if (!best) return;

  const bodyBot = best.object.userData.brBot;
  if (bodyBot) {
    const part = best.object.userData.brPart || 'torso';
    const multiplier = part === 'head' ? 1.65 : part === 'torso' ? 1 : 0.72;
    const reachFactor = 1.08 - Math.min(0.2, (bestDistance / Math.max(0.1, def.range)) * 0.2);
    const styleFactor = def.style === 'overhead' ? 1.12 : def.style === 'thrust' ? 1.05 : 1;
    battleRoyale.hitBot(bodyBot, def.damage * multiplier * reachFactor * styleFactor, best.point.clone(), dir, player, {
      weapon: def.name,
      melee: true,
      bash: !!def.bash,
      part,
    });
    fx.bloodBurst(best.point, dir, def.cut === 'blunt' ? 0.8 : 1.05);
    sound.hit();
    flashHitmarker();
    return;
  }

  if (best.object.userData.br) {
    const bot = battleRoyale.botForInstance(best.object, best.instanceId);
    if (bot) {
      const part = best.object.userData.brPart;
      const multiplier = part === 'head' ? 1.65 : part === 'torso' ? 1 : 0.72;
      const reachFactor = 1.08 - Math.min(0.2, (bestDistance / Math.max(0.1, def.range)) * 0.2);
      const styleFactor = def.style === 'overhead' ? 1.12 : def.style === 'thrust' ? 1.05 : 1;
      battleRoyale.hitBot(bot, def.damage * multiplier * reachFactor * styleFactor, best.point.clone(), dir, player, {
        weapon: def.name,
        melee: true,
        bash: !!def.bash,
        part,
      });
      fx.bloodBurst(best.point, dir, def.cut === 'blunt' ? 0.8 : 1.05);
      sound.hit();
      flashHitmarker();
      return;
    }
    return;
  }

  if (bestNpc) {
    const part = best.object.userData.part;
    const wasDead = bestNpc.dead;
    const reachFactor = 1.08 - Math.min(0.2, (bestDistance / Math.max(0.1, def.range)) * 0.2);
    const styleFactor = style === 'overhead' ? 1.12 : style === 'thrust' ? 1.05 : 1;
    bestNpc.hit(part, best.point.clone(), dir, def.damage * bestEdge * reachFactor, def.ap, def.force * styleFactor, {
      weapon: def.id,
      melee: true,
      style,
      cut: def.cut,
      slash: def.slash,
      bone: best.object.userData.skeletonBone || null,
    });
    fx.bloodBurst(best.point, dir, def.cut === 'blunt' ? 0.75 : 1.1);
    sound.hit();
    flashHitmarker(bestNpc.lastHitArmour);
    npcs.refreshTargets();
    if (!wasDead && bestNpc.dead) rewardKill(bestNpc, bestNpc.faceKill);
    return;
  }

  if (best.object.userData.structure) {
    building.damageStructure(best.object.userData.structure, def.damage * 1.15, best.point, dir);
    if (best.face) _meleeNormal.copy(best.face.normal).transformDirection(best.object.matrixWorld);
    else _meleeNormal.set(0, 1, 0);
    fx.impact(best.point, _meleeNormal);
    sound.impact();
    return;
  }

  if (best.face) _meleeNormal.copy(best.face.normal).transformDirection(best.object.matrixWorld);
  else _meleeNormal.set(0, 1, 0);
  if (def.cut === 'blunt') {
    fx.impact(best.point, _meleeNormal);
    sound.punch();
  } else {
    fx.sparks(best.point, _meleeNormal);
    sound.impact();
  }
  fx.bulletHole(best.point, _meleeNormal, def.cut === 'blunt' ? 0.12 : 0.075);
};

// The timed bash frame reuses the proven seven-ray contact path. Its def uses
// cut:'blunt', a shorter reach and a slower recovery, but the same world and
// body hit resolution.
player.onBash = player.onMelee;

npcs.onGunshot = (from, to, kind) => {
  spawnTracer(from, to);
  sound.enemyShot(kind);
  const shotDir = to.clone().sub(from).normalize();
  const maxDist = from.distanceTo(to);
  raycaster.set(from, shotDir);
  raycaster.far = maxDist;
  const hit = raycaster.intersectObjects(world.raycastTargets, false)[0];
  raycaster.far = 150;
  if (hit) {
    const n = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : new THREE.Vector3(0, 1, 0);
    fx.impact(hit.point, n);
    fx.bulletHole(hit.point, n, 0.045 + Math.random() * 0.025);
    sound.impact();
  }
};

// ---------------------------------------------------------------- input
let running = false;
let fallback = false;
let lockBlocked = false;
const overlay = ui.overlay;

function clearKeys() {
  player.keys.forward = false;
  player.keys.back = false;
  player.keys.left = false;
  player.keys.right = false;
  player.keys.sprint = false;
  player.keys.jump = false;
  player.setCrouch(false);
}

function pauseGame() {
  running = false;
  fallback = false;
  clearKeys();
  releaseTrigger();
  player.cancelAim();
  ui.scope.classList.remove('on');
  document.body.classList.remove('locked');
  overlay.classList.remove('hidden');
  overlay.classList.add('paused');
  overlay.querySelector('h1').innerHTML = 'PAUSED';
  overlay.querySelector('.tag').textContent = LAB_MODE
    ? 'click to return to the lab'
    : battleRoyale.active
      ? 'battle royale paused · the storm waits for no one'
      : buildBattle.active
        ? 'build battle paused · settings and armoury available'
        : 'click to return to the pit';
  ui.start.textContent = ((battleRoyale.active && !battleRoyale.resultShown) || (buildBattle.active && !buildBattle.resultShown)) ? 'RESUME MATCH' : 'RESUME';
  refreshAmmo();
}

function lockFailed() {
  document.body.classList.add('locked');
  overlay.classList.add('hidden');
}

function startFallback() {
  if (running) return;
  fallback = true;
  lockBlocked = true;
  running = true;
  lockFailed();
}

function enterGame() {
  sound.init();
  if (lockBlocked || !canvas.requestPointerLock) {
    startFallback();
    return;
  }
  try {
    const res = canvas.requestPointerLock();
    if (res && typeof res.catch === 'function') res.catch(() => startFallback());
  } catch (err) {
    startFallback();
    return;
  }
  setTimeout(() => {
    if (document.pointerLockElement !== canvas) startFallback();
  }, 400);
}

function resumeOrStart() {
  if ((buildBattle.active && !buildBattle.resultShown) || (battleRoyale.active && !battleRoyale.resultShown)) {
    enterGame();
    return;
  }
  startSelectedMode();
}

ui.start.addEventListener('click', resumeOrStart);

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) resumeOrStart();
});

canvas.addEventListener('click', () => {
  if (!running) enterGame();
});

document.addEventListener('pointerlockerror', () => startFallback());

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  fallback = false;
  running = locked;
  document.body.classList.toggle('locked', running);
  overlay.classList.toggle('hidden', running);
  if (!locked) {
    if (!buildBattle.resultShown && !battleRoyale.resultShown) pauseGame();
    else running = false;
  } else {
    lockBlocked = false;
  }
  clearKeys();
});

document.addEventListener('mousemove', (e) => {
  if (!running) return;
  player.look(e.movementX, e.movementY);
});

function selectWeaponSlot(index) {
  if (player.reloading) {
    callout('RELOAD IN PROGRESS', 'mode');
    return false;
  }
  const weapon = player.weapons[index];
  if (!weapon) {
    callout(`EMPTY SLOT ${index === 9 ? 0 : index + 1}`, 'mode');
    return false;
  }
  if (player.weaponIndex === index) return true;
  if (player.buildMode) setBuildMode(false);
  player.switchWeapon(index);
  return true;
}

function cycleWeaponSafe(dir) {
  if (!dir) return;
  if (player.reloading) {
    callout('RELOAD IN PROGRESS', 'mode');
    return;
  }
  if (player.buildMode) setBuildMode(false);
  player.cycleWeapon(dir);
}

function handleActionDown(action, event = null) {
  if (!action) return;
  if (event && action !== 'settings' && action !== 'armory') event.preventDefault();
  switch (action) {
    case 'forward': player.keys.forward = true; break;
    case 'back': player.keys.back = true; break;
    case 'left': player.keys.left = true; break;
    case 'right': player.keys.right = true; break;
    case 'sprint': player.keys.sprint = true; break;
    case 'jump': player.keys.jump = true; break;
    case 'crouch': player.setCrouch(true); break;
    case 'shoot':
      if (player.buildMode) placeBuildPiece();
      else player.pressTrigger();
      break;
    case 'aim':
      if (!player.buildMode) player.setAiming(true);
      break;
    case 'reload':
      if (!player.buildMode) player.startReload();
      break;
    case 'interact':
      if (battleRoyale.active) {
        battleRoyale.interact();
      } else {
        callout('LOADOUT STATION', 'mode');
        openArmory();
      }
      break;
    case 'quickMelee':
      // F is a firearm bash. It never equips melee and never falls back to a
      // knife strike; actual melee weapons use their normal LMB attacks.
      if (!player.buildMode && !player.weapon?.melee) player.weaponBash();
      break;
    case 'buildMode':
      if (buildBattle.active || battleRoyale.active) setBuildMode(!player.buildMode);
      else callout('BUILD MODE IS AVAILABLE IN BUILD BATTLE', 'mode');
      break;
    case 'buildWall':
    case 'buildFloor':
    case 'buildRamp':
    case 'buildRoof': {
      if (!player.buildMode) {
        callout(`ENTER BUILD MODE · ${keybindLabel(KEYBINDS.buildMode)}`, 'mode');
        break;
      }
      const kind = action.slice(5).toLowerCase();
      selectBuildPiece(BUILD_KINDS.indexOf(kind));
      break;
    }
    case 'edit':
      if (player.buildMode) editBuildPiece();
      else callout('ENTER BUILD MODE TO EDIT', 'mode');
      break;
    case 'confirmEdit':
      confirmBuildEdit();
      break;
    case 'resetEdit':
      if (player.buildMode) resetBuildPiece();
      break;
    case 'rotate':
      if (player.buildMode) rotateBuildPiece();
      break;
    case 'material':
      if (player.buildMode) cycleBuildMaterial(1);
      break;
    case 'cycleWeapon': cycleWeaponSafe(1); break;
    case 'settings':
      if (settingsOpen) closeSettings();
      break;
    case 'armory':
      if (armoryOpen) closeArmory();
      break;
    default: {
      const match = /^weapon(\d+)$/.exec(action);
      if (match) selectWeaponSlot(Number(match[1]) - 1);
    }
  }
}

function handleActionUp(action) {
  if (!action) return;
  switch (action) {
    case 'forward': player.keys.forward = false; break;
    case 'back': player.keys.back = false; break;
    case 'left': player.keys.left = false; break;
    case 'right': player.keys.right = false; break;
    case 'sprint': player.keys.sprint = false; break;
    case 'crouch': player.setCrouch(false); break;
    case 'shoot': releaseTrigger(); break;
    case 'aim': if (!player.buildMode) player.setAiming(false); break;
    default: break;
  }
}

document.addEventListener('mousedown', (e) => {
  if (keybindCapture || !running || settingsOpen || armoryOpen) return;
  const action = keybindOwner(`Mouse${e.button}`);
  if (!action) return;
  e.preventDefault();
  handleActionDown(action, e);
});

document.addEventListener('mouseup', (e) => {
  const action = keybindOwner(`Mouse${e.button}`);
  if (action) handleActionUp(action);
});

document.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('blur', () => {
  clearKeys();
  releaseTrigger();
  player.setAiming(false);
});

window.addEventListener(
  'wheel',
  (e) => {
    if (!running || settingsOpen || armoryOpen || keybindCapture) return;
    e.preventDefault();
    cycleWeaponSafe(e.deltaY > 0 ? 1 : -1);
  },
  { passive: false },
);

// Ctrl+W is a browser-reserved close-tab shortcut in several browsers. A
// capture-phase preventDefault is the strongest page-level defence: it keeps
// the event available to the gameplay handler below instead of swallowing the
// W key. The browser may still reserve the chord before dispatching it.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyW' || !(event.ctrlKey || event.metaKey)) return;
  if (!running || settingsOpen || armoryOpen || keybindCapture) return;
  event.preventDefault();
  event.returnValue = false;
}, { capture: true });

window.addEventListener('keydown', (e) => {
  if (keybindCapture) return;
  const k = e.code;
  if (k === 'Escape') {
    if (settingsOpen) {
      closeSettings();
      return;
    }
    if (armoryOpen) {
      closeArmory();
      return;
    }
    if (running || fallback) {
      e.preventDefault();
      pauseGame();
      if (document.pointerLockElement) document.exitPointerLock?.();
      return;
    }
  }
  const action = keybindOwner(k);
  if (action === 'settings') {
    // O is a menu-only convenience: it can close Settings when that panel is
    // actually open, but it can never open a menu during gameplay.
    e.preventDefault();
    if (settingsOpen) closeSettings();
    return;
  }
  if (action === 'armory') {
    e.preventDefault();
    if (armoryOpen) closeArmory();
    return;
  }
  if (settingsOpen || armoryOpen || !running) return;
  if (e.repeat || !action) return;
  e.preventDefault();
  handleActionDown(action, e);
});

window.addEventListener('keyup', (e) => {
  if (keybindCapture) return;
  handleActionUp(keybindOwner(e.code));
});

// ---------------------------------------------------------------- resize
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(Math.floor(w * RES_SCALE), Math.floor(h * RES_SCALE), false);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- loop
let last = performance.now();
let statsTimer = 0;

function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const realDt = Math.min(0.05, raw);

  if (slowmoTimer > 0) slowmoTimer = Math.max(0, slowmoTimer - realDt);
  const targetScale = slowmoTimer > 0 ? 0.24 : 1;
  timeScale += (targetScale - timeScale) * Math.min(1, realDt * (slowmoTimer > 0 ? 16 : 6));
  const dt = realDt * timeScale;

  const slowActive = slowmoTimer > 0;
  if (slowActive !== slowWasActive) {
    slowWasActive = slowActive;
    ui.slowmo.classList.toggle('on', slowActive);
    ui.vignette.classList.toggle('on', slowActive);
  }

  if (running) {
    player.update(dt);
    npcs.update(dt, player.pos);
    buildBattle.update(dt);
    battleRoyale.update(dt);
    if (battleRoyale.active) building.update(dt);
    if (player.buildMode) updateBuildPreview();
    refreshStance();
    if (LAB_MODE) {
      if (npcs.aliveCount() === 0) {
        labRespawnT -= dt;
        if (labRespawnT <= 0) {
          // The lab keeps exactly one subject. Dead bodies are removed before
          // the replacement is spawned; otherwise every 1.5 s adds another
          // corpse at the same spot and the "one subject" test fills with
          // overlapping ragdolls.
          npcs.disposeAll();
          spawnLabTarget();
          labRespawnT = 1.5;
        }
      } else {
        labRespawnT = 1.5;
      }
    }
    updateBullets(dt);
    physics.step(dt);
    for (const npc of npcs.npcs) {
      if (npc.physicsDriven) npc.afterPhysics();
    }
    battleRoyale.afterPhysics?.();
    debris.update(dt);
    fx.update(dt);
    world.update(dt, player.pos);
    updateTracers(dt);
    updateProjectiles(dt);
    if (hitmarkerTimer > 0) {
      hitmarkerTimer -= dt;
      if (hitmarkerTimer <= 0) ui.hitmarker.classList.remove('on');
    }
    statsTimer -= dt;
    if (statsTimer <= 0) {
      statsTimer = 0.2;
      refreshStats();
    }
  }

  // sun follows the player so shadow detail stays tight
  sun.position.set(player.pos.x + 14, 22, player.pos.z + 10);
  sun.target.position.set(player.pos.x, 0, player.pos.z);
  sun.target.updateMatrixWorld();

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

rebuildPips();
refreshAmmo();
refreshHealth();
refreshStats();
refreshCredits();
ui.mapName.textContent = world.mapData.label;
ui.start.textContent = `ENTER ${world.mapData.short}`;
syncSettingsUI();
renderKeybinds();
refreshControlHints();
updateModeSelection();
refreshBuildResources();
refreshStance();
if (LAB_MODE) {
  ui.mapName.textContent = 'RAGDOLL LAB';
  ui.start.textContent = 'ENTER THE LAB';
  overlay.querySelector('h1').innerHTML = 'RAGDOLL LAB';
  overlay.querySelector('.tag').textContent = 'ONE SUBJECT · LIVE BALLISTICS · SHOOT ANY BODY PART';
  overlay.querySelectorAll('.map-pick, .mode-pick, .setting-row').forEach((row) => { row.style.display = 'none'; });
  const note = overlay.querySelector('.note');
  if (note) note.textContent = 'One live subject, five thousand health, no AI aggression. Shoot any body part; targets respawn automatically after death.';
  const labButton = document.getElementById('lab-button');
  if (labButton) {
    labButton.href = './';
    labButton.innerHTML = 'LEAVE LAB <span>ARENA</span>';
  }
}
setFightBack(false, false);
setArmed(false, false);
setWaveMode(false, false);
refreshWave();
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('debug')) {
  const debugApi = { player, npcs, world, physics, bolts, bullets, scene, camera, renderer, fx, debris, THREE, stickBolt, market, building, buildBattle, battleRoyale, settings: GAME_SETTINGS, blood: BLOOD_SETTINGS,
    startRoyale: () => { selectedMode = 'royale'; updateModeSelection(); startSelectedMode(); },
    forceRunning: () => { fallback = true; lockBlocked = true; running = true; lockFailed(); clearKeys(); return true; },
    getBattleRoyale: () => battleRoyale.snapshot(),
    rollRarities: (n = 10000) => {
      const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
      for (let i = 0; i < n; i++) counts[battleRoyale._rollChestLoot().rarity.key]++;
      return counts;
    },
    getFullBodies: () => battleRoyale.bodies.map((b) => ({ bot: b.brBot?.id, visible: b.brBot?.bodyVisible, dead: b.dead })),
    getBRBuilds: () => battleRoyale.building?.snapshot().filter((s) => s.owner === 'player' || s.owner.startsWith('br-bot-')),
    // Debug-only deterministic bridge used by the live verification pass. It
    // advances the real controller, not a mock, then renders once.
    stepRoyale: (seconds = 1, step = 0.05) => {
      const n = Math.min(4000, Math.max(1, Math.ceil(seconds / step)));
      for (let i = 0; i < n; i++) {
        battleRoyale.update(step);
        physics.step(step);
        battleRoyale.afterPhysics?.();
        building.update(step);
      }
      renderer.render(scene, camera);
      return battleRoyale.snapshot();
    },
    teleportPlayer: (x, z, yaw = 0) => {
      player.pos.set(x, world.sampleGround(x, z, 2), z);
      player.vel.set(0, 0, 0);
      player.yaw = yaw;
      camera.updateMatrixWorld(true);
      return { pos: player.pos.toArray(), yaw: player.yaw };
    },
    renderProfile: (frames = 20) => {
      renderer.render(scene, camera);
      const start = performance.now();
      for (let i = 0; i < frames; i++) renderer.render(scene, camera);
      const elapsed = performance.now() - start;
      return {
        frames,
        msPerFrame: +(elapsed / frames).toFixed(2),
        fpsEquivalent: +(1000 / (elapsed / frames)).toFixed(1),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        jsHeap: performance.memory ? performance.memory.usedJSHeapSize : null,
      };
    },
    guns: GUN_WEAPONS.concat(SHOP_WEAPONS),
    giveCredits: (n) => market.addCredits(n),
    getCredits: () => market.credits,
    startBuildBattle: () => { selectedMode = 'buildbattle'; updateModeSelection(); startSelectedMode(); },
    loadArena,
    setBuildMode,
    selectBuildPiece,
    editBuildPiece,
    toggleEditSection,
    confirmBuildEdit,
    cancelPendingEdit,
    getPendingEdit: () => pendingEdit ? { structure: pendingEdit.structure.id, sections: [...pendingEdit.sections] } : null,
    setGameSetting,
    BUILD_KINDS,
    meleeWeapons: MELEE_SHOP_WEAPONS,
  };
  window.__bloodvox = debugApi;
  // Debug-only command bridge. Browser automation can execute a synchronous
  // expression against the live game and read the JSON result back from the
  // DOM even when its evaluate context is isolated from the game's main world.
  const debugOut = document.createElement('pre');
  debugOut.id = 'bv-debug-out';
  debugOut.hidden = true;
  document.body.appendChild(debugOut);
  document.addEventListener('bv-debug', (event) => {
    let id = null;
    try {
      const payload = JSON.parse(event.detail);
      id = payload.id;
      const run = new Function('api', `\"use strict\"; return (${payload.code});`);
      const result = run(debugApi);
      debugOut.textContent = JSON.stringify({ id, result: result === undefined ? null : result });
    } catch (error) {
      debugOut.textContent = JSON.stringify({ id, error: String(error?.stack || error) });
    }
  });
}

