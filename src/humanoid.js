import * as THREE from 'three';
import { makeVoxelPart, buildVoxelGeometry, carveVoxels, soakVoxels, srgb } from './voxel.js';
import { makeOrganMesh } from './organs.js';
import {
  BASE_BLOOD_VOLUME,
  bloodAmount,
  bloodLossScale,
  bloodSprayScale,
  childSafetyEnabled,
  goreEnabled,
} from './settings.js';
import {
  buildSkeleton,
  resolveSkeletonBone,
  damageSkeletonBone,
  skeletonBoneWear,
  disposeSkeleton,
  exposeSkeletonBones,
  concealSkeleton,
} from './skeleton.js';

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const PLATE_MAT = new THREE.MeshLambertMaterial({ color: 0x454d54 });
const PLATE_EDGE_MAT = new THREE.MeshLambertMaterial({ color: 0x7a848b });
const PLATE_STRAP_MAT = new THREE.MeshLambertMaterial({ color: 0x17191c });
const GUN_MAT = new THREE.MeshLambertMaterial({ color: 0x171a1e });
const GUN_METAL_MAT = new THREE.MeshLambertMaterial({ color: 0x343b42 });
const GUN_FLASH_MAT = new THREE.MeshBasicMaterial({
  color: 0xffc477,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const GUN_FORWARD = new THREE.Vector3(0, 0, -1);
const _aimTmp = new THREE.Vector3();
const _gunAim = new THREE.Vector3();
const _blastCenter = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _euphTarget = new THREE.Vector3();
const _euphDir = new THREE.Vector3();
const _motorDir = new THREE.Vector3();
const _jointDir = new THREE.Vector3();
const _jointPole = new THREE.Vector3();
const _jointElbow = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _com = new THREE.Vector3();
const _footCenter = new THREE.Vector3();
const _pelvisTarget = new THREE.Vector3();
const _chestTarget = new THREE.Vector3();
const _headTarget = new THREE.Vector3();
const _handTarget = new THREE.Vector3();
const _woundTarget = new THREE.Vector3();
const _shoulderCrawl = new THREE.Vector3();
const _braceA = new THREE.Vector3();
const _braceB = new THREE.Vector3();
const _chunkCenter = new THREE.Vector3();
const _chunkQuat = new THREE.Quaternion();
const _getUpHand = new THREE.Vector3();
const _getUpFoot = new THREE.Vector3();
const _getUpHip = new THREE.Vector3();
const _getUpGround = new THREE.Vector3();
const _getUpHandB = new THREE.Vector3();
const _getUpAux = new THREE.Vector3();
const _getUpAux2 = new THREE.Vector3();
const _getUpFront = new THREE.Vector3();
const _getUpSpine = new THREE.Vector3();
const _getUpShoulder = new THREE.Vector3();
const _getUpHeadDir = new THREE.Vector3();

const SHOTGUN_WEAPONS = new Set(['shotgun', 'sawedoff', 'scatter', 'breacher', 'jackhammer', 'gravedigger']);
const PENETRATOR_WEAPONS = new Set(['rifle', 'crossbow', 'impaler', 'longshot', 'railbow', 'nailer', 'hive', 'skewer']);
// Scoped rifle rounds are the only rounds with an explicit armour-defeating
// path. They still lose energy to the plate, but the plate cannot turn a torso
// hit into an armour-only event.
const SNIPER_WEAPONS = new Set(['rifle', 'longshot']);

// Approximate projectile mass in kilograms. This is combined with the real
// muzzle velocity carried by the shot, rather than treating every weapon's
// `force` number as an unrelated shove. Buckshot and nails are light per
// projectile; slugs, bolts and launcher rounds are not.
const PROJECTILE_MASS = {
  pistol: 0.0095, smg: 0.008, shotgun: 0.0035, rifle: 0.0095, magnum: 0.016,
  lmg: 0.0095, carbine: 0.0088, crossbow: 0.026, sawedoff: 0.0035,
  minigun: 0.0095, thumper: 0.23, impaler: 0.032, nailer: 0.006,
  scatter: 0.0035, hammer: 0.05, siege: 0.23, cleaver: 0.4, maul: 1.2,
  viper: 0.0078, vector: 0.0078, breacher: 0.0035, longshot: 0.021,
  judge: 0.019, vulcan: 0.012, wraith: 0.0085, railbow: 0.062,
  jackhammer: 0.0035, havoc: 0.23, skewer: 0.04, hive: 0.005,
  gravedigger: 0.0035, godhand: 0.025,
};
const DEFAULT_PROJECTILE_MASS = 0.009;

// NPC health is separate from the player's 100-point pool. The old 190/260
// values made a few pistol hits lethal; these are the requested doubling.
const NPC_BASE_HEALTH = 380;
const NPC_ARMOUR_HEALTH = 520;

// ---------- bone layout (metres, y = height above the floor) ----------
const BONES = {
  pelvis: [0, 0.94, 0],
  chest: [0, 1.38, 0.015],
  neck: [0, 1.5, 0.02],
  head: [0, 1.59, 0.025],
  lShoulder: [-0.185, 1.4, 0.005],
  rShoulder: [0.185, 1.4, 0.005],
  lElbow: [-0.2, 1.1, 0],
  rElbow: [0.2, 1.1, 0],
  lHand: [-0.21, 0.82, 0],
  rHand: [0.21, 0.82, 0],
  lHip: [-0.095, 0.94, 0],
  rHip: [0.095, 0.94, 0],
  lKnee: [-0.095, 0.5, 0.005],
  rKnee: [0.095, 0.5, 0.005],
  lFoot: [-0.095, 0.08, 0.02],
  rFoot: [0.095, 0.08, 0.02],
};

const RADII = {
  pelvis: 0.11,
  chest: 0.14,
  neck: 0.055,
  head: 0.13,
  lShoulder: 0.07,
  rShoulder: 0.07,
  lElbow: 0.055,
  rElbow: 0.055,
  lHand: 0.05,
  rHand: 0.05,
  lHip: 0.07,
  rHip: 0.07,
  lKnee: 0.06,
  rKnee: 0.06,
  lFoot: 0.06,
  rFoot: 0.06,
};

const LINKS = [
  ['pelvis', 'chest', 1],
  ['chest', 'neck', 1],
  ['neck', 'head', 1],
  ['chest', 'lShoulder', 1],
  ['chest', 'rShoulder', 1],
  ['lShoulder', 'lElbow', 1],
  ['lElbow', 'lHand', 1],
  ['rShoulder', 'rElbow', 1],
  ['rElbow', 'rHand', 1],
  ['pelvis', 'lHip', 1],
  ['pelvis', 'rHip', 1],
  ['lHip', 'lKnee', 1],
  ['lKnee', 'lFoot', 1],
  ['rHip', 'rKnee', 1],
  ['rKnee', 'rFoot', 1],
  ['lShoulder', 'rShoulder', 1],
  ['lHip', 'rHip', 1],
  ['chest', 'lHip', 0.6],
  ['chest', 'rHip', 0.6],
  ['lShoulder', 'pelvis', 0.45],
  ['rShoulder', 'pelvis', 0.45],
];

// limbs that come off together with a severed parent part
const DISTAL = {
  upperArmL: { parts: ['forearmL', 'handL'], bones: ['lElbow', 'lHand'] },
  upperArmR: { parts: ['forearmR', 'handR'], bones: ['rElbow', 'rHand'] },
  forearmL: { parts: ['handL'], bones: ['lHand'] },
  forearmR: { parts: ['handR'], bones: ['rHand'] },
  thighL: { parts: ['shinL', 'footL'], bones: ['lKnee', 'lFoot'] },
  thighR: { parts: ['shinR', 'footR'], bones: ['rKnee', 'rFoot'] },
  shinL: { parts: ['footL'], bones: ['lFoot'] },
  shinR: { parts: ['footR'], bones: ['rFoot'] },
};

// ---------- palettes ----------
const ARMOURS = [srgb(0.27, 0.29, 0.31), srgb(0.21, 0.23, 0.25), srgb(0.33, 0.34, 0.35)];
const SKINS = [
  srgb(0.85, 0.68, 0.55),
  srgb(0.72, 0.54, 0.4),
  srgb(0.56, 0.39, 0.27),
  srgb(0.4, 0.27, 0.19),
  srgb(0.93, 0.8, 0.68),
];
const SHIRTS = [
  srgb(0.26, 0.29, 0.35),
  srgb(0.4, 0.15, 0.14),
  srgb(0.16, 0.3, 0.25),
  srgb(0.44, 0.38, 0.23),
  srgb(0.19, 0.21, 0.29),
  srgb(0.5, 0.5, 0.52),
  srgb(0.33, 0.22, 0.3),
];
const PANTS = [srgb(0.17, 0.19, 0.25), srgb(0.24, 0.19, 0.15), srgb(0.13, 0.15, 0.17), srgb(0.28, 0.27, 0.29)];
const HAIRS = [srgb(0.12, 0.09, 0.07), srgb(0.34, 0.2, 0.1), srgb(0.55, 0.43, 0.18), srgb(0.07, 0.07, 0.08), srgb(0.42, 0.42, 0.44)];
const SHOES = [srgb(0.1, 0.1, 0.12), srgb(0.16, 0.12, 0.1), srgb(0.08, 0.09, 0.11)];
const EYE = srgb(0.03, 0.03, 0.04);
const MOUTH = srgb(0.26, 0.1, 0.09);

const pick = (a) => a[(Math.random() * a.length) | 0];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- math helpers ----------
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Quaternion that points local +Y along `dir`, with local +Z near `ref`. */
function quatFromY(dir, ref, out) {
  _y.copy(dir);
  if (_y.lengthSq() < 1e-9) _y.set(0, 1, 0);
  _y.normalize();
  _z.copy(ref).projectOnPlane(_y);
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).projectOnPlane(_y);
  if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0).projectOnPlane(_y);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Turn a round's energy and construction into a local wound profile. Heavy
 * slow rounds crush a wide face; fast penetrators punch a larger exit cavity;
 * buckshot tears a broad shallow channel. This is what makes destructiveness
 * depend on the weapon rather than only the raw health number.
 */
function destructionProfile(weapon, damage, ap, force, part) {
  const power = clamp(damage / 115 + force * 0.1 + ap * 0.14, 0.18, 3.4);
  const shotgun = SHOTGUN_WEAPONS.has(weapon);
  const penetrator = PENETRATOR_WEAPONS.has(weapon);
  let entry = 0.028 + power * 0.022;
  let exit = 0.05 + power * 0.035;
  let cavity = 0.032 + power * 0.024;
  let chunkVoxels = Math.round(3 + power * 8);
  if (shotgun) {
    entry *= 1.42;
    exit *= 1.12;
    cavity *= 1.2;
    chunkVoxels += 3;
  } else if (penetrator) {
    entry *= 0.88;
    exit *= 1.42;
    cavity *= 1.16;
  }

  const cap = Math.max(part.voxel * 0.7, Math.min(part.size[0], part.size[1], part.size[2]) * 0.46);
  return {
    kind: shotgun ? 'buckshot' : penetrator ? 'penetrator' : 'standard',
    power,
    entry: Math.min(entry, cap),
    exit: Math.min(exit, cap),
    cavity: Math.min(cavity, cap * 0.72),
    gibs: Math.round(2 + power * 4 + (shotgun ? 3 : 0)),
    chunkVoxels: Math.min(22, chunkVoxels),
  };
}

/** Where a ray leaves an axis-aligned box centred at the origin. */
function rayBoxExit(origin, dir, half) {
  let tExit = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(dir[axis]) < 1e-6) continue;
    const invD = 1 / dir[axis];
    const t1 = (-half[axis] - origin[axis]) * invD;
    const t2 = (half[axis] - origin[axis]) * invD;
    const t = Math.max(t1, t2);
    if (t < tExit) tExit = t;
  }
  if (!Number.isFinite(tExit) || tExit <= 0.01) return origin.clone().addScaledVector(dir, 0.05);
  return origin.clone().addScaledVector(dir, Math.min(tExit, 0.45));
}

// ---------- part definitions ----------
function partDefs(pal, armour) {
  const shirt = () => pal.shirt;
  const skin = () => pal.skin;
  const pants = () => pal.pants;

  return [
    {
      name: 'torso',
      kind: 'limb',
      a: 'pelvis',
      b: 'chest',
      extend: 0.1,
      w: 0.4,
      d: 0.24,
      voxel: 0.07,
      hp: 130,
      dmg: 1.1,
      cut: [],
      paint: (u, v, w) => {
        if (v < -0.4) return pal.pants;
        if (armour) {
          if (Math.abs(w) < 0.26) return pal.strap;
          if (Math.abs(v) > 0.36) return shade(pal.armour, 0.78);
          if (Math.abs(v) < 0.05) return pal.strap;
          return pal.armour;
        }
        if (v > 0.34) return shade(pal.shirt, 1.18);
        if (Math.abs(u) < 0.07) return shade(pal.shirt, 0.7);
        return pal.shirt;
      },
    },
    {
      name: 'neck',
      kind: 'limb',
      a: 'chest',
      b: 'neck',
      extend: 0.1,
      w: 0.12,
      d: 0.13,
      voxel: 0.06,
      hp: 60,
      dmg: 2.2,
      cut: [['chest', 'neck']],
      paint: () => shade(pal.skin, 0.94),
    },
    {
      name: 'head',
      kind: 'blob',
      a: 'head',
      from: 'neck',
      to: 'head',
      off: [0, 0.13, 0.01],
      w: 0.28,
      h: 0.3,
      d: 0.28,
      voxel: 0.06,
      hp: 75,
      dmg: 3.6,
      cut: [['neck', 'head']],
      kill: ['head'],
      paint: (u, v, w) => {
        const face = w > 0.29 && Math.abs(u) < 0.62 && v < 0.14 && v > -0.46;
        if (face) {
          if (Math.abs(v - 0.03) < 0.1 && Math.abs(Math.abs(u) - 0.17) < 0.11) return EYE;
          if (Math.abs(v + 0.27) < 0.08 && Math.abs(u) < 0.2) return MOUTH;
          return pal.skin;
        }
        if (armour) {
          if (v > 0.36) return shade(pal.helmet, 1.25);
          if (Math.abs(v - 0.16) < 0.07) return shade(pal.helmet, 0.65);
          return pal.helmet;
        }
        if (v > 0.3) return pal.hair;
        if (v > 0.2 && Math.abs(u) > 0.33) return pal.hair;
        return pal.skin;
      },
    },
    {
      name: 'upperArmL',
      kind: 'limb',
      a: 'lShoulder',
      b: 'lElbow',
      w: 0.14,
      d: 0.14,
      voxel: 0.055,
      hp: 40,
      dmg: 0.75,
      cut: [['lShoulder', 'lElbow']],
      paint: (u, v) => (armour ? (Math.abs(v) < 0.24 ? pal.armour : shade(pal.shirt, 0.8)) : v > 0.32 ? pal.skin : shirt()),
    },
    {
      name: 'upperArmR',
      kind: 'limb',
      a: 'rShoulder',
      b: 'rElbow',
      w: 0.14,
      d: 0.14,
      voxel: 0.055,
      hp: 40,
      dmg: 0.75,
      cut: [['rShoulder', 'rElbow']],
      paint: (u, v) => (armour ? (Math.abs(v) < 0.24 ? pal.armour : shade(pal.shirt, 0.8)) : v > 0.32 ? pal.skin : shirt()),
    },
    {
      name: 'forearmL',
      kind: 'limb',
      a: 'lElbow',
      b: 'lHand',
      w: 0.11,
      d: 0.11,
      voxel: 0.05,
      hp: 32,
      dmg: 0.7,
      cut: [['lElbow', 'lHand']],
      paint: skin,
    },
    {
      name: 'forearmR',
      kind: 'limb',
      a: 'rElbow',
      b: 'rHand',
      w: 0.11,
      d: 0.11,
      voxel: 0.05,
      hp: 32,
      dmg: 0.7,
      cut: [['rElbow', 'rHand']],
      paint: skin,
    },
    {
      name: 'handL',
      kind: 'blob',
      a: 'lHand',
      from: 'lElbow',
      to: 'lHand',
      off: [0, -0.04, 0],
      w: 0.1,
      h: 0.12,
      d: 0.09,
      voxel: 0.05,
      hp: 20,
      dmg: 0.5,
      cut: [],
      kill: ['lHand'],
      paint: skin,
    },
    {
      name: 'handR',
      kind: 'blob',
      a: 'rHand',
      from: 'rElbow',
      to: 'rHand',
      off: [0, -0.04, 0],
      w: 0.1,
      h: 0.12,
      d: 0.09,
      voxel: 0.05,
      hp: 20,
      dmg: 0.5,
      cut: [],
      kill: ['rHand'],
      paint: skin,
    },
    {
      name: 'thighL',
      kind: 'limb',
      a: 'lHip',
      b: 'lKnee',
      w: 0.17,
      d: 0.17,
      voxel: 0.06,
      hp: 44,
      dmg: 0.8,
      cut: [['lHip', 'lKnee']],
      paint: (u, v, w) => (armour && Math.abs(w) > 0.24 ? pal.armour : pal.pants),
    },
    {
      name: 'thighR',
      kind: 'limb',
      a: 'rHip',
      b: 'rKnee',
      w: 0.17,
      d: 0.17,
      voxel: 0.06,
      hp: 44,
      dmg: 0.8,
      cut: [['rHip', 'rKnee']],
      paint: (u, v, w) => (armour && Math.abs(w) > 0.24 ? pal.armour : pal.pants),
    },
    {
      name: 'shinL',
      kind: 'limb',
      a: 'lKnee',
      b: 'lFoot',
      w: 0.14,
      d: 0.14,
      voxel: 0.055,
      hp: 34,
      dmg: 0.75,
      cut: [['lKnee', 'lFoot']],
      paint: (u, v) => (v < -0.3 ? pal.shoe : armour && v > 0.16 ? pal.armour : pal.pants),
    },
    {
      name: 'shinR',
      kind: 'limb',
      a: 'rKnee',
      b: 'rFoot',
      w: 0.14,
      d: 0.14,
      voxel: 0.055,
      hp: 34,
      dmg: 0.75,
      cut: [['rKnee', 'rFoot']],
      paint: (u, v) => (v < -0.3 ? pal.shoe : armour && v > 0.16 ? pal.armour : pal.pants),
    },
    {
      name: 'footL',
      kind: 'blob',
      a: 'lFoot',
      from: 'lKnee',
      to: 'lFoot',
      off: [0, 0, 0.05],
      w: 0.13,
      h: 0.11,
      d: 0.25,
      voxel: 0.055,
      hp: 24,
      dmg: 0.5,
      cut: [],
      kill: ['lFoot'],
      paint: () => pal.shoe,
    },
    {
      name: 'footR',
      kind: 'blob',
      a: 'rFoot',
      from: 'rKnee',
      to: 'rFoot',
      off: [0, 0, 0.05],
      w: 0.13,
      h: 0.11,
      d: 0.25,
      voxel: 0.055,
      hp: 24,
      dmg: 0.5,
      cut: [],
      kill: ['rFoot'],
      paint: () => pal.shoe,
    },
  ];
}

let uid = 0;

export class Humanoid {
  constructor({ scene, world, physics, fx, debris, organs, position, yaw = 0, armour = false }) {
    this.id = ++uid;
    this.armoured = !!armour;
    this.aggressive = false;
    this.onAttack = null;
    this.attackT = 0;
    this.attackCooldown = 0;
    this.attackHit = false;
    this.getUpT = 0;
    this.lastHitArmour = false;
    this.faceKill = false;
    this.armed = false;
    this.gunKind = 'pistol';
    this.gunMesh = null;
    this.gunFlash = null;
    this.gunDir = new THREE.Vector3(0, 0, 1);
    this.meleeMesh = null;
    this.meleeKind = null;
    this.meleeSwingT = 0;
    this.plates = [];
    this.onShoot = null;
    this.shootTimer = 0.8 + Math.random() * 1.4;
    this.flashT = 0;
    this.lineOfSight = true;
    this.aiming = false;
    this.aimPoint = new THREE.Vector3();
    this.playerPos = new THREE.Vector3();
    this.scene = scene;
    this.world = world;
    this.physics = physics;
    this.fx = fx;
    this.debris = debris;
    this.organs = organs;

    this.position = position.clone();
    this.position.y = 0;
    this.yaw = yaw;
    this.forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.aimPoint.set(this.position.x, 1.35, this.position.z + 2);

    this.pal = {
      skin: pick(SKINS),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      hair: pick(HAIRS),
      shoe: pick(SHOES),
      armour: shade(pick(ARMOURS), 0.95),
      helmet: shade(pick(ARMOURS), 0.82),
      strap: srgb(0.08, 0.08, 0.09),
    };

    this.bones = {};
    this.links = [];
    this.jointLimits = [];
    this.parts = [];

    this.maxHealth = this.armoured ? NPC_ARMOUR_HEALTH : NPC_BASE_HEALTH;
    this.health = this.maxHealth;
    this.dead = false;
    this.counted = false;
    this.deathTime = 0;
    this.phase = Math.random() * 8;
    this.time = Math.random() * 8;
    this.speed = 0;
    this.fear = 0;
    this.state = 'idle';
    this.stateTimer = 0.4 + Math.random() * 2;
    this.target = this.position.clone();
    this.moveDir = new THREE.Vector3();
    this.moveWish = new THREE.Vector3();
    this.moveVelocity = new THREE.Vector3();
    this.moveIntent = false;
    this.moveWishSpeed = 0;
    this.locomotionGrounded = true;
    this.locomotionVertical = 0;
    this.locomotionBlocked = false;
    this.dripTimer = 0.3;
    this.stuckTimer = 0;
    this.armsUp = false;
    // Crouching changes the actual animated body height, the aim point other
    // bodies can hit, and movement speed. It is not a camera-only effect.
    this.crouching = false;
    this.crouchAmount = 0;
    this.targetOffsetY = 1.25;
    this.lastDamageAt = -100;

    // damage response
    this.flinch = 0;
    this.flinchDir = new THREE.Vector3(0, 0, 1);
    this.pain = 0;
    this.lean = 0;
    this.leanSide = 0;
    this.staggerT = 0;
    // Only a limbless crawl uses this legacy planted pose. Bullet reactions
    // never write to it; living bodies are recovered by the physical rig.
    this.kneelAmount = 0;
    this.kneelTarget = 0;
    this.kneelTimer = 0;
    this.downed = false;
    this.legsLost = 0;
    this.crawlPhase = 0;

    // wounds / circulation
    this.woundTotal = 0;
    this.bleedTimer = 0.4;
    this.poolTimer = 0.8;
    this.poolRadius = 0.12;
    this.dismemberments = 0;
    this.chunksTorn = 0;
    this.lastWoundProfile = null;
    this.bloodVolumeMax = BASE_BLOOD_VOLUME * Math.max(0.4, Math.min(2.4, bloodAmount()));
    this.bloodVolume = this.bloodVolumeMax;
    this.bloodLost = 0;
    this.bloodPressure = 1;
    this.bloodPulse = Math.random() * 6.28;
    this.bleedingWounds = [];
    this.arterialWounds = [];
    this.sprayCool = 0;
    this.deathCause = null;
    this.selfPairs = [];

    // gunfire shove
    this.knockT = 0;
    this.knockPower = 0;
    this.knockDir = new THREE.Vector3(0, 0, 1);

    // corpse / Euphoria-style active ragdoll
    this.frozen = false;
    this.merged = false;
    this.corpseMesh = null;
    this.muscle = 0;
    this.ragdollAwake = true;
    this.ragdollSleeping = false;
    this.ragdollIdle = 0;
    this.euphoriaT = 0;
    this.euphoriaPulse = 0;
    this.grabPoint = new THREE.Vector3();
    this.impactDir = new THREE.Vector3(0, 0, 1);
    this.impacts = 0;

    // ---- active neuromuscular rig -------------------------------------
    // A living body can hand itself to the solver for a real stagger, and a
    // dying body keeps its muscles fighting gravity as tone fades. These are
    // separate from the ordinary AI animation state.
    this.physicalDriven = false;
    this.activeRagdoll = false;
    // Upright NPCs use the preserved procedural walk/run presentation. A real
    // impact or loss of leg function hands the same body to the solver below.
    this.animationDriven = true;
    this.animPhase = Math.random() * Math.PI * 2;
    this.animTime = 0;
    this.animLimp = 0;
    this.animPoseReady = false;
    this.reactionT = 0;
    this.reactionDuration = 0;
    this.reactionSerial = 0;
    this.initialDeath = false;
    this.reactionGroup = 'torso';
    // Short, additive reactions used while the preserved locomotion animation
    // is still running. These never hand a lightly hit body to the solver.
    this.animFlinch = 0;
    this.animFlinchT = 0;
    this.animFlinchDuration = 0;
    this.animFlinchMax = 0;
    this.animFlinchSide = 0;
    this.animFlinchForward = 0;
    this.animFlinchGuardSide = 1;
    this.hitSlowT = 0;
    this.hitSlow = 1;
    this.hitSlowMul = 1;
    this.reactionTier = 'none';
    this.impactSeverity = 0;
    // A recovered solver body blends its bone transforms back into the
    // locomotion rig instead of snapping or standing in an idle pose.
    this.animBlendFrom = null;
    this.animBlendT = 0;
    this.animBlendDuration = 0;
    this.lastImpactPart = 'torso';
    this.lastImpactForce = 0;
    this.lastImpactPoint = new THREE.Vector3();
    this.lastImpactDir = new THREE.Vector3(0, 0, 1);
    this.lastBoneHit = null;
    this.lastBoneWear = 1;
    this.boneHits = 0;
    this.skeleton = [];
    this.incomingMomentum = 0;
    this.lastShotMass = 0;
    this.lastShotVelocity = 0;
    this.lastImpactMomentum = 0;
    this.lastImpactLever = 0;
    this.stumbleFallbackCount = 0;
    this.woundLocal = new THREE.Vector3();
    this.preHitVelocity = new THREE.Vector3();
    this.com = new THREE.Vector3();
    this.prevCom = new THREE.Vector3();
    this.comVelocity = new THREE.Vector3();
    this.balanceError = 0;
    this.balanceConfidence = 1;
    this.footPlantL = new THREE.Vector3();
    this.footPlantR = new THREE.Vector3();
    this.footTargetL = new THREE.Vector3();
    this.footTargetR = new THREE.Vector3();
    this.stepFrom = new THREE.Vector3();
    this.stepTo = new THREE.Vector3();
    this.stepSide = 0;
    this.stepT = 0;
    this.stepDuration = 0.28;
    this.stepCool = 0;
    this.stepKind = 'none';
    this.gaitLastSide = 0;
    this.locomotionPhase = 0;
    this.locomotionStride = 0.3;
    this.gaitStepCount = 0;
    this.catchStepCount = 0;
    this.impactTwist = 0;
    this.impactLift = 0;
    // A decaying world-space shove applied to the physical posture targets.
    // The solver impulse moves the bones; this keeps the neuromuscular target
    // displaced in the same direction instead of fighting it back instantly.
    this.impactShove = new THREE.Vector3();
    // A hit is not a binary stand/fall decision. These are consumed by the
    // living balance controller across several frames: accumulated instability,
    // the direction a catch step should cover, and a short local wound guard.
    this.stumbleLoad = 0;
    this.stumbleT = 0;
    this.stumbleDir = new THREE.Vector3();
    this.stumbleSide = 0;
    this.clutchT = 0;
    this.downSustainT = 0;
    this.recoveryRetryT = 0;
    this.impactLegSide = 0;
    this.impactLegT = 0;
    this.impactArmSide = 0;
    this.impactArmT = 0;
    this.buckle = 0;
    this.guardSide = 0;
    this.violence = 0;
    this.braceTarget = new THREE.Vector3();
    this.hasBrace = false;
    this.braceScanT = 0;
    this.motorTone = 0;
    this.twitchTimer = 1.4;
    this.twitchCount = 0;
    this.recoverBlend = 0;
    this.reacquireT = 0;
    this._animBlend = 1;
    this.physicalDown = false;
    // Solver bodies can be thrown clear of the floor. This is a real state,
    // not a get-up phase: no recovery or critical motor may run until the
    // bones have actually regained support.
    this.airborne = false;
    this.airborneT = 0;
    this.landedAt = -100;
    this.recoveryAnchorFresh = false;
    this.frameHitCount = 0;
    this.impulseStackScale = 1;
    this.hitLaunchT = 0;
    this.lastBoneHit = null;
    this.boneHits = 0;
    this.incomingMomentum = 0;
    this.lastShotMass = 0;
    this.lastShotVelocity = 0;
    this.lastImpactMomentum = 0;
    this.lastImpactLever = 0;
    this.stumbleFallbackCount = 0;
    this.criticalPending = false;
    this.recoveryT = 0;
    this.recoveryRise = 0;
    this.recoveryCapable = true;
    this.stableT = 0;
    this.downT = 0;
    this.recoveredFromDown = false;
    this.bodySpeed = 0;
    this.stableClock = 0;
    this.recoveryAnchor = new THREE.Vector3();
    // Controller state, not a timer: down -> recovery -> settle, or down ->
    // crawl/exhausted when the body cannot get itself up. Keeping this explicit
    // is what stops a body re-entering recovery every frame.
    this.physicalMode = 'idle';
    this.recoveryAttempted = false;
    this.recoveryStallT = 0;
    this.recoveryBestRise = 0;
    this.recoveryExhausted = false;
    this.lastStandUp = -100;
    this.recoveryHoldT = 0;
    // The room and support side of a get-up are chosen from the body's actual
    // orientation. These drive a physical plan, not an animation clip.
    this.recoveryPlanReady = false;
    this.recoveryDir = new THREE.Vector3(0, 0, 1);
    this.recoveryFaceUp = false;
    this.recoverySideLying = false;
    this.recoveryRoll = 1;
    this.recoveryKneeSide = 1;
    this.recoveryFootSide = -1;
    this.recoveryStartL = new THREE.Vector3();
    this.recoveryStartR = new THREE.Vector3();
    this.recoveryPlantL = new THREE.Vector3();
    this.recoveryPlantR = new THREE.Vector3();
    this.recoveryDelayBias = 0;
    this.recoveryDurationBias = 0;
    this.critical = false;
    this.criticalT = 0;
    this.criticalKneeSide = 1;
    this.criticalPray = 0;
    this.armTargetL = new THREE.Vector3();
    this.armTargetR = new THREE.Vector3();
    this.armTargetReady = false;
    this.armReachSpeedL = 0;
    this.armReachSpeedR = 0;
    this.woundCurl = 0;
    this.primaryWound = null;
    this.headPain = 0;
    this.braceL = new THREE.Vector3();
    this.braceR = new THREE.Vector3();
    this.hasBraceL = false;
    this.hasBraceR = false;
    // Physical crawl anchors. The hands stay in world space while the body is
    // pulled over them by the arm servos; no root translation is written.
    this.crawlDir = new THREE.Vector3(0, 0, 1);
    this.crawlCycle = 0;
    this.crawlSwingSide = -1;
    this.crawlSwingT = 0;
    this.crawlSwingFrom = new THREE.Vector3();
    this.crawlSwingTo = new THREE.Vector3();
    this.crawlPlantL = new THREE.Vector3();
    this.crawlPlantR = new THREE.Vector3();
    this.crawlInit = false;
    this.crawlSteerT = 0;
    this.crawlStride = 0.32;
    this.prevPhysicalPelvis = new THREE.Vector3();
    this.prevPhysicalChest = new THREE.Vector3();
    this.prevFramePelvis = new THREE.Vector3();
    this.prevFrameChest = new THREE.Vector3();
    this.neuro = {
      reflex: 0.72 + Math.random() * 0.56,
      painTolerance: 0.65 + Math.random() * 0.7,
      balanceSkill: 0.68 + Math.random() * 0.55,
      stance: 0.115 + Math.random() * 0.07,
      swayPhase: Math.random() * Math.PI * 2,
      stepBias: Math.random() < 0.5 ? -1 : 1,
      recovery: 0.72 + Math.random() * 0.6,
      flinch: 0.7 + Math.random() * 0.7,
      righting: 0.82 + Math.random() * 0.4,
      guard: Math.random() < 0.5 ? -1 : 1,
    };
    this.nervous = {
      pain: 0,
      startle: 0,
      imbalance: 0,
      fatigue: 0,
      reflexPool: 0,
    };

    this.build();
    this.initAnimatedLocomotion();
    this.updateMeshes();
  }

  /**
   * Put a newly spawned body straight into the solver. There is no kinematic
   * walking phase to hand off from: AI only supplies intent, while the linked
   * skeleton, gravity, contacts and muscle servos own every pose.
   */
  /** Initialize the preserved upright locomotion presentation. */
  initAnimatedLocomotion() {
    this.physicsDriven = false;
    this.activeRagdoll = false;
    this.animationDriven = true;
    this.ragdollAwake = false;
    this.ragdollSleeping = false;
    this.frozen = false;
    this.reactionT = 0;
    this.reactionSerial += 1;
    this.initialDeath = false;
    this.animFlinch = 0;
    this.animFlinchT = 0;
    this.animFlinchMax = 0;
    this.hitSlowT = 0;
    this.hitSlow = 1;
    this.hitSlowMul = 1;
    this.reactionTier = 'none';
    this.animBlendFrom = null;
    this.animBlendT = 0;
    this.animBlendDuration = 0;
    this.violence = 0;
    this.muscle = 1.9;
    this.physicalDown = false;
    this.physicalMode = 'animation';
    this.airborne = false;
    this.airborneT = 0;
    this.landedAt = -100;
    this.recoveryAnchorFresh = false;
    this.frameHitCount = 0;
    this.impulseStackScale = 1;
    this.hitLaunchT = 0;
    this.criticalPending = false;
    this.recoveryT = 0;
    this.recoveryRise = 0;
    this.recoveryCapable = true;
    this.recoveryAttempted = false;
    this.recoveryExhausted = false;
    this.stableT = 0;
    this.downT = 0;
    this.recoveredFromDown = false;
    this.bodySpeed = 0;
    this.stableClock = 0;
    this.speed = 0;
    this.moveDir.set(0, 0, 0);
    this.moveVelocity.set(0, 0, 0);
    this.moveWish.set(0, 0, 0);
    this.moveIntent = false;
    this.moveWishSpeed = 0;
    this.locomotionGrounded = true;
    this.locomotionVertical = 0;
    this.locomotionBlocked = false;
    this.stepSide = 0;
    this.stepT = 0;
    this.stepCool = 0;
    this.stepKind = 'none';
    this.gaitLastSide = 0;
    this.locomotionPhase = 0;
    this.recoveryPlanReady = false;
    this.recoveryDelayBias = Math.random() * 0.24;
    this.recoveryDurationBias = Math.random() * 0.34;
    this.critical = false;
    this.criticalT = 0;
    this.criticalPray = 0;
    this.armTargetReady = false;
    this.hasBrace = false;
    this.hasBraceL = false;
    this.hasBraceR = false;
    this.guardSide = 0;
    this.primaryWound = null;
    this.impactShove.set(0, 0, 0);
    this.impactLegSide = 0;
    this.impactLegT = 0;
    this.impactArmSide = 0;
    this.impactArmT = 0;
    this.balanceError = 0;
    this.nervous.pain = 0;
    this.nervous.startle = 0;
    this.animPhase = Math.random() * Math.PI * 2;
    this.animTime = 0;
    this.animLimp = 0;
    this.animPoseReady = false;
    this.position.y = this.world.sampleGround(this.position.x, this.position.z, this.position.y);

    for (const name in this.bones) {
      const bone = this.bones[name];
      if (!bone.alive) continue;
      bone.kinematic = true;
      bone.invMass = 0;
      bone.prev.copy(bone.position);
      bone.motorStrength = 0;
      bone.motorSpeed = 0;
    }
    for (const link of this.links) link.enabled = false;
    this.poseAnimatedLocomotion(0, true);
    this.updateCom(0);
    this.prevCom.copy(this.com);
    this.prevPhysicalPelvis.copy(this.bones.pelvis.position);
    this.prevPhysicalChest.copy(this.bones.chest.position);
    this.prevFramePelvis.copy(this.bones.pelvis.position);
    this.prevFrameChest.copy(this.bones.chest.position);
    if (this.gunMesh) this.gunMesh.visible = this.armed;
  }

  build() {
    for (const name in BONES) {
      const o = BONES[name];
      const p = this.physics.addParticle(
        new THREE.Vector3(this.position.x + o[0], o[1], this.position.z + o[2]),
        RADII[name] || 0.06,
        0,
      );
      p.kinematic = true;
      p.motorTarget = new THREE.Vector3();
      p.motorStrength = 0;
      p.motorSpeed = 0;
      this.bones[name] = p;
    }
    const boneDistance = (a, b) => this.bones[a].position.distanceTo(this.bones[b].position);
    this.rig = {
      upperArm: boneDistance('lShoulder', 'lElbow'),
      forearm: boneDistance('lElbow', 'lHand'),
      thigh: boneDistance('lHip', 'lKnee'),
      shin: boneDistance('lKnee', 'lFoot'),
      shoulder: boneDistance('chest', 'lShoulder'),
    };
    for (const [a, b, k] of LINKS) {
      const l = this.physics.addLink(this.bones[a], this.bones[b], k);
      l.enabled = false;
      l.baseStiffness = k;
      this.links.push(l);
    }

    // joint limits: knees, elbows and the neck cannot hyperextend or fold through
    const seg = (a, b) => this.bones[a].position.distanceTo(this.bones[b].position);
    const limit = (a, b, min, max) => {
      const l = this.physics.addLink(this.bones[a], this.bones[b], 0.9);
      l.limit = true;
      l.min = min;
      l.max = max;
      l.enabled = false;
      l.baseStiffness = 0.9;
      this.links.push(l);
      this.jointLimits.push(l);
    };
    // These are anatomical range limits, not a pose. A distance-only limit of
    // 0.18/0.26 allowed the elbow and knee to fold completely through
    // themselves, which is how an otherwise passive corpse ended in a ball.
    // Keep enough minimum extension for a human silhouette while still letting
    // the joints flex under gravity and impacts.
    limit('lHip', 'lFoot', 0.52, seg('lHip', 'lKnee') + seg('lKnee', 'lFoot') - 0.015);
    limit('rHip', 'rFoot', 0.52, seg('rHip', 'rKnee') + seg('rKnee', 'rFoot') - 0.015);
    limit('lShoulder', 'lHand', 0.34, seg('lShoulder', 'lElbow') + seg('lElbow', 'lHand') - 0.01);
    limit('rShoulder', 'rHand', 0.34, seg('rShoulder', 'rElbow') + seg('rElbow', 'rHand') - 0.01);
    limit('chest', 'head', 0.2, seg('chest', 'neck') + seg('neck', 'head') - 0.005);
    // A chain of individually legal links can still jackknife into a ball.
    // This long-range limit keeps the head in front of the ribcage instead of
    // letting it fold down beside the pelvis under gravity.
    limit(
      'pelvis',
      'head',
      0.62,
      seg('pelvis', 'chest') + seg('chest', 'neck') + seg('neck', 'head') - 0.01,
    );
    // Individual joint limits can still allow a compact fetal fold. Keep the
    // knees from being pulled into the ribcage and the head from meeting them.
    limit('chest', 'lKnee', 0.3, 1.8);
    limit('chest', 'rKnee', 0.3, 1.8);
    limit('head', 'lKnee', 0.42, 1.8);
    limit('head', 'rKnee', 0.42, 1.8);

    // Lateral anatomical limits. Distance constraints alone permit a leg to
    // rotate out sideways until the body is in a split, and permit arms to
    // flare straight out from the shoulders. These constraints are applied in
    // the same PBD iterations as the links, using the body's live right axis.
    const axisLimit = (a, b, min, max, stiffness = 0.8) => {
      const l = this.physics.addAxisLimit(this.bones[a], this.bones[b], this.right, min, max, stiffness);
      l.baseStiffness = stiffness;
      this.links.push(l);
      this.jointLimits.push(l);
    };
    axisLimit('pelvis', 'lFoot', -0.27, 0.27, 0.9);
    axisLimit('pelvis', 'rFoot', -0.27, 0.27, 0.9);
    axisLimit('pelvis', 'lKnee', -0.23, 0.23, 0.86);
    axisLimit('pelvis', 'rKnee', -0.23, 0.23, 0.86);
    axisLimit('lHip', 'lKnee', -0.16, 0.16, 0.82);
    axisLimit('rHip', 'rKnee', -0.16, 0.16, 0.82);
    axisLimit('lKnee', 'lFoot', -0.15, 0.15, 0.84);
    axisLimit('rKnee', 'rFoot', -0.15, 0.15, 0.84);
    axisLimit('pelvis', 'head', -0.34, 0.34, 0.76);
    axisLimit('chest', 'head', -0.22, 0.22, 0.8);
    axisLimit('lShoulder', 'lElbow', -0.35, 0.35, 0.78);
    axisLimit('rShoulder', 'rElbow', -0.35, 0.35, 0.78);
    axisLimit('lShoulder', 'lHand', -0.46, 0.46, 0.66);
    axisLimit('rShoulder', 'rHand', -0.46, 0.46, 0.66);

    // Non-adjacent bones collide as solid pieces of tissue. The direct links
    // above handle joints and bone length; this second pass stops a head being
    // driven through a ribcage or an arm through the pelvis by a high-force hit.
    if (this.physics.addSelfCollision) {
      const names = Object.keys(BONES);
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const na = names[i];
          const nb = names[j];
          const linked = this.links.some(
            (l) =>
              !l.limit &&
              !l.axisLimit &&
              ((l.a === this.bones[na] && l.b === this.bones[nb]) ||
                (l.a === this.bones[nb] && l.b === this.bones[na])),
          );
          if (linked) continue;
          this.selfPairs.push(this.physics.addSelfCollision(this.bones[na], this.bones[nb], 0.72));
        }
      }
    }

    // Segment volumes, not just joint spheres. The torso is a capsule from the
    // pelvis to the chest; the head, upper arms, forearms and legs collide
    // against it. This closes the gap where a forearm or thigh could sweep
    // through the ribcage between two otherwise separated joint particles.
    if (this.physics.addCapsuleCollision) {
      const cap = (a1, a2, b1, b2, gap, stiffness = 0.72) => {
        if (!this.bones[a1] || !this.bones[a2] || !this.bones[b1] || !this.bones[b2]) return;
        this.physics.addCapsuleCollision(this.bones[a1], this.bones[a2], this.bones[b1], this.bones[b2], gap, stiffness);
      };
      cap('pelvis', 'chest', 'neck', 'head', 0.07, 0.96);
      cap('pelvis', 'chest', 'lShoulder', 'lElbow', 0.05, 0.56);
      cap('pelvis', 'chest', 'rShoulder', 'rElbow', 0.05, 0.56);
      cap('pelvis', 'chest', 'lElbow', 'lHand', 0.035, 0.7);
      cap('pelvis', 'chest', 'rElbow', 'rHand', 0.035, 0.7);
      // The thighs and shins are volumes too. Without these, the knee joints
      // can be driven into the chest between the torso and limb particles.
      cap('pelvis', 'chest', 'lHip', 'lKnee', 0.05, 0.82);
      cap('pelvis', 'chest', 'rHip', 'rKnee', 0.05, 0.82);
      cap('pelvis', 'chest', 'lKnee', 'lFoot', 0.04, 0.72);
      cap('pelvis', 'chest', 'rKnee', 'rFoot', 0.04, 0.72);
      cap('lElbow', 'lHand', 'lHip', 'lKnee', 0.035, 0.56);
      cap('rElbow', 'rHand', 'rHip', 'rKnee', 0.035, 0.56);
      cap('lHip', 'lKnee', 'rHip', 'rKnee', 0.045, 0.56);
      cap('lKnee', 'lFoot', 'rKnee', 'rFoot', 0.04, 0.56);
    }

    const defs = partDefs(this.pal, this.armoured);
    defs.forEach((def, i) => {
      const len =
        def.kind === 'limb'
          ? this.bones[def.a].position.distanceTo(this.bones[def.b].position) + (def.extend || 0)
          : 0;
      const w = def.w;
      const h = def.kind === 'limb' ? len : def.h;
      const d = def.d;
      const built = makeVoxelPart(w, h, d, def.paint, def.voxel, this.id * 17 + i * 7 + 1);
      const geo = buildVoxelGeometry(built.voxels, def.voxel);
      const mesh = new THREE.Mesh(geo, MAT);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const hp = Math.round(def.hp * 1.35);
      const part = {
        name: def.name,
        kind: def.kind,
        a: def.a,
        b: def.b,
        from: def.from,
        to: def.to,
        off: new THREE.Vector3().fromArray(def.off || [0, 0, 0]),
        voxel: def.voxel,
        hp,
        maxHp: hp,
        dmg: def.dmg,
        cut: def.cut || [],
        kill: def.kill || [],
        voxels: built.voxels,
        size: [built.w, built.h, built.d],
        mesh,
        destroyed: false,
        mangled: false,
        trauma: 0,
        destroyedVolume: 0,
        plates: [],
        armourHp: 0,
        armourBroken: false,
        wounds: [],
      };
      mesh.userData.part = part;
      part.npc = this;
      this.scene.add(mesh);
      this.parts.push(part);
    });
    buildSkeleton(this);
    if (this.armoured) this.buildArmourPlates();
  }

  /** Visible helmet, vest, shoulder pads and limb plates over the voxel body. */
  addPlate(partName, w, h, d, x, y, z, mat = PLATE_MAT, rx = 0) {
    const part = this.parts.find((p) => p.name === partName);
    if (!part || !part.mesh) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    part.mesh.add(mesh);
    if (!part.plates.length) part.armourHp = Math.max(24, part.maxHp * 0.55);
    part.plates.push(mesh);
    this.plates.push(mesh);
  }

  /** Blow the plate off one body zone; the next round meets exposed tissue. */
  breakArmour(part, point) {
    if (!part.plates.length) return;
    part.armourHp = 0;
    part.armourBroken = true;
    for (const plate of part.plates) {
      if (plate.parent === part.mesh) part.mesh.remove(plate);
      plate.geometry.dispose();
      const i = this.plates.indexOf(plate);
      if (i >= 0) this.plates.splice(i, 1);
    }
    part.plates.length = 0;
    this.fx.sparks(point || part.mesh.position, new THREE.Vector3(0, 1, 0));
    this.fx.bloodBurst(point || part.mesh.position, new THREE.Vector3(0, 0.8, 0), 0.55);
  }

  buildArmourPlates() {
    // helmet: open face, thick top and side shells
    this.addPlate('head', 0.3, 0.09, 0.3, 0, 0.115, 0);
    this.addPlate('head', 0.06, 0.16, 0.28, 0.14, 0.005, 0);
    this.addPlate('head', 0.06, 0.16, 0.28, -0.14, 0.005, 0);
    this.addPlate('head', 0.24, 0.16, 0.055, 0, 0.005, -0.14);
    this.addPlate('head', 0.31, 0.025, 0.1, 0, 0.075, 0.13, PLATE_EDGE_MAT);
    this.addPlate('head', 0.18, 0.035, 0.025, 0, 0.025, 0.15, PLATE_EDGE_MAT);

    // hard chest and back plates with a bright collar and strap seams
    this.addPlate('torso', 0.3, 0.3, 0.055, 0, 0.035, 0.125);
    this.addPlate('torso', 0.3, 0.3, 0.055, 0, 0.035, -0.125);
    this.addPlate('torso', 0.055, 0.34, 0.25, 0.2, 0, 0);
    this.addPlate('torso', 0.055, 0.34, 0.25, -0.2, 0, 0);
    this.addPlate('torso', 0.32, 0.04, 0.27, 0, 0.21, 0, PLATE_EDGE_MAT);
    this.addPlate('torso', 0.03, 0.31, 0.27, 0.06, 0.02, 0, PLATE_STRAP_MAT);
    this.addPlate('torso', 0.03, 0.31, 0.27, -0.06, 0.02, 0, PLATE_STRAP_MAT);

    // shoulder pads and thigh/shin guards
    this.addPlate('upperArmL', 0.18, 0.1, 0.18, 0, 0.14, 0, PLATE_MAT);
    this.addPlate('upperArmR', 0.18, 0.1, 0.18, 0, 0.14, 0, PLATE_MAT);
    this.addPlate('thighL', 0.17, 0.24, 0.045, 0, 0.0, 0.085);
    this.addPlate('thighR', 0.17, 0.24, 0.045, 0, 0.0, 0.085);
    this.addPlate('shinL', 0.15, 0.2, 0.04, 0, 0.02, 0.065);
    this.addPlate('shinR', 0.15, 0.2, 0.04, 0, 0.02, 0.065);
  }

  /**
   * Give a normal-game body a visible melee tool. Battle Royale bots carry the
   * same axe as the player; the model is parented to the real right hand, so
   * it follows the existing skeleton and locomotion animation.
   */
  equipMelee(kind = 'fireaxe') {
    if (this.meleeMesh && this.meleeKind === kind) {
      this.meleeMesh.visible = !this.dead;
      return;
    }
    if (this.meleeMesh) {
      this.scene.remove(this.meleeMesh);
      for (const child of this.meleeMesh.children) child.geometry?.dispose();
      this.meleeMesh = null;
    }
    this.armed = false;
    if (this.gunMesh) this.gunMesh.visible = false;
    const group = new THREE.Group();
    const add = (w, h, d, x, y, z, mat, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rz;
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const haft = new THREE.MeshLambertMaterial({ color: 0x593a20 });
    const steel = new THREE.MeshLambertMaterial({ color: 0x5e666a });
    const edge = new THREE.MeshLambertMaterial({ color: 0xaab5b8 });
    const red = new THREE.MeshLambertMaterial({ color: 0x8e2d20 });
    add(0.045, 0.78, 0.045, 0, 0, 0, haft);
    add(0.16, 0.19, 0.065, 0.075, 0.32, 0, red);
    add(0.12, 0.27, 0.035, 0.15, 0.32, 0, steel);
    add(0.035, 0.30, 0.022, 0.225, 0.32, 0, edge);
    add(0.13, 0.09, 0.07, -0.08, 0.32, 0, steel);
    add(0.055, 0.16, 0.055, 0, 0.32, 0, steel);
    for (let i = 0; i < 4; i++) add(0.048, 0.014, 0.048, 0, -0.27 + i * 0.06, 0, new THREE.MeshLambertMaterial({ color: 0x17191b }));
    this.meleeKind = kind;
    this.meleeMesh = group;
    this.scene.add(group);
  }

  /** Show/hide every visual piece of this body for distance LOD. */
  setVisible(visible) {
    const on = !!visible;
    for (const part of this.parts) if (part.mesh) part.mesh.visible = on;
    if (this.gunMesh) this.gunMesh.visible = on && this.armed && !this.dead;
    if (this.meleeMesh) this.meleeMesh.visible = on && !this.armed && !this.dead;
    if (this.corpseMesh) this.corpseMesh.visible = on;
    for (const bone of this.skeleton || []) if (bone.mesh) bone.mesh.visible = on && !!bone.exposed;
    this._lodVisible = on;
  }

  /** Give or take away the visible NPC firearm. */
  equipGun(on, kind = this.gunKind) {
    this.armed = !!on;
    this.gunKind = kind;
    if (this.armed && this.meleeMesh) this.meleeMesh.visible = false;
    this.shootTimer = 0.55 + Math.random() * 1.3;
    if (this.armed && !this.gunMesh) this.buildGunMesh();
    if (this.gunMesh) this.gunMesh.visible = this.armed && !this.dead;
  }

  /** Swap the visible firearm model and its handling profile in combat. */
  setGunKind(kind) {
    if (!kind || kind === this.gunKind) return;
    this.gunKind = kind;
    if (!this.gunMesh) return;
    this.scene.remove(this.gunMesh);
    for (const child of this.gunMesh.children) child.geometry?.dispose();
    this.gunMesh = null;
    this.gunFlash = null;
    if (this.armed && !this.dead) {
      this.buildGunMesh();
      this.gunMesh.visible = true;
    }
  }

  buildGunMesh() {
    const group = new THREE.Group();
    const add = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const smg = this.gunKind === 'smg';
    add(0.065, smg ? 0.08 : 0.065, smg ? 0.36 : 0.25, 0, 0.015, smg ? -0.1 : -0.07, GUN_METAL_MAT);
    add(0.03, 0.03, smg ? 0.2 : 0.13, 0, 0.02, smg ? -0.37 : -0.26, GUN_MAT);
    add(0.05, smg ? 0.14 : 0.11, 0.07, 0, -0.075, 0.02, GUN_MAT);
    if (smg) add(0.04, 0.14, 0.05, 0, -0.1, -0.08, GUN_MAT);
    add(0.022, 0.035, 0.022, 0, 0.06, -0.19, GUN_MAT);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), GUN_FLASH_MAT);
    flash.position.set(0, 0.02, smg ? -0.48 : -0.34);
    flash.visible = false;
    group.add(flash);
    this.gunFlash = flash;
    this.gunMesh = group;
    this.scene.add(group);
  }

  /** A hit to the weapon arm can strip the firearm out of the hand. */
  dropGun() {
    if (!this.armed && !this.gunMesh) return;
    this.armed = false;
    this.aiming = false;
    if (this.gunMesh) this.gunMesh.visible = false;
  }

  muzzleWorld(out) {
    if (!this.gunMesh) return out.copy(this.bones.chest.position);
    return out
      .copy(this.bones.rHand.position)
      .addScaledVector(this.gunDir, this.gunKind === 'smg' ? 0.52 : 0.38);
  }

  fireGun() {
    this.flashT = 0.06;
    if (this.gunFlash) this.gunFlash.visible = true;
    this.shootTimer = this.gunKind === 'smg' ? 1.05 + Math.random() * 0.75 : 1.5 + Math.random() * 1.1;
    this.onShoot?.(this);
  }

  // ---------------- AI ----------------
  think(dt, playerPos) {
    this.time += dt;
    if (!this.dead && this.health > 0 && this.health <= 1 && !this.critical) {
      this.enterCritical(this.forward, null, 0.35);
    }
    this.fear = Math.max(0, this.fear - dt);
    this.stateTimer -= dt;
    this.pain = Math.max(0, this.pain - dt * 2.2);
    this.lean += (0 - this.lean) * Math.min(1, dt * 4);
    this.leanSide *= Math.exp(-dt * 5);
    this.staggerT = Math.max(0, this.staggerT - dt);
    this.aiming = false;
    if (this.shootTimer > 0) this.shootTimer -= dt;

    const hurt = 0.45 + 0.55 * clamp(this.health / this.maxHealth, 0, 1);
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    this.playerPos.copy(playerPos);

    // While the body is physically on the floor, the crawl/recovery/downed
    // controller owns it. AI may not add root velocity or another get-up.
    if (this.physicalDown) {
      this.speed = 0;
      this.moveDir.set(0, 0, 0);
      this.aiming = false;
      return;
    }

    if (this.aggressive && !this.downed) {
      const toP = _dir.copy(playerPos).sub(this.position);
      toP.y = 0;
      const dist = toP.length();

      if (this.armed) {
        this.aimPoint.set(playerPos.x, playerPos.y + this.targetOffsetY, playerPos.z);
        if (dist > 18 || !this.lineOfSight) {
          if (dist > 0.001) this.move(_aimTmp.copy(toP).normalize(), 3.55 * hurt, dt);
        } else if (dist < 5.5) {
          if (dist > 0.001) this.move(_aimTmp.copy(toP).normalize().multiplyScalar(-1), 1.8, dt);
        } else {
          const side = Math.sin(this.time * 1.5 + this.phase) > 0 ? 1 : -1;
          this.move(_strafe.copy(this.right).multiplyScalar(side), 1.4, dt);
        }

        if (dist > 0.001) {
          this.yaw = angleLerp(this.yaw, Math.atan2(toP.x, toP.z), Math.min(1, dt * 11));
          this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        }

        if (dist < 1.3) {
          this.speed = 0;
          if (this.attackCooldown <= 0) {
            this.attackT = 0.42;
            this.attackCooldown = 0.9;
            this.attackHit = false;
          }
          return;
        }

        this.aiming = true;
        if (this.shootTimer <= 0 && this.lineOfSight && dist < 26) this.fireGun();
        return;
      }

      if (dist > 1.15) {
        if (dist > 0.001) this.move(toP.normalize(), 3.5 * hurt, dt);
        this.armsUp = false;
        return;
      }
      this.speed = 0;
      if (dist > 0.001) {
        this.yaw = angleLerp(this.yaw, Math.atan2(toP.x, toP.z), Math.min(1, dt * 10));
        this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      }
      if (this.attackCooldown <= 0) {
        this.attackT = 0.42;
        this.attackCooldown = 0.9;
        this.attackHit = false;
      }
      return;
    }

    const toPlayer = _dir.copy(playerPos).sub(this.position);
    toPlayer.y = 0;
    const playerDist = toPlayer.length();
    if (playerDist < 2.6) this.fear = Math.max(this.fear, 1.1);

    if (this.fear > 0.01) {
      // Panic: run away from the shooter. Keep the normal opposite-leg arm
      // cycle. Lifting both hands beside the chest reads as a curled pose and
      // hides the running swing.
      const away = toPlayer.clone().multiplyScalar(-1);
      if (away.lengthSq() < 0.001) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      away.normalize();
      if (Math.abs(this.position.x) > this.world.bounds - 3) away.x *= -1;
      if (Math.abs(this.position.z) > this.world.bounds - 3) away.z *= -1;
      this.move(away, 3.4 * hurt, dt);
      this.armsUp = false;
      return;
    }

    this.armsUp = false;

    if (this.state === 'walk') {
      const d = _dir.copy(this.target).sub(this.position);
      d.y = 0;
      if (d.length() < 0.7 || this.stateTimer <= 0) {
        this.state = 'idle';
        this.stateTimer = 1.2 + Math.random() * 3.5;
        this.speed = 0;
      } else {
        d.normalize();
        this.move(d, 1.35 * hurt, dt);
      }
    } else {
      this.speed = 0;
      if (this.stateTimer <= 0) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 11;
        this.target.set(
          Math.max(-this.world.bounds + 1.5, Math.min(this.world.bounds - 1.5, this.position.x + Math.sin(ang) * dist)),
          0,
          Math.max(-this.world.bounds + 1.5, Math.min(this.world.bounds - 1.5, this.position.z + Math.cos(ang) * dist)),
        );
        this.state = 'walk';
        this.stateTimer = 5 + Math.random() * 7;
      }
      this.yaw += Math.sin(this.time * 0.7) * dt * 0.6;
      this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    }
  }

  /**
   * AI locomotion is intent only. No root translation is written here: the
   * physical gait moves the pelvis by planting feet and driving the legs.
   */
  move(dir, speed, dt) {
    const length = Math.hypot(dir.x, dir.z);
    if (this.dead || this.physicalDown || length < 1e-5 || speed <= 0) {
      this.moveIntent = false;
      this.speed = 0;
      return;
    }
    this.moveDir.set(dir.x / length, 0, dir.z / length);
    // Ground locomotion is an intent. stepAnimatedLocomotion changes the
    // actual horizontal velocity with acceleration, friction and collision;
    // this function no longer teleports the root each frame.
    const cap = this.animationDriven ? 3.8 : this.physicalDown ? 1.05 : 2.9;
    const limpFactor = 1 - clamp(this.animLimp, 0, 0.7) * 0.55;
    const crouchFactor = 1 - clamp(this.crouchAmount, 0, 1) * 0.52;
    this.moveWish.copy(this.moveDir);
    this.moveWishSpeed = Math.min(speed * this.hitSlowMul * limpFactor, cap) * crouchFactor;
    this.moveIntent = true;
    this.speed = this.moveWishSpeed;
    const targetYaw = Math.atan2(this.moveDir.x, this.moveDir.z);
    this.yaw = angleLerp(this.yaw, targetYaw, 1 - Math.exp(-9 * dt));
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** Jump while keeping the current horizontal velocity. */
  jump(power = 5.4) {
    if (this.dead || this.physicalDown || !this.locomotionGrounded) return false;
    this.locomotionGrounded = false;
    this.locomotionVertical = power;
    return true;
  }

  /**
   * Integrate real horizontal velocity for the upright AI. The old pose path
   * wrote position directly from speed, which made releasing an input stop the
   * body instantly. This keeps momentum through jumps and uses the same
   * collision circle as the player.
   */
  stepAnimatedLocomotion(dt) {
    if (!(dt > 0) || this.dead || this.physicalDown) return;
    const intent = this.moveIntent && this.moveWish.lengthSq() > 0.0001;
    const grounded = this.locomotionGrounded;
    const wishX = intent ? this.moveWish.x * this.moveWishSpeed : 0;
    const wishZ = intent ? this.moveWish.z * this.moveWishSpeed : 0;
    if (intent) {
      const response = 1 - Math.exp(-(grounded ? 9.2 : 2.2) * dt);
      this.moveVelocity.x += (wishX - this.moveVelocity.x) * response;
      this.moveVelocity.z += (wishZ - this.moveVelocity.z) * response;
    } else if (grounded) {
      const friction = Math.exp(-7.2 * dt);
      this.moveVelocity.x *= friction;
      this.moveVelocity.z *= friction;
      if (this.moveVelocity.lengthSq() < 0.0025) this.moveVelocity.set(0, 0, 0);
    } else {
      const drag = Math.exp(-0.22 * dt);
      this.moveVelocity.x *= drag;
      this.moveVelocity.z *= drag;
    }

    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    const next = {
      x: beforeX + this.moveVelocity.x * dt,
      z: beforeZ + this.moveVelocity.z * dt,
    };
    this.world.resolveCircle(next, 0.29, this.position.y);
    const movedX = next.x - beforeX;
    const movedZ = next.z - beforeZ;
    const intended = Math.hypot(this.moveVelocity.x, this.moveVelocity.z) * dt;
    const actual = Math.hypot(movedX, movedZ);
    this.locomotionBlocked = intended > 0.001 && actual < intended * 0.6;
    if (intended > 0.001 && actual < intended * 0.82) {
      this.moveVelocity.x = movedX / Math.max(0.001, dt);
      this.moveVelocity.z = movedZ / Math.max(0.001, dt);
    }
    this.position.x = next.x;
    this.position.z = next.z;

    const ground = this.world.sampleGround(this.position.x, this.position.z, this.position.y);
    if (grounded) {
      if (ground < this.position.y - 0.32) {
        this.locomotionGrounded = false;
        this.locomotionVertical = 0;
      } else {
        this.position.y = ground;
      }
    } else {
      this.locomotionVertical -= 22 * dt;
      this.position.y += this.locomotionVertical * dt;
      if (this.position.y <= ground && this.locomotionVertical <= 0) {
        this.position.y = ground;
        this.locomotionVertical = 0;
        this.locomotionGrounded = true;
      }
    }
    this.speed = Math.hypot(this.moveVelocity.x, this.moveVelocity.z);
    this.moveIntent = false;
  }

  /** Write one bone of the animated rig in the NPC's local forward/right frame. */
  setAnimatedBone(name, x, y, z) {
    const bone = this.bones[name];
    if (!bone) return;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const tx = this.position.x + x * c + z * s;
    const ty = this.position.y + y;
    const tz = this.position.z - x * s + z * c;
    const from = this.animBlendFrom?.[name];
    if (from && this.animBlendDuration > 0) {
      const u = clamp(this.animBlendT / this.animBlendDuration, 0, 1);
      const e = u * u * (3 - 2 * u);
      bone.position.set(
        from.x + (tx - from.x) * e,
        from.y + (ty - from.y) * e,
        from.z + (tz - from.z) * e,
      );
    } else {
      bone.position.set(tx, ty, tz);
    }
    bone.prev.copy(bone.position);
    bone.kinematic = true;
    bone.invMass = 0;
    bone.motorStrength = 0;
  }

  /**
   * Preserved walking/running presentation, with a run-specific arm cycle.
   * Walking is the original pose. As speed rises, the arms bend, the shoulders
   * roll, the torso leans, and the opposite arm/leg swing becomes pronounced.
   * A surviving light impact can perturb this cycle without replacing it.
   */
  poseAnimatedLocomotion(dt, snap = false) {
    this.animTime += dt;
    if (this.animBlendFrom && this.animBlendDuration > 0) {
      this.animBlendT = Math.min(this.animBlendDuration, this.animBlendT + dt);
      if (this.animBlendT >= this.animBlendDuration) this.animBlendFrom = null;
    }
    if (!snap) this.stepAnimatedLocomotion(dt);
    const moving = this.speed > 0.12 && this.moveDir.lengthSq() > 0.0001;
    const run = clamp((this.speed - 1.7) / 1.7, 0, 1);
    const runPose = run * run * (3 - 2 * run);
    const crouch = clamp(this.crouchAmount, 0, 1);
    const lateralSpeed = this.moveVelocity.x * this.right.x + this.moveVelocity.z * this.right.z;
    const strafeLean = clamp(lateralSpeed / 4.2, -1, 1);
    this.animPhase += dt * (moving ? 2.8 + this.speed * 2.25 : 1.25);
    if (this.animPhase > Math.PI * 2000) this.animPhase %= Math.PI * 2;

    // A damaged but still attached leg produces a limp instead of a crawl.
    const legIntegrity = (names) => {
      let v = 1;
      for (const name of names) {
        const part = this.parts.find((p) => p.name === name);
        if (part && !part.destroyed) {
          v *= 0.35 + 0.65 * clamp(part.hp / part.maxHp, 0, 1);
          // Bone damage must survive the hand-off back to the gait animation.
          // Otherwise a fractured tibia or femur disappears from the limp as
          // soon as the solver releases the body.
          v *= 0.5 + 0.5 * this.partBoneWear(name);
        }
      }
      return clamp(v, 0.25, 1);
    };
    const legL = legIntegrity(['thighL', 'shinL', 'footL']);
    const legR = legIntegrity(['thighR', 'shinR', 'footR']);
    const limpTarget = moving ? clamp((1 - Math.min(legL, legR)) * 0.8, 0, 0.7) : 0;
    this.animLimp += (limpTarget - this.animLimp) * Math.min(1, dt * 5);

    const phase = this.animPhase;
    const flinch = clamp(this.animFlinch, 0, 1);
    const flinchSide = this.animFlinchSide || 0;
    const flinchForward = this.animFlinchForward || 0;
    const stumble = flinch * (0.42 + runPose * 0.58);
    const bob = moving
      ? Math.sin(phase * 2) * (0.015 + run * 0.018)
      : Math.sin(this.animTime * 1.7) * 0.004;
    const lean = (moving ? 0.018 + run * 0.16 : 0.006) + this.animLimp * 0.035;
    const twist = moving ? Math.sin(phase) * (0.025 + run * 0.05) : Math.sin(this.animTime * 0.7) * 0.006;
    const baseY = 0.94 + bob - this.animLimp * 0.035 - flinch * 0.006 - crouch * 0.3;
    const chestY = 1.37 + bob - this.animLimp * 0.05 - flinch * 0.01 - crouch * 0.37;
    const chestZ = lean + flinch * flinchForward * 0.06;
    const headZ = lean * 0.72 + 0.024 + flinch * flinchForward * 0.03;

    this.setAnimatedBone(
      'pelvis',
      flinch * flinchSide * 0.012 + strafeLean * 0.018,
      baseY,
      0.015 + run * 0.025 + flinch * flinchForward * 0.012,
    );
    this.setAnimatedBone('chest', twist * 0.16 + flinch * flinchSide * 0.035 + strafeLean * 0.05, chestY, chestZ);
    this.setAnimatedBone('neck', twist * 0.04 + flinch * flinchSide * 0.018 + strafeLean * 0.06, chestY + 0.12, chestZ + 0.012);
    this.setAnimatedBone('head', twist * 0.02 + flinch * flinchSide * 0.008 + strafeLean * 0.065, chestY + 0.215, headZ);

    for (const side of [-1, 1]) {
      const injured = side < 0 ? legL : legR;
      const p = phase + (side > 0 ? Math.PI : 0);
      const uneven = 1 - stumble * (side * Math.sign(flinchSide || 1) > 0 ? 0.38 : 0.12);
      const swingBase = Math.sin(p) * (0.28 + run * 0.25) * (moving ? 1 : 0) * uneven;
      const swing = swingBase * (0.5 + injured * 0.5);
      const lift = Math.max(0, Math.cos(p)) * (0.035 + run * 0.065) * (moving ? 1 : 0);
      const hipX = side * 0.095 + flinch * flinchSide * 0.012 + strafeLean * 0.012;
      const hipY = baseY;
      const kneeY = hipY - 0.44 * Math.cos(swing * 0.9) + lift * 0.3 - crouch * 0.015;
      const kneeZ = 0.025 + 0.44 * Math.sin(swing) + crouch * 0.3;
      const shinSwing =
        swing * 0.72 - (run * 0.32 + Math.max(0, -swing) * 0.28) - crouch * 0.92;
      const footY = Math.max(0.08, kneeY - 0.42 * Math.cos(shinSwing) + lift * 0.65);
      const footZ = kneeZ + 0.42 * Math.sin(shinSwing);
      this.setAnimatedBone(side < 0 ? 'lHip' : 'rHip', hipX, hipY, 0.02);
      this.setAnimatedBone(side < 0 ? 'lKnee' : 'rKnee', hipX + side * flinch * 0.008, kneeY, kneeZ);
      this.setAnimatedBone(side < 0 ? 'lFoot' : 'rFoot', hipX + side * flinch * 0.014, footY, footZ);
    }

    const aim = this.armed && this.aggressive && this.aiming;
    for (const side of [-1, 1]) {
      // Walking keeps the original arm phase. At a run, the opposite arm/leg
      // phase takes over; this is the main fix for the tucked, robotic posture.
      const p = phase + (side > 0 ? Math.PI * runPose : Math.PI * (1 - runPose));
      const armSwing = moving ? -Math.sin(p) : 0;
      const shoulderX = side * 0.185;
      let shoulderY = 1.4 + bob + armSwing * (0.006 + runPose * 0.014);
      let shoulderZ = 0.03 + lean * 0.65 + side * twist * 0.1 + armSwing * (0.012 + runPose * 0.045);
      let elbowX = side * 0.205;
      let elbowY = 1.12 + bob;
      let elbowZ = 0.03 + armSwing * 0.075;
      let handX = side * 0.21;
      let handY = 0.84 + bob;
      let handZ = 0.03 + armSwing * 0.13;

      // A running arm is bent, hangs from the shoulder, and drives from the
      // elbow instead of tucking the hand into the chest.
      elbowX += side * -0.01 * runPose;
      elbowY += -0.02 * runPose + armSwing * 0.012 * runPose;
      elbowZ += armSwing * 0.095 * runPose;
      handX += side * -0.012 * runPose;
      handY += 0.1 * runPose + (armSwing * 0.5 + 0.5) * 0.19 * runPose;
      handZ += armSwing * 0.14 * runPose;

      if (aim && side > 0) {
        elbowX = 0.17;
        elbowY = 1.29 + bob;
        elbowZ = 0.17;
        handX = 0.11;
        handY = 1.21 + bob;
        handZ = 0.39;
      } else if (aim && side < 0) {
        elbowX = -0.025;
        elbowY = 1.26 + bob;
        elbowZ = 0.2;
        handX = -0.01;
        handY = 1.16 + bob;
        handZ = 0.32;
      }
      if (this.attackT > 0 && side > 0 && moving) {
        const thrust = Math.sin(clamp(1 - this.attackT / 0.42, 0, 1) * Math.PI);
        handZ += thrust * 0.26;
      }

      // Light impacts show up as a short whole-body flinch and an arm thrown
      // out for balance, not as a scripted fall or a fully solver-driven body.
      if (flinch > 0.001) {
        const guard = flinch * (side === this.animFlinchGuardSide ? 1 : 0.55);
        elbowX += flinchSide * 0.025 * guard;
        elbowY += 0.018 * guard;
        elbowZ += flinchForward * 0.025 * guard;
        handX += flinchSide * 0.04 * guard + side * 0.012 * guard;
        handY += 0.03 * guard;
        handZ += flinchForward * 0.05 * guard;
        shoulderY += 0.008 * guard;
        shoulderZ += flinchForward * 0.018 * guard;
      }

      // The shoulders and hands follow the lowered chest in a crouch, so the
      // arms do not stay floating at standing height.
      shoulderY -= crouch * 0.37;
      elbowY -= crouch * 0.37;
      handY -= crouch * 0.37;
      this.setAnimatedBone(side < 0 ? 'lShoulder' : 'rShoulder', shoulderX, shoulderY, shoulderZ);
      this.setAnimatedBone(side < 0 ? 'lElbow' : 'rElbow', elbowX, elbowY, elbowZ);
      this.setAnimatedBone(side < 0 ? 'lHand' : 'rHand', handX, handY, handZ);
    }

    this.animPoseReady = true;
    this.physicalMode = 'animation';
    this.balanceError = 0;
    this.balanceConfidence = 1;
  }

  /** Advance short animated impact reactions without starting the solver. */
  updateReactionMomentum(dt) {
    if (this.animFlinchT > 0) {
      this.animFlinchT = Math.max(0, this.animFlinchT - dt);
      const u = 1 - this.animFlinchT / Math.max(1e-4, this.animFlinchDuration);
      this.animFlinch = this.animFlinchMax * (1 - u) * (1 - u) * (1 + Math.sin(u * Math.PI * 2.5) * 0.16);
      if (this.animFlinchT <= 0) this.animFlinch = 0;
    } else {
      this.animFlinch = 0;
    }
    if (this.hitSlowT > 0) this.hitSlowT = Math.max(0, this.hitSlowT - dt);
    const targetSlow = this.hitSlowT > 0 ? this.hitSlow : 1;
    this.hitSlowMul += (targetSlow - this.hitSlowMul) * Math.min(1, dt * 7);
    if (this.hitSlowT <= 0 && this.hitSlowMul > 0.995) {
      this.hitSlowMul = 1;
      this.hitSlow = 1;
    }
  }

  /** Normal upright locomotion: AI intent, preserved animation, then bleed. */
  updateAnimatedBody(dt, playerPos) {
    if (this.dead || !this.animationDriven) return;
    this.updateReactionMomentum(dt);
    const crouchTarget = this.crouching && !this.physicalDown ? 1 : 0;
    this.crouchAmount += (crouchTarget - this.crouchAmount) * Math.min(1, dt * 9);
    this.playerPos.copy(playerPos);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.gunFlash) this.gunFlash.visible = false;
    }
    this.think(dt, playerPos);
    if (this.attackT > 0) {
      this.attackT = Math.max(0, this.attackT - dt);
      if (!this.attackHit && this.attackT < 0.19) {
        this.attackHit = true;
        const reach = _dir.copy(playerPos).sub(this.position);
        reach.y = 0;
        if (this.aggressive && reach.length() < 1.8) {
          reach.normalize();
          this.onAttack?.(this.armoured ? 18 : 12, this.position, reach);
        }
      }
    }
    this.poseAnimatedLocomotion(dt);
    this.updateMeshes();
    this.bleed(dt);
  }

  updateMeshes() {
    for (const part of this.parts) {
      const mesh = part.mesh;
      if (!mesh) continue;
      if (part.kind === 'limb') {
        const a = this.bones[part.a].position;
        const b = this.bones[part.b].position;
        _dir.subVectors(b, a);
        if (_dir.lengthSq() < 1e-9) continue;
        quatFromY(_dir, this.forward, _q);
        mesh.position.addVectors(a, b).multiplyScalar(0.5);
        mesh.quaternion.copy(_q);
      } else {
        const from = this.bones[part.from].position;
        const to = this.bones[part.to].position;
        _dir.subVectors(to, from);
        quatFromY(_dir, this.forward, _q);
        mesh.quaternion.copy(_q);
        mesh.position.copy(this.bones[part.a].position).add(_x.copy(part.off).applyQuaternion(_q));
      }
    }

    if (this.gunMesh && this.armed && !this.dead) {
      const chest = this.bones.chest.position;
      if (this.aggressive) _aimTmp.copy(this.aimPoint).sub(chest);
      else _aimTmp.copy(this.forward);
      if (_aimTmp.lengthSq() < 1e-6) _aimTmp.copy(this.forward);
      this.gunDir.copy(_aimTmp).normalize();
      // The grip sits in the right hand; the rest of the gun points where
      // the NPC is actually aiming, so the weapon follows every arm motion.
      this.gunMesh.position.copy(this.bones.rHand.position).addScaledVector(this.gunDir, 0.035);
      this.gunMesh.position.y += 0.025;
      this.gunMesh.quaternion.setFromUnitVectors(GUN_FORWARD, this.gunDir);
    }
    if (this.meleeMesh && !this.armed && !this.dead) {
      const chest = this.bones.chest.position;
      if (this.aggressive) _aimTmp.copy(this.aimPoint).sub(chest);
      else _aimTmp.copy(this.forward);
      if (_aimTmp.lengthSq() < 1e-6) _aimTmp.copy(this.forward);
      this.gunDir.copy(_aimTmp).normalize();
      this.meleeMesh.position.copy(this.bones.rHand.position).addScaledVector(this.gunDir, 0.08);
      this.meleeMesh.position.y += 0.02;
      this.meleeMesh.quaternion.setFromUnitVectors(GUN_FORWARD, this.gunDir);
      if (this.meleeSwingT > 0) {
        this.meleeMesh.rotateX(-this.meleeSwingT * 2.4);
        this.meleeMesh.rotateZ(this.meleeSwingT * 0.7);
      }
      this.meleeMesh.visible = !!this._lodVisible;
    }
  }

  update(dt, playerPos) {
    if (this.dead) {
      this.updateCorpse(dt);
      return;
    }
    if (this.animationDriven) {
      this.updateAnimatedBody(dt, playerPos);
      return;
    }
    this.updateActiveBody(dt, playerPos);
  }

  /** World-space centre used by explosions and other radial effects. */
  worldCenter(out) {
    if (this.merged && this.corpseMesh?.geometry) {
      if (!this.corpseMesh.geometry.boundingSphere) this.corpseMesh.geometry.computeBoundingSphere();
      const bs = this.corpseMesh.geometry.boundingSphere;
      if (bs) return out.copy(bs.center);
    }
    return out.copy(this.bones.chest.position);
  }

  /** Radial blast damage and shove. Handles both living bodies and ragdolls. */
  blast(point, dir, damage, force = 2) {
    _blastCenter.copy(this.position);
    _blastCenter.y += 1.15;
    const flat = new THREE.Vector3(dir.x, 0, dir.z);
    if (flat.lengthSq() < 1e-5) flat.set(0, 0, 1);
    flat.normalize();

    if (this.dead) {
      this.fx.bloodBurst(_blastCenter, flat, 0.6);
      this.wakeRagdoll(1.6, point, dir, 'torso');
      this.applyPhysicalHit(point, dir, force * 1.5, 'torso', damage * 0.3);
      return;
    }

    this.woundTotal += 3;
    this.health -= damage;
    this.fx.bloodBurst(_blastCenter, flat, 1.5);
    this.react(flat, damage, force * 1.3, point, null);
    if (this.health <= 0) this.die(flat, point || _blastCenter.clone(), force * 0.85, 'torso');
  }

  // ---------------- gore ----------------
  woundPoint() {
    if (this.bleedingWounds.length) {
      const wound = this.bleedingWounds[(Math.random() * this.bleedingWounds.length) | 0];
      if (wound.part?.mesh && !wound.part.destroyed) {
        const local = wound.local;
        if (Number.isFinite(local?.x) && Number.isFinite(local?.y) && Number.isFinite(local?.z)) {
          wound.part.mesh.updateMatrixWorld();
          return wound.part.mesh.localToWorld(local.clone());
        }
      }
    }
    const candidates = [];
    for (const part of this.parts) {
      if (part.wounds && part.wounds.length) candidates.push(part);
    }
    if (!candidates.length) return null;
    const part = candidates[(Math.random() * candidates.length) | 0];
    const local = part.wounds[(Math.random() * part.wounds.length) | 0];
    if (!Number.isFinite(local?.x) || !Number.isFinite(local?.y) || !Number.isFinite(local?.z)) {
      return this.bones.chest.position.clone();
    }
    part.mesh.updateMatrixWorld();
    return part.mesh.localToWorld(local.clone());
  }

  /**
   * Finite circulation, not a damage timer. The body loses litres through
   * capillary wounds and high-flow arterial tears; pressure falls, the
   * muscles weaken, and hypovolaemia can finish a character who was not killed
   * by the impact itself. Spray originates at the stored wound transform and
   * follows the ragdoll as it moves and is hit again.
   */
  bleed(dt) {
    // The child filter removes the circulation presentation and its secondary
    // graphic effects. The wound's direct health damage already landed.
    if (childSafetyEnabled()) return;
    if (!this.woundTotal && !this.arterialWounds.length && !this.bleedingWounds.length) return;
    const alive = !this.dead;
    this.bloodPulse += dt * (alive ? 6.2 : 0.8);
    const pressure = clamp(this.bloodPressure, 0, 1);
    if (this.bloodVolume <= 0.001) {
      this.bloodPressure = 0;
      return;
    }

    let openRate = 0;
    for (const wound of this.bleedingWounds) {
      if (wound.part?.destroyed && !wound.part?.mesh) continue;
      wound.life += dt;
      openRate += wound.rate;
    }
    for (const wound of this.arterialWounds) {
      if (wound.part?.destroyed && !wound.part?.mesh) continue;
      wound.life += dt;
      // A perforated artery keeps losing volume until pressure and clotting
      // bring the flow down. No wound is an unlimited blood source.
      openRate += wound.severity * 0.022;
    }
    const openScale = (alive ? 0.34 + pressure * 0.66 : 0.13) * bloodLossScale();
    const lost = Math.min(this.bloodVolume, openRate * openScale * dt);
    this.bloodVolume = Math.max(0, this.bloodVolume - lost);
    this.bloodLost += lost;
    this.bloodPressure = this.bloodVolume / this.bloodVolumeMax;

    if (alive && lost > 0) {
      // Roughly 150 health for three litres: blood loss contributes strongly,
      // but a character with no lethal structural damage can still survive it.
      this.health -= lost * 52;
      if (this.health <= 0) {
        const wound = this.arterialWounds[0];
        const at = wound ? this.arterialPoint(wound).clone() : this.bones.chest.position.clone();
        const dir = at.clone().sub(this.bones.chest.position).normalize();
        this.die(dir, at, 0.6, 'circulation');
      }
    }

    // Pressure-fed arterial jets. Rate and direction come from the wound and
    // the current body motion; the pulses are not a looping sprite.
    this.sprayCool -= dt;
    const sprayScale = bloodSprayScale();
    const canPump = alive && this.bloodPressure > 0.12 && this.bloodVolume > 0.001 && sprayScale > 0.01;
    if (canPump && this.sprayCool <= 0 && this.arterialWounds.length) {
      const wound = this.arterialWounds[(Math.random() * this.arterialWounds.length) | 0];
      const at = this.arterialPoint(wound).clone();
      _euphTarget.copy(at).sub(this.bones.chest.position);
      if (_euphTarget.lengthSq() < 1e-5) _euphTarget.set(0, 1, 0);
      _euphTarget.normalize();
      // The jet keeps a strong component of the round's direction while the
      // vessel and body surface deflect it outward.
      _euphDir.copy(wound.dir).multiplyScalar(0.55).addScaledVector(_euphTarget, 0.6);
      _euphDir.y += 0.32 + Math.random() * 0.22;
      _euphDir.addScaledVector(this.comVelocity, 0.08);
      _euphDir.normalize();
      const power = clamp(wound.severity * (0.35 + this.bloodPressure * 0.9) * sprayScale, 0.25, 2.2);
      if (this.fx.arterial) this.fx.arterial(at, _euphDir, power);
      else this.fx.bloodBurst(at, _euphDir, power);
      this.fx.dropBlood(at);
      this.sprayCool = (0.2 + Math.random() * 0.36 / (0.4 + wound.severity)) / (0.55 + sprayScale * 0.6);
    }

    // Wounded bodies leave a growing puddle under the actual wound/feet.
    const severity = clamp(this.woundTotal / 7, 0, 1) + (1 - this.bloodPressure) * 0.4;
    this.poolTimer -= dt;
    if (this.bloodVolume > 0.005 && this.poolTimer <= 0) {
      this.poolTimer = (1.4 - severity * 0.65) * (0.8 + Math.random() * 0.8);
      this.poolRadius = Math.min(1.35, this.poolRadius + 0.035 + severity * 0.04);
      const p = this.woundPoint();
      const poolAt = p && p.y < 1.1 ? p : this.bones.chest.position;
      this.fx.pool(
        { x: poolAt.x + (Math.random() - 0.5) * 0.16, z: poolAt.z + (Math.random() - 0.5) * 0.16 },
        Math.min(0.65, this.poolRadius),
      );
    }

    this.bleedTimer -= dt;
    if (this.bleedTimer > 0 || this.bloodVolume <= 0.005) return;
    this.bleedTimer = (1.0 - 0.55 * clamp(severity, 0, 1)) * (0.65 + Math.random() * 0.9) / Math.max(0.35, bloodLossScale());
    const p = this.woundPoint();
    if (!p) return;
    this.fx.dropBlood(p);
    if (Math.random() < 0.25 + clamp(severity, 0, 1) * 0.3) {
      this.fx.pool({ x: p.x + (Math.random() - 0.5) * 0.1, z: p.z + (Math.random() - 0.5) * 0.1 }, 0.07 + Math.random() * 0.1);
    }
  }

  /**
   * Register a bleeding channel at the exact voxel that was opened. Large
   * cavities near the neck, heart and major limb vessels become arterial;
   * the wound keeps its own location so spray follows the actual body pose.
   */
  recordWound(part, localPoint, dir, profile, damage, melee = false, impactSpeed = 0) {
    const mass = damage * part.dmg;
    const isHead = part.name === 'head' || part.name === 'neck';
    const isTorso = part.name === 'torso' || part.name === 'pelvis';
    const area = part.name === 'neck' ? 0.72 : isHead ? 0.2 : isTorso ? 0.3 : 0.16;
    const vesselDensity = part.name === 'neck' ? 0.008 : isHead ? 0.0025 : isTorso ? 0.0038 : 0.0017;
    const speed = clamp(impactSpeed / 850, 0, 2);
    const severity = clamp(mass / 140 + profile.power * 0.5 + speed * 0.32 + (melee ? 0.2 : 0), 0.22, 2.6);
    const rate = vesselDensity * (0.35 + severity) * (melee ? 1.45 : 1);

    // Every penetrating hole is its own bleeding source. These continue to
    // ooze after death, but the heart no longer drives a jet.
    if (this.bleedingWounds.length >= 16) {
      this.bleedingWounds.sort((a, b) => a.rate - b.rate);
      this.bleedingWounds.shift();
    }
    const safeLocal = localPoint && Number.isFinite(localPoint.x) && Number.isFinite(localPoint.y) && Number.isFinite(localPoint.z)
      ? localPoint.clone()
      : new THREE.Vector3();
    // A lower-torso wound is a pelvic/hip injury, not a reason to reach into
    // the groin. Keep the physics group as torso while classifying the local
    // wound response separately.
    const lowerTorso =
      part.name === 'torso' && safeLocal.y < -part.size[1] * 0.12;
    const wound = {
      part,
      local: safeLocal,
      dir: dir.clone().normalize(),
      severity,
      rate,
      impactSpeed,
      phase: Math.random() * Math.PI * 2,
      life: 0,
      group: this.inferImpactGroup(null, part.name),
      zone: part.name === 'pelvis' || lowerTorso ? 'pelvis' : 'torso',
      side: this.lastBoneHit?.side || (part.name.endsWith('L') ? -1 : part.name.endsWith('R') ? 1 : 0),
      bone: this.lastBoneHit,
    };
    this.bleedingWounds.push(wound);
    // The nervous system attends to the newest serious injury. Keeping the
    // wound object (not an index) means the hand target follows the actual
    // moving tissue even after older entries are culled.
    if (!this.primaryWound || severity >= this.primaryWound.severity * 0.72) this.primaryWound = wound;

    // Deep, fast cavities near a named vessel additionally produce pressure-
    // fed arterial spray. The wound keeps its own local transform.
    const deep = profile.power > 0.72 || melee;
    const arterialChance = profile.power > 0.9 || melee ? 1 : Math.min(0.9, area + severity * 0.18);
    if (!deep || mass < 24 || Math.random() > arterialChance) {
      this.woundTotal += 1;
      return;
    }
    if (this.arterialWounds.length >= 5) {
      this.arterialWounds.sort((a, b) => a.severity - b.severity);
      this.arterialWounds.shift();
    }
    const arterialSeverity = clamp(mass / 190 + profile.power * 0.32 + speed * 0.18, 0.25, 2.1);
    this.arterialWounds.push({
      part,
      local: safeLocal.clone(),
      dir: dir.clone().normalize(),
      severity: arterialSeverity,
      phase: Math.random() * Math.PI * 2,
      life: 0,
    });
    this.woundTotal += 1;
  }

  /** Preserve the current fill ratio when the global Blood Amount changes. */
  refreshBloodCapacity() {
    const ratio = this.bloodVolumeMax > 0 ? clamp(this.bloodVolume / this.bloodVolumeMax, 0, 1) : 1;
    this.bloodVolumeMax = BASE_BLOOD_VOLUME * Math.max(0.4, Math.min(2.4, bloodAmount()));
    this.bloodVolume = this.bloodVolumeMax * ratio;
    this.bloodPressure = ratio;
  }

  /** World position of a specific arterial opening, following the ragdoll. */
  arterialPoint(wound, out = _jointDir) {
    if (wound.part && !wound.part.destroyed && wound.part.mesh) {
      const local = wound.local;
      if (Number.isFinite(local?.x) && Number.isFinite(local?.y) && Number.isFinite(local?.z)) {
        wound.part.mesh.updateMatrixWorld(true);
        return out.copy(local).applyMatrix4(wound.part.mesh.matrixWorld);
      }
    }
    return out.copy(this.bones.chest.position);
  }

  /**
   * Child-safety impact path. It preserves every combat rule (damage, armour,
   * death, physics reaction, skeleton structural damage) but never opens the
   * voxel body, spawns tissue, exposes bone or emits blood.
   */
  hitClean(part, point, dir, baseDamage, ap, force, meta, wasDead) {
    const mesh = part.mesh;
    mesh.updateMatrixWorld(true);
    if (wasDead) this.wakeRagdoll(clamp(0.5 + force * 0.55, 0.5, 1.6), point, dir, part.name);
    const localEntry = mesh.worldToLocal(point.clone());
    const hitBone = resolveSkeletonBone(this, part, localEntry, meta?.bone || null);
    let dmg = baseDamage * part.dmg;
    const armourHit = this.armoured && !part.armourBroken && part.plates.length > 0;
    if (armourHit) {
      dmg *= clamp(0.18 + ap * 0.55, 0.1, 0.7);
      part.armourHp -= baseDamage * (0.36 + ap * 0.92);
      if (part.armourHp <= 0) this.breakArmour(part, point);
    }
    part.hp -= dmg;
    if (!wasDead) this.health -= dmg * 0.85;
    if (hitBone) damageSkeletonBone(hitBone, dmg * 0.32, dir, point);
    this.lastHitArmour = armourHit;
    this.lastArmourPenetrated = false;
    this.lastDamageAt = this.time;
    if (part.name === 'head' && this.health <= 0) this.faceKill = true;
    if (wasDead) {
      this.applyPhysicalHit(point, dir, force * 0.55, part.name, dmg);
    } else if (this.health <= 0) {
      this.die(dir, point, force * 0.8, part.name);
    } else {
      this.react(dir, dmg * 0.9, force * 0.55, point, part.name);
    }
    return true;
  }

  hit(part, point, dir, baseDamage = 34, ap = 0, force = 0.3, meta = null) {
    if (!part || part.destroyed || !part.mesh) return false;
    if (childSafetyEnabled()) {
      return this.hitClean(part, point, dir, baseDamage, ap, force, meta, this.dead);
    }
    const mesh = part.mesh;
    mesh.updateMatrixWorld(true);
    const wasDead = this.dead;
    const melee = !!meta?.melee;
    this.lastWoundProfile = null;
    if (wasDead) this.wakeRagdoll(clamp(0.5 + force * 0.55, 0.5, 1.6), point, dir, part.name);

    // ---- entry / exit cavity ----
    const localEntry = mesh.worldToLocal(point.clone());
    if (!Number.isFinite(localEntry.x) || !Number.isFinite(localEntry.y) || !Number.isFinite(localEntry.z)) {
      localEntry.set(0, 0, 0);
    }
    const hitBone = resolveSkeletonBone(this, part, localEntry, meta?.bone || null);
    this.lastBoneHit = hitBone;
    if (hitBone) this.boneHits += 1;
    const projectileMass = meta?.mass ?? (melee
      ? 0.24
      : PROJECTILE_MASS[meta?.weapon] ?? DEFAULT_PROJECTILE_MASS);
    const shotSpeed = meta?.velocity || (melee ? 8 : 420);
    this.lastShotMass = projectileMass;
    this.lastShotVelocity = shotSpeed;
    // Momentum, not an arbitrary shove. A light pistol round at 335 m/s has a
    // different effect from a heavy slug at 410 m/s, even when their nominal
    // force values are close.
    this.incomingMomentum = projectileMass * shotSpeed;
    const woundLocal = localEntry.clone();
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const localDir = dir.clone().transformDirection(inv).normalize();
    const localSlash = meta?.slash
      ? meta.slash.clone().transformDirection(inv).normalize()
      : new THREE.Vector3(0, 1, 0).cross(localDir).normalize();
    const half = new THREE.Vector3(part.size[0] * 0.5, part.size[1] * 0.5, part.size[2] * 0.5);
    const localExit = rayBoxExit(localEntry, localDir, half);
    const depth = localEntry.distanceTo(localExit);
    this.lastHitArmour = false;
    this.lastArmourPenetrated = false;

    if (this.armoured && !part.armourBroken && part.plates.length) {
      const halfH = part.size[1] * 0.5;
      const face =
        part.name === 'head' &&
        localEntry.z > part.size[2] * 0.16 &&
        Math.abs(localEntry.x) < part.size[0] * 0.32 &&
        localEntry.y < halfH * 0.16 &&
        localEntry.y > -halfH * 0.45;

      if (face) {
        // the one unarmoured spot: a round through the face drops them instantly
        const profile = destructionProfile(meta?.weapon, baseDamage * part.dmg, ap, force, part);
        this.lastWoundProfile = profile;
        const carved = carveVoxels(part.voxels, localEntry, 0.04);
        part.voxels = carved.kept;
        exposeSkeletonBones(part, carved.removed);
        soakVoxels(part.voxels, localEntry, 0.11, 0.95);
        mesh.geometry.dispose();
        mesh.geometry = buildVoxelGeometry(part.voxels, part.voxel);
        this.spawnTissueChunk(part, carved.removed, localEntry, localEntry, dir, profile);
        part.wounds.push(localEntry.clone());
        part.trauma += 1;
        this.woundTotal += 2;
        this.fx.bloodBurst(point, dir.clone().negate(), 0.75);
        this.fx.bloodBurst(point, dir, 2);
        this.health = 0;
        part.hp -= 20;
        this.faceKill = true;
        if (wasDead) this.applyPhysicalHit(point, dir, force * 0.8, 'head', baseDamage);
        else this.die(dir, point, force, 'head');
        return true;
      }

      // The plate is struck first. Ordinary rounds are mostly spent against
      // it. A scoped rifle carries enough sectional density to punch a
      // permanent channel through the plate and the tissue behind it; the
      // armour still removes energy according to what it covers.
      const sniper = SNIPER_WEAPONS.has(meta?.weapon);
      const armourType = part.name === 'head' ? 'helmet' : part.name === 'torso' ? 'vest' : 'limb';
      const dent = carveVoxels(part.voxels, localEntry, sniper ? 0.04 : 0.02);
      part.voxels = dent.kept;
      mesh.geometry.dispose();
      mesh.geometry = buildVoxelGeometry(part.voxels, part.voxel);
      this.fx.sparks(point, dir);

      let dmg;
      let healthMul = 0.8;
      if (sniper) {
        // Helmet steel and a trauma plate stop more than a limb guard. A
        // longshot's larger, faster projectile retains more of its damage
        // than the standard rifle round; neither is ever fully stopped.
        const retained = clamp(
          (armourType === 'helmet' ? 0.76 : armourType === 'vest' ? 0.88 : 0.82) +
            Math.max(0, baseDamage - 80) * 0.0012 +
            (ap - 0.9) * 0.06,
          0.55,
          0.96,
        );
        dmg = baseDamage * part.dmg * retained;
        // Penetration is not immunity: the plate and tissue behind it absorb
        // energy, so armour must never amplify health damage.
        healthMul = armourType === 'helmet' ? 0.68 : armourType === 'limb' ? 0.7 : 0.74;
        part.armourHp -= baseDamage * (0.46 + ap * 0.7 + Math.max(0, baseDamage - 80) * 0.0016);
        const profile = destructionProfile(meta?.weapon, dmg, ap, force, part);
        this.lastWoundProfile = profile;
        // The round opens an entry and an exit through the body, not merely a
        // cosmetic dent. Bleeding, cavity damage and the physical reaction all
        // stay tied to the shot that actually penetrated.
        const exitCut = carveVoxels(part.voxels, localExit, Math.max(part.voxel * 0.62, 0.028));
        part.voxels = exitCut.kept;
        exposeSkeletonBones(part, dent.removed.concat(exitCut.removed));
        soakVoxels(part.voxels, localEntry, 0.09, 0.95);
        soakVoxels(part.voxels, localExit, 0.15, 0.9);
        mesh.geometry.dispose();
        mesh.geometry = buildVoxelGeometry(part.voxels, part.voxel);
        const exitWorld = mesh.localToWorld(localExit.clone());
        part.wounds.push(woundLocal.clone(), localExit.clone());
        part.trauma += 1;
        this.recordWound(part, woundLocal, dir, profile, dmg, false, meta?.velocity || 0);
        this.fx.bloodBurst(point, dir.clone().negate(), 0.42);
        this.fx.bloodBurst(exitWorld, dir, 1.15);
        if (dent.removed.length + exitCut.removed.length >= 3) {
          this.spawnTissueChunk(
            part,
            dent.removed.concat(exitCut.removed),
            localEntry,
            localExit,
            dir,
            profile,
          );
        }
      } else {
        const mul = clamp(0.1 + ap * 0.8, 0.1, 0.88);
        dmg = baseDamage * part.dmg * mul;
        part.armourHp -= baseDamage * (0.36 + ap * 0.92);
      }

      part.hp -= dmg;
      if (!wasDead) this.health -= dmg * healthMul;
      if (hitBone) damageSkeletonBone(hitBone, dmg * (sniper ? 0.62 : 0.16), dir, point);
      this.lastHitArmour = true;
      this.lastArmourPenetrated = sniper;
      if (part.armourHp <= 0) this.breakArmour(part, point);
      if (wasDead) this.applyPhysicalHit(point, dir, force * (sniper ? 0.85 : 0.55), part.name, dmg);
      else if (this.health <= 0) this.die(dir, point, force * (sniper ? 0.95 : 0.8), part.name);
      else {
        this.react(dir, dmg * (sniper ? 1.25 : 1.6), force * (sniper ? 0.9 : 0.55), point, part.name);
        if (this.health <= 1) this.enterCritical(dir, point, force);
      }
      return true;
    }

    const profile = destructionProfile(meta?.weapon, baseDamage * part.dmg, ap, force, part);
    if (melee) {
      // A blade is not a bullet hole. It opens one or more narrow troughs
      // across the surface, with a deeper split where the edge buried itself.
      // The radius must exceed half a voxel or the attack appears to do nothing.
      const blunt = meta?.cut === 'blunt';
      profile.kind = blunt ? 'crush' : 'cut';
      profile.entry = Math.max(profile.entry * (blunt ? 1.25 : 0.9), part.voxel * (blunt ? 0.95 : 0.68));
      profile.cavity = Math.max(profile.cavity, part.voxel * (blunt ? 0.8 : 0.64));
      profile.exit *= 0.7;
      profile.chunkVoxels = Math.min(28, profile.chunkVoxels + 8);
      profile.gibs += 5;
    }
    this.lastWoundProfile = profile;

    let kept = part.voxels;
    let removed = [];
    let exitWorld = null;
    if (melee) {
      const cuts = meta?.cut === 'blunt' ? 3 : 7;
      const reach = meta?.cut === 'blunt' ? 1.25 : 2.3;
      for (let i = 0; i < cuts; i++) {
        const f = cuts === 1 ? 0 : i / (cuts - 1) - 0.5;
        const p = localEntry.clone().addScaledVector(localSlash, f * part.voxel * reach);
        p.addScaledVector(localDir, 0.5 * Math.abs(f) * part.voxel);
        const c = carveVoxels(kept, p, profile.entry * (0.72 + Math.random() * 0.38));
        kept = c.kept;
        removed = removed.concat(c.removed);
        if (Math.abs(f) < 0.26) {
          const deep = carveVoxels(kept, p.clone().addScaledVector(localDir, profile.cavity * 0.62), profile.cavity * 0.58);
          kept = deep.kept;
          removed = removed.concat(deep.removed);
        }
      }
    } else {
      const c1 = carveVoxels(kept, localEntry, profile.entry * (0.88 + Math.random() * 0.24));
      kept = c1.kept;
      removed = removed.concat(c1.removed);

      if (depth > 0.055) {
        const c2 = carveVoxels(kept, localExit, profile.exit * (0.86 + Math.random() * 0.28));
        kept = c2.kept;
        removed = removed.concat(c2.removed);
        exitWorld = mesh.localToWorld(localExit.clone());
        if (depth > 0.13) {
          // A fast round pulls tissue through the temporary cavity, not just out
          // of a clean entrance and exit. The offset makes the tear asymmetric.
          const mid = localEntry.clone().lerp(localExit, 0.28 + Math.random() * 0.44);
          mid.x += (Math.random() - 0.5) * profile.cavity * 0.8;
          mid.y += (Math.random() - 0.5) * profile.cavity * 0.8;
          mid.z += (Math.random() - 0.5) * profile.cavity * 0.8;
          const c3 = carveVoxels(kept, mid, profile.cavity * (0.8 + Math.random() * 0.45));
          kept = c3.kept;
          removed = removed.concat(c3.removed);
          if (profile.power > 0.8 && depth > 0.2) {
            const c4 = carveVoxels(kept, localEntry.clone().lerp(localExit, 0.72), profile.cavity * 0.7);
            kept = c4.kept;
            removed = removed.concat(c4.removed);
          }
        }
      }
    }

    // Even a narrow round through a sparse voxel grid must open a visible
    // wound. Pull the nearest cell into the wound if the channel missed every
    // sample centre by a few millimetres.
    if (!removed.length && kept.length) {
      let nearest = 0;
      let best = Infinity;
      for (let i = 0; i < kept.length; i++) {
        const v = kept[i];
        const d = (v.x - localEntry.x) ** 2 + (v.y - localEntry.y) ** 2 + (v.z - localEntry.z) ** 2;
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      removed.push(kept.splice(nearest, 1)[0]);
    }

    // Never let a single bullet erase the entire part. Keep a structural core
    // so the remaining body is still visibly present and shootable.
    const structuralMin = part.name === 'head' || part.name === 'torso' ? 12 : 5;
    while (kept.length < structuralMin && removed.length) kept.push(removed.pop());

    // wet, dark rings soaked into the voxels around each hole
    soakVoxels(kept, localEntry, 0.095 + profile.power * 0.02, 0.95);
    if (exitWorld) soakVoxels(kept, localExit, 0.165 + profile.power * 0.03, 0.9);

    part.voxels = kept;
    exposeSkeletonBones(part, removed);
    part.trauma += 1;
    part.destroyedVolume += removed.length;
    if (removed.length >= 3) this.spawnTissueChunk(part, removed, localEntry, localExit, dir, profile);
    mesh.geometry.dispose();
    mesh.geometry = buildVoxelGeometry(kept, part.voxel);

    part.wounds.push(woundLocal.clone());
    if (exitWorld) part.wounds.push(localExit.clone());
    this.woundTotal += exitWorld ? 2 : 1;
    this.recordWound(part, woundLocal, dir, profile, baseDamage, melee, meta?.velocity || 0);

    const gibCount = Math.min(removed.length, profile.gibs);
    for (let i = 0; i < gibCount; i++) {
      const v = removed[(Math.random() * removed.length) | 0];
      this.fx.gib(mesh.localToWorld(new THREE.Vector3(v.x, v.y, v.z)), dir, v.color);
    }

    const impactScale = clamp(0.55 + (meta?.velocity || 0) / 950, 0.55, 2.1);
    this.fx.bloodBurst(point, dir.clone().negate(), 0.32 + profile.power * 0.5 * impactScale); // splash back at the shooter
    if (exitWorld) this.fx.bloodBurst(exitWorld, dir, 0.85 + profile.power * 0.7 * impactScale); // blow-through mist

    if (
      removed.length &&
      ((part.name === 'torso' && (profile.power > 0.62 || part.hp <= 0)) ||
        (part.name === 'head' && profile.power > 0.75)) &&
      Math.random() < 0.42
    ) {
      this.spawnOrgan(exitWorld || point, dir, part.name === 'head' ? 'brain' : null);
    }

    // ---- damage ----
    const dmg = baseDamage * part.dmg;
    part.hp -= dmg;
    if (!this.dead) this.health -= dmg * 0.85;
    if (hitBone) damageSkeletonBone(hitBone, dmg * 0.55, dir, point);

    if (!wasDead) {
      // Penetrating trauma to the brain, brainstem or cervical spine is not a
      // health-bar event. It immediately hands the body to the ragdoll, while
      // an armoured helmet must first be broken through by the plate path.
      const fatalHead = part.name === 'head';
      const fatalNeck = part.name === 'neck' && (dmg >= 52 || force >= 1.1);
      if (fatalHead || fatalNeck || this.health <= 0) {
        this.health = Math.min(this.health, 0);
        this.die(dir, point, force * (fatalHead ? 1.15 : 1), part.name);
      } else {
        this.react(dir, dmg, force, point, part.name);
        if (this.health <= 1) this.enterCritical(dir, point, force);
      }
    } else {
      // Dead tissue is still tissue. Every further round carves the same body,
      // wakes the solver and transfers its momentum into the ragdoll.
      this.applyPhysicalHit(point, dir, force, part.name, dmg);
    }

    part.mangled = part.hp <= part.maxHp * 0.3;
    if (part.hp <= 0) {
      this.breakPart(part, dir, exitWorld || point);
    } else if (part.name === 'torso' && Math.random() < 0.22) {
      this.spawnOrgan(exitWorld || point, dir);
    }
    return true;
  }

  /** How much an impact should disturb locomotion rather than replace it. */
  impactScore(dmg, force, group) {
    let score = force * 0.72 + dmg / 85;
    if (group === 'head') score += 0.55;
    else if (group === 'leg') score += 0.28;
    else if (group === 'arm') score += 0.12;
    if (this.speed > 2.1) score += 0.08;
    if (this.animLimp > 0.18) score += 0.12;
    if (this.lastBoneHit) {
      if (this.lastBoneHit.fractured) score += 0.16;
      if (this.lastBoneHit.broken) score += 0.12;
      if (this.lastBoneHit.role === 'spine' || this.lastBoneHit.role === 'pelvis') score += 0.1;
      else if (this.lastBoneHit.role === 'leg') score += 0.08;
    }
    return score;
  }

  /**
   * Add a short recoil to the preserved locomotion cycle. This is deliberately
   * not a ragdoll state: a light round nicks the stride and is absorbed by the
   * runner's balance instead of dropping the body to the floor.
   */
  triggerAnimationFlinch(dir, dmg, force, partName = null, duration = 0.42, slow = 0.78) {
    const flat = _dir.copy(dir);
    flat.y = 0;
    if (flat.lengthSq() < 1e-5) flat.set(0, 0, 1);
    flat.normalize();
    const side = flat.x * this.right.x + flat.z * this.right.z;
    const forward = flat.x * this.forward.x + flat.z * this.forward.z;
    this.animFlinchMax = clamp(0.34 + force * 0.2 + dmg / 130, 0.32, 0.98);
    this.animFlinchDuration = clamp(duration, 0.28, 0.95);
    this.animFlinchT = this.animFlinchDuration;
    this.animFlinchSide = side;
    this.animFlinchForward = forward;
    this.animFlinchGuardSide = partName?.endsWith('L')
      ? -1
      : partName?.endsWith('R')
        ? 1
        : this.neuro.guard;
    this.hitSlow = Math.min(this.hitSlow, slow);
    this.hitSlowT = Math.max(this.hitSlowT, this.animFlinchDuration + 0.32);
    this.hitSlowMul = Math.min(this.hitSlowMul, slow);
  }

  /**
   * Hand a standing, staggered body back to the animation rig. Bone transforms
   * are blended from the solver pose, so recovery does not snap or pause in an
   * idle stance. Current running intent and momentum remain intact.
   */
  returnToAnimation(blend = 0.24) {
    if (this.dead || this.physicalDown || this.airborne || !this.activeRagdoll) return false;
    const pelvis = this.bones.pelvis.position;
    this.position.x = pelvis.x;
    this.position.z = pelvis.z;
    this.position.y = this.world.sampleGround(pelvis.x, pelvis.z, pelvis.y);
    this.animBlendFrom = {};
    for (const name in this.bones) {
      const bone = this.bones[name];
      if (bone.alive) this.animBlendFrom[name] = bone.position.clone();
    }
    this.animBlendT = 0;
    this.animBlendDuration = Math.max(0.01, blend);
    this.animationDriven = true;
    this.activeRagdoll = false;
    this.physicsDriven = false;
    this.physicalDown = false;
    this.physicalMode = 'animation';
    this.reactionT = 0;
    this.reactionDuration = 0;
    this.reactionTier = 'recovered';
    this.muscle = 1.9;
    this.clearMotors();
    for (const l of this.links) l.enabled = false;
    for (const name in this.bones) {
      const bone = this.bones[name];
      if (!bone.alive) continue;
      bone.kinematic = true;
      bone.invMass = 0;
      bone.prev.copy(bone.position);
      bone.motorStrength = 0;
      bone.motorSpeed = 0;
    }

    const motion = this.preHitVelocity.lengthSq() > 0.04 ? this.preHitVelocity : this.moveDir;
    if (motion.lengthSq() > 1e-4) {
      this.moveDir.copy(motion).setY(0).normalize();
      this.yaw = Math.atan2(this.moveDir.x, this.moveDir.z);
      this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    }
    this.speed = clamp(Math.max(this.speed, this.preHitVelocity.length() * 0.75, 0.65), 0.65, 3.8);
    this.animPhase = this.locomotionPhase;
    this.animPoseReady = false;
    this.armTargetReady = false;
    this.hasBrace = false;
    this.hasBraceL = false;
    this.hasBraceR = false;
    this.impactShove.set(0, 0, 0);
    this.stumbleLoad = 0;
    this.stumbleT = 0;
    this.stumbleDir.set(0, 0, 0);
    this.stumbleSide = 0;
    this.clutchT = 0;
    this.downSustainT = 0;
    this.recoveryRetryT = 0;
    this.impactLegSide = 0;
    this.impactLegT = 0;
    this.impactArmSide = 0;
    this.impactArmT = 0;
    this.stepSide = 0;
    this.stepT = 0;
    this.stepKind = 'none';
    this.nervous.startle = Math.min(this.nervous.startle, 0.24);
    this.footPlantL.copy(this.bones.lFoot.position);
    this.footPlantR.copy(this.bones.rFoot.position);
    this.gunMesh && (this.gunMesh.visible = this.armed);
    return true;
  }

  /**
   * At exactly one point of health a living body stops trying to win the
   * fight. It folds onto its knees and begs toward the shooter. This is a
   * physical mode, not an idle: the legs, spine and arms are all motor-driven
   * until the body dies.
   */
  enterCritical(dir = null, point = null, force = 0.3) {
    if (this.dead || this.health <= 0 || this.health > 1) return;
    // A terminal plea is still a physical posture. Do not start the kneel
    // until the body has landed; otherwise the critical servos pull a flying
    // body back toward the impact point.
    if (this.airborne) {
      // Remember the terminal state, but do not let the kneel controller run
      // while the body is still ballistic. It starts on the landing frame.
      this.criticalPending = true;
      this.critical = false;
      this.criticalT = 0;
      return;
    }
    const flat = new THREE.Vector3(dir?.x || 0, 0, dir?.z || 0);
    if (flat.lengthSq() < 1e-5) flat.copy(this.forward);
    flat.normalize();
    const at = point ? point.clone() : this.bones.chest.position.clone();
    const first = !this.critical;
    if (!this.activeRagdoll || !this.physicsDriven) {
      this.beginPhysicalBody(
        false,
        at,
        flat,
        Math.max(0.32, force),
        this.inferImpactGroup(at, 'torso'),
        30,
        'torso',
      );
    }
    this.critical = true;
    this.criticalT = 0;
    this.criticalKneeSide = this.neuro.guard;
    this.physicalDown = true;
    this.physicalMode = 'critical';
    this.recoveryRise = 0;
    this.recoveryCapable = true;
    this.recoveryExhausted = false;
    this.stableT = 0;
    this.recoveryHoldT = 0;
    this.stepSide = 0;
    this.stepT = 0;
    this.stepKind = 'none';
    this.captureRecoveryAnchor();
    if (first) {
      // The collapse itself is part of the performance. A tiny lateral shove
      // keeps the knees from folding in perfect symmetry.
      this.impactTwist += (Math.random() - 0.5) * 0.16;
      this.nervous.pain = Math.max(this.nervous.pain, 1.2);
    }
  }

  react(dir, dmg, force = 0.3, point = null, partName = null) {
    this.fear = Math.max(this.fear, 3.2 + Math.random() * 2.5);
    this.pain = 1;
    this.flinch = 0.55;
    this.staggerT = 0.7;
    this.lean = 0.25 + Math.random() * 0.4 + clamp(force, 0, 2.5) * 0.12;
    this.leanSide = (Math.random() - 0.5) * 0.4;

    const flat = _dir.copy(dir).setY(0);
    if (flat.lengthSq() < 1e-5) flat.set(0, 0, 1);
    flat.normalize();
    this.flinchDir.copy(flat);

    const at = point ? point.clone() : this.bones.chest.position.clone();
    const group = this.inferImpactGroup(at, partName);
    const score = this.impactScore(dmg, force, group);
    const tier = score < 0.78 ? 'minor' : score < 1.5 ? 'moderate' : 'severe';
    this.reactionTier = tier;
    this.impactSeverity = score;

    // A hit is an evolving balance problem, not an instant takedown. The load
    // grows across hits and is spent by the foot-placement and posture
    // controller. Shot count alone never decides the reaction.
    const sideSign = partName?.endsWith('L') ? -1 : partName?.endsWith('R') ? 1 : 0;
    const lateralPush = flat.x * this.right.x + flat.z * this.right.z;
    const linger = group === 'leg' ? 0.95 : group === 'torso' ? 0.7 : 0.48;
    this.stumbleLoad = clamp(
      this.stumbleLoad * 0.86 +
        clamp(score * 0.2 + dmg / 260 + force * 0.07, 0.04, 0.5),
      0,
      1.5,
    );
    this.stumbleDir.copy(flat);
    this.stumbleSide = sideSign || (Math.abs(lateralPush) > 0.035 ? Math.sign(lateralPush) : this.neuro.stepBias);
    this.stumbleT = Math.max(this.stumbleT, linger + force * 0.16);

    // Every practical bullet hit must produce a physical response. A round
    // that is too weak to move the body still gets a local animated flinch,
    // but any hit that can visibly injure the body enters the active solver.
    const flinchTime = tier === 'minor' ? 0.46 : 0.62;
    this.triggerAnimationFlinch(
      flat,
      dmg,
      force,
      partName,
      flinchTime,
      tier === 'minor' ? 0.82 : 0.7,
    );

    // A round through an arm is a local wound, not an automatic takedown. A
    // healthy body can catch its weight on the other leg and keep fighting;
    // only a heavy hit, a low-health body or one already badly off balance
    // hands the whole body to the solver. The animated flinch still gives the
    // hit an immediate, readable reaction. Test the wounded part directly:
    // impact-group inference is useful for impulses, but a real arm wound must
    // not become a torso hit just because the ray entered near the shoulder.
    const armWound =
      partName === 'upperArmL' || partName === 'upperArmR' ||
      partName === 'forearmL' || partName === 'forearmR' ||
      partName === 'handL' || partName === 'handR';
    if (
      armWound &&
      this.health > this.maxHealth * 0.45 &&
      force < 1.1
    ) {
      this.hitSlow = Math.min(this.hitSlow, 0.7);
      this.hitSlowT = Math.max(this.hitSlowT, this.animFlinchDuration + 0.3);
      this.hitSlowMul = Math.min(this.hitSlowMul, this.hitSlow);
      return;
    }

    // Already staggering: add the new impulse to the same physical body instead
    // of restarting a reaction or switching systems underneath it.
    if (this.physicsDriven && this.activeRagdoll) {
      this.applyPhysicalHit(at, flat, force, partName, dmg);
      this.reactionTier = tier;
      if (group === 'head') this.nervous.startle = Math.min(this.nervous.startle, 0.34);
      else if (tier === 'minor') this.nervous.startle = Math.min(this.nervous.startle, 0.3);
      else if (tier === 'moderate') this.nervous.startle = Math.min(this.nervous.startle, 0.46);
      const extra = tier === 'minor' ? 0.55 : tier === 'moderate' ? 0.92 : 1.25;
      this.reactionDuration = Math.max(
        this.reactionDuration,
        extra + force * 0.16 + dmg / 520,
      );
      return;
    }

    // Below this threshold the round is a graze. It still visibly flinches, but
    // it does not justify taking the whole body away from locomotion.
    if (score < 0.28) {
      this.hitSlow = Math.min(this.hitSlow, tier === 'minor' ? 0.84 : 0.72);
      this.hitSlowT = Math.max(this.hitSlowT, this.animFlinchDuration + 0.3);
      this.hitSlowMul = Math.min(this.hitSlowMul, this.hitSlow);
      return;
    }

    // A bullet that connects hands the body to the same solver used by severe
    // impacts. The difference between tiers is now the impulse, reaction
    // duration and balance load, not whether the physics runs at all.
    this.beginPhysicalBody(false, at, flat, force, group, dmg, partName);
    this.reactionTier = tier;
    if (group === 'head') this.nervous.startle = Math.min(this.nervous.startle, 0.34);
    else if (tier === 'minor') this.nervous.startle = Math.min(this.nervous.startle, 0.3);
    else if (tier === 'moderate') this.nervous.startle = Math.min(this.nervous.startle, 0.46);
    const base = tier === 'minor' ? 0.58 : tier === 'moderate' ? 0.92 : 1.3;
    this.reactionDuration = clamp(base + force * 0.16 + dmg / 520, 0.5, 2.2);
    // A leg hit needs enough time for a real weight transfer and catch step;
    // a torso hit needs time for the arms and spine to fight the recoil.
    if (group === 'leg') this.reactionDuration = Math.max(this.reactionDuration, 0.86 + force * 0.1);
    else if (group === 'torso') this.reactionDuration = Math.max(this.reactionDuration, 0.76 + force * 0.08);
    if (group === 'head') this.reactionDuration = Math.min(this.reactionDuration, 0.8);
    if (this.health < this.maxHealth * 0.32 || dmg > this.maxHealth * 0.25) {
      this.fear = Math.max(this.fear, 5);
    }
  }

  spawnOrgan(point, dir, name = null) {
    if (!goreEnabled() || !this.debris || !this.organs || !this.organs.length) return;
    const organ = name
      ? this.organs.find((o) => o.name === name) || this.organs[0]
      : this.organs[(Math.random() * this.organs.length) | 0];
    const mesh = makeOrganMesh(organ);
    mesh.position.copy(point).add(
      new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12),
    );
    mesh.quaternion.setFromEuler(
      new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
    );
    const vel = dir.clone().multiplyScalar(1.4 + Math.random() * 2.2);
    vel.x += (Math.random() - 0.5) * 2;
    vel.y += 1.1 + Math.random() * 1.6;
    vel.z += (Math.random() - 0.5) * 2;
    this.debris.add(mesh, {
      velocity: vel,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      ),
      radius: organ.radius,
    });
    this.fx.bloodBurst(point, dir, 0.4);
  }

  /**
   * A torn-out piece of the actual voxel body, not a generic meat sprite. The
   * removed cells are rebound into a small mesh whose colours and silhouette
   * match the hole they just left, then handed to the environmental debris sim.
   */
  spawnTissueChunk(part, removed, focus, exit, dir, profile) {
    if (!goreEnabled() || !this.debris || !this.fx || removed.length < 3) return;
    const pool = removed
      .map((v) => ({
        v,
        d: (v.x - focus.x) ** 2 + (v.y - focus.y) ** 2 + (v.z - focus.z) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, profile.chunkVoxels)
      .map((entry) => entry.v);
    if (pool.length < 3) return;

    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const v of pool) {
      cx += v.x;
      cy += v.y;
      cz += v.z;
    }
    cx /= pool.length;
    cy /= pool.length;
    cz /= pool.length;
    const voxels = pool.map((v) => ({
      x: v.x - cx,
      y: v.y - cy,
      z: v.z - cz,
      color: [v.color[0], v.color[1], v.color[2]],
    }));
    const geo = buildVoxelGeometry(voxels, part.voxel);
    geo.computeBoundingBox();
    const size = new THREE.Vector3();
    geo.boundingBox?.getSize(size);
    const mesh = new THREE.Mesh(geo, MAT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    part.mesh.updateMatrixWorld(true);
    mesh.position.copy(part.mesh.localToWorld(new THREE.Vector3(cx, cy, cz)));
    part.mesh.getWorldQuaternion(_chunkQuat);
    mesh.quaternion.copy(_chunkQuat);

    const launch = dir.lengthSq() > 1e-6 ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const vel = launch.multiplyScalar(1.3 + profile.power * 2.4);
    vel.x += (Math.random() - 0.5) * (2.4 + profile.power);
    vel.y = 1.1 + Math.random() * (1.6 + profile.power);
    vel.z += (Math.random() - 0.5) * (2.4 + profile.power);
    const radius = clamp(Math.max(size.x, size.y, size.z) * 0.46, 0.035, 0.22);
    this.debris.add(mesh, {
      velocity: vel,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
      ),
      radius,
    });
    this.chunksTorn += 1;
    this.fx.gibCount += 1;
    this.fx.bloodBurst(mesh.position, dir, 0.22 + profile.power * 0.18);
    if (exit) this.fx.dropBlood(mesh.position);
  }

  /**
   * Detach a whole articulated chain as one rigid compound. Reparenting the
   * live part meshes preserves every voxel and joint seam, so a forearm leaves
   * with its hand still attached instead of turning into unrelated props.
   */
  detachLimb(chain, dir, woundPoint) {
    const live = chain.filter((p) => p && !p.destroyed && p.mesh);
    if (!live.length) return;
    const stump = woundPoint ? woundPoint.clone() : null;
    const group = new THREE.Group();
    this.scene.add(group);
    group.position.set(0, 0, 0);
    group.quaternion.identity();
    group.updateMatrixWorld(true);

    for (const p of live) {
      p.destroyed = true;
      p.mesh.updateMatrixWorld(true);
      group.attach(p.mesh);
    }
    this.parts = this.parts.filter((p) => !live.includes(p));
    group.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    bounds.getCenter(_chunkCenter);
    for (const child of group.children) child.position.sub(_chunkCenter);
    group.position.copy(_chunkCenter);
    group.quaternion.identity();
    group.updateMatrixWorld(true);

    const launch = dir.lengthSq() > 1e-6 ? dir.clone().setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    const vel = launch.multiplyScalar(2.1 + Math.min(4.5, size.length() * 2.2));
    vel.x += (Math.random() - 0.5) * 2.2;
    vel.y = 1.35 + Math.random() * 2.5;
    vel.z += (Math.random() - 0.5) * 2.2;
    const spin = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
    );
    const radius = clamp(Math.max(size.x, size.y, size.z) * 0.32, 0.08, 0.31);

    if (this.debris) {
      this.debris.add(group, { velocity: vel, spin, radius });
    } else {
      this.scene.remove(group);
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
    }

    for (const part of live) {
      for (const [a, b] of part.cut) {
        const ba = this.bones[a];
        const bb = this.bones[b];
        for (const l of this.links) {
          if ((l.a === ba && l.b === bb) || (l.a === bb && l.b === ba)) {
            l.enabled = false;
            l.cut = true;
          }
        }
      }
      for (const name of part.kill) {
        const p = this.bones[name];
        p.alive = false;
        p.invMass = 0;
        p.kinematic = true;
      }
    }
    for (const l of this.jointLimits) {
      if (!l.a.alive || !l.b.alive) l.enabled = false;
    }

    const spray = stump || _chunkCenter.clone();
    for (let i = 0; i < 5; i++) {
      this.fx.meatChunk(spray, new THREE.Vector3(0, 0.6, 0), this.pal.skin, 0.8);
    }
    this.fx.bloodBurst(spray, new THREE.Vector3(0, 0.4, 0), 1.8);
    this.fx.gibCount += live.length;
    this.woundTotal += 3;
    this.dismemberments += 1;
  }

  sever(part, dir, woundPoint = null) {
    // A detached limb is exactly the kind of graphic destruction the child
    // filter removes. Structural damage, death and physics still run.
    if (!goreEnabled() || part.destroyed) return;
    const distal = DISTAL[part.name];
    const chain = [part];
    if (distal) {
      for (const name of distal.parts) {
        const p = this.parts.find((q) => q.name === name);
        if (p && !p.destroyed) chain.push(p);
      }
    }
    this.detachLimb(chain, dir, woundPoint);
    if (distal) {
      for (const name of distal.bones) {
        const b = this.bones[name];
        b.alive = false;
        b.invMass = 0;
        b.kinematic = true;
      }
    }
  }

  breakPart(part, dir, woundPoint) {
    if (part.destroyed) return;

    if (part.name === 'head') {
      // a headshot kills and leaves a hole; the head does not explode off
      if (!this.dead) return;
      if (part.hp > -90) return;
      this.spawnOrgan(woundPoint, dir, 'brain');
      this.fx.bloodBurst(woundPoint, dir, 2.6);
      this.sever(part, dir, woundPoint);
      return;
    }

    if (part.name === 'neck') {
      this.decapitate(dir, woundPoint);
      return;
    }

    if (part.name === 'torso') {
      if (!this.dead) return;
      for (let i = 0; i < 2; i++) this.spawnOrgan(woundPoint, dir);
      return;
    }

    const leg =
      part.name === 'thighL' || part.name === 'thighR' || part.name === 'shinL' || part.name === 'shinR';
    if (leg) this.legsLost++;
    this.sever(part, dir, woundPoint);

    if (!this.dead) {
      this.fear = Math.max(this.fear, leg ? 5.5 : 4.2);
      this.pain = Math.max(this.pain, leg ? 1 : 0.72);
      this.buckle = Math.max(this.buckle, leg ? 0.55 : 0.36);
      this.stableT = 0;
      if (!leg) {
        // Losing an arm is a life-changing wound and a violent local event, but
        // it is not a load-bearing failure. Keep an upright body upright; the
        // flinch, blood loss and permanent missing limb already carry the hit.
        // A body that was already in the solver stays there, and a later heavy
        // impact can still take it down. Do not force the floor controller.
        this.recoveryCapable = this.canSelfRight();
        return;
      }
      // A full leg is load-bearing. Whether one or both are gone, the body is
      // committed to the floor and must drag itself with its arms.
      this.recoveryCapable = false;
      this.downed = this.legsLost >= 2;
      this.kneelTarget = 0;
      this.kneelAmount = 0;
      this.physicalDown = true;
      this.recoveryExhausted = true;
      this.physicalMode = 'crawl';
      this.crawlInit = false;
      this.recoveryAnchor.set(this.bones.pelvis.position.x, 0, this.bones.pelvis.position.z);
      const hip = this.bones[part.name.endsWith('L') ? 'lHip' : 'rHip'];
      if (hip?.alive) this.physics.impulse(hip.position, DOWN, 0.07, 0.34);
      if (!this.physicsDriven) {
        const at = woundPoint ? woundPoint.clone() : this.bones.pelvis.position.clone();
        const pushDir = dir && dir.lengthSq() > 1e-5 ? dir : this.forward;
        this.beginPhysicalBody(false, at, pushDir, 0.5, 'leg', 0, this.lastImpactPart);
        this.physicalDown = true;
        this.recoveryCapable = false;
        this.recoveryExhausted = true;
        this.physicalMode = 'crawl';
        this.crawlInit = false;
        this.recoveryAnchor.set(this.bones.pelvis.position.x, 0, this.bones.pelvis.position.z);
      }
    }
  }

  decapitate(dir, woundPoint) {
    if (!goreEnabled()) return;
    const head = this.parts.find((p) => p.name === 'head');
    if (head && !head.destroyed) {
      this.spawnOrgan(woundPoint, dir, 'brain');
      this.fx.bloodBurst(woundPoint, dir, 3.2);
      this.sever(head, dir, woundPoint);
    }
    if (this.parts.some((p) => p.name === 'neck')) {
      const neck = this.parts.find((p) => p.name === 'neck');
      neck.hp = Math.min(neck.hp, 0);
    }
    if (!this.dead) this.die(dir, woundPoint);
  }

  die(dir = new THREE.Vector3(0, 1, 0), point = null, force = 1, partName = null) {
    if (this.dead) return;
    this.dead = true;
    this.deathCause = partName || 'trauma';
    if (this.gunMesh) this.gunMesh.visible = false;
    this.aiming = false;
    this.attackT = 0;
    this.deathTime = 0;
    // Death is a handoff to passive dynamics. No residual muscle tone is
    // allowed to pose the body after this point.
    this.muscle = 0;
    this.dripTimer = 0.12;
    this.poolTimer = 0.7;
    this.kneelTarget = 0;
    this.critical = false;
    this.criticalT = 0;
    this.criticalPray = 0;
    this.ragdollAwake = true;
    this.ragdollSleeping = false;
    this.ragdollIdle = 0;
    this.euphoriaT = 0;
    this.euphoriaPulse = 0;
    this.impacts = 1;
    this.impactDir.copy(dir);
    if (this.impactDir.lengthSq() < 1e-5) this.impactDir.set(0, 0, 1);
    this.impactDir.normalize();

    const at = point ? point.clone() : this.bones.chest.position.clone();
    this.fx.bloodBurst(at, dir, 1.2 + force * 0.25);
    // The last systolic beat after a lethal wound throws a much larger jet
    // than the passive ooze that follows.
    for (const wound of this.arterialWounds) {
      const wp = this.arterialPoint(wound).clone();
      const wd = wp.clone().sub(this.bones.chest.position).normalize().addScaledVector(dir, 0.4).normalize();
      if (this.fx.arterial) this.fx.arterial(wp, wd, clamp(0.8 + wound.severity, 0.8, 2));
    }
    this.beginPhysicalBody(true, at, dir, force, this.inferImpactGroup(at, partName), 1000, partName);
  }

  /** Wake a settled body and put every surviving joint back in the solver. */
  wakeRagdoll(intensity = 1, point = null, dir = null) {
    if (!this.dead) return;
    this.frozen = false;
    this.ragdollSleeping = false;
    this.ragdollAwake = true;
    this.ragdollIdle = 0;
    this.physicsDriven = true;
    this.animationDriven = false;
    this.activeRagdoll = false;
    this.initialDeath = false;
    this.reactionT = 0;
    // Waking a corpse re-enables its passive solver. It must never re-enable
    // muscle tone or a controller: only the incoming impulse may move it.
    this.muscle = 0;
    this.euphoriaT = 0;
    this.euphoriaPulse = 0;
    this.impacts += 1;
    if (point) {
      this.grabPoint.copy(point);
      this.lastImpactPoint.copy(point);
    }
    if (dir) {
      this.impactDir.copy(dir);
      if (this.impactDir.lengthSq() < 1e-5) this.impactDir.set(0, 0, 1);
      this.impactDir.normalize();
      this.lastImpactDir.copy(this.impactDir);
    }
    for (const name in this.bones) {
      const p = this.bones[name];
      if (!p.alive) continue;
      p.kinematic = false;
      p.invMass = 1;
      p.prev.copy(p.position);
      p.motorStrength = 0;
    }
    for (const l of this.links) {
      l.enabled = !l.cut && l.a.alive && l.b.alive;
      l.stiffness = l.baseStiffness ?? 1;
    }
    this.reactionSerial += 1;
    this.footPlantL.copy(this.bones.lFoot.position);
    this.footPlantR.copy(this.bones.rFoot.position);
    this.footTargetL.copy(this.footPlantL);
    this.footTargetR.copy(this.footPlantR);
    this.hasBrace = false;
    this.braceScanT = 0;
    this.guardSide = 0;
    this.updateCom(0);
    this.prevCom.copy(this.com);
  }

  inferImpactGroup(point, partName = null) {
    if (partName) {
      if (partName === 'head' || partName === 'neck') return 'head';
      if (partName === 'torso' || partName === 'pelvis') return 'torso';
      if (partName.startsWith('upperArm') || partName.startsWith('forearm') || partName.startsWith('hand')) return 'arm';
      if (partName.startsWith('thigh') || partName.startsWith('shin') || partName.startsWith('foot')) return 'leg';
    }
    if (!point) return 'torso';
    let best = Infinity;
    let group = 'torso';
    for (const [name, kind] of [
      ['head', 'head'],
      ['neck', 'head'],
      ['chest', 'torso'],
      ['pelvis', 'torso'],
      ['lHand', 'arm'],
      ['rHand', 'arm'],
      ['lKnee', 'leg'],
      ['rKnee', 'leg'],
      ['lFoot', 'leg'],
      ['rFoot', 'leg'],
    ]) {
      const d = point.distanceToSquared(this.bones[name].position);
      if (d < best) {
        best = d;
        group = kind;
      }
    }
    return group;
  }

  /** Hand a standing or dying body to the shared solver under muscle control. */
  beginPhysicalBody(fatal, point, dir, force, group, damage = 0, partName = null) {
    const at = point ? point.clone() : this.bones.chest.position.clone();
    const impulse = dir ? dir.clone() : new THREE.Vector3(0, 0, 1);
    if (impulse.lengthSq() < 1e-5) impulse.set(0, 0, 1);
    impulse.normalize();
    const hitGroup = group || this.inferImpactGroup(at, null);

    this.physicsDriven = true;
    this.animationDriven = false;
    this.activeRagdoll = !fatal;
    // This is the start of a fresh solver handoff. A body already in flight
    // does not call beginPhysicalBody again, so this cannot erase real flight.
    this.airborne = false;
    this.airborneT = 0;
    this.frameHitCount = 0;
    this.impulseStackScale = 1;
    this.hitLaunchT = 0;
    this.criticalPending = false;
    this.ragdollAwake = true;
    this.ragdollSleeping = false;
    this.frozen = false;
    this.reactionT = 0;
    this.reactionSerial += 1;
    this.initialDeath = !!fatal;
    this.reactionGroup = hitGroup;
    this.lastImpactPart = partName || hitGroup;
    this.violence = clamp(force, 0, 5);
    this.reactionDuration = fatal
      ? Infinity
      : clamp((0.9 + force * 0.3 + damage / 130) * (1.45 - this.neuro.recovery * 0.4) * (1.16 - this.neuro.reflex * 0.1), 0.68, 2.2);

    this.physicalDown = false;
    this.recoveryT = 0;
    this.recoveryRise = 0;
    this.recoveryCapable = true;
    this.stableT = 0;
    this.downT = 0;
    this.recoveredFromDown = false;
    this.bodySpeed = 0;
    this.prevPhysicalPelvis.copy(this.bones.pelvis.position);
    this.prevPhysicalChest.copy(this.bones.chest.position);
    this.stableClock = 0;
    this.physicalMode = fatal ? 'dying' : 'balance';
    this.recoveryAttempted = false;
    this.recoveryStallT = 0;
    this.recoveryBestRise = 0;
    this.recoveryExhausted = false;
    this.lastStandUp = -100;
    this.recoveryHoldT = 0;
    this.recoveryPlanReady = false;
    this.recoveryAnchorFresh = false;
    this.recoveryDelayBias = Math.random() * 0.24;
    this.recoveryDurationBias = Math.random() * 0.34;
    this.critical = false;
    this.criticalT = 0;
    this.criticalPray = 0;
    this.woundCurl = 0;
    this.crawlInit = false;
    this.armTargetReady = false;
    this.muscle = fatal
      ? 0
      : clamp(1.35 + damage / 180 + force * 0.12, 1.35, 1.9);
    // Severe hypovolaemia or structural trauma also removes postural tone. The
    // body buckles under its own weight instead of handing back to the normal
    // walk animation at full strength.
    if (!fatal && this.health < this.maxHealth * 0.3) {
      this.buckle = Math.max(this.buckle, 1.15);
      this.muscle = Math.min(this.muscle, 1.05);
    }
    this.nervous.pain = clamp(0.55 + damage / 90 + force * 0.3, 0.55, 2.5);
    this.nervous.startle = clamp(0.58 + force * 0.25, 0.58, 1);
    this.nervous.fatigue = 0;
    this.buckle = 0;
    this.impactTwist = 0;
    this.impactLift = 0;
    this.impactShove.set(0, 0, 0);
    this.clutchT = 0;
    this.downSustainT = 0;
    this.recoveryRetryT = 0;
    this.impactLegSide = 0;
    this.impactLegT = 0;
    this.impactArmSide = 0;
    this.impactArmT = 0;
    this.stepSide = 0;
    this.stepT = 0;
    this.stepCool = 0;
    this.recoverBlend = 0;
    this._animBlend = 1;
    const motion = this.moveDir.lengthSq() > 1e-4 ? this.moveDir : this.forward;
    this.preHitVelocity.copy(motion).multiplyScalar(this.speed);
    this.speed = 0;
    this.aiming = false;
    this.attackT = 0;
    this.ragdollIdle = 0;
    this.aimPoint.copy(this.playerPos);
    this.twitchTimer = 1.2 + Math.random() * 2.9;

    for (const name in this.bones) {
      const p = this.bones[name];
      if (!p.alive) continue;
      p.kinematic = false;
      p.invMass = 1;
      p.prev.copy(p.position);
      p.motorStrength = 0;
    }
    for (const l of this.links) {
      l.enabled = !l.cut && l.a.alive && l.b.alive;
      l.stiffness = l.baseStiffness ?? 1;
    }
    for (const name of ['lFoot', 'rFoot']) {
      const foot = this.bones[name];
      const plant = name === 'lFoot' ? this.footPlantL : this.footPlantR;
      plant.set(foot.position.x, this.world.sampleGround(foot.position.x, foot.position.z, foot.position.y) + 0.08, foot.position.z);
      if (name === 'lFoot') this.footTargetL.copy(plant);
      else this.footTargetR.copy(plant);
    }
    this.hasBrace = false;
    this.braceScanT = 0;
    this.guardSide = 0;
    this.updateCom(0);
    this.prevCom.copy(this.com);
    if (this.gunMesh) this.gunMesh.visible = false;
    this.applyPhysicalHit(at, impulse, force, partName, damage, true);
  }

  /** Apply impact momentum through the same-frame stacking budget. */
  physicalImpulse(point, dir, force, radius) {
    this.physics.impulse(point, dir, force * (this.impulseStackScale || 1), radius);
  }

  /** Local reflex arc for one impact. Force and location change the response. */
  applyPhysicalHit(point, dir, force, partName = null, damage = 0, initial = false) {
    if (!this.physicsDriven) return;
    this.frameHitCount = (this.frameHitCount || 0) + 1;
    // A shotgun delivers its pellets in the same frame. Nine independent
    // full-body impulses would add to ~80 m/s, which is not momentum a person
    // can absorb. Keep the first pellet/round at full strength and share the
    // frame's impulse budget with the rest. This is not a global force nerf.
    this.impulseStackScale = 1 / (1 + 0.85 * (this.frameHitCount - 1));
    const at = point ? point.clone() : this.bones.chest.position.clone();
    // Momentum is not just the weapon's nominal shove. The energy deposited in
    // tissue matters too: otherwise a pistol and a rifle with similar force
    // numbers produce the same visible reaction. `incomingMomentum` is mass x
    // actual projectile speed, set by hit(); direct solver impacts fall back
    // to the existing force value.
    const momentum = this.incomingMomentum > 0 ? this.incomingMomentum : force * 3.4;
    const momentumScale = clamp(momentum / 5.2, 0.42, 1.6);
    this.lastImpactMomentum = momentum;
    const push = clamp((force + damage / 110) * (0.86 + momentumScale * 0.22), 0.16, 3.4);
    const flat = new THREE.Vector3(dir.x, 0, dir.z);
    if (flat.lengthSq() < 1e-5) flat.set(0, 0, 1);
    flat.normalize();
    const group = this.inferImpactGroup(at, partName);
    if (!this.dead && push >= 0.9) this.hitLaunchT = Math.max(this.hitLaunchT, 0.35);
    this.reactionGroup = group;
    this.lastImpactPart = partName || group;
    this.lastImpactForce = push;
    this.lastImpactPoint.copy(at);
    this.lastImpactDir.copy(dir).normalize();
    this.woundLocal.copy(at).sub(this.bones.chest.position);

    const sideSign = partName?.endsWith('L') ? -1 : partName?.endsWith('R') ? 1 : 0;
    if (!this.dead) {
      // A hand may cover a fresh torso/arm wound for a moment. It must not stay
      // there or become a two-handed curl while the legs are trying to recover.
      const guard =
        group === 'torso' ? 0.55 :
        group === 'arm' ? 0.48 :
        group === 'head' ? 0.34 :
        group === 'leg' ? 0.85 : 0;
      this.clutchT = Math.max(this.clutchT, guard + Math.min(0.1, force * 0.035));
      if (group === 'leg' || group === 'torso') {
        const lateralPush = flat.x * this.right.x + flat.z * this.right.z;
        this.stumbleDir.copy(flat);
        this.stumbleT = Math.max(this.stumbleT, (group === 'leg' ? 0.62 : 0.46) + push * 0.1);
        // A torso/head impact has no left/right part suffix. Preserve the
        // actual lateral impact direction instead of replacing it with the
        // NPC's random stance bias; a sideways hit must catch in that direction.
        this.stumbleSide =
          sideSign || (Math.abs(lateralPush) > 0.08 ? Math.sign(lateralPush) : this.neuro.stepBias);
      }
    }
    // Feed the same directional event into the posture controller. The solver
    // gets the bone impulse; the posture target stays displaced for a moment
    // so the muscles do not cancel the hit on the very next iteration.
    this.impactShove.addScaledVector(flat, 0.012 + push * 0.024);
    this.impactShove.y += group === 'head' ? 0.009 : group === 'leg' ? -0.004 : 0.005;
    this.impactShove.clampLength(0, 0.1);
    if (group === 'leg') {
      this.impactLegSide = sideSign || this.guardSide;
      this.impactLegT = Math.max(this.impactLegT, 0.55 + push * 0.22);
      // Interrupt the current gait step so the damaged leg can be replaced by
      // a catch step instead of completing a stride on a buckling support.
      this.stepSide = 0;
      this.stepT = 0;
      this.stepKind = 'none';
      this.stepCool = 0;
    } else if (group === 'arm') {
      this.impactArmSide = sideSign || this.guardSide;
      this.impactArmT = Math.max(this.impactArmT, 0.42 + push * 0.18);
      if (this.armed && (damage > 26 || push > 0.72)) this.dropGun();
    }

    const leftHand = this.bones.lHand.position;
    const rightHand = this.bones.rHand.position;
    const dl = at.distanceToSquared(leftHand);
    const dr = at.distanceToSquared(rightHand);
    this.guardSide = Math.abs(dl - dr) < 0.012 ? this.neuro.guard : dl < dr ? -1 : 1;
    const lateral = flat.x * this.right.x + flat.z * this.right.z;
    const lowerTorsoImpact =
      partName === 'torso' && at.y < this.bones.pelvis.position.y + 0.2;
    // Torque comes from the actual lever between the impact point and the
    // centre of mass. A centred chest shot has almost none; a hit on the outer
    // shoulder, ribs or hip has a real lever and rotates the torso.
    const leverX = at.x - this.com.x;
    const leverZ = at.z - this.com.z;
    const leverArm = Math.hypot(leverX, leverZ);
    this.lastImpactLever = leverArm;
    this.impactTwist = clamp(
      this.impactTwist +
        lateral * clamp(leverArm, 0.03, 0.55) * (1.25 + push * 0.3) +
        (Math.random() - 0.5) * (lowerTorsoImpact ? 0.035 : 0.11),
      -1.6,
      1.6,
    );
    this.impactLift = clamp(this.impactLift + (group === 'head' ? 0.24 : 0) + push * 0.08, 0, 1.6);
    if (group === 'leg') this.buckle = Math.max(this.buckle, 0.14 + push * 0.07);
    this.nervous.pain = clamp(
      this.nervous.pain + (0.45 + damage / 120 + push * 0.3) * (1.15 - this.neuro.painTolerance * 0.22),
      0,
      3.2,
    );
    this.nervous.startle = Math.max(this.nervous.startle, initial ? 0.68 : 0.8);
    this.nervous.reflexPool = Math.min(1.4, this.nervous.reflexPool + 0.7);
    this.ragdollIdle = 0;
    if (this.dead) {
      // A corpse can be shoved, but it cannot brace, guard or pose itself.
      this.muscle = 0;
      this.reactionT = 0;
    } else if (!initial) {
      this.reactionT = 0;
      this.reactionDuration = Math.min(3.1, this.reactionDuration + 0.22 + push * 0.07);
    }
    this.stepCool = 0;
    if (!this.dead) {
      // Any hit can interrupt a stride. The previous gait step must not carry
      // the body half a metre away from the support base before the catch step
      // is allowed to start.
      this.stepSide = 0;
      this.stepT = 0;
      this.stepKind = 'none';
      this.stepCool = 0;
      if (this.health < this.maxHealth * 0.3) {
        this.buckle = Math.max(this.buckle, 1.15);
        this.muscle = Math.min(this.muscle, 1.05);
      }
      // A fresh impact can restart one recovery attempt after an exhausted
      // body has had time to lie still; it never restarts it every frame.
      if (this.health >= this.maxHealth * 0.3 && this.physicalDown && this.downT > 1.1) {
        this.recoveryExhausted = false;
        this.recoveryAttempted = false;
        this.recoveryStallT = 0;
        this.recoveryBestRise = this.recoveryRise;
      }
      if (this.primaryWound) this.headPain = Math.min(1, this.headPain + 0.18 + push * 0.1);
    }

    const shove = (this.dead ? 0.018 + push * 0.032 : 0.012 + push * 0.02) *
      (0.88 + momentumScale * 0.13);
    // Off-centre transfer adds a small tangential component at the contact.
    // The point impulse is already applied to the hit segment below; this is
    // the rotational lever, not an arbitrary whole-body shove.
    const torqueImpulse = clamp(leverArm * 0.5, 0, 0.3) * (0.003 + push * 0.0045);
    if (torqueImpulse > 0.0015) {
      _motorDir.set(-flat.z, 0, flat.x).normalize();
      this.physicalImpulse(at, _motorDir, torqueImpulse, 0.2 + Math.min(push, 2) * 0.045);
    }
    const limbScale = this.dead ? 1 : 0.84;
    // A bullet is not an explosion. Keep the impulse on the struck segment and
    // its neighbours; a wide radial impulse moves the feet and pelvis with the
    // chest, which is what made every torso hit launch the whole body backward.
    this.physicalImpulse(at, dir, shove, 0.3 + Math.min(push, 2.2) * 0.055);
    this.physicalImpulse(this.bones.chest.position, flat, (0.008 + push * 0.014) * limbScale, 0.34);
    if (this.preHitVelocity.lengthSq() > 0.01) {
      _motorDir.copy(this.preHitVelocity).normalize();
      this.physicalImpulse(
        this.bones.chest.position,
        _motorDir,
        Math.min(0.028, this.preHitVelocity.length() * 0.007),
        0.42,
      );
    }

    // An impact is a whole-body event. Drive the hit segment and the adjacent
    // joints first, then let the torso, head and opposite limbs lag behind.
    _motorDir.set(-flat.z, 0, flat.x).normalize();
    const torsoImpulse = (0.006 + push * 0.012) * limbScale;
    const armImpulse = (0.004 + push * 0.008) * limbScale;
    const headImpulse = (0.009 + push * 0.018) * limbScale;
    this.physicalImpulse(this.bones.lShoulder.position, flat, torsoImpulse, 0.24);
    this.physicalImpulse(this.bones.rShoulder.position, flat, torsoImpulse, 0.24);
    this.physicalImpulse(this.bones.lHand.position, flat, armImpulse, 0.18);
    this.physicalImpulse(this.bones.rHand.position, flat, armImpulse, 0.18);
    this.physicalImpulse(this.bones.neck.position, flat, headImpulse * 0.7, 0.2);

    if (group === 'head') {
      this.physicalImpulse(this.bones.head.position, dir, (0.026 + push * 0.038) * limbScale, 0.24);
      this.physicalImpulse(this.bones.lShoulder.position, _motorDir, (0.018 + push * 0.024) * limbScale, 0.18);
      this.physicalImpulse(this.bones.rShoulder.position, _motorDir, (-0.018 - push * 0.024) * limbScale, 0.18);
      this.physicalImpulse(this.bones.lHand.position, _motorDir, armImpulse * 0.8, 0.16);
      this.physicalImpulse(this.bones.rHand.position, _motorDir, -armImpulse * 0.8, 0.16);
    } else if (group === 'torso') {
      this.physicalImpulse(this.bones.lShoulder.position, _motorDir, (0.012 + push * 0.024) * limbScale, 0.2);
      this.physicalImpulse(this.bones.rShoulder.position, _motorDir, (-0.012 - push * 0.024) * limbScale, 0.2);
      this.physicalImpulse(this.bones.head.position, flat, headImpulse, 0.24);
    } else if (group === 'arm') {
      const side = this.impactArmSide || sideSign;
      const sign = side < 0 ? -1 : 1;
      const elbow = this.bones[side < 0 ? 'lElbow' : 'rElbow'];
      const hand = this.bones[side < 0 ? 'lHand' : 'rHand'];
      const shoulder = this.bones[side < 0 ? 'lShoulder' : 'rShoulder'];
      this.physicalImpulse(elbow.position, dir, (0.036 + push * 0.05) * limbScale, 0.24);
      this.physicalImpulse(hand.position, flat, (0.018 + push * 0.026) * limbScale, 0.18);
      this.physicalImpulse(shoulder.position, _motorDir, sign * (0.012 + push * 0.022) * limbScale, 0.18);
      this.physicalImpulse(this.bones.chest.position, _motorDir, -sign * (0.005 + push * 0.009) * limbScale, 0.24);
    } else if (group === 'leg') {
      const side = this.impactLegSide || sideSign;
      const sign = side < 0 ? -1 : 1;
      const knee = this.bones[side < 0 ? 'lKnee' : 'rKnee'];
      const foot = this.bones[side < 0 ? 'lFoot' : 'rFoot'];
      const hip = this.bones[side < 0 ? 'lHip' : 'rHip'];
      _motorDir.copy(DOWN).addScaledVector(flat, 0.5).normalize();
      this.physicalImpulse(knee.position, _motorDir, (0.012 + push * 0.018) * limbScale, 0.26);
      this.physicalImpulse(foot.position, flat, (0.008 + push * 0.012) * limbScale, 0.18);
      this.physicalImpulse(hip.position, flat, (0.004 + push * 0.007) * limbScale, 0.2);
      this.physicalImpulse(this.bones.chest.position, _motorDir.set(-this.right.x * sign, 0.04, -this.right.z * sign), (0.008 + push * 0.014) * limbScale, 0.3);
      this.physicalImpulse(this.bones.rShoulder.position, _motorDir, armImpulse, 0.18);
      this.physicalImpulse(this.bones.lShoulder.position, _motorDir, armImpulse, 0.18);
    }

    if (this.dead && initial) {
      // A real body does not fold in one piece: the head, hands and feet all
      // receive the momentum differently depending on where the round landed.
      for (const name of ['head', 'lHand', 'rHand', 'lFoot', 'rFoot']) {
        const bone = this.bones[name];
        if (!bone.alive) continue;
        _motorDir.set((Math.random() - 0.5) * 1.1, 0.12 + Math.random() * 0.45, (Math.random() - 0.5) * 1.1).normalize();
        this.physicalImpulse(bone.position, _motorDir, 0.008 + Math.random() * 0.02, 0.14);
      }
    }
  }

  /** Weighted centre of mass, used by the balance and catch-step controller. */
  updateCom(dt) {
    const px = this.com.x;
    const py = this.com.y;
    const pz = this.com.z;
    let x = 0;
    let y = 0;
    let z = 0;
    let mass = 0;
    const add = (name, m) => {
      const p = this.bones[name];
      if (!p?.alive) return;
      x += p.position.x * m;
      y += p.position.y * m;
      z += p.position.z * m;
      mass += m;
    };
    add('pelvis', 0.24);
    add('chest', 0.3);
    add('head', 0.09);
    add('neck', 0.03);
    add('lShoulder', 0.04);
    add('rShoulder', 0.04);
    add('lElbow', 0.018);
    add('rElbow', 0.018);
    add('lHand', 0.008);
    add('rHand', 0.008);
    add('lKnee', 0.045);
    add('rKnee', 0.045);
    add('lFoot', 0.04);
    add('rFoot', 0.04);
    if (mass > 0) this.com.set(x / mass, y / mass, z / mass);
    if (dt > 0) {
      this.comVelocity.set((this.com.x - px) / dt, (this.com.y - py) / dt, (this.com.z - pz) / dt);
      if (this.comVelocity.lengthSq() > 64) this.comVelocity.setLength(8);
    }
    return this.com;
  }

  setMotor(name, target, strength, speed = 4) {
    const p = this.bones[name];
    if (!p || !p.alive || p.kinematic) return;
    if (!(strength > 0.001) || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
      p.motorStrength = 0;
      return;
    }
    p.motorTarget.copy(target);
    p.motorStrength = strength;
    p.motorSpeed = speed;
  }

  clearMotors() {
    for (const name in this.bones) this.bones[name].motorStrength = 0;
  }

  /** Analytic two-bone IK: returns the bend position for a knee or elbow. */
  solveJoint(origin, target, upper, lower, pole, out) {
    let dist = _jointDir.subVectors(target, origin).length();
    if (dist < 1e-5) return out.copy(origin);
    _jointDir.divideScalar(dist);
    dist = clamp(dist, Math.abs(upper - lower) + 0.015, upper + lower - 0.008);
    _jointPole.copy(pole);
    _jointPole.addScaledVector(_jointDir, -_jointPole.dot(_jointDir));
    if (_jointPole.lengthSq() < 1e-6) _jointPole.set(0, -1, 0);
    _jointPole.normalize();
    const along = (upper * upper - lower * lower + dist * dist) / (2 * dist);
    const outOfLine = Math.sqrt(Math.max(0, upper * upper - along * along));
    out.copy(origin).addScaledVector(_jointDir, along).addScaledVector(_jointPole, outOfLine);
    return out;
  }

  applyArmTarget(side, target, strength, speed = 5) {
    const names = side < 0 ? ['lShoulder', 'lElbow', 'lHand'] : ['rShoulder', 'rElbow', 'rHand'];
    if (!this.bones[names[0]].alive || !this.bones[names[1]].alive || !this.bones[names[2]].alive) return;
    _ikPole
      .set(this.right.x * side * 0.8 + this.forward.x * 0.2, -0.12, this.right.z * side * 0.8 + this.forward.z * 0.2)
      .normalize();
    this.solveJoint(this.bones[names[0]].position, target, this.rig.upperArm, this.rig.forearm, _ikPole, _jointElbow);
    this.setMotor(names[1], _jointElbow, strength * 0.82, speed * 0.9);
    this.setMotor(names[2], target, strength, speed);
  }

  applyLegTarget(side, hipTarget, footTarget, strength, footSpeed = 4.2) {
    const names = side < 0 ? ['lHip', 'lKnee', 'lFoot'] : ['rHip', 'rKnee', 'rFoot'];
    if (!this.bones[names[0]].alive || !this.bones[names[1]].alive || !this.bones[names[2]].alive) return;
    _ikPole.set(this.forward.x, -0.02, this.forward.z).normalize();
    this.solveJoint(hipTarget, footTarget, this.rig.thigh, this.rig.shin, _ikPole, _jointElbow);
    this.setMotor(names[0], hipTarget, strength * 0.78, 3.1);
    this.setMotor(names[1], _jointElbow, strength * 0.92, 3.4);
    this.setMotor(names[2], footTarget, strength, footSpeed);
  }

  /** Find a wall, table or door edge the hands can actually brace against. */
  findBracePoint(origin, reach, out) {
    let best = reach * reach;
    let found = false;
    for (const b of this.world.boxes) {
      if (b.max.y < 0.32) continue;
      if (
        origin.x > b.min.x - 0.05 &&
        origin.x < b.max.x + 0.05 &&
        origin.y > b.min.y &&
        origin.y < b.max.y &&
        origin.z > b.min.z - 0.05 &&
        origin.z < b.max.z + 0.05
      ) continue;
      const x = clamp(origin.x, b.min.x, b.max.x);
      const y = clamp(origin.y, b.min.y, b.max.y);
      const z = clamp(origin.z, b.min.z, b.max.z);
      const dx = x - origin.x;
      const dy = y - origin.y;
      const dz = z - origin.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.024) continue;
      if (d2 >= best) continue;
      best = d2;
      out.set(x, y, z);
      found = true;
    }
    return found;
  }

  /** Peripheral nervous activity: persistent pain, startle and involuntary twitches. */
  updateNervous(dt, alive) {
    const n = this.nervous;
    n.pain = Math.max(0, n.pain - dt * (alive ? 1.1 : 0.42));
    n.startle = Math.max(0, n.startle - dt * (alive ? 2.1 : 0.7));
    n.reflexPool = Math.max(0, n.reflexPool - dt * (alive ? 2.6 : 1.1));
    n.imbalance = this.balanceError;
    n.fatigue = Math.min(1, n.fatigue + dt * (alive ? 0.018 : 0.004));
    this.neuro.swayPhase += dt * (alive ? 2.2 : 0.35);

    // Dead bodies are intentionally excluded from involuntary twitch impulses:
    // after death, every visible movement must be explainable by gravity,
    // contact, or an external force.
  }

  updateActiveBody(dt, playerPos) {
    if (this.dead || !this.activeRagdoll) return;
    this.updateReactionMomentum(dt);
    this.playerPos.copy(playerPos);
    this.reactionT += dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.gunFlash) this.gunFlash.visible = false;
    }
    this.think(dt, playerPos);
    if (this.attackT > 0) {
      this.attackT = Math.max(0, this.attackT - dt);
      if (!this.attackHit && this.attackT < 0.19) {
        this.attackHit = true;
        const reach = _dir.copy(playerPos).sub(this.position);
        reach.y = 0;
        if (this.aggressive && reach.length() < 1.8) {
          reach.normalize();
          this.onAttack?.(this.armoured ? 18 : 12, this.position, reach);
        }
      }
    }
    const tone = clamp(this.muscle / 1.9, 0, 1);
    this.muscle = Math.max(0.78, this.muscle - dt * 0.48);
    for (const l of this.links) {
      if (l.enabled) l.stiffness = (l.baseStiffness ?? 1) * (0.52 + 0.4 * tone);
    }
    this.updateNervous(dt, true);
    this.updatePhysicalState(dt);
    if (this.airborne) {
      // Flight is passive: no get-up, kneel, crawl or animation motors. The
      // linked body keeps the momentum supplied by the projectile.
      this.clearMotors();
      this.bleed(dt);
      return;
    }
    if (
      this.activeRagdoll &&
      !this.physicalDown &&
      !this.critical &&
      this.health > 1 &&
      this.reactionT > this.reactionDuration
    ) {
      const pelvis = this.bones.pelvis.position;
      const chest = this.bones.chest.position;
      const ground = this.world.sampleGround(pelvis.x, pelvis.z, pelvis.y);
      const standHeight = this.reactionGroup === 'leg' ? 0.63 : 0.72;
      const upright = pelvis.y - ground > standHeight && chest.y - pelvis.y > 0.27;
      if (upright && (this.balanceError < 0.38 || this.reactionT > this.reactionDuration + 0.7)) {
        this.returnToAnimation(0.24);
        return;
      }
    }

    // A stumble must always have an exit. If a non-down body is still upright
    // but not balanced enough for the normal hand-off, put it back into gait
    // once its feet are under it; if it cannot regain support, commit it to the
    // floor controller so it can never remain frozen in a solver balance pose.
    if (
      this.activeRagdoll &&
      !this.physicalDown &&
      !this.critical &&
      this.health > 1 &&
      this.reactionT > this.reactionDuration + 0.85
    ) {
      const pelvis = this.bones.pelvis.position;
      const chest = this.bones.chest.position;
      const ground = this.world.sampleGround(pelvis.x, pelvis.z, pelvis.y);
      const standHeight = this.reactionGroup === 'leg' ? 0.63 : 0.72;
      const upright = pelvis.y - ground > standHeight && chest.y - pelvis.y > 0.27;
      const feetUnder = (this.bones.lFoot.position.y < ground + 0.17) &&
        (this.bones.rFoot.position.y < ground + 0.17);
      const canRight = this.canSelfRight();
      if (upright && canRight && feetUnder && this.balanceError < 0.62 && this.stepSide === 0) {
        this.stumbleFallbackCount += 1;
        this.returnToAnimation(0.3);
        return;
      }
      if (this.reactionT > this.reactionDuration + 1.55) {
        this.stumbleFallbackCount += 1;
        this.physicalDown = true;
        this.physicalMode = canRight ? 'recovery' : this.legsLost > 0 ? 'crawl' : 'downed';
        this.recoveryCapable = canRight;
        this.recoveryExhausted = false;
        this.recoveryAttempted = false;
        this.recoveryRise = 0;
        this.recoveryHoldT = 0;
        this.downT = 0;
        this.stableT = 0;
        this.captureRecoveryAnchor();
      }
    }
    this.controlPhysical(dt, true);
    this.bleed(dt);

    // Finishing a get-up leaves the body in the same solver. It never blends
    // back to a walking animation or turns its particles kinematic.
    const standThreshold = this.recoveredFromDown ? 1.15 : 0.85;
    if (
      this.physicalDown &&
      this.physicalMode === 'recovery' &&
      this.recoveryRise > 0.9 &&
      this.stableT >= standThreshold
    ) {
      // Do not hand a barely-supported body straight to the gait controller.
      // Hold the physical support pose long enough for the next frame's
      // contacts to settle, then release it into normal balance control.
      if (this.recoveryHoldT <= 0) {
        this.recoveryHoldT = 0.26;
      } else {
        this.recoveryHoldT -= dt;
        if (this.recoveryHoldT <= 0) {
          this.physicalDown = false;
          this.physicalMode = 'balance';
          this.recoveryRise = 0;
          this.recoveryAttempted = false;
          this.stableT = 0;
          this.stepCool = 0;
          this.lastStandUp = this.time;
          // The recovery controller plants the feet at the new support base.
          // Normal balance must start from those plants, not from the stale
          // impact-time plants. Otherwise the first balance frame pulls the
          // feet back across the floor and topples the recovered body.
          this.footPlantL.copy(this.bones.lFoot.position);
          this.footPlantR.copy(this.bones.rFoot.position);
          this.footTargetL.copy(this.footPlantL);
          this.footTargetR.copy(this.footPlantR);
          this.stepSide = 0;
          this.stepT = 0;
          this.gaitLastSide = 0;
          this.returnToAnimation(0.26);
        }
      }
    } else {
      this.recoveryHoldT = 0;
    }
  }

  /** Copy the actual current pelvis into the get-up anchor. */
  captureRecoveryAnchor() {
    const pelvis = this.bones.pelvis.position;
    if (!Number.isFinite(pelvis.x) || !Number.isFinite(pelvis.z)) return;
    this.recoveryAnchor.set(pelvis.x, 0, pelvis.z);
    this.recoveryAnchorFresh = true;
  }

  /** Feet or a fallen torso are actually supported by the world. */
  hasGroundSupport() {
    const pelvis = this.bones.pelvis.position;
    const ground = this.world.sampleGround(pelvis.x, pelvis.z, pelvis.y);
    if (pelvis.y - ground < 0.34) return true;
    for (const name of ['lFoot', 'rFoot']) {
      const foot = this.bones[name];
      if (!foot.alive) continue;
      const g = this.world.sampleGround(foot.position.x, foot.position.z, foot.position.y);
      if (foot.position.y - g <= 0.14) return true;
    }
    return false;
  }

  /**
   * Detect ballistic flight, keep the body passive while it is clear of the
   * floor, and only clear the flag after a real contact. This is the gate that
   * prevents the recovery controller from pulling a launched body back toward
   * its impact point.
   */
  updateAirborneState(dt, verticalSpeed) {
    if (this.dead) {
      this.airborne = false;
      this.airborneT = 0;
      return false;
    }
    const pelvis = this.bones.pelvis.position;
    const chest = this.bones.chest.position;
    const ground = this.world.sampleGround(pelvis.x, pelvis.z, pelvis.y);
    const chestGround = this.world.sampleGround(chest.x, chest.z, chest.y);
    const pelvisHeight = pelvis.y - ground;
    const chestHeight = chest.y - chestGround;
    let feetClear = true;
    for (const name of ['lFoot', 'rFoot']) {
      const foot = this.bones[name];
      if (!foot.alive) continue;
      const g = this.world.sampleGround(foot.position.x, foot.position.z, foot.position.y);
      if (foot.position.y - g <= 0.18) feetClear = false;
    }
    // A lying body can have its feet off the floor. Treat the pelvis/chest
    // resting near the floor as contact too, otherwise a side landing looks
    // like permanent flight.
    const torsoDown = pelvisHeight < 0.46 || chestHeight < 0.56;
    const touching = !feetClear || torsoDown || pelvisHeight < 0.34;
    const launchWindow = this.hitLaunchT > 0;
    const airborneNow =
      !touching &&
      pelvisHeight > 0.35 &&
      (this.airborne || (launchWindow && (verticalSpeed > 0.08 || this.bodySpeed > 0.8)));

    if (airborneNow) {
      this.airborne = true;
      this.airborneT += dt;
      this.physicalMode = 'airborne';
      this.physicalDown = false;
      this.recoveryRise = 0;
      this.recoveryT = 0;
      this.stableT = 0;
      this.recoveryPlanReady = false;
      this.recoveryAttempted = false;
      this.criticalPending = this.criticalPending || this.critical;
      this.critical = false;
      this.criticalT = 0;
      return true;
    }

    if (!this.airborne) return false;

    // One foot brushing the ground during a tumble is not a landing. Wait for
    // contact and a non-ballistic vertical state before releasing the get-up
    // controller. Horizontal sliding is still a landing: the recovery settle
    // gate, not the flight flag, is responsible for waiting until it stops.
    if (!touching || verticalSpeed > 0.24) {
      this.physicalMode = 'airborne';
      this.physicalDown = false;
      this.stableT = 0;
      return true;
    }

    this.airborne = false;
    this.airborneT = 0;
    this.hitLaunchT = 0;
    this.landedAt = this.time;
    this.stableT = 0;
    this.recoveryT = 0;
    this.recoveryRise = 0;
    this.recoveryPlanReady = false;
    this.recoveryAttempted = false;
    this.captureRecoveryAnchor();
    this.footPlantL.copy(this.bones.lFoot.position);
    this.footPlantR.copy(this.bones.rFoot.position);
    this.criticalT = 0;
    return false;
  }

  /**
   * Read the solver's body, decide whether it is down, and advance the physical
   * get-up. No bone positions are written here; only motor targets are set by
   * controlRecovery below.
   */
  updatePhysicalState(dt) {
    const pelvis = this.bones.pelvis.position;
    const chest = this.bones.chest.position;
    const ground = this.world.sampleGround(pelvis.x, pelvis.z, pelvis.y);
    const pelvisHeight = pelvis.y - ground;
    const torsoUp = chest.y - pelvis.y;
    // The old speed estimate was only refreshed every 0.42 s. During a slow
    // get-up it could retain a large rising velocity after the body had already
    // stopped, preventing the settle gate from ever opening. Use a smoothed
    // frame-to-frame estimate instead; it still rejects real motion and drift.
    const instantSpeed =
      Math.max(this.prevFramePelvis.distanceTo(pelvis), this.prevFrameChest.distanceTo(chest)) /
      Math.max(dt, 1e-4);
    // Soft muscles and contact constraints produce a few millimetres of visible
    // jitter. Do not mistake that for travel: the old sensor did, and a fully
    // upright body could never accumulate settle time.
    const verticalSpeed = (pelvis.y - this.prevFramePelvis.y) / Math.max(dt, 1e-4);
    this.hitLaunchT = Math.max(0, this.hitLaunchT - dt);
    const measuredSpeed = instantSpeed < 0.28 ? 0 : instantSpeed;
    this.bodySpeed += (measuredSpeed - this.bodySpeed) * Math.min(1, dt * 8);
    this.prevFramePelvis.copy(pelvis);
    this.prevFrameChest.copy(chest);
    // Keep the longer window as a slow drift check, but do not let it override
    // the live speed used by the settle gate.
    this.stableClock += dt;
    if (this.stableClock >= 0.42) {
      this.prevPhysicalPelvis.copy(pelvis);
      this.prevPhysicalChest.copy(chest);
      this.stableClock = 0;
    }
    if (this.updateAirborneState(dt, verticalSpeed)) return;
    // A deep knee bend with both feet planted is a stagger, not a fall. Wait
    // for a sustained lack of support, a horizontal torso, or a real ground
    // contact before handing the body to the get-up controller.
    const lfDown = this.bones.lFoot;
    const rfDown = this.bones.rFoot;
    const feetPlanted =
      (!lfDown.alive || lfDown.position.y < ground + 0.16) &&
      (!rfDown.alive || rfDown.position.y < ground + 0.16);
    const chestGround = this.world.sampleGround(chest.x, chest.z, chest.y);
    const chestHeight = chest.y - chestGround;
    const torsoCollapse = torsoUp < 0.15 && chestHeight < 0.8;
    const supportFailure =
      pelvisHeight < 0.44 ||
      torsoCollapse ||
      (pelvisHeight < 0.52 && (!feetPlanted || this.balanceError > 0.4));
    this.downSustainT = supportFailure
      ? Math.min(0.5, this.downSustainT + dt)
      : Math.max(0, this.downSustainT - dt * 2.4);
    const downNow = this.downed || this.downSustainT > 0.14;

    // One point of health is a terminal plea, not another get-up attempt. Keep
    // the body in the solver and advance its kneel even if it was standing when
    // the last round landed.
    if (!this.dead && this.health > 0 && this.health <= 1) {
      if (!this.critical) this.enterCritical(this.forward, null, 0.35);
      this.critical = true;
      this.criticalT += dt;
      this.physicalDown = true;
      this.physicalMode = 'critical';
      this.recoveryCapable = true;
      this.recoveryExhausted = false;
      this.recoveryRise = 0;
      this.stableT = 0;
      return;
    }
    if (this.critical || this.criticalPending) {
      this.critical = false;
      this.criticalPending = false;
      this.criticalT = 0;
      this.criticalPray = 0;
      this.recoveryPlanReady = false;
      this.recoveryT = 0;
      this.recoveryRise = 0;
    }

    if (!this.physicalDown && downNow) {
      this.physicalDown = true;
      this.downT = 0;
      this.downSustainT = 0;
      this.recoveryRetryT = 0;
      this.recoveryT = 0;
      this.recoveryRise = 0;
      this.stableT = 0;
      this.recoveredFromDown = true;
      // A second collapse immediately after a successful get-up is a failed
      // righting attempt, not an invitation to repeat the same motor program
      // forever. Let the body rest instead of cycling stand/fall.
      if (this.lastStandUp > -50 && this.time - this.lastStandUp < 2.6 && this.health < this.maxHealth * 0.55) {
        this.recoveryExhausted = true;
      }
      this.recoveryHoldT = 0;
      this.captureRecoveryAnchor();
      this.footPlantL.copy(this.bones.lFoot.position);
      this.footPlantR.copy(this.bones.rFoot.position);
      this.physicalMode = this.legsLost > 0 ? 'crawl' : 'down';
      this.recoveryAttempted = false;
      this.recoveryStallT = 0;
      this.recoveryBestRise = 0;
      this.recoveryPlanReady = false;
      this.recoveryDelayBias = Math.random() * 0.24;
      this.recoveryDurationBias = Math.random() * 0.34;
      this.crawlInit = false;
    }

    if (this.physicalDown) {
      this.downT += dt;
      this.recoveryCapable = this.canSelfRight();
      // Missing legs are a locomotion problem, not a failed get-up. The crawl
      // controller keeps the hips low and pulls the body over planted hands.
      if (this.legsLost > 0 || this.downed) {
        this.physicalMode = 'crawl';
        this.recoveryRise = 0;
        this.stableT = 0;
        return;
      }
      if (!this.recoveryCapable) {
        // Too hurt, too blood-starved or structurally unable to stand. There is
        // no value in retrying a motor program that cannot succeed.
        this.physicalMode = 'exhausted';
        this.recoveryRise = Math.max(0, this.recoveryRise - dt * 1.2);
        this.stableT = 0;
        return;
      }
      if (this.recoveryExhausted) {
        this.recoveryRetryT += dt;
        // A healthy body that failed one righting attempt is not permanently
        // incapacitated. After a short rest it may try again from its current
        // position; only structural leg loss or severe hypovolaemia is final.
        if (
          this.recoveryRetryT > 2.2 &&
          !this.legsLost &&
          this.health > this.maxHealth * 0.3 &&
          this.recoveryCapable
        ) {
          this.recoveryExhausted = false;
          this.recoveryAttempted = false;
          this.recoveryRetryT = 0;
          this.recoveryPlanReady = false;
        } else {
          this.physicalMode = 'exhausted';
          this.recoveryRise = Math.max(0, this.recoveryRise - dt * 0.9);
          this.stableT = 0;
          return;
        }
      }
      if (!this.recoveryAttempted) {
        this.recoveryAttempted = true;
        // Never use the impact-time point. A body may have landed several
        // metres away, so its get-up plan starts from the actual pelvis here.
        this.captureRecoveryAnchor();
        this.recoveryT = 0;
        this.recoveryStallT = 0;
        this.recoveryBestRise = this.recoveryRise;
        this.recoveryPlanReady = false;
      }
      if (!this.recoveryPlanReady) this.initRecoveryPlan();
      this.physicalMode = 'recovery';
      this.recoveryT += dt;
      const injury = 1 - clamp(this.health / this.maxHealth, 0, 1);
      const delay = 0.32 + injury * 0.75 + this.recoveryDelayBias;
      const duration =
        1.35 + injury * 2.1 + (1 - this.neuro.recovery) * 0.6 + this.recoveryDurationBias;
      const progress = clamp((this.recoveryT - delay) / duration, 0, 1);
      this.recoveryRise = progress * progress * (3 - 2 * progress);
      if (this.recoveryRise > this.recoveryBestRise + 0.012) {
        this.recoveryBestRise = this.recoveryRise;
        this.recoveryStallT = 0;
      } else if (this.recoveryRise < 0.58 || pelvisHeight < 0.55) {
        this.recoveryStallT += dt;
      }
      // A body wedged under geometry or repeatedly collapsing at the top of the
      // rise should stop fighting. One exhausted state is better than a
      // permanent push-up loop.
      if (this.recoveryStallT > 2.15 && (this.recoveryRise < 0.58 || pelvisHeight < 0.55)) {
        this.recoveryExhausted = true;
        this.physicalMode = 'exhausted';
        this.recoveryRise = Math.max(0, this.recoveryRise - dt * 0.8);
        this.stableT = 0;
        return;
      }

      const lf = this.bones.lFoot;
      const rf = this.bones.rFoot;
      const feetReady =
        (!lf.alive || lf.position.y < ground + 0.16) &&
        (!rf.alive || rf.position.y < ground + 0.16);
      const upright = pelvisHeight > 0.76 && torsoUp > 0.29 && this.recoveryRise > 0.86;
      const balanced =
        this.recoveryCapable &&
        !this.recoveryExhausted &&
        upright &&
        feetReady &&
        this.balanceError < 0.2 &&
        this.bodySpeed < 0.16 &&
        this.nervous.startle < 0.35;
      this.stableT = balanced ? this.stableT + dt : 0;
      return;
    }

    this.physicalMode = 'balance';
    const lf = this.bones.lFoot;
    const rf = this.bones.rFoot;
    const feetReady =
      (!lf.alive || lf.position.y < ground + 0.16) &&
      (!rf.alive || rf.position.y < ground + 0.16);
    const upright = pelvisHeight > 0.77 && torsoUp > 0.3;
    const balanced =
      upright &&
      feetReady &&
      !this.stepSide &&
      this.canSelfRight() &&
      this.balanceError < 0.17 &&
      this.bodySpeed < 0.16 &&
      this.nervous.startle < 0.42;
    this.stableT = balanced ? this.stableT + dt : 0;
  }

  /** Structural wear from the actual skeleton, separate from flesh HP. */
  partBoneWear(partName) {
    if (!this.skeleton?.length) return 1;
    const bones = this.skeleton.filter((b) => b.functional && b.part?.name === partName);
    if (!bones.length) return 1;
    if (partName === 'torso') {
      const core = bones.filter((b) =>
        b.id === 'ribcage' || b.id === 'sternum' || b.id === 'thoracicSpine' ||
        b.id === 'lumbarSpine' || b.id === 'pelvisBone' || b.id === 'sacrum');
      if (!core.length) return 1;
      return clamp(core.reduce((sum, b) => sum + skeletonBoneWear(b), 0) / core.length, 0.18, 1);
    }
    let wear = 1;
    for (const b of bones) wear = Math.min(wear, skeletonBoneWear(b));
    this.lastBoneWear = wear;
    return clamp(wear, 0.15, 1);
  }

  canSelfRight() {
    if (this.dead || this.downed || this.legsLost > 0) return false;
    const legBoneBroken = (this.skeleton || []).some((b) =>
      (b.id === 'femurL' || b.id === 'femurR' || b.id === 'tibiaL' || b.id === 'tibiaR') && b.broken);
    if (legBoneBroken) return false;
    if (this.health < this.maxHealth * 0.04) return false;
    if (this.bloodPressure < 0.14) return false;
    return (
      this.bones.lHip.alive &&
      this.bones.rHip.alive &&
      this.bones.lKnee.alive &&
      this.bones.rKnee.alive &&
      this.bones.lFoot.alive &&
      this.bones.rFoot.alive
    );
  }

  /**
   * The active part: balance sensor, foot-placement reflex, spinal posture and
   * limb IK all produce targets. The solver decides whether the muscles win.
   */
  controlPhysical(dt, alive) {
    // Hard stop for the corpse path. Even if a future caller tries to run the
    // living controller after death, it cannot write a motor target.
    if (this.dead) {
      this.clearMotors();
      return;
    }
    this.updateCom(dt);
    this.impactShove.multiplyScalar(Math.exp(-dt * 2.35));
    this.impactArmT = Math.max(0, this.impactArmT - dt);
    this.impactLegT = Math.max(0, this.impactLegT - dt);
    this.clutchT = Math.max(0, this.clutchT - dt);
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this.stumbleLoad = Math.max(
      0,
      this.stumbleLoad - dt * (this.balanceError < 0.12 ? 0.34 : 0.1),
    );
    const instability = clamp(this.stumbleLoad, 0, 1.2);
    const age = this.reactionT;
    const tone = clamp(this.muscle / 1.9, 0, 1);
    const initialFall = this.dead && this.reactionSerial === 1;
    const coreFade = this.dead ? (initialFall ? clamp(1 - age / 1.25, 0, 1) : 0) : 1;
    const stun = alive ? clamp(this.nervous.startle * 0.5, 0, 0.56) : 0;
    const perfusion = alive ? clamp(0.34 + this.bloodPressure * 0.66, 0.18, 1) : 1;
    // A body that has physically righted itself remains in a guarded crouch
    // while the wound is still open. The recovery pose uses much more postural
    // tone than ordinary standing; if that support vanishes as soon as balance
    // resumes, the torso sinks under gravity even though the feet are centered.
    // Keep the residual guarding tone until the body is either healed or
    // deliberately knocked down. This is a motor state, not an animation.
    const guardedStance = alive && this.recoveredFromDown && this.lastStandUp > -50;
    const posturalBridge = guardedStance ? 2.6 : 1;
    const core =
      (alive ? 1 - stun : 0.95 * coreFade) *
      (0.72 + 0.28 * tone) *
      (0.88 + this.neuro.righting * 0.16) *
      perfusion * posturalBridge * (0.82 + 0.18 * this.partBoneWear('torso'));
    const armStrength =
      (alive ? 0.82 * (0.72 + tone * 0.28) : Math.max(0, 0.7 - age * 0.11)) * perfusion;
    const legStrength =
      (alive ? 1.05 * (0.72 + tone * 0.28) * (1 - stun * 0.72) : 0.85 * coreFade) *
      perfusion * (guardedStance ? 1.15 : 1) * (1 - instability * 0.14);
    const limbWear = (names) => {
      let integrity = 1;
      for (const name of names) {
        const part = this.parts.find((p) => p.name === name);
        if (!part || part.destroyed) continue;
        integrity *= 0.3 + 0.7 * clamp(part.hp / part.maxHp, 0, 1);
        integrity *= 0.58 + 0.42 * this.partBoneWear(part.name);
      }
      return clamp(integrity, 0.12, 1);
    };
    const armWearL = limbWear(['upperArmL', 'forearmL', 'handL']);
    const armWearR = limbWear(['upperArmR', 'forearmR', 'handR']);
    const legWearL = limbWear(['thighL', 'shinL', 'footL']);
    const legWearR = limbWear(['thighR', 'shinR', 'footR']);
    this.motorTone = clamp(core, 0, 1);

    const lf = this.bones.lFoot;
    const rf = this.bones.rFoot;
    const pelvis = this.bones.pelvis;
    const chest = this.bones.chest;
    const head = this.bones.head;
    // Head and neck support are structural too. A fractured jaw or cervical
    // vertebra should not leave the head held at full servo strength.
    const headWear = Math.min(this.partBoneWear('head'), this.partBoneWear('neck'));
    const canFeet = lf.alive && rf.alive;
    const walking = alive && canFeet && this.speed > 0.12 && this.moveDir.lengthSq() > 0.01;
    // A living one-health body is not allowed to resume locomotion. It uses a
    // separate kneel-and-plead program which is still solved by the same rig.
    if (alive && this.health > 0 && this.health <= 1) {
      this.controlCritical(dt, core, armStrength, legStrength, armWearL, armWearR, legWearL, legWearR);
      this.impactTwist *= Math.exp(-dt * 1.9);
      this.impactLift *= Math.exp(-dt * 2.2);
      this.impactShove.multiplyScalar(Math.exp(-dt * 2.2));
      this.buckle *= Math.exp(-dt * 0.9);
      return;
    }
    if (alive && this.physicalDown) {
      if (this.legsLost > 0 || this.downed) {
        this.controlCrawl(dt, core, armStrength, armWearL, armWearR, legStrength, legWearL, legWearR);
      } else if (this.recoveryCapable && !this.recoveryExhausted) {
        this.controlRecovery(dt, core, armStrength, legStrength, canFeet, armWearL, armWearR, legWearL, legWearR);
      } else {
        this.controlDowned(dt, core, armStrength, armWearL, armWearR);
      }
      this.impactTwist *= Math.exp(-dt * 1.9);
      this.impactLift *= Math.exp(-dt * 2.2);
      this.impactShove.multiplyScalar(Math.exp(-dt * 2.2));
      this.buckle *= Math.exp(-dt * 0.9);
      return;
    }
    const footLX = canFeet ? this.footPlantL.x : pelvis.position.x;
    const footLZ = canFeet ? this.footPlantL.z : pelvis.position.z;
    const footRX = canFeet ? this.footPlantR.x : pelvis.position.x;
    const footRZ = canFeet ? this.footPlantR.z : pelvis.position.z;
    _footCenter.set((footLX + footRX) * 0.5, 0, (footLZ + footRZ) * 0.5);
    const leanX = this.com.x - _footCenter.x;
    const leanZ = this.com.z - _footCenter.z;
    // Forward COM travel is the point of walking. Only lateral drift and
    // excessive forward lean count as loss of balance while moving.
    const travelDir = walking ? this.moveDir : this.forward;
    const lateralLean = leanX * this.right.x + leanZ * this.right.z;
    const travelLean = leanX * travelDir.x + leanZ * travelDir.z;
    // Normal forward gait travel is intentional. During an impact, however,
    // front/back COM drift is exactly what the feet must catch. The old
    // controller ignored positive travel lean while walking, so a shot in the
    // back could push the body over before any catch step was requested.
    const impactWindow =
      this.reactionT < Math.max(0.35, this.reactionDuration) ||
      this.impactShove.lengthSq() > 0.0002;
    const travelAllowance = walking && !impactWindow ? 0.16 : 0.015;
    const travelError = impactWindow
      ? Math.abs(travelLean)
      : Math.max(0, travelLean - travelAllowance);
    this.balanceError = walking
      ? Math.abs(lateralLean) + travelError
      : Math.hypot(leanX, leanZ);
    this.balanceConfidence = alive ? clamp(1 - this.balanceError * 1.7, 0, 1) : 0;
    if (alive && this.balanceError > 0.11) this.fear = Math.max(this.fear, 0.9);

    // ---- planted-foot locomotion / catch-step reflex ----
    this.footTargetL.copy(this.footPlantL);
    this.footTargetR.copy(this.footPlantR);
    this.stepCool = Math.max(0, this.stepCool - dt);
    if (walking) this.locomotionPhase += dt * (2.5 + this.speed * 2.1);

    // A hit that disturbs balance asks for an immediate catch step even before
    // the COM has drifted far enough to cross the normal threshold. This is
    // foot placement, not a scripted stumble clip: the IK leg must reach the
    // ground and the remaining support leg must carry the pelvis.
    if (alive && canFeet && this.stumbleT > 0 && this.stepSide === 0 && this.stepCool <= 0) {
      let side = this.stumbleSide || this.neuro.stepBias;
      if (this.impactLegT > 0 && this.impactLegSide) side = -this.impactLegSide;
      if (!this.bones[side < 0 ? 'lFoot' : 'rFoot'].alive) side = -side;
      if (side !== 0) {
        const stepFrom = side < 0 ? this.footPlantL : this.footPlantR;
        const stepTarget = side < 0 ? this.footTargetL : this.footTargetR;
        _motorDir.copy(this.stumbleDir);
        _motorDir.y = 0;
        if (_motorDir.lengthSq() < 1e-4) _motorDir.copy(this.forward);
        _motorDir.normalize();
        const stride =
          0.19 +
          Math.min(0.07, this.impactSeverity * 0.025) +
          Math.min(0.08, this.stumbleLoad * 0.055);
        stepTarget.set(
          stepFrom.x + _motorDir.x * stride + this.right.x * side * (0.07 + this.neuro.stance * 0.3),
          0,
          stepFrom.z + _motorDir.z * stride + this.right.z * side * (0.07 + this.neuro.stance * 0.3),
        );
        const p = { x: stepTarget.x, z: stepTarget.z };
        this.world.resolveCircle(p, 0.15, 0);
        stepTarget.x = p.x;
        stepTarget.z = p.z;
        stepTarget.y = this.world.sampleGround(stepTarget.x, stepTarget.z, 0.4) + 0.08;
        this.stepFrom.copy(stepFrom);
        this.stepTo.copy(stepTarget);
        this.stepSide = side;
        this.stepT = 0;
        this.stepDuration = 0.23 + Math.random() * 0.09;
        this.stepCool = 0.2;
        this.stepKind = 'catch';
        this.catchStepCount += 1;
        this.stumbleT = 0;
      }
    }
    if (this.stepSide !== 0) {
      this.stepT += dt;
      const u = Math.min(1, this.stepT / this.stepDuration);
      const ease = u * u * (3 - 2 * u);
      const side = this.stepSide;
      const target = side < 0 ? this.footTargetL : this.footTargetR;
      target.lerpVectors(this.stepFrom, this.stepTo, ease);
      const g = this.world.sampleGround(target.x, target.z, 0.4);
      const lift = this.stepKind === 'gait' ? 0.08 : 0.12;
      target.y = g + 0.08 + Math.sin(Math.PI * u) * lift;
      if (u >= 1) {
        const plant = side < 0 ? this.footPlantL : this.footPlantR;
        plant.copy(this.stepTo);
        plant.y = this.world.sampleGround(plant.x, plant.z, 0.4) + 0.08;
        target.copy(plant);
        this.stepSide = 0;
        this.stepT = 0;
        this.stepCool = this.stepKind === 'gait' ? 0.025 : 0.3 + Math.random() * 0.2;
        if (this.stepKind === 'gait') this.gaitStepCount += 1;
        this.stepKind = 'none';
      }
    }

    if (walking && canFeet && this.stepSide === 0 && this.stepCool <= 0 && !(impactWindow && this.balanceError > 0.1)) {
      _motorDir.copy(this.moveDir).normalize();
      const projL = (this.footPlantL.x - pelvis.position.x) * _motorDir.x + (this.footPlantL.z - pelvis.position.z) * _motorDir.z;
      const projR = (this.footPlantR.x - pelvis.position.x) * _motorDir.x + (this.footPlantR.z - pelvis.position.z) * _motorDir.z;
      let side = projL <= projR ? -1 : 1;
      if (Math.abs(projL - projR) < 0.025) side = this.gaitLastSide ? -this.gaitLastSide : this.neuro.stepBias;
      const target = side < 0 ? this.footTargetL : this.footTargetR;
      const plant = side < 0 ? this.footPlantL : this.footPlantR;
      const stride = this.locomotionStride + Math.min(0.12, this.speed * 0.06);
      target.set(
        pelvis.position.x + _motorDir.x * stride + this.right.x * side * this.neuro.stance,
        0,
        pelvis.position.z + _motorDir.z * stride + this.right.z * side * this.neuro.stance,
      );
      const p = { x: target.x, z: target.z };
      this.world.resolveCircle(p, 0.14, 0);
      target.x = p.x;
      target.z = p.z;
      target.y = this.world.sampleGround(target.x, target.z, 0.4) + 0.08;
      this.stepFrom.copy(plant);
      this.stepTo.copy(target);
      this.stepSide = side;
      this.stepT = 0;
      this.stepDuration = clamp(stride / (0.9 + this.speed * 1.45), 0.25, 0.46);
      this.stepKind = 'gait';
      this.gaitLastSide = side;
    }

    const catchThreshold = 0.1 + (1 - this.neuro.balanceSkill) * 0.09;
    const catchWindow = !walking || impactWindow;
    if (catchWindow && alive && canFeet && this.stepSide === 0 && this.stepCool <= 0 && this.balanceError > catchThreshold) {
      const dot = leanX * this.right.x + leanZ * this.right.z;
      let side = Math.abs(dot) > 0.025 ? (dot > 0 ? 1 : -1) : this.neuro.stepBias;
      if (!this.bones[side < 0 ? 'lFoot' : 'rFoot'].alive) side *= -1;
      const target = side < 0 ? this.footTargetL : this.footTargetR;
      this.stepFrom.copy(side < 0 ? this.footPlantL : this.footPlantR);
      target.set(
        this.com.x + this.right.x * side * this.neuro.stance + this.forward.x * 0.08 + this.comVelocity.x * 0.09,
        0,
        this.com.z + this.right.z * side * this.neuro.stance + this.forward.z * 0.08 + this.comVelocity.z * 0.09,
      );
      const from = side < 0 ? this.footPlantL : this.footPlantR;
      _motorDir.set(target.x - from.x, 0, target.z - from.z);
      const trip = _motorDir.length();
      if (trip > 1e-5) {
        const stepLength = Math.min(trip, 0.64);
        _motorDir.divideScalar(trip);
        target.x = from.x + _motorDir.x * stepLength;
        target.z = from.z + _motorDir.z * stepLength;
      }
      const p = { x: target.x, z: target.z };
      this.world.resolveCircle(p, 0.15, 0);
      target.x = p.x;
      target.z = p.z;
      target.y = this.world.sampleGround(target.x, target.z, 0.4) + 0.08;
      this.stepTo.copy(target);
      this.stepSide = side;
      this.stepT = 0;
      this.stepDuration = 0.22 + Math.random() * 0.12;
      this.stepCool = 0.16 + Math.random() * 0.08;
      this.stepKind = 'catch';
      this.catchStepCount += 1;
    }

    const footGround = canFeet
      ? (this.footPlantL.y + this.footPlantR.y) * 0.5 - 0.08
      : Math.max(0, this.world.sampleGround(pelvis.position.x, pelvis.position.z, pelvis.position.y));
    const buckle = alive ? this.buckle : clamp(this.deathTime * 0.33, 0, 1.1);
    // Keep the pelvis over the support polygon. The previous target pushed away
    // from the COM, which made the feet chase the body indefinitely.
    const balanceShift = alive ? clamp(1 - this.balanceError * 1.3, 0, 1) : 0;
    const gaitLead = walking ? Math.min(0.11, 0.025 + this.speed * 0.055) : 0;
    // A body that just righted itself cannot immediately stand at the full
    // healthy pelvis height. Keeping the target at 0.94 leaves the knees locked
    // and the torso is one solver tick from collapse. A small, persistent
    // post-recovery crouch is the posture an injured person can actually hold.
    const recoveryCrouch = this.recoveredFromDown ? 0.02 : 0;
    _pelvisTarget.set(
      _footCenter.x + leanX * balanceShift * 0.42,
      footGround + (walking ? 0.9 : 0.94) - recoveryCrouch - buckle * 0.4 - (this.dead ? Math.min(0.42, this.deathTime * 0.05) : 0),
      _footCenter.z + leanZ * balanceShift * 0.42,
    );
    if (walking) {
      _pelvisTarget.x += this.moveDir.x * gaitLead;
      _pelvisTarget.z += this.moveDir.z * gaitLead;
    }
    const sway = Math.sin(this.neuro.swayPhase) * (alive ? 0.012 : 0.004);
    _pelvisTarget.x += this.right.x * sway;
    _pelvisTarget.z += this.right.z * sway;
    _pelvisTarget.addScaledVector(this.impactShove, 0.18);
    if (this.impactLegT > 0) {
      _pelvisTarget.addScaledVector(this.right, -this.impactLegSide * 0.055 * Math.min(1, this.impactLegT * 2));
    }
    this.setMotor('pelvis', _pelvisTarget, core * 0.9, 2.3);

    _chestTarget.copy(_pelvisTarget);
    _chestTarget.y += 0.44 - buckle * 0.06;
    _chestTarget.addScaledVector(this.right, this.impactTwist * 0.045);
    _chestTarget.addScaledVector(this.forward, 0.02 + this.impactLift * 0.018);
    _chestTarget.addScaledVector(this.impactShove, 0.72);
    const woundGroup = this.primaryWound?.group || null;
    const woundZone = this.primaryWound?.zone || null;
    const lowerTorsoWound = woundZone === 'pelvis';
    const woundAlive = !!(this.primaryWound?.part?.mesh && !this.primaryWound.part.destroyed);
    const woundPain = clamp(this.nervous.pain * 0.34 + (1 - this.health / this.maxHealth) * 0.24, 0, 1);
    // Protective flexion is only a small, local bias. A large forward/downward
    // chest target is what made repeated torso hits fold the whole body into a
    // ball, so the spine stays extended and the pelvis/knees carry the buckle.
    // Only the torso keeps a small protective flexion. Legs and pelvis never
    // pull the head or knees toward the wound; that is the curled-ball pose.
    const curlTarget =
      woundAlive && !lowerTorsoWound && woundGroup === 'torso' ? woundPain * 0.26 : 0;
    this.woundCurl += (curlTarget - this.woundCurl) * Math.min(1, dt * 3.6);
    _chestTarget.addScaledVector(this.forward, this.woundCurl * 0.042);
    _chestTarget.y -= this.woundCurl * (woundGroup === 'leg' ? 0.026 : 0.014);
    this.setMotor('chest', _chestTarget, core, 2.9);

    _headTarget.copy(_chestTarget);
    _headTarget.y += 0.205;
    _headTarget.x += Math.sin(this.neuro.swayPhase * 1.7) * 0.009;
    _headTarget.z += Math.cos(this.neuro.swayPhase * 1.4) * 0.009;
    this.headPain = Math.max(0, this.headPain - dt * 0.34);
    if (woundAlive) {
      if (!this.primaryWound.part.mesh) this.primaryWound.part.mesh.updateMatrixWorld();
      _woundTarget.copy(this.primaryWound.local).applyMatrix4(this.primaryWound.part.mesh.matrixWorld);
      if (!Number.isFinite(_woundTarget.x) || !Number.isFinite(_woundTarget.y) || !Number.isFinite(_woundTarget.z)) {
        _woundTarget.copy(this.bones.chest.position);
      }
      if (woundGroup === 'leg' && this.primaryWound.part.name.startsWith('foot')) {
        const side = this.primaryWound.side || this.guardSide || -1;
        _woundTarget.lerp(this.bones[side < 0 ? 'lKnee' : 'rKnee'].position, 0.72);
      }
      const lateral = (_woundTarget.x - head.position.x) * this.right.x + (_woundTarget.z - head.position.z) * this.right.z;
      _headTarget.addScaledVector(this.right, clamp(lateral, -0.22, 0.22) * 0.55);
      _headTarget.addScaledVector(this.forward, woundGroup === 'head' ? -0.018 : -0.008);
      _headTarget.y += this.headPain * (woundGroup === 'head' ? 0.055 : 0.022);
    }
    _headTarget.addScaledVector(this.impactShove, 0.34);
    this.setMotor('neck', _headTarget, core * 0.66 * (0.76 + headWear * 0.24), 2.6);
    this.setMotor('head', _headTarget, core * (0.62 + woundPain * 0.12) * (0.68 + headWear * 0.32), 2.7);

    const twist = this.impactTwist * 0.09;
    _handTarget.copy(_chestTarget).addScaledVector(this.right, -0.185);
    _handTarget.addScaledVector(this.forward, -twist);
    this.setMotor('lShoulder', _handTarget, core * 0.64, 2.4);
    _handTarget.copy(_chestTarget).addScaledVector(this.right, 0.185);
    _handTarget.addScaledVector(this.forward, twist);
    this.setMotor('rShoulder', _handTarget, core * 0.64, 2.4);

    if (canFeet) {
      // A leg wound must unload the injured support and load the healthy leg.
      // This is the difference between a limp and a body that keeps trusting
      // the leg that was just hit.
      const legHitL = this.impactLegT > 0 && this.impactLegSide < 0;
      const legHitR = this.impactLegT > 0 && this.impactLegSide > 0;
      // Preserve a usable support base: the injured leg unloads, while the
      // healthy leg takes more weight. Going all the way soft here produced a
      // permanent crouch that could never meet the stand-return gate.
      const supportL = Math.max(0.42, legWearL) * (legHitL ? 0.58 : legHitR ? 1.22 : 1);
      const supportR = Math.max(0.42, legWearR) * (legHitR ? 0.58 : legHitL ? 1.22 : 1);
      _handTarget.copy(_pelvisTarget).addScaledVector(this.right, -this.neuro.stance);
      this.applyLegTarget(-1, _handTarget, this.footTargetL, legStrength * supportL);
      _handTarget.copy(_pelvisTarget).addScaledVector(this.right, this.neuro.stance);
      this.applyLegTarget(1, _handTarget, this.footTargetR, legStrength * supportR);
    }

    // ---- arms: physical wound clutch, then bracing, then balance outreach ----
    this.braceScanT -= dt;
    if (this.braceScanT <= 0) {
      this.braceScanT = 0.17;
      this.hasBraceL = this.findBracePoint(this.bones.lShoulder.position, 0.72, this.braceL);
      this.hasBraceR = this.findBracePoint(this.bones.rShoulder.position, 0.72, this.braceR);
      // Do not let both hands converge on one wall point and fight each other.
      if (this.hasBraceL && this.hasBraceR && this.braceL.distanceToSquared(this.braceR) < 0.06) {
        if (this.guardSide < 0) this.hasBraceR = false;
        else this.hasBraceL = false;
      }
    }
    // A wound guard is a short local reflex, not a pose. It never auto-grabs a
    // foot or pulls both hands into the torso; those produced the curled ball.
    let clutchL = 0;
    let clutchR = 0;
    if (woundAlive && !this.dead && this.clutchT > 0) {
      const fade = clamp(this.clutchT / 0.3, 0, 1);
      const clutchBase = clamp(woundPain * 1.15 + this.nervous.pain * 0.18, 0, 1) * fade;
      if (woundGroup === 'torso' && !lowerTorsoWound) {
        // One hand for a moment only. The other remains available to balance.
        const side = this.primaryWound?.side || this.guardSide || this.neuro.guard;
        if (side < 0) clutchL = Math.min(0.46, clutchBase * 0.52);
        else clutchR = Math.min(0.46, clutchBase * 0.52);
      } else if (woundGroup === 'arm') {
        const injured = this.primaryWound.side || this.guardSide;
        if (injured < 0) clutchR = Math.min(0.46, clutchBase * 0.58);
        else clutchL = Math.min(0.46, clutchBase * 0.58);
        if (this.bones[injured < 0 ? 'lHand' : 'rHand'].alive) {
          if (injured < 0) clutchL = Math.min(0.28, clutchBase * 0.3);
          else clutchR = Math.min(0.28, clutchBase * 0.3);
        }
      } else if (woundGroup === 'head') {
        // A brief hand to the head is allowed, but not a two-arm shell.
        if (this.guardSide < 0) clutchL = Math.min(0.2, clutchBase * 0.28);
        else clutchR = Math.min(0.2, clutchBase * 0.28);
      } else if (woundGroup === 'leg') {
        // The hand may cover a leg wound only when the other arm is free and
        // the body is not in the middle of a catch step. Balance outranks this.
        const side = this.primaryWound?.side || this.guardSide || this.neuro.guard;
        // The catch step comes first. The guard window lasts long enough to
        // engage after that step plants; it still waits for a usable support
        // base instead of dragging the hand away during the balance recovery.
        if (this.balanceConfidence > 0.3 && this.stepSide === 0 && this.impactLegT <= 0.15) {
          if (side < 0) clutchL = Math.min(0.26, clutchBase * 0.36);
          else clutchR = Math.min(0.26, clutchBase * 0.36);
        }
      }
    }
    this.primaryClutchAmount = Math.max(clutchL, clutchR);
    for (const side of [-1, 1]) {
      const shoulder = this.bones[side < 0 ? 'lShoulder' : 'rShoulder'];
      if (!shoulder.alive) continue;
      const handBone = this.bones[side < 0 ? 'lHand' : 'rHand'];
      const elbowBone = this.bones[side < 0 ? 'lElbow' : 'rElbow'];
      if (!handBone.alive || !elbowBone.alive) continue;
      const clutch = side < 0 ? clutchL : clutchR;
      let brace = side < 0 ? this.hasBraceL : this.hasBraceR;
      const bracePoint = side < 0 ? this.braceL : this.braceR;
      const wear = side < 0 ? armWearL : armWearR;
      let strength = armStrength * wear * 0.9;
      let speed = 4.8;
      if (clutch > 0.03) {
        // Reach the real local wound point on the moving part. Offsetting the
        // two hands keeps them from occupying the same tissue point.
        _handTarget.copy(_woundTarget);
        if (woundGroup === 'torso') {
          _handTarget.addScaledVector(this.right, side * 0.045);
          _handTarget.addScaledVector(this.forward, side < 0 ? 0.018 : 0.035);
          _handTarget.y += side < 0 ? 0.02 : -0.045;
        } else if (woundGroup === 'head') {
          _handTarget.addScaledVector(this.right, side * 0.06);
          _handTarget.addScaledVector(this.forward, 0.045);
          _handTarget.y += 0.03;
        } else if (woundGroup === 'arm') {
          const injured = this.primaryWound.side || this.guardSide;
          if (side === injured) {
            // The wounded hand supports above its own injury; the healthy hand
            // crosses to the actual opening.
            _handTarget.copy(this.bones[side < 0 ? 'lElbow' : 'rElbow'].position);
            _handTarget.lerp(_woundTarget, 0.45);
          } else {
            _handTarget.addScaledVector(this.right, side * 0.015);
            _handTarget.addScaledVector(this.forward, 0.025);
          }
        } else if (woundGroup === 'leg') {
          _handTarget.addScaledVector(this.right, side * 0.025);
          _handTarget.addScaledVector(this.forward, 0.015);
          _handTarget.y += 0.015;
        } else {
          _handTarget.addScaledVector(this.right, side * 0.035);
          _handTarget.addScaledVector(this.forward, 0.02);
        }
        strength *= 0.72 + clutch * 0.6;
        speed = 6.4;
      } else if (brace) {
        _handTarget.copy(bracePoint);
        _handTarget.x += this.right.x * side * 0.012;
        _handTarget.z += this.right.z * side * 0.012;
        strength *= 1.02;
        speed = 5.2;
      } else {
        _handTarget.copy(shoulder.position);
        if (!this.dead) {
          if (this.armed && this.aiming) {
            _gunAim.copy(this.aimPoint).sub(chest);
            _gunAim.y = 0;
            if (_gunAim.lengthSq() < 1e-5) _gunAim.copy(this.forward);
            _gunAim.normalize();
            if (side > 0) {
              _handTarget.copy(chest).addScaledVector(this.right, 0.105).addScaledVector(_gunAim, 0.34);
              _handTarget.y = chest.y - 0.025;
            } else {
              _handTarget.copy(chest).addScaledVector(this.right, 0.015).addScaledVector(_gunAim, 0.55);
              _handTarget.y = chest.y - 0.075;
            }
            strength *= 1.12;
            speed = 6;
          } else if (this.attackT > 0 && side > 0) {
            const thrust = Math.sin(clamp(1 - this.attackT / 0.42, 0, 1) * Math.PI);
            _handTarget.addScaledVector(this.forward, 0.3 + thrust * 0.24);
            _handTarget.addScaledVector(this.right, 0.015);
            _handTarget.y += 0.01;
          } else {
            const swing = walking ? Math.sin(this.locomotionPhase + (side < 0 ? Math.PI : 0)) * Math.min(0.13, this.speed * 0.08) : 0;
            const flare = clamp(
              this.balanceError * 1.7 + this.nervous.startle * 0.28 + this.stumbleLoad * 0.18,
              0,
              0.9,
            );
            _handTarget.addScaledVector(this.right, side * (0.14 + this.neuro.stance * 0.36 + flare * 0.045));
            _handTarget.addScaledVector(this.forward, 0.035 + swing + flare * 0.018);
            _handTarget.y += -0.27 + flare * 0.055;
            _handTarget.addScaledVector(this.comVelocity, 0.025);
            _handTarget.addScaledVector(this.impactShove, 0.5);
          }
        } else {
          _handTarget.copy(this.bones.chest.position);
          _handTarget.addScaledVector(this.forward, 0.24);
          _handTarget.addScaledVector(this.right, side * 0.28);
          _handTarget.y = 0.11;
        }
      }
      _handTarget.x += Math.sin(this.neuro.swayPhase * 1.8 + side) * (this.nervous.pain * 0.004 + 0.0015);
      const reach = this.armTargetReady ? 1 - Math.exp(-dt * (clutch > 0.05 ? 10 : 6.5)) : 1;
      if (!this.armTargetReady) {
        if (side < 0) this.armTargetL.copy(_handTarget); else this.armTargetR.copy(_handTarget);
      } else if (side < 0) {
        this.armTargetL.lerp(_handTarget, reach);
      } else {
        this.armTargetR.lerp(_handTarget, reach);
      }
      this.applyArmTarget(side, side < 0 ? this.armTargetL : this.armTargetR, strength * (clutch > 0.05 ? 1.15 : 1), speed);
    }
    this.armTargetReady = true;

    this.impactTwist *= Math.exp(-dt * 1.55);
    this.impactLift *= Math.exp(-dt * 1.9);
    if (alive) this.buckle *= Math.exp(-dt * 0.85);
    if (!alive && age > 4.6) this.clearMotors();
  }

  /**
   * Hand-over-hand dragging for a body without usable legs. The hands are
   * planted in world space and pulled back under the shoulders; the chest is
   * drawn toward the planted hand, so the pelvis and torso move because the
   * solver transmits force through the arms. No root position is written here.
   */
  controlCrawl(dt, core, armStrength, armWearL, armWearR, legStrength, legWearL, legWearR) {
    const lArm = this.bones.lElbow.alive && this.bones.lHand.alive;
    const rArm = this.bones.rElbow.alive && this.bones.rHand.alive;
    if (!lArm && !rArm) {
      this.physicalMode = 'downed';
      this.controlDowned(dt, core, armStrength, armWearL, armWearR);
      return;
    }
    const pelvis = this.bones.pelvis.position;
    const chest = this.bones.chest.position;
    const ground = this.world.sampleGround(chest.x, chest.z, chest.y);
    const health = clamp(this.health / this.maxHealth, 0, 1);
    const oneArm = !lArm || !rArm;
    const noLegs = this.legsLost >= 2;
    let strength = clamp(core * (0.46 + health * 0.42) * (0.55 + this.bloodPressure * 0.45), 0.18, 1);
    // Dragging two dead legs adds friction that a single intact leg can brace
    // against. Do not let the arm-only drag outrun a body with a usable leg.
    if (noLegs) strength *= 0.78;
    // One arm can pull, but it cannot alternate support or generate the same
    // traction as a hand-over-hand crawl.
    if (oneArm) strength *= 0.62;

    // Escaping is a changing goal, so update the desired bearing slowly. The
    // actual translation still comes only from the planted hands.
    this.crawlSteerT -= dt;
    if (this.crawlSteerT <= 0 || this.crawlDir.lengthSq() < 1e-4) {
      this.crawlSteerT = 0.85 + Math.random() * 0.45;
      _motorDir.copy(this.position).sub(this.playerPos);
      _motorDir.y = 0;
      if (_motorDir.lengthSq() < 1e-4) _motorDir.copy(this.forward);
      this.crawlDir.lerp(_motorDir.normalize(), 0.58).normalize();
    }
    const dir = this.crawlDir;
    this.yaw = angleLerp(this.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 1.7));
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    if (!this.crawlInit) {
      this.crawlInit = true;
      this.crawlSwingSide = lArm ? -1 : 1;
      this.crawlSwingT = 0.42;
      this.crawlPlantL.copy(this.bones.lHand.position);
      this.crawlPlantR.copy(this.bones.rHand.position);
      this.crawlPlantL.y = this.world.sampleGround(this.crawlPlantL.x, this.crawlPlantL.z, 0) + 0.055;
      this.crawlPlantR.y = this.world.sampleGround(this.crawlPlantR.x, this.crawlPlantR.z, 0) + 0.055;
      const start = lArm ? this.crawlPlantL : this.crawlPlantR;
      this.crawlSwingFrom.copy(start);
      this.crawlSwingTo.copy(start);
      this.crawlSwingTo.x += dir.x * 0.28;
      this.crawlSwingTo.z += dir.z * 0.28;
    }

    this.crawlSwingT += dt * (oneArm ? 0.9 : 1.35 + health * 0.35) * (noLegs ? 0.84 : 1);
    if (this.crawlSwingT >= 1) {
      const finished = this.crawlSwingSide;
      if (finished < 0) this.crawlPlantL.copy(this.crawlSwingTo);
      else this.crawlPlantR.copy(this.crawlSwingTo);
      const next = finished < 0 ? (rArm ? 1 : -1) : lArm ? -1 : 1;
      this.crawlSwingSide = next;
      this.crawlSwingT = 0;
      const from = next < 0 ? this.bones.lHand.position : this.bones.rHand.position;
      this.crawlSwingFrom.copy(from);
      this.crawlSwingTo.copy(from);
      const reach =
        (this.crawlStride + health * 0.09) *
        (0.75 + this.neuro.reflex * 0.28) *
        (oneArm ? 0.62 : 1) *
        (noLegs ? 0.88 : 1);
      this.crawlSwingTo.x += dir.x * reach + this.right.x * next * 0.035;
      this.crawlSwingTo.z += dir.z * reach + this.right.z * next * 0.035;
      const p = { x: this.crawlSwingTo.x, z: this.crawlSwingTo.z };
      this.world.resolveCircle(p, 0.12, 0);
      this.crawlSwingTo.x = p.x;
      this.crawlSwingTo.z = p.z;
      this.crawlSwingTo.y = this.world.sampleGround(p.x, p.z, 0.4) + 0.055;
    }

    const u = clamp(this.crawlSwingT, 0, 1);
    const ease = u * u * (3 - 2 * u);
    const swingL = this.crawlSwingSide < 0 && lArm;
    const swingR = this.crawlSwingSide > 0 && rArm;
    _braceA.copy(this.crawlPlantL);
    _braceB.copy(this.crawlPlantR);
    if (swingL) {
      _braceA.lerpVectors(this.crawlSwingFrom, this.crawlSwingTo, ease);
      _braceA.y += Math.sin(Math.PI * u) * 0.1;
    }
    if (swingR) {
      _braceB.lerpVectors(this.crawlSwingFrom, this.crawlSwingTo, ease);
      _braceB.y += Math.sin(Math.PI * u) * 0.1;
    }

    // The support centre is where the hands actually are. Drawing the chest
    // toward it is the pulling action; the body follows only as far as the
    // links and arm strength allow.
    let sx = 0;
    let sz = 0;
    let n = 0;
    if (lArm) { sx += _braceA.x; sz += _braceA.z; n++; }
    if (rArm) { sx += _braceB.x; sz += _braceB.z; n++; }
    sx /= Math.max(1, n);
    sz /= Math.max(1, n);
    const pull = (0.12 + Math.sin(this.crawlSwingT * Math.PI) * 0.045) * (oneArm ? 0.84 : 1);
    // With one arm the body has to roll over that side to keep the load line
    // inside its support, instead of floating straight ahead like a two-arm
    // hand-over-hand crawl.
    const armBias = oneArm ? (lArm ? -1 : 1) : 0;
    // The torso has to stay high enough that the planted hands, not the
    // sternum, carry the upper body. This is what makes the motion read as a
    // human crawl instead of a flat drag.
    _chestTarget.set(sx - dir.x * pull, ground + 0.42, sz - dir.z * pull);
    _chestTarget.addScaledVector(this.right, armBias * 0.035);
    _pelvisTarget.set(_chestTarget.x - dir.x * 0.31, ground + 0.26, _chestTarget.z - dir.z * 0.31);
    _pelvisTarget.addScaledVector(this.right, armBias * 0.022);
    _pelvisTarget.y = Math.min(_pelvisTarget.y, ground + 0.28);
    const support = clamp(strength * 3.4, 0.9, 3.8);
    this.setMotor('pelvis', _pelvisTarget, support * 1.25, 2.6);
    this.setMotor('chest', _chestTarget, support * 2.1, 3.0);

    _headTarget.set(chest.x + dir.x * 0.30, ground + 0.50, chest.z + dir.z * 0.30);
    _headTarget.y += Math.sin(this.nervous.pain * 2.1) * 0.008;
    this.setMotor('neck', _headTarget, support * 0.82, 2.4);
    this.setMotor('head', _headTarget, support * 0.9, 2.6);

    for (const side of [-1, 1]) {
      if (side < 0 ? !lArm : !rArm) continue;
      const shoulderName = side < 0 ? 'lShoulder' : 'rShoulder';
      const wear = side < 0 ? armWearL : armWearR;
      const target = side < 0 ? _braceA : _braceB;
      const swinging = side < 0 ? swingL : swingR;
      _handTarget.copy(target);
      if (!swinging) _handTarget.addScaledVector(dir, -0.018);
      _handTarget.y = Math.max(_handTarget.y, ground + 0.045);
      _handTarget.x += Math.sin(this.neuro.swayPhase + side) * 0.003;
      _handTarget.z += Math.cos(this.neuro.swayPhase * 1.3 + side) * 0.003;
      _shoulderCrawl.copy(_chestTarget).addScaledVector(this.right, side * 0.19);
      _shoulderCrawl.addScaledVector(dir, 0.08);
      _shoulderCrawl.y -= 0.03;
      this.setMotor(shoulderName, _shoulderCrawl, strength * 0.78, 2.2);
      this.applyArmTarget(
        side,
        _handTarget,
        armStrength * wear * strength * (swinging ? 1.2 : 1.06) * 2.1,
        swinging ? 5.4 : 7.2,
      );
    }

    // A remaining leg can hook the floor and add push, but it never drives the
    // root directly. With no legs, both hips are simply dragged.
    for (const side of [-1, 1]) {
      const hipName = side < 0 ? 'lHip' : 'rHip';
      const kneeName = side < 0 ? 'lKnee' : 'rKnee';
      const footName = side < 0 ? 'lFoot' : 'rFoot';
      if (!this.bones[hipName].alive || !this.bones[kneeName].alive || !this.bones[footName].alive) continue;
      const t = (this.crawlSwingT + (side > 0 ? 0.5 : 0)) % 1;
      const push = Math.sin(t * Math.PI * 2) * 0.06;
      _getUpHip.copy(_pelvisTarget).addScaledVector(this.right, side * 0.09);
      _getUpFoot.set(
        _pelvisTarget.x - dir.x * (0.24 + push) + this.right.x * side * 0.1,
        ground + 0.075,
        _pelvisTarget.z - dir.z * (0.24 + push) + this.right.z * side * 0.1,
      );
      this.applyLegTarget(
        side,
        _getUpHip,
        _getUpFoot,
        legStrength * (side < 0 ? legWearL : legWearR) * strength * (this.legsLost === 1 ? 0.4 : 0.62),
      );
    }

    this.balanceError = 0.32;
    this.balanceConfidence = 0.12;
    this.stepSide = 0;
    this.stableT = 0;
  }

  /**
   * Terminal resting posture. No get-up cycling, no limb flapping: the body
   * keeps its airway clear and supports the wounded area while it waits. If it
   * has arms but cannot walk, the crawl controller is used instead.
   */
  controlDowned(dt, core, armStrength, armWearL, armWearR) {
    const pelvis = this.bones.pelvis.position;
    // This is a resting pose, not a worm gait. Anchor it to where the body went
    // down; targeting a point ahead of the current pelvis lets even a limbless
    // torso slowly pull itself across the floor one frame at a time.
    const anchor = this.recoveryAnchor;
    if (Math.hypot(anchor.x - pelvis.x, anchor.z - pelvis.z) > 0.12) {
      anchor.set(pelvis.x, 0, pelvis.z);
      this.recoveryAnchorFresh = true;
    }
    const ground = this.world.sampleGround(anchor.x, anchor.z, pelvis.y);
    const strength = clamp(core * (0.45 + this.bloodPressure * 0.3), 0.12, 0.72);
    const breath = Math.sin(this.time * 1.35) * 0.006;
    _pelvisTarget.set(anchor.x, ground + 0.135, anchor.z);
    _chestTarget.set(anchor.x + this.forward.x * 0.34, ground + 0.29 + breath, anchor.z + this.forward.z * 0.34);
    this.setMotor('pelvis', _pelvisTarget, strength * 0.55, 1.1);
    this.setMotor('chest', _chestTarget, strength * 0.62, 1.35);
    _headTarget.set(anchor.x + this.forward.x * 0.44, ground + 0.37 + breath, anchor.z + this.forward.z * 0.44);
    this.setMotor('neck', _headTarget, strength * 0.46, 1.5);
    this.setMotor('head', _headTarget, strength * 0.5, 1.6);

    // A limp body on concrete should smear to a stop, not glide. The motors
    // above hold the pose; this is the horizontal friction the contact solver
    // cannot supply from a few isolated particles.
    const grip = Math.min(0.35, dt * 10);
    for (const name in this.bones) {
      const bone = this.bones[name];
      if (!bone.alive || bone.kinematic) continue;
      bone.prev.x += (bone.position.x - bone.prev.x) * grip;
      bone.prev.z += (bone.position.z - bone.prev.z) * grip;
    }

    let woundSide = 0;
    const protectWound = this.primaryWound?.zone !== 'pelvis';
    if (protectWound && this.primaryWound?.part?.mesh && !this.primaryWound.part.destroyed) {
      this.primaryWound.part.mesh.updateMatrixWorld();
      _woundTarget.copy(this.primaryWound.local).applyMatrix4(this.primaryWound.part.mesh.matrixWorld);
      if (!Number.isFinite(_woundTarget.x) || !Number.isFinite(_woundTarget.y) || !Number.isFinite(_woundTarget.z)) {
        _woundTarget.copy(this.bones.chest.position);
      }
      woundSide = this.primaryWound.side || this.guardSide;
      const side = this.bones[woundSide < 0 ? 'lHand' : 'rHand'].alive ? woundSide : -woundSide;
      if (this.bones[side < 0 ? 'lHand' : 'rHand'].alive) {
        _handTarget.copy(_woundTarget);
        _handTarget.addScaledVector(this.right, side * 0.03);
        this.setMotor(side < 0 ? 'lShoulder' : 'rShoulder', _chestTarget, strength * 0.4, 1.5);
        this.applyArmTarget(side, _handTarget, armStrength * (side < 0 ? armWearL : armWearR) * 0.48, 2.2);
      }
    }
    for (const side of [-1, 1]) {
      if (side === woundSide) continue;
      if (!this.bones[side < 0 ? 'lElbow' : 'rElbow'].alive) continue;
      _handTarget.copy(_chestTarget).addScaledVector(this.right, side * 0.3);
      _handTarget.addScaledVector(this.forward, 0.04);
      _handTarget.y = ground + 0.07;
      this.setMotor(side < 0 ? 'lShoulder' : 'rShoulder', _chestTarget, strength * 0.32, 1.3);
      this.applyArmTarget(side, _handTarget, armStrength * (side < 0 ? armWearL : armWearR) * 0.24, 1.6);
    }
    this.balanceError = 0.5;
    this.balanceConfidence = 0;
    this.stableT = 0;
    this.stepSide = 0;
  }

  /** Choose the support side and the room for this particular fall. */
  initRecoveryPlan() {
    const pelvis = this.bones.pelvis.position;
    const chest = this.bones.chest.position;
    this.captureRecoveryAnchor();
    const head = this.bones.head.position;
    const lShoulder = this.bones.lShoulder.position;
    const rShoulder = this.bones.rShoulder.position;
    this.recoveryStartL.copy(this.bones.lFoot.position);
    this.recoveryStartR.copy(this.bones.rFoot.position);
    _getUpSpine.subVectors(chest, pelvis);
    _getUpShoulder.subVectors(rShoulder, lShoulder);
    _getUpFront.crossVectors(_getUpShoulder, _getUpSpine);
    if (_getUpFront.lengthSq() > 1e-7) _getUpFront.normalize();
    else _getUpFront.set(0, 0, 1);
    // The chest normal points up when the body is supine, down when prone and
    // sideways when it is lying on a shoulder. That single measurement changes
    // where the hands first reach and which side takes the knee.
    this.recoveryFaceUp = _getUpFront.y > 0.16;
    this.recoverySideLying =
      Math.abs(_getUpFront.y) <= 0.16 && Math.abs(_getUpShoulder.y) > 0.065;
    this.recoveryRoll =
      _getUpFront.x * this.right.x + _getUpFront.z * this.right.z >= 0 ? 1 : -1;
    this.recoveryKneeSide = this.neuro.guard;
    this.recoveryFootSide = -this.recoveryKneeSide;

    this.recoveryDir.copy(this.forward).setY(0);
    if (this.recoveryDir.lengthSq() < 1e-5) this.recoveryDir.set(0, 0, 1);
    this.recoveryDir.normalize();
    _getUpHeadDir.set(head.x - pelvis.x, 0, head.z - pelvis.z);
    if (!this.recoveryFaceUp && _getUpHeadDir.lengthSq() > 0.035) {
      _getUpHeadDir.normalize();
      if (_getUpHeadDir.dot(this.recoveryDir) < -0.2) this.recoveryDir.copy(_getUpHeadDir);
    }

    const f = this.recoveryDir;
    const r = this.right;
    const anchor = this.recoveryAnchor;
    const frontOffset = 0.28 + Math.random() * 0.05;
    const rearOffset = 0.12 + Math.random() * 0.04;
    _getUpAux.set(
      anchor.x + f.x * frontOffset + r.x * this.recoveryFootSide * 0.145,
      0,
      anchor.z + f.z * frontOffset + r.z * this.recoveryFootSide * 0.145,
    );
    _getUpAux2.set(
      anchor.x - f.x * rearOffset + r.x * this.recoveryKneeSide * 0.135,
      0,
      anchor.z - f.z * rearOffset + r.z * this.recoveryKneeSide * 0.135,
    );
    for (const target of [_getUpAux, _getUpAux2]) {
      const flat = { x: target.x, z: target.z };
      this.world.resolveCircle(flat, 0.14, 0);
      target.x = flat.x;
      target.z = flat.z;
      target.y = this.world.sampleGround(target.x, target.z, 0.4) + 0.08;
    }
    if (this.recoveryFootSide < 0) {
      this.recoveryPlantL.copy(_getUpAux);
      this.recoveryPlantR.copy(_getUpAux2);
    } else {
      this.recoveryPlantL.copy(_getUpAux2);
      this.recoveryPlantR.copy(_getUpAux);
    }
    this.recoveryPlanReady = true;
  }

  /**
   * A complete physical get-up. The support polygon changes in stages:
   * both hands -> one hand and both knees -> one hand, one planted foot and a
   * trailing knee -> both feet. Every target is world-space; the solver is
   * still free to fail, so this cannot teleport the body upright.
   */
  controlRecovery(dt, core, armStrength, legStrength, canFeet, armWearL, armWearR, legWearL, legWearR) {
    const pelvis = this.bones.pelvis.position;
    const chest = this.bones.chest.position;
    const ground = this.world.sampleGround(pelvis.x, pelvis.z, pelvis.y);
    if (!this.recoveryPlanReady) this.initRecoveryPlan();
    const rise = this.recoveryCapable ? this.recoveryRise : 0;
    const dir = this.recoveryDir;
    const right = this.right;
    const anchor = this.recoveryAnchor;
    const smooth = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / Math.max(0.001, b - a)));
      return t * t * (3 - 2 * t);
    };

    // Hips stay low until the hands have actually reached the floor. This is
    // the difference between pushing the torso up and levitating it.
    const handLow = Math.min(
      this.bones.lHand.position.y,
      this.bones.rHand.position.y,
    ) - ground;
    let targetPelvisY;
    let targetChestY;
    let shift;
    if (rise < 0.18) {
      const p = rise / 0.18;
      targetPelvisY = ground + 0.135 + p * 0.025;
      targetChestY = ground + 0.28 + p * 0.06;
      shift = 0.03;
    } else if (rise < 0.42) {
      const p = (rise - 0.18) / 0.24;
      targetPelvisY = ground + 0.16 + p * 0.075;
      targetChestY = ground + 0.34 + p * 0.2;
      shift = 0.05 + p * 0.05;
    } else if (rise < 0.68) {
      const p = (rise - 0.42) / 0.26;
      targetPelvisY = ground + 0.235 + p * 0.155;
      targetChestY = ground + 0.54 + p * 0.23;
      shift = 0.1 + p * 0.045;
    } else if (rise < 0.86) {
      const p = (rise - 0.68) / 0.18;
      targetPelvisY = ground + 0.39 + p * 0.29;
      targetChestY = ground + 0.77 + p * 0.21;
      shift = 0.145 + p * 0.02;
    } else {
      // The last quarter is a real leg-drive to standing height, not a hold at
      // the top of the kneel. The chest rises faster than the pelvis so the
      // torso straightens out of its forward fold as the hips come over the
      // planted feet.
      const p = (rise - 0.86) / 0.14;
      targetPelvisY = ground + 0.68 + p * 0.24;
      targetChestY = targetPelvisY + 0.3 + p * 0.13;
      shift = 0.165 - p * 0.1;
    }
    if (rise < 0.46) {
      const brace = 1 - Math.max(0, Math.min(1, (handLow - 0.04) / 0.34));
      targetPelvisY = Math.min(targetPelvisY, ground + 0.145 + brace * 0.105);
    }

    const rollShift = this.recoveryFaceUp
      ? this.recoveryRoll * (0.045 * (1 - rise))
      : this.recoverySideLying
        ? this.recoveryRoll * (0.025 * (1 - rise))
        : 0;
    _pelvisTarget.set(
      anchor.x + dir.x * (0.015 + rise * 0.085) + right.x * rollShift,
      targetPelvisY,
      anchor.z + dir.z * (0.015 + rise * 0.085) + right.z * rollShift,
    );
    this.setMotor('pelvis', _pelvisTarget, core * (0.62 + rise * 1.05), 1.05 + rise * 2.6);
    _chestTarget.set(
      anchor.x + dir.x * (shift + 0.035) + right.x * rollShift * 0.55,
      targetChestY,
      anchor.z + dir.z * (shift + 0.035) + right.z * rollShift * 0.55,
    );
    this.setMotor('chest', _chestTarget, core * (2.0 + rise * 0.45), 3.2 + rise * 0.9);
    _headTarget.copy(_chestTarget).addScaledVector(dir, 0.035 + rise * 0.035);
    _headTarget.y += 0.2 + rise * 0.025;
    _getUpGround.copy(_chestTarget).addScaledVector(dir, 0.015);
    _getUpGround.y += 0.105;
    this.setMotor('neck', _getUpGround, core * (1.45 + rise * 0.35), 2.7);
    this.setMotor('head', _headTarget, core * (1.3 + rise * 0.35), 2.9);

    // Feet: the forward foot is lifted and planted first. The trailing foot
    // follows while the knee is down. Once planted their targets never move,
    // which removes the old get-up foot skating.
    if (canFeet && rise >= 0.08) {
      for (const side of [-1, 1]) {
        const footBone = this.bones[side < 0 ? 'lFoot' : 'rFoot'];
        const kneeBone = this.bones[side < 0 ? 'lKnee' : 'rKnee'];
        if (!footBone.alive || !kneeBone.alive) continue;
        const front = side === this.recoveryFootSide;
        const plant = side < 0 ? this.recoveryPlantL : this.recoveryPlantR;
        const start = side < 0 ? this.recoveryStartL : this.recoveryStartR;
        const stepStart = front ? 0.16 : 0.3;
        const stepEnd = front ? 0.42 : 0.6;
        const u = smooth(stepStart, stepEnd, rise);
        _getUpFoot.copy(start).lerp(plant, u);
        const footGround = this.world.sampleGround(_getUpFoot.x, _getUpFoot.z, 0.4);
        _getUpFoot.y = footGround + 0.08 + Math.sin(Math.PI * u) * (front ? 0.17 : 0.1);
        _getUpHip.copy(_pelvisTarget).addScaledVector(right, side * 0.085);
        _getUpHip.y -= 0.015;
        // Planted feet need a firmer motor than a walking stride: the rising
        // pelvis otherwise drags the foot bones across the floor.
        this.applyLegTarget(
          side,
          _getUpHip,
          _getUpFoot,
          legStrength * (side < 0 ? legWearL : legWearR) * (1.05 + rise * 1.25),
          5.8,
        );
        // The trailing knee carries the body during the one-knee stage. This
        // explicit contact is what keeps the pelvis from floating above it.
        if (!front && rise >= 0.3 && rise < 0.72) {
          _getUpAux.set(
            anchor.x + dir.x * 0.02 + right.x * this.recoveryKneeSide * 0.135,
            ground + 0.07,
            anchor.z + dir.z * 0.02 + right.z * this.recoveryKneeSide * 0.135,
          );
          this.setMotor(
            side < 0 ? 'lKnee' : 'rKnee',
            _getUpAux,
            legStrength * (side < 0 ? legWearL : legWearR) * 1.15,
            4.1,
          );
        }
      }
    }

    // Arms brace first, then the free hand moves to the planted knee while the
    // support hand keeps taking weight. Only at the end do both arms release.
    const supportSide = this.recoveryKneeSide;
    for (const side of [-1, 1]) {
      const shoulderName = side < 0 ? 'lShoulder' : 'rShoulder';
      if (!this.bones[shoulderName].alive) continue;
      const target = side < 0 ? _getUpHand : _getUpHandB;
      if (rise < 0.42) {
        const handSide = this.recoveryFaceUp
          ? side === this.recoveryRoll
            ? 0.3
            : 0.065
          : this.recoverySideLying
            ? side === this.recoveryRoll
              ? 0.25
              : 0.12
            : 0.16;
        target.set(
          anchor.x + dir.x * (this.recoveryFaceUp ? 0.02 : 0.25) + right.x * side * handSide,
          ground + 0.055,
          anchor.z + dir.z * (this.recoveryFaceUp ? 0.02 : 0.25) + right.z * side * handSide,
        );
      } else if (rise < 0.8) {
        if (side === supportSide) {
          target.set(
            anchor.x + dir.x * 0.14 + right.x * side * 0.25,
            ground + 0.055,
            anchor.z + dir.z * 0.14 + right.z * side * 0.25,
          );
        } else {
          const frontPlant = this.recoveryFootSide < 0 ? this.recoveryPlantL : this.recoveryPlantR;
          target.set(frontPlant.x, ground + 0.28, frontPlant.z);
        }
      } else {
        target.copy(_chestTarget);
        target.addScaledVector(right, side * (0.23 + (rise - 0.8) * 0.2));
        target.addScaledVector(dir, 0.08);
        target.y -= 0.13;
      }
      _getUpGround.copy(_chestTarget).addScaledVector(right, side * 0.17);
      _getUpGround.y -= 0.02;
      this.setMotor(shoulderName, _getUpGround, core * (0.62 + rise * 0.3), 1.9);
      this.applyArmTarget(
        side,
        target,
        armStrength * (side < 0 ? armWearL : armWearR) * (rise < 0.8 ? 1.35 : 0.75),
        rise < 0.8 ? 5.4 : 2.8,
      );
    }

    const footX = (this.bones.lFoot.position.x + this.bones.rFoot.position.x) * 0.5;
    const footZ = (this.bones.lFoot.position.z + this.bones.rFoot.position.z) * 0.5;
    this.balanceError = Math.hypot(this.com.x - footX, this.com.z - footZ);
    this.balanceConfidence = clamp(1 - this.balanceError * 1.7, 0, 1);
  }

  /**
   * Kneel, then plead. No locomotion, no idle animation and no scripted root
   * translation: the hips come down over the knees and the hands meet at the
   * chest while the head tracks the player.
   */
  controlCritical(dt, core, armStrength, legStrength, armWearL, armWearR, legWearL, legWearR) {
    const pelvis = this.bones.pelvis.position;
    const chest = this.bones.chest.position;
    const ground = this.world.sampleGround(pelvis.x, pelvis.z, pelvis.y);
    const t = this.criticalT;
    const smooth = (a, b, x) => {
      const s = Math.max(0, Math.min(1, (x - a) / Math.max(0.001, b - a)));
      return s * s * (3 - 2 * s);
    };
    const kneel = smooth(0.04, 1.55, t);
    const pray = smooth(1.1, 2.65, t);
    this.criticalPray = pray;
    if (
      t < 0.06 ||
      Math.hypot(this.recoveryAnchor.x - pelvis.x, this.recoveryAnchor.z - pelvis.z) > 0.28
    ) {
      this.captureRecoveryAnchor();
    }
    const anchor = this.recoveryAnchor;
    _getUpAux.copy(this.playerPos).sub(chest);
    _getUpAux.y = 0;
    if (_getUpAux.lengthSq() < 0.09) _getUpAux.copy(this.forward);
    _getUpAux.normalize();
    const look = _getUpAux;
    const sway = Math.sin(this.time * 1.55 + this.neuro.swayPhase) * 0.025;
    const tremble = Math.sin(this.time * 9.2 + this.neuro.swayPhase) * 0.006;

    const pelvisY = ground + 0.135 + kneel * 0.205;
    const chestY = ground + 0.245 + kneel * 0.475 + Math.sin(this.time * 1.2) * 0.004;
    _pelvisTarget.set(
      anchor.x + look.x * (0.015 + kneel * 0.045),
      pelvisY,
      anchor.z + look.z * (0.015 + kneel * 0.045),
    );
    _pelvisTarget.addScaledVector(this.right, sway * 0.35);
    this.setMotor('pelvis', _pelvisTarget, core * (0.7 + kneel * 0.55), 2.2);
    _chestTarget.set(
      anchor.x + look.x * (0.04 + kneel * 0.08) + this.right.x * sway,
      chestY,
      anchor.z + look.z * (0.04 + kneel * 0.08) + this.right.z * sway,
    );
    this.setMotor('chest', _chestTarget, core * (2.25 + pray * 0.25), 3.4);

    const headNod = Math.sin(this.time * 2.5) * 0.014 * pray;
    _headTarget.copy(_chestTarget).addScaledVector(look, 0.13 + pray * 0.035);
    _headTarget.y = chest.y + 0.21 + headNod;
    _headTarget.addScaledVector(this.right, sway * 0.5);
    _getUpGround.copy(_chestTarget).addScaledVector(look, 0.075);
    _getUpGround.y = chest.y + 0.105;
    this.setMotor('neck', _getUpGround, core * 1.55, 2.9);
    this.setMotor('head', _headTarget, core * 1.45, 3.1);

    // Both knees take the floor, with the feet folded behind for a stable base.
    for (const side of [-1, 1]) {
      const footName = side < 0 ? 'lFoot' : 'rFoot';
      const kneeName = side < 0 ? 'lKnee' : 'rKnee';
      if (!this.bones[footName].alive || !this.bones[kneeName].alive) continue;
      _getUpFoot.set(
        anchor.x - look.x * (0.19 + side * 0.012) + this.right.x * side * 0.145,
        0,
        anchor.z - look.z * (0.19 + side * 0.012) + this.right.z * side * 0.145,
      );
      const flat = { x: _getUpFoot.x, z: _getUpFoot.z };
      this.world.resolveCircle(flat, 0.13, 0);
      _getUpFoot.x = flat.x;
      _getUpFoot.z = flat.z;
      _getUpFoot.y = this.world.sampleGround(_getUpFoot.x, _getUpFoot.z, 0.4) + 0.08;
      _getUpHip.copy(_pelvisTarget).addScaledVector(this.right, side * 0.085);
      _getUpHip.y -= 0.01;
      this.applyLegTarget(
        side,
        _getUpHip,
        _getUpFoot,
        legStrength * (side < 0 ? legWearL : legWearR) * 1.12,
      );
      _getUpAux2.set(
        anchor.x + this.right.x * side * 0.12 - look.x * 0.065,
        ground + 0.07,
        anchor.z + this.right.z * side * 0.12 - look.z * 0.065,
      );
      this.setMotor(
        kneeName,
        _getUpAux2,
        legStrength * (side < 0 ? legWearL : legWearR) * 1.1,
        4.2,
      );
    }

    // Hands begin on the floor while the body folds down, then meet in front of
    // the chest and face. The elbows stay bent rather than locking straight.
    for (const side of [-1, 1]) {
      if (!this.bones[side < 0 ? 'lHand' : 'rHand'].alive) continue;
      const target = side < 0 ? _getUpHand : _getUpHandB;
      const groundX = anchor.x + look.x * 0.15 + this.right.x * side * 0.18;
      const groundZ = anchor.z + look.z * 0.15 + this.right.z * side * 0.18;
      target.set(
        groundX * (1 - pray) +
          (_chestTarget.x + look.x * 0.24 + this.right.x * side * 0.028) * pray +
          tremble * pray,
        ground + 0.055 + pray * (chest.y + 0.095 - ground - 0.055),
        groundZ * (1 - pray) +
          (_chestTarget.z + look.z * 0.24 + this.right.z * side * 0.028) * pray,
      );
      _getUpGround.copy(_chestTarget).addScaledVector(this.right, side * 0.155);
      _getUpGround.y = chest.y - 0.01;
      this.setMotor(
        side < 0 ? 'lShoulder' : 'rShoulder',
        _getUpGround,
        core * 0.75,
        2.1,
      );
      this.applyArmTarget(
        side,
        target,
        armStrength * (side < 0 ? armWearL : armWearR) * (1.2 + pray * 0.5),
        4.8,
      );
    }

    this.physicalMode = 'critical';
    this.physicalDown = true;
    this.balanceError = 0.22;
    this.balanceConfidence = 0.15;
    this.stableT = 0;
    this.stepSide = 0;
  }

  updateCorpse(dt) {
    if (this.ragdollSleeping) {
      // A settled body no longer needs joint solving, but open vessels still
      // drain and stain the floor until the finite supply runs out.
      this.bleed(dt);
      return;
    }
    this.deathTime += dt;
    this.reactionT += dt;

    // Passive corpse: no muscle servo, no balance target, no crawl/recovery,
    // no wound guard and no twitch. Only gravity, contacts, joint limits and
    // external impulses are allowed to move the body.
    this.muscle = 0;
    this.euphoriaT = 0;
    this.clearMotors();
    for (const l of this.links) {
      if (l.enabled) l.stiffness = l.baseStiffness ?? 1;
    }

    // Circulation continues changing after death: pressure collapses, arterial
    // jets stop, and remaining blood drains slowly into the pool.
    this.bleed(dt);

    // Awake bodies keep making small, physical corrections for a long time.
    // Only after the motor storm dies down do they sleep, and a sleeping body
    // remains fully shootable: the next hit wakes the solver again.
    let motion = 0;
    for (const name in this.bones) {
      const p = this.bones[name];
      if (p.alive) motion = Math.max(motion, p.position.distanceTo(p.prev));
    }
    // A corpse resting on stiff joint limits can twitch by a millimetre at the
    // contacts without actually travelling. Use a travel threshold rather than
    // leaving it awake for the full 24 second watchdog.
    if (this.deathTime > 7 && motion < 0.0045) this.ragdollIdle += dt;
    else this.ragdollIdle = 0;
    if (this.ragdollIdle > 1.4 || this.reactionT > 24) this.sleepRagdoll();
  }

  sleepRagdoll() {
    if (this.ragdollSleeping) return;
    this.ragdollSleeping = true;
    this.ragdollAwake = false;
    this.physicsDriven = false;
    this.initialDeath = false;
    this.frozen = true;
    this.muscle = 0;
    this.euphoriaT = 0;
    this.clearMotors();
    for (const name in this.bones) {
      const p = this.bones[name];
      if (!p.alive) continue;
      p.kinematic = true;
      p.invMass = 0;
      p.prev.copy(p.position);
    }
    for (const l of this.links) l.enabled = false;
    this.updateMeshes();
  }

  /** Push the simulated skeleton to the render meshes after the solver runs. */
  afterPhysics() {
    this.frameHitCount = 0;
    this.impulseStackScale = 1;
    if (!this.physicsDriven) return;
    this.updateMeshes();
    if (this.dead) return;
    const pelvis = this.bones.pelvis.position;
    const p = { x: pelvis.x, z: pelvis.z };
    this.world.resolveCircle(p, 0.3, 0);
    this.position.x = p.x;
    this.position.z = p.z;
    this.position.y = 0;
    if (this.activeRagdoll) {
      // Facing is AI/movement intent. Reading it back from shoulder positions
      // creates a feedback loop with the balance controller.
      this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    }
  }

  dispose() {
    disposeSkeleton(this);
    if (this.gunMesh) {
      this.scene.remove(this.gunMesh);
      for (const child of this.gunMesh.children) child.geometry.dispose();
      this.gunMesh = null;
    }
    if (this.meleeMesh) {
      this.scene.remove(this.meleeMesh);
      for (const child of this.meleeMesh.children) child.geometry?.dispose?.();
      this.meleeMesh = null;
    }
    for (const part of this.parts) {
      if (part.mesh) {
        this.scene.remove(part.mesh);
        part.mesh.geometry.dispose();
      }
    }
    this.parts = [];
    if (this.corpseMesh) {
      this.scene.remove(this.corpseMesh);
      this.corpseMesh.geometry.dispose();
      this.corpseMesh = null;
    }
    for (const name in this.bones) {
      const p = this.bones[name];
      p.alive = false;
      p.invMass = 0;
      p.kinematic = true;
      p.motorStrength = 0;
    }
    for (const l of this.links) l.enabled = false;
    this.physicsDriven = false;
  }
}
