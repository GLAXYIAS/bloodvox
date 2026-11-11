import * as THREE from 'three';
import { reloadSpecFor, reloadDurationFor } from './reload.js';
import { applyWeaponMods, attachmentById, isAttachmentCompatible, weaponMounts, weaponModSlots } from './attachments.js';
import { GAME_SETTINGS } from './settings.js';

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _meleeUp = new THREE.Vector3();

const smoothStep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / Math.max(0.001, b - a)));
  return t * t * (3 - 2 * t);
};

export const WEAPONS = [
  {
    id: 'pistol',
    name: 'GLOCK 17',
    magSize: 12,
    damage: 34,
    cooldown: 0.145,
    spread: 0.004,
    pellets: 1,
    reload: 1.35,
    auto: false,
    ap: 0.15,
    force: 0.3,
    kick: 0.02,
    recoil: 1,
    hold: [0.21, -0.2, -0.42],
    muzzleZ: -0.33,
    flashSize: 0.95,
    flashLight: 8,
  },
  {
    id: 'smg',
    name: 'HK MP5A3',
    magSize: 30,
    damage: 22,
    cooldown: 0.075,
    spread: 0.012,
    pellets: 1,
    reload: 1.75,
    auto: true,
    ap: 0.22,
    force: 0.2,
    kick: 0.008,
    recoil: 0.6,
    hold: [0.2, -0.21, -0.38],
    muzzleZ: -0.45,
    flashSize: 0.75,
    flashLight: 7,
  },
  {
    id: 'shotgun',
    name: 'REMINGTON 870',
    magSize: 6,
    damage: 23,
    cooldown: 0.7,
    spread: 0.07,
    pellets: 9,
    reload: 2.3,
    auto: false,
    ap: 0.12,
    force: 1.25,
    kick: 0.065,
    recoil: 2.4,
    hold: [0.2, -0.23, -0.44],
    muzzleZ: -0.62,
    flashSize: 1.7,
    flashLight: 16,
    adsFov: 58,
    falloff: { start: 6, end: 24, min: 0.32 },
  },
  {
    id: 'rifle',
    name: 'REMINGTON 700',
    magSize: 10,
    damage: 82,
    cooldown: 0.34,
    spread: 0.003,
    pellets: 1,
    reload: 1.9,
    auto: false,
    ap: 0.92,
    force: 0.8,
    kick: 0.038,
    recoil: 1.8,
    hold: [0.2, -0.22, -0.42],
    muzzleZ: -0.64,
    flashSize: 1.15,
    flashLight: 12,
    scope: true,
    adsFov: 34,
  },
  {
    id: 'magnum',
    name: 'COLT PYTHON',
    magSize: 6,
    damage: 130,
    cooldown: 0.6,
    spread: 0.0035,
    pellets: 1,
    reload: 2.15,
    auto: false,
    ap: 0.55,
    force: 1.35,
    kick: 0.08,
    recoil: 3.4,
    hold: [0.21, -0.22, -0.46],
    muzzleZ: -0.44,
    flashSize: 1.5,
    flashLight: 13,
  },
  {
    id: 'lmg',
    name: 'M249 SAW',
    magSize: 45,
    damage: 26,
    cooldown: 0.09,
    spread: 0.015,
    pellets: 1,
    reload: 3.2,
    auto: true,
    ap: 0.34,
    force: 0.35,
    kick: 0.007,
    recoil: 0.85,
    hold: [0.19, -0.24, -0.34],
    muzzleZ: -0.7,
    flashSize: 1.15,
    flashLight: 11,
  },
  {
    id: 'carbine',
    name: 'M4A1',
    magSize: 20,
    damage: 36,
    cooldown: 0.125,
    spread: 0.005,
    pellets: 1,
    reload: 1.85,
    auto: true,
    ap: 0.3,
    force: 0.42,
    kick: 0.011,
    recoil: 1,
    hold: [0.2, -0.22, -0.38],
    muzzleZ: -0.63,
    flashSize: 1,
    flashLight: 9,
  },
  {
    id: 'crossbow',
    name: 'EXCALIBUR ASSASSIN',
    magSize: 1,
    damage: 118,
    cooldown: 1,
    spread: 0.0008,
    pellets: 1,
    reload: 2.6,
    auto: false,
    ap: 0.9,
    force: 1.1,
    kick: 0.025,
    recoil: 2,
    hold: [0.2, -0.2, -0.36],
    muzzleZ: -0.62,
    flashSize: 0.35,
    flashLight: 2,
    adsFov: 58,
    shell: false,
  },
  {
    id: 'sawedoff',
    name: 'STOEGER COACH GUN',
    magSize: 2,
    damage: 26,
    cooldown: 0.55,
    spread: 0.13,
    pellets: 12,
    reload: 1.9,
    auto: false,
    ap: 0.08,
    force: 1.6,
    kick: 0.095,
    recoil: 3.6,
    hold: [0.21, -0.22, -0.3],
    muzzleZ: -0.43,
    flashSize: 1.9,
    flashLight: 18,
    adsFov: 60,
    falloff: { start: 4, end: 16, min: 0.2 },
  },
  {
    id: 'minigun',
    name: 'M134 MINIGUN',
    magSize: 120,
    damage: 19,
    cooldown: 0.052,
    spread: 0.026,
    pellets: 1,
    reload: 4.4,
    auto: true,
    ap: 0.25,
    force: 0.16,
    kick: 0.004,
    recoil: 0.5,
    hold: [0.19, -0.24, -0.32],
    muzzleZ: -0.78,
    flashSize: 1.45,
    flashLight: 14,
    sound: 'lmg',
    model: 'minigun',
  },
  {
    id: 'thumper',
    name: 'M32A1 MGL',
    magSize: 6,
    damage: 30,
    cooldown: 1.05,
    spread: 0.006,
    pellets: 1,
    reload: 2.7,
    auto: false,
    ap: 1,
    force: 3.4,
    kick: 0.06,
    recoil: 2.8,
    hold: [0.18, -0.23, -0.28],
    muzzleZ: -0.56,
    flashSize: 1.2,
    flashLight: 12,
    projectile: 'grenade',
    blast: { radius: 3.8, damage: 130, force: 3.4 },
    shell: false,
    sound: 'thumper',
    model: 'thumper',
  },
  {
    id: 'impaler',
    name: 'IMPALER',
    magSize: 36,
    damage: 26,
    cooldown: 0.085,
    spread: 0.0045,
    pellets: 1,
    reload: 2.3,
    auto: true,
    ap: 0.9,
    force: 0.85,
    kick: 0.012,
    recoil: 1.2,
    hold: [0.2, -0.23, -0.36],
    muzzleZ: -0.6,
    flashSize: 0.8,
    flashLight: 8,
    sound: 'carbine',
    model: 'impaler',
  },
  {
    id: 'nailer',
    name: 'NAILER',
    magSize: 40,
    damage: 17,
    cooldown: 0.065,
    spread: 0.009,
    pellets: 1,
    reload: 1.9,
    auto: true,
    ap: 0.7,
    force: 0.38,
    kick: 0.006,
    recoil: 0.55,
    hold: [0.2, -0.22, -0.36],
    muzzleZ: -0.55,
    flashSize: 0.8,
    flashLight: 7,
    sound: 'carbine',
    model: 'nailer',
  },
  {
    id: 'scatter',
    name: 'SCATTER',
    magSize: 2,
    damage: 24,
    cooldown: 0.7,
    spread: 0.12,
    pellets: 12,
    reload: 1.65,
    auto: false,
    ap: 0.1,
    force: 2.1,
    kick: 0.11,
    recoil: 4.2,
    hold: [0.21, -0.23, -0.3],
    muzzleZ: -0.46,
    flashSize: 2.1,
    flashLight: 18,
    adsFov: 60,
    falloff: { start: 3.5, end: 14, min: 0.18 },
    sound: 'shotgun',
    model: 'scatter',
  },
  {
    id: 'hammer',
    name: 'HAMMER',
    magSize: 5,
    damage: 210,
    cooldown: 0.85,
    spread: 0.0015,
    pellets: 1,
    reload: 2.6,
    auto: false,
    ap: 1,
    force: 2.3,
    kick: 0.07,
    recoil: 3.5,
    hold: [0.2, -0.22, -0.38],
    muzzleZ: -0.68,
    flashSize: 1.6,
    flashLight: 12,
    sound: 'rifle',
    model: 'hammer',
  },
  {
    id: 'siege',
    name: 'SIEGE',
    magSize: 1,
    damage: 40,
    cooldown: 2.4,
    spread: 0.002,
    pellets: 1,
    reload: 3.6,
    auto: false,
    ap: 1,
    force: 4,
    kick: 0.13,
    recoil: 5,
    hold: [0.19, -0.24, -0.32],
    muzzleZ: -0.74,
    flashSize: 2,
    flashLight: 18,
    projectile: 'grenade',
    projectileType: 'rocket',
    projectileSpeed: 72,
    projectileGravity: 0.8,
    blast: { radius: 4.4, damage: 240, force: 5.2 },
    shell: false,
    sound: 'thumper',
    model: 'siege',
  },
];

/**
 * Melee attacks are physical contact weapons, not invisible hitscan.
 * `range` is measured from the eye, `swing` is the time the blade takes to
 * cross the screen, and `cut` selects a narrow slicing trough or a blunt crush.
 */
export const MELEE_WEAPONS = [
  {
    id: 'cleaver',
    name: 'CLEAVER',
    melee: true,
    cut: 'sharp',
    magSize: 0,
    mag: 0,
    damage: 62,
    cooldown: 0.46,
    range: 2.25,
    arc: 0.16,
    swing: 0.32,
    ap: 0.25,
    force: 0.72,
    kick: 0.012,
    recoil: 0.8,
    hold: [0.23, -0.22, -0.34],
    muzzleZ: -0.48,
    flashSize: 0.2,
    flashLight: 0,
    reload: 0,
    auto: false,
    spread: 0,
    pellets: 1,
    shell: false,
    sound: 'blade',
  },
  {
    id: 'maul',
    name: 'MAUL',
    melee: true,
    cut: 'blunt',
    magSize: 0,
    mag: 0,
    damage: 132,
    cooldown: 0.96,
    range: 2.55,
    arc: 0.13,
    swing: 0.5,
    ap: 0.7,
    force: 2.3,
    kick: 0.04,
    recoil: 2.2,
    hold: [0.21, -0.24, -0.3],
    muzzleZ: -0.62,
    flashSize: 0.2,
    flashLight: 0,
    reload: 0,
    auto: false,
    spread: 0,
    pellets: 1,
    shell: false,
    sound: 'maul',
  },
  {
    id: 'sword',
    name: 'LONGSWORD',
    melee: true,
    cut: 'sharp',
    magSize: 0,
    mag: 0,
    damage: 94,
    cooldown: 0.62,
    range: 2.68,
    arc: 0.2,
    swing: 0.5,
    styles: ['slash', 'overhead', 'thrust'],
    ap: 0.42,
    force: 1.15,
    kick: 0.015,
    recoil: 1.15,
    hold: [0.25, -0.22, -0.4],
    muzzleZ: -1.03,
    flashSize: 0.2,
    flashLight: 0,
    reload: 0,
    auto: false,
    spread: 0,
    pellets: 1,
    shell: false,
    block: true,
    sound: 'blade',
    desc: 'Hand-forged two-handed longsword. Cut, crush or thrust through armour.',
  },
  {
    id: 'knife',
    name: 'COMBAT KNIFE',
    melee: true,
    cut: 'sharp',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 34, cooldown: 0.28, range: 1.7, arc: 0.10, swing: 0.22,
    styles: ['thrust', 'slash'], anim: 'stab', weight: 0.25, drawTime: 0.15,
    ap: 0.15, force: 0.38, kick: 0.008, recoil: 0.45,
    hold: [0.22, -0.15, -0.27], holdRot: [0.02, -0.08, -0.16], muzzleZ: -0.61,
    flashSize: 0.2, flashLight: 0, sound: 'blade',
    desc: 'A compact fighting knife with a clipped point, serrated spine and taped grip. Fast, quiet and lethal at contact range.',
  },
  {
    id: 'machete',
    name: 'MACHETE',
    melee: true,
    cut: 'sharp',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 54, cooldown: 0.40, range: 1.98, arc: 0.17, swing: 0.30,
    styles: ['slash', 'overhead'], anim: 'cleave', weight: 0.5, drawTime: 0.2,
    ap: 0.22, force: 0.70, kick: 0.014, recoil: 0.85,
    hold: [0.24, -0.19, -0.36], holdRot: [0.02, 0.04, -0.08], muzzleZ: -0.82,
    flashSize: 0.2, flashLight: 0, sound: 'blade',
    desc: 'A broad, forward-weighted jungle blade. Wide diagonal swings trade precision for reach and momentum.',
  },
  {
    id: 'baseballbat',
    name: 'BASEBALL BAT',
    melee: true,
    cut: 'blunt',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 74, cooldown: 0.62, range: 2.42, arc: 0.21, swing: 0.42,
    styles: ['slash', 'overhead'], anim: 'blunt', weight: 0.95, drawTime: 0.28,
    ap: 0.40, force: 1.7, kick: 0.028, recoil: 1.6,
    hold: [0.22, -0.24, -0.40], holdRot: [-0.02, 0.16, -0.04], muzzleZ: -0.72,
    flashSize: 0.2, flashLight: 0, sound: 'maul',
    desc: 'A taped ash bat with a swollen barrel. Long reach and heavy follow-through, but slow to recover.',
  },
  {
    id: 'crowbar',
    name: 'CROWBAR',
    melee: true,
    cut: 'blunt',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 84, cooldown: 0.78, range: 2.22, arc: 0.16, swing: 0.48,
    styles: ['overhead', 'slash'], anim: 'hook', weight: 1.05, drawTime: 0.30,
    ap: 0.55, force: 1.95, kick: 0.03, recoil: 1.7,
    hold: [0.21, -0.22, -0.34], holdRot: [0.12, 0.12, 0.05], muzzleZ: -0.70,
    flashSize: 0.2, flashLight: 0, sound: 'maul',
    desc: 'A forged wrecking bar with a hooked jaw and chisel tip. Slow, brutal blows that fold armour and cover.',
  },
  {
    id: 'fireaxe',
    name: 'FIRE AXE',
    melee: true,
    cut: 'sharp',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 112, cooldown: 0.94, range: 2.34, arc: 0.17, swing: 0.58,
    styles: ['overhead', 'slash'], anim: 'chop', weight: 1.3, drawTime: 0.36,
    ap: 0.60, force: 2.1, kick: 0.045, recoil: 2.3,
    hold: [0.24, -0.26, -0.43], holdRot: [0.06, 0.18, -0.10], muzzleZ: -0.85,
    flashSize: 0.2, flashLight: 0, sound: 'blade',
    desc: 'A full-size fire axe with a red head and pick. Deep overhead cuts with enough mass to stagger a body.',
  },
  {
    id: 'katana',
    name: 'KATANA',
    melee: true,
    cut: 'sharp',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 78, cooldown: 0.36, range: 2.80, arc: 0.19, swing: 0.28,
    styles: ['slash', 'thrust'], anim: 'katana', weight: 0.55, drawTime: 0.18,
    ap: 0.48, force: 0.85, kick: 0.012, recoil: 0.8,
    hold: [0.25, -0.20, -0.45], holdRot: [0.02, 0.30, 0.03], muzzleZ: -1.05,
    flashSize: 0.2, flashLight: 0, sound: 'blade',
    desc: 'A long, curved single-edge blade with a circular guard and wrapped grip. Precise cuts, fast recovery and exceptional reach.',
  },
  {
    id: 'sledgehammer',
    name: 'SLEDGEHAMMER',
    melee: true,
    cut: 'blunt',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 156, cooldown: 1.22, range: 2.70, arc: 0.18, swing: 0.70,
    styles: ['overhead'], anim: 'smash', weight: 1.8, drawTime: 0.42,
    ap: 0.82, force: 3.4, kick: 0.065, recoil: 3.0,
    hold: [0.20, -0.30, -0.39], holdRot: [-0.06, 0.08, -0.03], muzzleZ: -0.82,
    flashSize: 0.2, flashLight: 0, sound: 'maul',
    desc: 'A long-handled demolition sledge with a double-faced steel head. The slowest swing in the rack and the hardest impact.',
  },
  {
    id: 'tomahawk',
    name: 'TACTICAL TOMAHAWK',
    melee: true,
    cut: 'sharp',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 58, cooldown: 0.34, range: 1.90, arc: 0.13, swing: 0.26,
    styles: ['slash', 'overhead'], anim: 'quick', weight: 0.35, drawTime: 0.16,
    ap: 0.30, force: 0.90, kick: 0.010, recoil: 0.7,
    hold: [0.20, -0.16, -0.30], holdRot: [0.03, -0.04, -0.12], muzzleZ: -0.62,
    flashSize: 0.2, flashLight: 0, sound: 'blade',
    desc: 'A short tactical axe with a bearded cutting edge and rear spike. Compact chops with very little wind-up.',
  },
  {
    id: 'pipewrench',
    name: 'PIPE WRENCH',
    melee: true,
    cut: 'blunt',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 92, cooldown: 0.84, range: 2.25, arc: 0.17, swing: 0.50,
    styles: ['slash', 'overhead'], anim: 'club', weight: 1.15, drawTime: 0.30,
    ap: 0.62, force: 2.05, kick: 0.035, recoil: 1.8,
    hold: [0.24, -0.23, -0.37], holdRot: [0.08, -0.12, -0.06], muzzleZ: -0.70,
    flashSize: 0.2, flashLight: 0, sound: 'maul',
    desc: 'A heavy adjustable pipe wrench with a serrated jaw. Short, ugly swings that hit like a steel club.',
  },
  {
    id: 'baton',
    name: 'BATON',
    melee: true,
    cut: 'blunt',
    magSize: 0, mag: 0, reload: 0, auto: false, spread: 0, pellets: 1, shell: false,
    damage: 42, cooldown: 0.26, range: 1.92, arc: 0.13, swing: 0.20,
    styles: ['slash', 'thrust'], anim: 'baton', weight: 0.3, drawTime: 0.14,
    ap: 0.20, force: 0.52, kick: 0.008, recoil: 0.4,
    hold: [0.20, -0.16, -0.31], holdRot: [0.02, 0.06, -0.14], muzzleZ: -0.58,
    flashSize: 0.2, flashLight: 0, sound: 'maul', block: true,
    desc: 'A balanced expandable steel baton. Quick defensive strikes with a fast recovery and a solid guard.',
  },
];

export const GUN_WEAPONS = WEAPONS.slice();
WEAPONS.push(...MELEE_WEAPONS);
export const QUICK_MELEE = MELEE_WEAPONS[0];

/** The ten slots reached by number keys 1-0. Melee stays on F. */
export const LOADOUT_SIZE = 10;
export const DEFAULT_LOADOUT = [
  'pistol',
  'smg',
  'shotgun',
  'rifle',
  'magnum',
  'carbine',
  'sawedoff',
  'crossbow',
  'lmg',
  'minigun',
];

const BALLISTICS = {
  pistol: { speed: 335, range: 58, drop: 1 },
  smg: { speed: 390, range: 68, drop: 1 },
  shotgun: { speed: 365, range: 42, drop: 1.1 },
  rifle: { speed: 805, range: 155, drop: 1 },
  magnum: { speed: 410, range: 78, drop: 1 },
  lmg: { speed: 765, range: 135, drop: 1 },
  carbine: { speed: 725, range: 125, drop: 1 },
  crossbow: { speed: 168, range: 92, drop: 0.32 },
  sawedoff: { speed: 305, range: 27, drop: 1.15 },
  minigun: { speed: 790, range: 115, drop: 1 },
  thumper: { speed: 31, range: 140, drop: 1 },
  impaler: { speed: 905, range: 140, drop: 0.85 },
  nailer: { speed: 520, range: 85, drop: 0.9 },
  scatter: { speed: 342, range: 26, drop: 1.15 },
  hammer: { speed: 910, range: 185, drop: 0.9 },
  siege: { speed: 82, range: 180, drop: 0.5 },
};

/** Velocity, drop and useful range are weapon properties, not one ray length. */
export function ballisticSpec(weapon) {
  if (!weapon || weapon.melee || weapon.projectile) return null;
  return BALLISTICS[weapon.model || weapon.id] || { speed: 600, range: 100, drop: 1 };
}

/**
 * The black-market set: one premium replacement for every slot. These are
 * bought with kill credits and can be toggled back to the standard gun.
 */
const variant = (slot, over) => ({
  ...WEAPONS[slot],
  ...over,
  baseId: WEAPONS[slot].id,
  model: over.model || WEAPONS[slot].id,
  adsFov: over.adsFov ?? WEAPONS[slot].adsFov ?? 58,
  shopId: over.shopId,
});

export const SHOP_WEAPONS = [
  variant(0, {
    shopId: 'viper',
    id: 'viper',
    name: 'SIG SAUER P226 X-FIVE',
    price: 300,
    desc: '18-round match pistol. Fast, flat and accurate.',
    magSize: 18,
    damage: 38,
    cooldown: 0.115,
    spread: 0.0025,
    ap: 0.28,
    reload: 1.05,
    stability: 1.2,
    force: 0.32,
    kick: 0.016,
    recoil: 0.8,
    sound: 'pistol',
  }),
  variant(1, {
    shopId: 'vector',
    id: 'vector',
    name: 'KRISS VECTOR GEN II',
    price: 380,
    desc: '36-round close-quarters SMG with a vicious rate of fire.',
    magSize: 36,
    damage: 24,
    cooldown: 0.058,
    spread: 0.0105,
    ap: 0.26,
    reload: 1.5,
    kick: 0.006,
    recoil: 0.48,
    force: 0.22,
    sound: 'smg',
  }),
  variant(2, {
    shopId: 'breacher',
    id: 'breacher',
    name: 'BENELLI M4 TACTICAL',
    price: 520,
    desc: 'Eight-shell semi-auto. Ten pellets, longer reach before falloff.',
    magSize: 8,
    damage: 24,
    pellets: 10,
    cooldown: 0.7,
    spread: 0.085,
    ap: 0.16,
    reload: 2.5,
    falloff: { start: 8, end: 30, min: 0.42 },
    force: 1.35,
    sound: 'shotgun',
  }),
  variant(3, {
    shopId: 'longshot',
    id: 'longshot',
    name: 'BARRETT M107A1',
    price: 750,
    desc: 'Six-round anti-materiel rifle. Scoped, 160 damage, full penetration.',
    magSize: 6,
    damage: 160,
    cooldown: 0.8,
    spread: 0.0012,
    ap: 1,
    reload: 2.4,
    kick: 0.055,
    recoil: 2.6,
    scope: true,
    adsFov: 26,
    force: 1.85,
    sound: 'rifle',
  }),
  variant(4, {
    shopId: 'judge',
    id: 'judge',
    name: 'S&W M&P R8',
    price: 650,
    desc: 'Eight-shot hand cannon. 170 damage and enough AP to dent a vest.',
    magSize: 8,
    damage: 170,
    cooldown: 0.5,
    spread: 0.003,
    ap: 0.8,
    reload: 2.1,
    kick: 0.07,
    recoil: 3.1,
    force: 1.6,
    sound: 'magnum',
  }),
  variant(5, {
    shopId: 'vulcan',
    id: 'vulcan',
    name: 'M60E4',
    price: 800,
    desc: 'Sixty-round belt-fed LMG. Sustained fire, no apologies.',
    magSize: 60,
    damage: 25,
    cooldown: 0.062,
    spread: 0.0135,
    ap: 0.42,
    reload: 3.8,
    kick: 0.006,
    recoil: 0.75,
    force: 0.42,
    sound: 'lmg',
  }),
  variant(6, {
    shopId: 'wraith',
    id: 'wraith',
    name: 'SIG MCX SPEAR',
    price: 620,
    desc: '24-round carbine. Hard-hitting, low recoil, faster reload.',
    magSize: 24,
    damage: 46,
    cooldown: 0.105,
    spread: 0.0038,
    ap: 0.38,
    reload: 1.65,
    kick: 0.009,
    recoil: 0.85,
    force: 0.55,
    sound: 'carbine',
  }),
  variant(7, {
    shopId: 'railbow',
    id: 'railbow',
    name: 'TENPOINT NITRO XRT',
    price: 900,
    desc: 'One-bolt scoped rail crossbow. 220 damage, full penetration.',
    magSize: 1,
    damage: 220,
    cooldown: 1.1,
    spread: 0.0005,
    ap: 1,
    reload: 2.9,
    kick: 0.02,
    recoil: 1.5,
    scope: true,
    adsFov: 24,
    shell: false,
    force: 2,
    sound: 'crossbow',
  }),
  variant(8, {
    shopId: 'jackhammer',
    id: 'jackhammer',
    name: 'PANCOR JACKHAMMER',
    price: 780,
    desc: 'Six-shell automatic shotgun. Eight pellets, fearsome up close.',
    magSize: 6,
    damage: 20,
    pellets: 8,
    cooldown: 0.34,
    auto: true,
    spread: 0.11,
    ap: 0.1,
    reload: 2.4,
    kick: 0.075,
    recoil: 2.8,
    falloff: { start: 4.5, end: 18, min: 0.24 },
    force: 1.45,
    sound: 'shotgun',
  }),
  variant(9, {
    shopId: 'ripper',
    id: 'ripper',
    name: 'M134D MINIGUN',
    price: 950,
    desc: 'Twin-feed 160-round minigun. Turns a doorway into a meat grinder.',
    model: 'minigun',
    magSize: 160,
    damage: 24,
    cooldown: 0.042,
    spread: 0.021,
    ap: 0.3,
    force: 0.2,
    reload: 5,
    kick: 0.003,
    recoil: 0.42,
    sound: 'lmg',
  }),
  variant(10, {
    shopId: 'havoc',
    id: 'havoc',
    name: 'MILKOR MGL',
    price: 1150,
    desc: 'Six-shot rotary launcher. Wider blast, more shove, less mercy.',
    model: 'thumper',
    magSize: 6,
    damage: 50,
    cooldown: 0.92,
    reload: 3.2,
    force: 4.2,
    projectile: 'grenade',
    blast: { radius: 4.7, damage: 195, force: 4.5 },
    shell: false,
    sound: 'thumper',
  }),
  variant(11, {
    shopId: 'skewer',
    id: 'skewer',
    name: 'SKEWER',
    price: 1000,
    desc: 'Thirty high-velocity spikes. Punches cover and throws bodies.',
    model: 'impaler',
    magSize: 30,
    damage: 150,
    cooldown: 0.22,
    spread: 0.002,
    ap: 1,
    force: 1.7,
    reload: 2.6,
    kick: 0.018,
    recoil: 1.6,
    sound: 'rifle',
  }),
  variant(12, {
    shopId: 'hive',
    id: 'hive',
    name: 'HIVE',
    price: 980,
    desc: 'Seventy-two hardened flechettes. A swarm of armour-piercing hate.',
    model: 'nailer',
    magSize: 72,
    damage: 21,
    cooldown: 0.045,
    spread: 0.0075,
    ap: 0.86,
    force: 0.48,
    reload: 2.2,
    kick: 0.005,
    recoil: 0.48,
    sound: 'carbine',
  }),
  variant(13, {
    shopId: 'gravedigger',
    id: 'gravedigger',
    name: 'CHIAPPA TRIPLE THREAT',
    price: 1050,
    desc: 'Triple-barrel close-range cannon. Sixteen pellets and a tombstone shove.',
    model: 'scatter',
    magSize: 3,
    damage: 27,
    pellets: 16,
    cooldown: 0.62,
    spread: 0.105,
    ap: 0.14,
    force: 2.55,
    reload: 2.2,
    kick: 0.12,
    recoil: 4.6,
    falloff: { start: 4.5, end: 17, min: 0.25 },
    sound: 'shotgun',
  }),
  variant(14, {
    shopId: 'godhand',
    id: 'godhand',
    name: 'RUGER SUPER REDHAWK',
    price: 1350,
    desc: 'Six-shot hand-held artillery. 300 damage, full penetration, no follow-up needed.',
    model: 'hammer',
    magSize: 6,
    damage: 300,
    cooldown: 0.78,
    spread: 0.001,
    ap: 1,
    force: 3,
    reload: 2.9,
    kick: 0.085,
    recoil: 4.1,
    sound: 'rifle',
  }),
  variant(15, {
    shopId: 'omen',
    id: 'omen',
    name: 'OMEN',
    price: 1500,
    desc: 'Twin rocket tubes. Direct-fire warheads with a 5.4-metre kill radius.',
    model: 'siege',
    magSize: 2,
    damage: 60,
    reload: 4.1,
    cooldown: 2.1,
    force: 5.8,
    projectile: 'grenade',
    projectileType: 'rocket',
    projectileSpeed: 82,
    projectileGravity: 0.5,
    blast: { radius: 5.4, damage: 330, force: 6.2 },
    shell: false,
    sound: 'thumper',
  }),
];

/**
 * Melee stock is separate from firearm variants but uses the same weapon
 * definition shape, so purchasing, slot assignment, save/load, viewmodel and
 * hit resolution all run through the existing systems.
 */
const SWORD_SHOP = MELEE_WEAPONS.find((weapon) => weapon.id === 'sword');
const meleeShopEntry = (id, shopId, price, desc) => {
  const base = MELEE_WEAPONS.find((weapon) => weapon.id === id);
  if (!base) throw new Error(`Unknown melee weapon: ${id}`);
  return { ...base, shopId, baseId: id, price, category: 'melee', desc };
};
export const MELEE_SHOP_WEAPONS = [
  { ...SWORD_SHOP, shopId: 'longsword', baseId: 'sword', price: 450, category: 'melee', desc: 'A two-handed longsword. Chained horizontal cuts, overhead breaks and armour-piercing thrusts.' },
  meleeShopEntry('knife', 'combatknife', 180, 'A compact fighting knife with a clipped point, serrated spine and taped grip. Fast, quiet and lethal at contact range.'),
  meleeShopEntry('machete', 'machete', 260, 'A broad, forward-weighted jungle blade. Wide diagonal swings trade precision for reach and momentum.'),
  meleeShopEntry('baseballbat', 'baseballbat', 330, 'A taped ash bat with a swollen barrel. Long reach and heavy follow-through, but slow to recover.'),
  meleeShopEntry('crowbar', 'crowbar', 390, 'A forged wrecking bar with a hooked jaw and chisel tip. Slow, brutal blows that fold armour and cover.'),
  meleeShopEntry('fireaxe', 'fireaxe', 560, 'A full-size fire axe with a red head and pick. Deep overhead cuts with enough mass to stagger a body.'),
  meleeShopEntry('katana', 'katana', 620, 'A long, curved single-edge blade with a circular guard and wrapped grip. Precise cuts, fast recovery and exceptional reach.'),
  meleeShopEntry('sledgehammer', 'sledgehammer', 760, 'A long-handled demolition sledge with a double-faced steel head. The slowest swing in the rack and the hardest impact.'),
  meleeShopEntry('tomahawk', 'tomahawk', 310, 'A short tactical axe with a bearded cutting edge and rear spike. Compact chops with very little wind-up.'),
  meleeShopEntry('pipewrench', 'pipewrench', 360, 'A heavy adjustable pipe wrench with a serrated jaw. Short, ugly swings that hit like a steel club.'),
  meleeShopEntry('baton', 'baton', 230, 'A balanced expandable steel baton. Quick defensive strikes with a fast recovery and a solid guard.'),
];
export const ALL_SHOP_WEAPONS = SHOP_WEAPONS.concat(MELEE_SHOP_WEAPONS);

/** Distance falloff for shot pellets. No falloff object means full damage. */
export function falloffDamage(base, falloff, distance) {
  if (!falloff) return base;
  const span = Math.max(0.001, falloff.end - falloff.start);
  const t = Math.max(0, Math.min(1, (distance - falloff.start) / span));
  return base * (1 - t * (1 - falloff.min));
}

/**
 * Sample a small [p, x, y, z, rx, ry, rz] timeline. Used for hands only; the
 * mechanical parts below get direct stage-specific motion.
 */
function sampleReloadPose(object, keys, p) {
  if (!keys || !keys.length) return;
  if (p <= keys[0][0]) {
    object.position.set(keys[0][1], keys[0][2], keys[0][3]);
    object.rotation.set(keys[0][4] || 0, keys[0][5] || 0, keys[0][6] || 0);
    return;
  }
  const last = keys[keys.length - 1];
  if (p >= last[0]) {
    object.position.set(last[1], last[2], last[3]);
    object.rotation.set(last[4] || 0, last[5] || 0, last[6] || 0);
    return;
  }
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (p > b[0]) continue;
    const t = Math.max(0, Math.min(1, (p - a[0]) / Math.max(1e-5, b[0] - a[0])));
    const e = t * t * (3 - 2 * t);
    object.position.set(
      a[1] + (b[1] - a[1]) * e,
      a[2] + (b[2] - a[2]) * e,
      a[3] + (b[3] - a[3]) * e,
    );
    object.rotation.set(
      (a[4] || 0) + ((b[4] || 0) - (a[4] || 0)) * e,
      (a[5] || 0) + ((b[5] || 0) - (a[5] || 0)) * e,
      (a[6] || 0) + ((b[6] || 0) - (a[6] || 0)) * e,
    );
    return;
  }
}

/** First-person controller: ten assignable gun slots, health, knockback and respawn. */
export class Player {
  constructor({ camera, world, sound }) {
    this.camera = camera;
    this.world = world;
    this.sound = sound;

    this.pos = new THREE.Vector3(0, 0, 14);
    this.spawn = new THREE.Vector3(0, 0, 14);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = true;
    this.standHeight = 1.62;
    this.crouchHeight = 1.02;
    this.eyeHeight = this.standHeight;
    this.height = this.standHeight;
    this.radius = 0.32;
    // Crouching is a real stance: the camera, the weapon, the movement speed
    // and the point NPCs aim at all follow crouchBlend. The collision circle
    // stays the same, but the body centre used by enemy fire drops.
    this.crouching = false;
    this.crouchBlend = 0;
    this.crouchHold = false;
    this.hitCenterStand = 1.12;
    this.hitCenterCrouch = 0.7;
    this.buildMode = false;

    const defaultGuns = DEFAULT_LOADOUT.map((id) => GUN_WEAPONS.find((w) => w.id === id));
    this.baseWeapons = defaultGuns.map((w) => ({ ...w, attachments: {}, mag: w.magSize }));
    this.weapons = this.baseWeapons.map((w) => ({ ...w, attachments: {} }));
    for (const weapon of this.weapons) applyWeaponMods(weapon);
    this.weaponIndex = 0;
    this.weapon = this.weapons[0];
    this.magSize = this.weapon.magSize;
    this.mag = this.weapon.mag;
    this.sight = this.weapon.sight || (this.weapon.scope ? 'scope' : 'iron');
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDuration = this.weapon.reload;
    this.cooldown = 0;
    this.recoil = 0;
    this.fireCycleT = 0;
    this.fireCycleDur = 0;
    this.firePump = null;
    this.firePumpBase = new THREE.Vector3();
    this.bob = 0;
    this.fireCount = 0;
    this.triggerHeld = false;
    this.baseFov = camera.fov;
    this.aiming = false;
    this.aimBlend = 0;
    this.scoped = false;
    this.meleeSwingT = 0;
    this.meleeSwingDur = 1;
    this.meleeStyle = 'slash';
    this.meleeCombo = 0;
    this.blocking = false;
    this.blockT = 0;
    this.onMelee = null;
    this.onBash = null;
    this.bashT = 0;
    this.bashDur = 0;
    this.bashHitAt = 0.18;
    this.bashImpacted = false;
    this.bashDef = null;
    this.brMode = false;
    this.shield = 0;
    this.maxShield = 0;
    this.onBlock = null;
    this.reloadKind = 'mag';
    this.reloadType = 'mag';
    this.reloadSpec = null;
    this.reloadRig = null;
    this.reloadProps = {};
    this.loadedRounds = [];
    this.cylinderRounds = [];
    this.reloadHeld = null;
    this.reloadStartMag = 0;
    this.reloadPart = null;
    this.reloadSpare = null;
    this.reloadCharge = null;
    this.handL = null;
    this.handR = null;

    this.maxHealth = 100;
    this.health = 100;
    this.regenRate = 3.5;
    this.dead = false;
    this.respawnT = 0;
    this.invuln = 1.5;
    this.hurtT = 0;
    this.regenDelay = 0;
    this.shake = 0;
    this.healthUiT = 0;

    this.onAmmo = null;
    this.onFire = null;
    this.onEmpty = null;
    this.onReload = null;
    this.onWeapon = null;
    this.onBlock = null;
    this.onHealth = null;
    this.onAim = null;
    this.onDamage = null;
    this.onDeath = null;
    this.onRespawn = null;

    this.keys = { forward: false, back: false, left: false, right: false, sprint: false, jump: false };
    // Momentum tuning. Ground control is deliberately much stronger than air
    // control; releasing a direction in the air never snaps horizontal speed
    // to zero. Damage knockback and jump velocity live in the same vector.
    this.groundAccel = 8.5;
    this.airAccel = 2.6;
    this.groundFriction = 7.2;
    this.airDrag = 0.18;
    this.strafeRoll = 0;
    this.drawT = 0;
    this.drawDuration = 0.26;
    this.baseRot = new THREE.Vector3();

    this.buildViewModel();
  }

  buildViewModel() {
    const container = new THREE.Group();
    container.position.fromArray(this.weapon.hold);
    container.rotation.set(0.02, 0.1, 0.02);
    this.camera.add(container);
    this.viewModel = container;
    this.basePos = container.position.clone();

    this.steel = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
    this.dark = new THREE.MeshLambertMaterial({ color: 0x14161a });
    this.gripMat = new THREE.MeshLambertMaterial({ color: 0x241c16 });
    this.wood = new THREE.MeshLambertMaterial({ color: 0x4a2f1d });
    this.polymer = new THREE.MeshLambertMaterial({ color: 0x1d2228 });
    this.brass = new THREE.MeshLambertMaterial({ color: 0x6b4f25 });
    this.chrome = new THREE.MeshLambertMaterial({ color: 0x8d979e });
    this.rubber = new THREE.MeshLambertMaterial({ color: 0x101215 });
    this.accent = new THREE.MeshLambertMaterial({ color: 0x9a6738 });
    this.olive = new THREE.MeshLambertMaterial({ color: 0x3f4936 });
    this.tan = new THREE.MeshLambertMaterial({ color: 0x78634a });
    this.copper = new THREE.MeshLambertMaterial({ color: 0x9d5b34 });
    this.glass = new THREE.MeshBasicMaterial({ color: 0x80d6ff });
    this.firePump = null;

    this.gun = new THREE.Group();
    container.add(this.gun);

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcf8a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), flashMat);
    this.flash.visible = false;
    container.add(this.flash);

    this.flashLight = new THREE.PointLight(0xffb469, 0, 16, 2);
    container.add(this.flashLight);

    this.flashTimer = 0;
    this.muzzle = new THREE.Vector3();
    this.buildHands();
    this.buildGunModel();
  }

  buildGunModel() {
    while (this.gun.children.length) {
      const c = this.gun.children.pop();
      // Detail groups (the shotgun's pump, optic assemblies) own geometry too.
      if (c.traverse) c.traverse((o) => o.geometry && o.geometry.dispose());
      else if (c.geometry) c.geometry.dispose();
    }
    this.gun.position.set(0, 0, 0);
    this.gun.rotation.set(0, 0, 0);
    this.firePump = null;

    const box = (w, h, d, x, y, z, mat, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.rotation.z = rz;
      this.gun.add(m);
      return m;
    };

    const premium = !!this.weapon.shopId;
    // Deeper, separated values: the arena sun is strong enough to wash a
    // mid-grey receiver into white, which erased the new panel work.
    this.steel.color.setHex(premium ? 0x252c33 : 0x1a1f23);
    this.dark.color.setHex(premium ? 0x0d1013 : 0x0b0d10);
    this.gripMat.color.setHex(premium ? 0x271a11 : 0x20150e);
    this.wood.color.setHex(premium ? 0x2b180d : 0x382112);
    this.polymer.color.setHex(premium ? 0x121b22 : 0x141b20);
    this.chrome.color.setHex(premium ? 0x59636b : 0x444d54);
    this.rubber.color.setHex(0x0b0d10);
    this.accent.color.setHex(premium ? 0x8a5a22 : 0x5c3a1a);
    this.olive.color.setHex(premium ? 0x2b3524 : 0x222a1c);
    this.tan.color.setHex(premium ? 0x4a3d2c : 0x3a3023);
    this.copper.color.setHex(premium ? 0x6b3a1f : 0x4c2915);
    this.glass.color.setHex(premium ? 0xa8e6ff : 0x80d6ff);

    const id = this.weapon.model || this.weapon.id;
    if (id === 'sword') {
      // A real longsword silhouette: two-edged blade, central fuller, cross
      // guard, leather-wrapped grip and a weighted pommel. The blade points
      // down the view axis so the tip is visible rather than foreshortened.
      box(0.07, 0.024, 0.66, 0, 0.055, -0.49, this.steel);
      box(0.048, 0.016, 0.14, 0, 0.055, -0.89, this.steel);
      box(0.025, 0.011, 0.05, 0, 0.055, -0.985, this.steel);
      box(0.018, 0.006, 0.56, 0, 0.069, -0.49, this.chrome);
      box(0.006, 0.021, 0.58, 0.034, 0.055, -0.49, this.chrome);
      box(0.006, 0.021, 0.58, -0.034, 0.055, -0.49, this.chrome);
      box(0.31, 0.046, 0.052, 0, 0.048, -0.145, this.chrome);
      box(0.085, 0.07, 0.07, 0, 0.048, -0.1, this.steel);
      box(0.058, 0.062, 0.235, 0, 0.035, 0.02, this.gripMat);
      for (let i = 0; i < 7; i++) box(0.061, 0.009, 0.018, 0, 0.035, -0.065 + i * 0.029, this.dark);
      box(0.092, 0.09, 0.062, 0, 0.035, 0.175, this.chrome);
      box(0.034, 0.034, 0.034, 0, 0.088, 0.202, this.steel);
      box(0.12, 0.014, 0.02, 0, 0.055, -0.17, this.accent);
      for (let i = 0; i < 3; i++) box(0.012, 0.012, 0.008, 0.024, 0.055, -0.34 + i * 0.065, this.chrome);
    } else if (id === 'knife') {
      // Compact clip-point fighting knife: narrow flat blade, serrated spine,
      // double guard, wrapped handle and a steel pommel.
      box(0.040, 0.024, 0.24, 0, 0.052, -0.42, this.steel);
      box(0.030, 0.016, 0.10, 0.006, 0.058, -0.58, this.chrome);
      box(0.034, 0.010, 0.055, 0.006, 0.048, -0.585, this.dark);
      for (let i = 0; i < 6; i++) box(0.008, 0.008, 0.014, 0.023, 0.052, -0.50 + i * 0.027, this.chrome);
      box(0.030, 0.075, 0.034, 0, 0.05, -0.295, this.dark);
      box(0.046, 0.06, 0.15, 0, 0.035, -0.20, this.gripMat);
      for (let i = 0; i < 4; i++) box(0.050, 0.010, 0.018, 0, 0.035, -0.26 + i * 0.035, this.dark);
      box(0.062, 0.07, 0.028, 0, 0.035, -0.115, this.chrome);
      box(0.018, 0.024, 0.025, 0, 0.092, -0.40, this.chrome);
    } else if (id === 'machete') {
      // Broad jungle blade with a clipped tip, spine fuller and taped handle.
      box(0.105, 0.028, 0.44, 0.012, 0.058, -0.49, this.steel);
      box(0.080, 0.024, 0.12, 0.040, 0.058, -0.74, this.steel);
      box(0.050, 0.018, 0.07, 0.072, 0.062, -0.79, this.chrome);
      box(0.012, 0.020, 0.40, -0.041, 0.058, -0.49, this.chrome);
      box(0.018, 0.038, 0.055, 0.012, 0.058, -0.29, this.dark);
      box(0.052, 0.07, 0.17, 0, 0.038, -0.20, this.gripMat);
      for (let i = 0; i < 5; i++) box(0.056, 0.010, 0.016, 0, 0.038, -0.27 + i * 0.032, this.dark);
      box(0.070, 0.075, 0.030, 0, 0.038, -0.10, this.steel);
      box(0.016, 0.02, 0.11, -0.02, 0.058, -0.47, this.chrome);
    } else if (id === 'baseballbat') {
      // Ash bat: narrow handle, swelling barrel, taped grip and a heavy knob.
      box(0.056, 0.056, 0.20, 0, 0.025, -0.17, this.gripMat);
      box(0.070, 0.070, 0.23, 0, 0.035, -0.37, this.wood);
      box(0.095, 0.095, 0.24, 0, 0.045, -0.58, this.wood);
      box(0.115, 0.115, 0.20, 0, 0.050, -0.76, this.wood);
      box(0.092, 0.092, 0.035, 0, 0.050, -0.87, this.wood);
      box(0.070, 0.018, 0.18, 0, 0.026, -0.14, this.dark);
      for (let i = 0; i < 7; i++) box(0.061, 0.016, 0.018, 0, 0.026, -0.23 + i * 0.027, this.wood);
      box(0.085, 0.085, 0.028, 0, 0.025, -0.06, this.dark);
      box(0.018, 0.018, 0.018, 0, 0.08, -0.06, this.chrome);
    } else if (id === 'crowbar') {
      // Wrecking bar with a hooked jaw, flat chisel tip and worn paint.
      box(0.032, 0.032, 0.58, 0, 0.04, -0.37, this.steel);
      box(0.055, 0.038, 0.16, 0, 0.04, -0.67, this.steel);
      box(0.12, 0.035, 0.045, 0.055, 0.04, -0.73, this.steel);
      box(0.035, 0.06, 0.04, 0.108, 0.04, -0.705, this.dark);
      box(0.09, 0.025, 0.04, 0.025, 0.025, -0.71, this.accent);
      box(0.045, 0.028, 0.12, 0, 0.04, -0.11, this.dark);
      box(0.040, 0.040, 0.16, 0, 0.04, -0.02, this.steel);
      box(0.018, 0.018, 0.08, 0, 0.04, -0.61, this.chrome);
    } else if (id === 'fireaxe') {
      // Full-size fire axe: long haft, eye/socket, broad bearded blade and a
      // physically separate poll. The bright chrome edge is the cutting layer.
      box(0.040, 0.040, 0.78, 0, 0.012, -0.32, this.wood);
      box(0.055, 0.055, 0.16, 0, 0.012, -0.69, this.dark);
      box(0.19, 0.17, 0.075, 0.075, 0.038, -0.73, this.accent);
      box(0.17, 0.22, 0.036, 0.145, 0.038, -0.755, this.steel);
      box(0.10, 0.28, 0.026, 0.235, 0.038, -0.76, this.chrome);
      box(0.035, 0.30, 0.018, 0.285, 0.038, -0.76, this.chrome);
      box(0.13, 0.075, 0.085, -0.085, 0.038, -0.73, this.dark);
      box(0.045, 0.12, 0.070, -0.155, 0.038, -0.73, this.chrome);
      box(0.17, 0.035, 0.055, 0.07, 0.155, -0.73, this.steel);
      box(0.05, 0.10, 0.05, -0.015, 0.015, -0.73, this.steel);
      box(0.065, 0.045, 0.065, 0, 0.012, -0.715, this.chrome);
      box(0.042, 0.05, 0.05, 0, 0.012, 0.075, this.dark);
      for (let i = 0; i < 7; i++) box(0.044, 0.012, 0.015, 0, 0.012, -0.23 + i * 0.055, this.rubber);
    } else if (id === 'katana') {
      // Curved single-edge blade, circular tsuba, wrapped tsuka and pommel.
      for (let i = 0; i < 6; i++) {
        const seg = box(0.045, 0.018, 0.18, i * 0.006, 0.048 + i * 0.003, -0.39 - i * 0.16, i === 5 ? this.chrome : this.steel);
        seg.rotation.y = -0.035 * i;
      }
      box(0.020, 0.008, 0.90, 0.008, 0.065, -0.82, this.chrome);
      box(0.16, 0.16, 0.026, 0, 0.035, -0.10, this.dark);
      box(0.10, 0.10, 0.018, 0, 0.035, -0.085, this.accent);
      box(0.055, 0.07, 0.28, 0, 0.028, 0.045, this.gripMat);
      for (let i = 0; i < 7; i++) box(0.058, 0.014, 0.025, 0, 0.028, -0.095 + i * 0.042, this.dark);
      box(0.075, 0.085, 0.035, 0, 0.028, 0.20, this.steel);
      box(0.040, 0.050, 0.022, 0, 0.028, 0.225, this.accent);
    } else if (id === 'sledgehammer') {
      // Long-handled demolition sledge with a massive double-faced head.
      box(0.044, 0.044, 0.72, 0, 0.005, -0.34, this.wood);
      box(0.075, 0.075, 0.14, 0, 0.005, -0.67, this.dark);
      box(0.34, 0.17, 0.17, 0, 0.055, -0.74, this.steel);
      box(0.055, 0.19, 0.19, 0.17, 0.055, -0.74, this.dark);
      box(0.055, 0.19, 0.19, -0.17, 0.055, -0.74, this.dark);
      box(0.20, 0.045, 0.20, 0, 0.145, -0.74, this.chrome);
      box(0.060, 0.045, 0.11, 0, 0.055, -0.60, this.dark);
      for (let i = 0; i < 5; i++) box(0.049, 0.016, 0.020, 0, 0.005, -0.18 + i * 0.08, this.rubber);
      box(0.050, 0.050, 0.04, 0, 0.005, -0.02, this.dark);
    } else if (id === 'tomahawk') {
      // Short tactical axe with a beard-edged head and rear spike.
      box(0.038, 0.038, 0.46, 0, 0.025, -0.29, this.gripMat);
      box(0.060, 0.060, 0.08, 0, 0.025, -0.48, this.dark);
      box(0.20, 0.17, 0.050, 0.055, 0.055, -0.55, this.steel);
      box(0.13, 0.22, 0.025, 0.075, 0.055, -0.58, this.chrome);
      box(0.040, 0.095, 0.040, -0.055, 0.055, -0.55, this.dark);
      box(0.070, 0.050, 0.042, 0.015, 0.13, -0.55, this.accent);
      for (let i = 0; i < 4; i++) box(0.043, 0.012, 0.017, 0, 0.025, -0.33 + i * 0.035, this.dark);
      box(0.045, 0.045, 0.025, 0, 0.025, -0.045, this.steel);
    } else if (id === 'pipewrench') {
      // Adjustable pipe wrench with a long handle, serrated jaw and knurled nut.
      box(0.040, 0.040, 0.50, 0, 0.025, -0.28, this.steel);
      box(0.065, 0.075, 0.15, 0, 0.02, -0.52, this.steel);
      box(0.16, 0.055, 0.055, 0.045, 0.06, -0.57, this.steel);
      box(0.13, 0.035, 0.045, 0.045, 0.015, -0.57, this.dark);
      box(0.055, 0.11, 0.050, -0.025, 0.055, -0.58, this.dark);
      box(0.045, 0.045, 0.045, -0.005, 0.115, -0.50, this.accent);
      for (let i = 0; i < 7; i++) box(0.045, 0.012, 0.015, 0, 0.025, -0.42 + i * 0.028, this.rubber);
      box(0.047, 0.047, 0.03, 0, 0.025, -0.02, this.dark);
    } else if (id === 'baton') {
      // Expandable steel baton with a ribbed grip, collar and end cap.
      box(0.046, 0.046, 0.22, 0, 0.025, -0.20, this.gripMat);
      box(0.035, 0.035, 0.28, 0, 0.025, -0.44, this.steel);
      box(0.028, 0.028, 0.20, 0, 0.025, -0.67, this.chrome);
      box(0.052, 0.052, 0.035, 0, 0.025, -0.30, this.dark);
      box(0.058, 0.058, 0.032, 0, 0.025, -0.06, this.steel);
      for (let i = 0; i < 6; i++) box(0.049, 0.012, 0.016, 0, 0.025, -0.26 + i * 0.028, this.rubber);
      box(0.020, 0.020, 0.04, 0, 0.052, -0.70, this.chrome);
    } else if (id === 'cleaver') {
      box(0.035, 0.035, 0.26, 0, 0.015, -0.13, this.steel);
      box(0.04, 0.13, 0.09, 0, -0.07, 0.01, this.gripMat, 0.18);
      box(0.012, 0.055, 0.03, 0, 0.045, -0.01, this.dark);
      box(0.11, 0.2, 0.026, 0.045, 0.02, -0.29, this.steel);
      box(0.02, 0.19, 0.03, -0.035, 0.02, -0.29, this.dark);
      box(0.07, 0.035, 0.035, 0.065, 0.14, -0.29, this.steel);
      box(0.2, 0.012, 0.02, 0, 0.17, -0.29, this.steel);
    } else if (id === 'maul') {
      box(0.045, 0.045, 0.62, 0, -0.03, -0.28, this.wood);
      box(0.05, 0.15, 0.04, 0, -0.11, 0.03, this.dark, 0.1);
      box(0.25, 0.13, 0.14, 0, 0.06, -0.6, this.steel);
      box(0.06, 0.14, 0.15, 0.13, 0.06, -0.6, this.dark);
      box(0.06, 0.14, 0.15, -0.13, 0.06, -0.6, this.dark);
      box(0.06, 0.03, 0.16, 0, 0.135, -0.6, this.steel);
      box(0.04, 0.06, 0.1, 0, 0.06, -0.48, this.dark);
    } else if (id === 'pistol') {
      box(0.075, 0.075, 0.3, 0, 0.02, -0.1, this.steel);
      box(0.06, 0.05, 0.2, 0, -0.04, -0.08, this.dark);
      box(0.06, 0.17, 0.08, 0, -0.13, 0.02, this.gripMat, 0.22);
      box(0.032, 0.032, 0.1, 0, -0.005, -0.28, this.dark);
      box(0.02, 0.03, 0.02, 0, 0.075, -0.23, this.dark);
      box(0.05, 0.02, 0.02, 0, 0.075, 0.03, this.dark);
      box(0.012, 0.05, 0.012, 0, -0.1, -0.02, this.steel);
    } else if (id === 'smg') {
      box(0.085, 0.1, 0.34, 0, 0.015, -0.14, this.steel);
      box(0.06, 0.06, 0.24, 0, -0.055, -0.16, this.dark);
      box(0.052, 0.2, 0.075, 0, -0.16, -0.02, this.polymer, 0.12);
      box(0.03, 0.03, 0.18, 0, 0.0, -0.4, this.dark);
      box(0.035, 0.055, 0.16, 0, -0.085, -0.3, this.polymer);
      box(0.05, 0.085, 0.14, 0, 0.005, 0.06, this.polymer);
      box(0.024, 0.045, 0.024, 0, 0.095, -0.27, this.dark);
    } else if (id === 'shotgun') {
      box(0.052, 0.052, 0.68, 0, 0.005, -0.28, this.dark);
      box(0.06, 0.045, 0.5, 0, -0.035, -0.32, this.steel);
      // Magazine tube under the barrel: the fore-end slides on this, so it
      // must be present or the pump appears to float in mid-air.
      box(0.032, 0.028, 0.48, 0, -0.052, -0.33, this.dark);
      // The pump is its own voxel assembly so the firing cycle can move it
      // without moving the barrel or the player's hands.
      const pump = new THREE.Group();
      this.gun.add(pump);
      this.firePump = pump;
      this.firePumpBase.set(0, 0, 0);
      const pumpShell = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.17), this.wood);
      pumpShell.position.set(0, -0.075, -0.34);
      pump.add(pumpShell);
      for (let i = 0; i < 4; i++) {
        const groove = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.014), this.dark);
        groove.position.set(0, -0.075, -0.405 + i * 0.038);
        pump.add(groove);
      }
      box(0.02, 0.018, 0.16, 0.047, -0.075, -0.34, this.chrome);
      box(0.02, 0.018, 0.16, -0.047, -0.075, -0.34, this.chrome);
      box(0.095, 0.115, 0.3, 0, -0.02, 0.06, this.steel);
      box(0.004, 0.072, 0.17, 0.049, -0.015, 0.06, this.dark);
      box(0.004, 0.072, 0.17, -0.049, -0.015, 0.06, this.dark);
      box(0.006, 0.026, 0.06, 0.05, 0.028, -0.035, this.steel);
      box(0.006, 0.014, 0.035, 0.05, -0.045, 0.13, this.brass);
      box(0.06, 0.025, 0.16, 0, 0.04, 0.25, this.wood);
      box(0.07, 0.15, 0.3, 0, -0.075, 0.26, this.wood, -0.12);
      box(0.02, 0.03, 0.02, 0, 0.06, -0.58, this.dark);
      box(0.05, 0.04, 0.1, 0, -0.01, -0.48, this.steel);
    } else if (id === 'rifle') {
      box(0.045, 0.045, 0.52, 0, 0.0, -0.32, this.dark);
      box(0.08, 0.1, 0.36, 0, -0.01, -0.02, this.steel);
      box(0.004, 0.062, 0.2, 0.041, -0.005, -0.02, this.dark);
      box(0.004, 0.062, 0.2, -0.041, -0.005, -0.02, this.dark);
      box(0.006, 0.024, 0.065, 0.043, 0.03, -0.095, this.steel);
      box(0.004, 0.014, 0.028, -0.043, 0.018, 0.045, this.brass);
      box(0.055, 0.022, 0.13, 0, 0.045, 0.2, this.wood);
      box(0.06, 0.14, 0.1, 0, -0.13, -0.03, this.polymer, 0.1);
      box(0.065, 0.15, 0.28, 0, -0.065, 0.2, this.polymer);
      box(0.036, 0.05, 0.17, 0, 0.085, -0.03, this.dark);
      box(0.03, 0.03, 0.05, 0, 0.115, -0.1, this.dark);
      box(0.02, 0.03, 0.02, 0, 0.075, -0.56, this.dark);
      box(0.05, 0.09, 0.24, 0, -0.075, -0.2, this.wood);
    } else if (id === 'magnum') {
      box(0.05, 0.055, 0.4, 0, 0.02, -0.2, this.dark);
      box(0.085, 0.095, 0.14, 0, -0.005, -0.04, this.steel);
      box(0.06, 0.03, 0.12, 0, 0.06, -0.02, this.dark);
      box(0.062, 0.17, 0.09, 0, -0.14, 0.04, this.wood, 0.24);
      box(0.025, 0.05, 0.025, 0, 0.085, 0.01, this.dark);
      box(0.03, 0.035, 0.16, 0, -0.01, -0.32, this.steel);
      box(0.014, 0.022, 0.02, 0, 0.08, -0.36, this.steel);
    } else if (id === 'lmg') {
      box(0.11, 0.14, 0.5, 0, -0.01, -0.18, this.steel);
      box(0.045, 0.045, 0.34, 0, 0.02, -0.52, this.dark);
      box(0.13, 0.12, 0.2, 0, 0.1, -0.1, this.polymer);
      box(0.09, 0.21, 0.12, 0, -0.16, -0.04, this.polymer, 0.08);
      box(0.06, 0.16, 0.28, 0, -0.06, 0.2, this.polymer);
      box(0.09, 0.05, 0.24, 0, 0.09, -0.4, this.dark);
      box(0.02, 0.18, 0.02, 0.07, -0.2, -0.46, this.steel, 0, 0.28);
      box(0.02, 0.18, 0.02, -0.07, -0.2, -0.46, this.steel, 0, -0.28);
      box(0.05, 0.09, 0.12, 0, 0.02, 0.06, this.dark);
    } else if (id === 'carbine') {
      box(0.08, 0.095, 0.36, 0, 0, -0.14, this.steel);
      box(0.042, 0.042, 0.34, 0, 0.015, -0.44, this.dark);
      box(0.06, 0.15, 0.09, 0, -0.1, -0.04, this.polymer, 0.12);
      box(0.055, 0.12, 0.28, 0, -0.04, 0.18, this.polymer);
      box(0.045, 0.06, 0.16, 0, 0.075, -0.02, this.dark);
      box(0.02, 0.03, 0.02, 0, 0.07, -0.61, this.dark);
      box(0.05, 0.07, 0.14, 0, -0.06, -0.26, this.polymer);
    } else if (id === 'crossbow') {
      box(0.06, 0.06, 0.62, 0, -0.015, -0.2, this.wood);
      box(0.56, 0.028, 0.05, 0, 0.03, -0.34, this.dark);
      box(0.09, 0.09, 0.08, 0, 0.02, -0.34, this.steel);
      box(0.032, 0.032, 0.4, 0, 0.045, -0.42, this.steel);
      box(0.06, 0.16, 0.1, 0, -0.13, 0.04, this.gripMat, 0.22);
      box(0.012, 0.07, 0.02, 0, 0.1, -0.16, this.dark);
      box(0.08, 0.06, 0.14, 0, 0.02, 0.1, this.dark);
    } else if (id === 'minigun') {
      box(0.18, 0.18, 0.4, 0, 0.0, -0.08, this.steel);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(0.045, 0.045, 0.56, Math.cos(a) * 0.07, Math.sin(a) * 0.07, -0.47, i % 2 ? this.dark : this.steel);
      }
      box(0.2, 0.2, 0.16, 0, 0.0, -0.71, this.dark);
      box(0.11, 0.2, 0.14, 0, -0.17, 0.0, this.polymer, 0.16);
      box(0.12, 0.16, 0.26, 0, -0.12, 0.18, this.polymer);
      box(0.16, 0.22, 0.22, 0, 0.02, 0.2, this.dark);
      box(0.06, 0.06, 0.13, 0, 0.11, -0.13, this.steel);
    } else if (id === 'thumper') {
      box(0.12, 0.12, 0.62, 0, 0.025, -0.28, this.dark);
      box(0.18, 0.18, 0.18, 0, 0.02, -0.52, this.steel);
      box(0.15, 0.16, 0.18, 0, -0.01, -0.07, this.steel);
      box(0.22, 0.19, 0.19, 0, 0.01, 0.02, this.dark);
      box(0.068, 0.16, 0.1, 0, -0.14, 0.09, this.polymer, 0.22);
      box(0.11, 0.15, 0.27, 0, -0.05, 0.23, this.wood, -0.08);
      box(0.04, 0.04, 0.12, 0, 0.11, -0.21, this.steel);
      box(0.06, 0.07, 0.06, 0, 0.12, -0.34, this.dark);
    } else if (id === 'impaler') {
      box(0.065, 0.075, 0.42, 0, 0.01, -0.18, this.steel);
      box(0.036, 0.036, 0.42, 0, 0.02, -0.52, this.dark);
      box(0.13, 0.13, 0.18, 0, -0.01, -0.03, this.dark);
      box(0.09, 0.17, 0.1, 0, -0.13, -0.02, this.polymer, 0.1);
      box(0.08, 0.1, 0.25, 0, -0.025, 0.18, this.polymer);
      box(0.075, 0.15, 0.09, 0, -0.11, -0.15, this.polymer);
      box(0.1, 0.055, 0.14, 0, 0.085, -0.08, this.dark);
      box(0.02, 0.06, 0.02, 0.052, -0.02, -0.48, this.steel);
      box(0.03, 0.09, 0.03, 0, 0.08, -0.57, this.steel);
    } else if (id === 'nailer') {
      box(0.11, 0.12, 0.34, 0, -0.01, -0.14, this.steel);
      box(0.075, 0.075, 0.36, 0, 0.035, -0.36, this.dark);
      box(0.04, 0.2, 0.12, 0.065, -0.02, -0.08, this.polymer, 0.08);
      box(0.1, 0.13, 0.15, 0, -0.15, 0.02, this.polymer);
      box(0.07, 0.16, 0.27, 0, -0.065, 0.19, this.polymer);
      box(0.13, 0.11, 0.22, 0, 0.08, -0.14, this.polymer);
      box(0.045, 0.045, 0.14, 0, 0.015, -0.58, this.steel);
      box(0.16, 0.04, 0.04, 0, 0.08, -0.46, this.steel);
    } else if (id === 'scatter') {
      box(0.05, 0.05, 0.7, -0.035, 0.02, -0.3, this.steel);
      box(0.05, 0.05, 0.7, 0.035, 0.02, -0.3, this.steel);
      box(0.16, 0.12, 0.14, 0, -0.02, -0.04, this.dark);
      box(0.14, 0.18, 0.28, 0, -0.04, 0.17, this.wood, -0.12);
      box(0.08, 0.06, 0.26, 0, -0.075, -0.33, this.wood);
      box(0.015, 0.025, 0.015, 0, 0.065, -0.5, this.steel);
      box(0.18, 0.035, 0.05, 0, 0.1, -0.08, this.dark);
    } else if (id === 'hammer') {
      box(0.075, 0.075, 0.52, 0, 0.015, -0.3, this.steel);
      box(0.13, 0.15, 0.28, 0, -0.01, -0.02, this.dark);
      box(0.15, 0.12, 0.17, 0, -0.015, -0.08, this.steel);
      box(0.07, 0.17, 0.11, 0, -0.16, 0.02, this.wood, 0.22);
      box(0.1, 0.16, 0.32, 0, -0.055, 0.24, this.wood, 0.04);
      box(0.05, 0.06, 0.22, 0, 0.1, -0.08, this.dark);
      box(0.02, 0.06, 0.02, 0, 0.12, -0.62, this.steel);
      box(0.16, 0.035, 0.06, 0, 0.06, -0.36, this.steel);
    } else if (id === 'siege') {
      box(0.19, 0.19, 0.74, 0, 0.025, -0.28, this.dark);
      box(0.26, 0.26, 0.22, 0, 0.025, -0.67, this.steel);
      box(0.2, 0.18, 0.17, 0, 0.02, -0.03, this.steel);
      box(0.18, 0.2, 0.18, 0, 0.02, 0.1, this.polymer);
      box(0.08, 0.17, 0.1, 0, -0.16, 0.08, this.polymer, 0.18);
      box(0.12, 0.17, 0.24, 0, -0.04, 0.28, this.wood);
      box(0.07, 0.08, 0.2, 0, 0.17, -0.15, this.steel);
      box(0.05, 0.05, 0.06, 0, 0.2, -0.27, this.steel);
      box(0.03, 0.035, 0.03, 0.11, -0.02, -0.61, this.steel);
    } else {
      box(0.045, 0.045, 0.42, 0.032, 0.015, -0.2, this.dark);
      box(0.045, 0.045, 0.42, -0.032, 0.015, -0.2, this.dark);
      box(0.13, 0.09, 0.14, 0, -0.015, -0.02, this.steel);
      box(0.09, 0.16, 0.3, 0, -0.09, 0.18, this.wood, -0.16);
      box(0.02, 0.03, 0.02, 0, 0.06, -0.39, this.steel);
      box(0.065, 0.03, 0.08, 0, -0.05, -0.05, this.dark);
    }

    this.addWeaponDetails(box, premium);
    this.addAttachments(box);
    this.flash.position.set(0, 0.0, this.weapon.muzzleZ);
    this.flashLight.position.set(0, 0.0, this.weapon.muzzleZ);
    this.basePos.fromArray(this.weapon.hold);
    this.baseRot.fromArray(this.weapon.holdRot || [0, 0, 0]);
    this.viewModel.position.copy(this.basePos);
    this.buildReloadParts();
    this.applyHandHold();
    this.resetHands();
  }

  /**
   * Add the small voxel hardware that turns the base silhouettes into modelled
   * weapons: dovetail rails, sights, vents, screws, magazine baseplates,
   * muzzle crowns, optic glass and variant-specific furniture. Everything is
   * still axis-aligned box geometry with flat shading.
   */
  addWeaponDetails(box, premium) {
    const id = this.weapon.model || this.weapon.id;
    const key = this.weapon.id;
    const accents = {
      viper: 0xd8aa4e,
      vector: 0xc84a38,
      breacher: 0xd06a32,
      longshot: 0x7db5d8,
      judge: 0xd6a84e,
      vulcan: 0x77834d,
      wraith: 0x7a62b8,
      railbow: 0x52c9e0,
      jackhammer: 0xd06a32,
      ripper: 0xb64036,
      havoc: 0x7d8650,
      skewer: 0xb84733,
      hive: 0x6d9f52,
      gravedigger: 0xb9a68a,
      godhand: 0xe0b352,
      omen: 0xb74633,
    };
    if (accents[key]) this.accent.color.setHex(accents[key]);
    const screw = (x, y, z, side = 1) => {
      box(0.012, 0.012, 0.007, x, y, z, this.chrome);
      box(0.007, 0.007, 0.003, x + side * 0.002, y, z - 0.001, this.dark);
    };
    const rail = (y, z0, z1, n = 6, width = 0.055) => {
      // Dark tooth gaps over a steel base: a rail should read by silhouette,
      // not as a row of bright white blocks under the sun.
      box(width, 0.012, z1 - z0, 0, y, (z0 + z1) * 0.5, this.steel);
      for (let i = 0; i < n; i++) {
        const z = z0 + (z1 - z0) * (i / Math.max(1, n - 1));
        box(width * 0.92, 0.01, 0.014, 0, y + 0.009, z, this.dark);
      }
    };
    const vent = (x, y, z, side = 1, count = 4, gap = 0.026) => {
      for (let i = 0; i < count; i++) {
        box(0.006, 0.018, 0.014, x + side * 0.001, y, z + i * gap, this.dark);
      }
    };
    const iron = (frontZ, rearZ, y = 0.075, width = 0.055) => {
      box(0.014, 0.024, 0.012, 0, y, frontZ, this.dark);
      box(width, 0.01, 0.014, 0, y - 0.016, frontZ, this.steel);
      box(0.014, 0.022, 0.012, -0.018, y, rearZ, this.dark);
      box(0.014, 0.022, 0.012, 0.018, y, rearZ, this.dark);
    };
    const muzzleCrown = (z, w = 0.055, h = 0.045, y = 0.01) => {
      box(w, h, 0.022, 0, y, z, this.chrome);
      box(w * 0.28, h * 0.28, 0.009, 0, y, z - 0.012, this.rubber);
      box(w * 0.82, 0.008, 0.03, 0, y + h * 0.5, z + 0.005, this.steel);
    };

    if (id === 'pistol') {
      // A service pistol has slide serrations, not a full Picatinny roof. The
      // old rail made the pistol read as a rail with a grip attached.
      for (let i = 0; i < 5; i++) {
        box(0.004, 0.03, 0.008, 0.039, 0.032, 0.022 - i * 0.018, this.dark);
        box(0.004, 0.03, 0.008, -0.039, 0.032, 0.022 - i * 0.018, this.dark);
      }
      box(0.006, 0.026, 0.07, 0.039, 0.028, -0.085, this.dark);
      box(0.05, 0.006, 0.008, 0, -0.075, -0.055, this.dark);
      box(0.006, 0.04, 0.008, 0, -0.06, -0.055, this.dark);
      iron(-0.235, 0.035, 0.079, 0.052);
      box(0.006, 0.018, 0.058, 0.039, 0.042, -0.13, this.rubber);
      for (let i = 0; i < 4; i++) {
        box(0.006, 0.024, 0.008, 0.039, 0.018, 0.03 - i * 0.018, this.dark);
        box(0.006, 0.024, 0.008, -0.039, 0.018, 0.03 - i * 0.018, this.dark);
      }
      box(0.014, 0.035, 0.014, 0.026, -0.09, -0.005, this.steel);
      box(0.055, 0.008, 0.065, 0, -0.095, -0.015, this.dark);
      box(0.062, 0.018, 0.082, 0, -0.205, 0.025, this.steel);
      screw(0.041, 0.005, -0.01);
      screw(-0.041, 0.005, -0.01, -1);
      muzzleCrown(-0.29, 0.05, 0.042, 0.02);
      if (key === 'viper') {
        box(0.058, 0.048, 0.075, 0, 0.025, -0.315, this.dark);
        for (let i = 0; i < 3; i++) box(0.008, 0.026, 0.04, 0.032, 0.025, -0.34 + i * 0.022, this.steel);
        box(0.012, 0.018, 0.2, 0.041, 0.055, -0.12, this.accent);
        box(0.066, 0.105, 0.075, 0, -0.225, 0.025, this.steel);
      }
    } else if (id === 'smg') {
      rail(0.073, -0.32, 0.06, 8, 0.05);
      iron(-0.39, 0.055, 0.082, 0.05);
      vent(0.047, -0.02, -0.28, 1, 5, 0.033);
      vent(-0.047, -0.02, -0.28, -1, 5, 0.033);
      box(0.02, 0.018, 0.3, 0.05, 0.045, 0.07, this.steel);
      box(0.02, 0.018, 0.3, -0.05, 0.045, 0.07, this.steel);
      box(0.1, 0.08, 0.035, 0, -0.005, 0.235, this.rubber);
      box(0.07, 0.025, 0.08, 0, -0.09, -0.3, this.dark);
      screw(0.044, 0.0, 0.01);
      screw(-0.044, 0.0, 0.01, -1);
      muzzleCrown(-0.495, 0.042, 0.04, 0.005);
      if (key === 'vector') {
        box(0.02, 0.09, 0.22, 0.056, 0.005, -0.22, this.accent);
        box(0.02, 0.09, 0.22, -0.056, 0.005, -0.22, this.accent);
        box(0.055, 0.05, 0.13, 0, 0.09, 0.1, this.dark);
        for (let i = 0; i < 3; i++) box(0.045, 0.012, 0.02, 0, 0.12, 0.06 + i * 0.035, this.steel);
      }
    } else if (id === 'shotgun') {
      box(0.012, 0.018, 0.58, 0, 0.042, -0.35, this.steel);
      for (let i = 0; i < 7; i++) box(0.024, 0.012, 0.014, 0, 0.052, -0.57 + i * 0.08, this.dark);
      box(0.012, 0.012, 0.012, 0, 0.055, -0.635, this.brass);
      iron(-0.605, -0.02, 0.075, 0.06);
      vent(0.034, -0.005, -0.52, 1, 6, 0.04);
      vent(-0.034, -0.005, -0.52, -1, 6, 0.04);
      box(0.024, 0.12, 0.19, 0.058, -0.015, 0.035, this.dark);
      for (let i = 0; i < 3; i++) {
        box(0.018, 0.055, 0.018, 0.072, -0.01, 0.0 + i * 0.04, this.brass);
        box(0.01, 0.012, 0.02, 0.081, 0.026, 0.0 + i * 0.04, this.copper);
      }
      box(0.068, 0.12, 0.03, 0, -0.07, 0.405, this.rubber);
      box(0.012, 0.045, 0.08, 0.052, -0.07, 0.19, this.dark);
      screw(0.05, -0.015, 0.07);
      screw(-0.05, -0.015, 0.07, -1);
      muzzleCrown(-0.625, 0.058, 0.052, 0.005);
      if (key === 'breacher') {
        box(0.09, 0.085, 0.085, 0, 0.0, -0.655, this.dark);
        for (let i = 0; i < 3; i++) box(0.012, 0.06, 0.06, 0.05, 0.0, -0.665 + i * 0.02, this.dark);
        box(0.12, 0.13, 0.045, 0.065, -0.01, 0.03, this.dark);
        for (let i = 0; i < 4; i++) box(0.018, 0.055, 0.018, 0.093, -0.01, -0.02 + i * 0.04, this.brass);
        box(0.055, 0.03, 0.055, 0, 0.12, -0.1, this.dark);
        box(0.035, 0.02, 0.005, 0, 0.125, -0.13, this.glass);
      } else if (key === 'jackhammer') {
        box(0.12, 0.11, 0.16, 0, -0.14, -0.16, this.dark);
        box(0.1, 0.025, 0.16, 0, -0.075, -0.16, this.steel);
        box(0.035, 0.06, 0.2, 0, 0.11, -0.06, this.dark);
        box(0.055, 0.018, 0.2, 0, 0.145, -0.06, this.steel);
        box(0.012, 0.05, 0.2, 0.052, -0.005, -0.2, this.accent);
      }
    } else if (id === 'rifle') {
      rail(0.075, -0.33, 0.08, 8, 0.06);
      if (!this.weapon.attachments?.optic) {
        box(0.062, 0.062, 0.25, 0, 0.125, -0.1, this.dark);
        box(0.072, 0.072, 0.028, 0, 0.125, -0.225, this.steel);
        box(0.058, 0.058, 0.005, 0, 0.125, -0.24, this.glass);
        box(0.072, 0.072, 0.028, 0, 0.125, 0.025, this.steel);
        box(0.042, 0.042, 0.006, 0, 0.125, 0.041, this.glass);
        for (const z of [-0.18, -0.02]) {
          box(0.08, 0.025, 0.018, 0, 0.1, z, this.steel);
          box(0.018, 0.06, 0.018, 0.045, 0.085, z, this.dark);
        }
        box(0.06, 0.012, 0.1, 0, 0.18, -0.1, this.dark);
      }
      box(0.04, 0.018, 0.04, 0.07, 0.085, -0.02, this.steel);
      box(0.018, 0.018, 0.065, 0.09, 0.045, 0.0, this.brass);
      box(0.065, 0.025, 0.14, 0, -0.11, -0.19, this.steel);
      box(0.06, 0.025, 0.09, 0, -0.13, 0.23, this.rubber);
      box(0.012, 0.13, 0.012, 0.075, -0.12, -0.58, this.steel);
      box(0.012, 0.13, 0.012, -0.075, -0.12, -0.58, this.steel);
      vent(0.048, 0.0, -0.38, 1, 4, 0.035);
      screw(0.055, 0.02, 0.02);
      screw(-0.055, 0.02, 0.02, -1);
      muzzleCrown(-0.675, 0.058, 0.05, 0.0);
      if (key === 'longshot') {
        if (!this.weapon.attachments?.optic) {
          box(0.08, 0.08, 0.34, 0, 0.13, -0.12, this.dark);
          box(0.092, 0.092, 0.04, 0, 0.13, -0.3, this.chrome);
          box(0.075, 0.075, 0.006, 0, 0.13, -0.322, this.glass);
        }
        box(0.02, 0.04, 0.18, 0.065, 0.09, -0.02, this.steel);
        box(0.11, 0.075, 0.05, 0, 0.0, -0.7, this.dark);
        for (let i = 0; i < 3; i++) box(0.12, 0.012, 0.018, 0, 0.02, -0.715 + i * 0.017, this.steel);
        box(0.014, 0.2, 0.014, 0.075, -0.2, -0.62, this.dark);
        box(0.014, 0.2, 0.014, -0.075, -0.2, -0.62, this.dark);
        box(0.05, 0.018, 0.24, 0, 0.19, -0.1, this.accent);
      }
    } else if (id === 'magnum') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(0.012, 0.045, 0.012, Math.cos(a) * 0.045, Math.sin(a) * 0.045 + 0.02, -0.02, this.dark);
      }
      box(0.05, 0.018, 0.28, 0, 0.075, -0.17, this.steel);
      box(0.05, 0.018, 0.24, 0, 0.075, -0.17, this.dark);
      box(0.07, 0.06, 0.035, 0, -0.005, 0.085, this.dark);
      box(0.018, 0.05, 0.018, 0.045, 0.08, -0.34, this.chrome);
      box(0.065, 0.035, 0.032, 0, 0.075, 0.02, this.steel);
      box(0.058, 0.12, 0.028, 0.045, -0.12, 0.05, this.tan);
      box(0.058, 0.12, 0.028, -0.045, -0.12, 0.05, this.tan);
      screw(0.047, 0.02, -0.07);
      screw(-0.047, 0.02, -0.07, -1);
      muzzleCrown(-0.4, 0.055, 0.05, 0.02);
      if (key === 'judge') {
        box(0.09, 0.1, 0.2, 0, 0.0, -0.055, this.steel);
        for (let i = 0; i < 6; i++) box(0.012, 0.035, 0.018, 0.048, 0.03, -0.11 + i * 0.025, this.dark);
        box(0.07, 0.018, 0.15, 0, 0.085, -0.1, this.accent);
      }
    } else if (id === 'lmg') {
      rail(0.085, -0.38, 0.08, 9, 0.075);
      box(0.12, 0.02, 0.3, 0, 0.085, -0.13, this.dark);
      box(0.13, 0.055, 0.05, 0, 0.06, 0.08, this.steel);
      box(0.1, 0.16, 0.14, 0.11, -0.13, -0.04, this.olive);
      for (let i = 0; i < 5; i++) box(0.04, 0.03, 0.018, 0.12, -0.06 - i * 0.02, 0.0, this.brass);
      box(0.1, 0.08, 0.035, 0, 0.13, -0.04, this.dark);
      box(0.02, 0.18, 0.02, 0.075, -0.2, -0.55, this.steel);
      box(0.02, 0.18, 0.02, -0.075, -0.2, -0.55, this.steel);
      box(0.06, 0.025, 0.11, 0, -0.07, 0.27, this.rubber);
      vent(0.063, 0.0, -0.42, 1, 5, 0.035);
      screw(0.058, 0.02, 0.02);
      screw(-0.058, 0.02, 0.02, -1);
      muzzleCrown(-0.715, 0.07, 0.055, 0.01);
      if (key === 'vulcan') {
        box(0.14, 0.18, 0.2, 0.13, -0.14, 0.02, this.olive);
        box(0.11, 0.03, 0.18, 0.13, -0.03, 0.02, this.dark);
        box(0.02, 0.04, 0.64, 0.075, 0.02, -0.27, this.dark);
      }
    } else if (id === 'carbine') {
      rail(0.072, -0.3, 0.06, 7, 0.055);
      if (!this.weapon.attachments?.optic) {
        box(0.06, 0.055, 0.16, 0, 0.115, -0.04, this.dark);
        box(0.048, 0.048, 0.006, 0, 0.115, -0.125, this.glass);
        box(0.05, 0.03, 0.05, 0, 0.085, 0.035, this.steel);
      }
      iron(-0.42, 0.02, 0.07, 0.05);
      box(0.07, 0.09, 0.09, 0, -0.1, -0.3, this.polymer);
      box(0.065, 0.06, 0.12, 0, -0.12, -0.28, this.dark);
      box(0.06, 0.035, 0.12, 0, 0.03, 0.24, this.rubber);
      box(0.012, 0.045, 0.08, 0.052, -0.06, 0.12, this.steel);
      vent(0.045, -0.02, -0.38, 1, 4, 0.032);
      screw(0.045, 0.01, -0.01);
      screw(-0.045, 0.01, -0.01, -1);
      muzzleCrown(-0.645, 0.05, 0.045, 0.005);
      if (key === 'wraith') {
        box(0.055, 0.055, 0.2, 0, 0.02, -0.52, this.dark);
        box(0.07, 0.07, 0.025, 0, 0.02, -0.62, this.steel);
        box(0.012, 0.025, 0.3, 0.045, 0.04, -0.25, this.accent);
        box(0.08, 0.055, 0.09, 0, 0.115, -0.04, this.accent);
      }
    } else if (id === 'crossbow') {
      box(0.07, 0.03, 0.68, 0, 0.035, -0.18, this.steel);
      for (const side of [-1, 1]) {
        box(0.02, 0.02, 0.03, side * 0.29, 0.03, -0.34, this.steel);
        box(0.03, 0.012, 0.12, side * 0.255, 0.03, -0.3, this.dark);
        box(0.02, 0.08, 0.04, side * 0.12, 0.06, -0.34, this.steel);
      }
      box(0.56, 0.006, 0.006, 0, 0.075, -0.34, this.rubber);
      box(0.012, 0.04, 0.34, 0, 0.06, -0.2, this.chrome);
      box(0.06, 0.06, 0.18, 0, 0.11, -0.12, this.dark);
      box(0.045, 0.045, 0.005, 0, 0.11, -0.215, this.glass);
      box(0.09, 0.06, 0.035, 0, 0.02, 0.1, this.rubber);
      box(0.02, 0.06, 0.02, 0.05, 0.08, -0.34, this.brass);
      box(0.02, 0.06, 0.02, -0.05, 0.08, -0.34, this.brass);
      for (let i = 0; i < 3; i++) box(0.012, 0.012, 0.28, 0.02, 0.065, -0.18, this.brass);
      if (key === 'railbow') {
        box(0.08, 0.02, 0.55, 0, 0.05, -0.24, this.accent);
        box(0.02, 0.024, 0.42, 0.06, 0.08, -0.24, this.accent);
        box(0.02, 0.024, 0.42, -0.06, 0.08, -0.24, this.accent);
        box(0.12, 0.1, 0.2, 0, 0.02, -0.03, this.dark);
        for (let i = 0; i < 3; i++) box(0.018, 0.018, 0.2, 0.03, 0.05, -0.18, this.brass);
      }
    } else if (id === 'minigun') {
      for (const z of [-0.28, -0.47, -0.63]) {
        box(0.18, 0.022, 0.022, 0, 0.08, z, this.steel);
        box(0.022, 0.18, 0.022, 0.08, 0.0, z, this.steel);
        box(0.022, 0.18, 0.022, -0.08, 0.0, z, this.steel);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(0.012, 0.012, 0.11, Math.cos(a) * 0.085, Math.sin(a) * 0.085, -0.72, this.chrome);
      }
      box(0.045, 0.08, 0.36, -0.11, -0.12, -0.12, this.dark);
      box(0.045, 0.08, 0.36, 0.11, -0.12, -0.12, this.dark);
      box(0.14, 0.06, 0.16, 0, 0.13, 0.02, this.dark);
      box(0.16, 0.02, 0.18, 0, 0.16, 0.02, this.steel);
      for (let i = 0; i < 3; i++) box(0.012, 0.012, 0.34, 0.075, 0.06, -0.28, this.copper);
      screw(0.06, 0.02, 0.14);
      screw(-0.06, 0.02, 0.14, -1);
      if (key === 'ripper') {
        box(0.07, 0.12, 0.3, 0.12, -0.18, 0.06, this.dark);
        box(0.07, 0.12, 0.3, -0.12, -0.18, 0.06, this.dark);
        box(0.02, 0.02, 0.45, 0.1, -0.05, -0.28, this.accent);
        box(0.02, 0.02, 0.45, -0.1, -0.05, -0.28, this.accent);
      }
    } else if (id === 'thumper') {
      const z = -0.52;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(0.055, 0.055, 0.05, Math.cos(a) * 0.07, 0.025 + Math.sin(a) * 0.07, z, i % 2 ? this.steel : this.dark);
      }
      box(0.14, 0.14, 0.025, 0, 0.025, z - 0.035, this.steel);
      box(0.18, 0.06, 0.06, 0, 0.13, -0.2, this.dark);
      box(0.035, 0.05, 0.05, 0.08, 0.09, -0.21, this.steel);
      box(0.06, 0.11, 0.06, 0, -0.01, -0.34, this.steel);
      box(0.065, 0.025, 0.2, 0, 0.14, -0.08, this.dark);
      box(0.07, 0.14, 0.03, 0, -0.07, 0.39, this.rubber);
      screw(0.055, 0.02, 0.02);
      screw(-0.055, 0.02, 0.02, -1);
      if (key === 'havoc') {
        box(0.22, 0.18, 0.18, 0, 0.01, -0.08, this.dark);
        box(0.24, 0.05, 0.16, 0, 0.11, -0.08, this.olive);
        box(0.04, 0.1, 0.24, 0.12, -0.01, -0.2, this.olive);
      }
    } else if (id === 'impaler') {
      box(0.09, 0.025, 0.35, 0, 0.085, -0.28, this.steel);
      for (let i = 0; i < 4; i++) box(0.012, 0.012, 0.32, 0.045, 0.095, -0.25, this.brass);
      box(0.06, 0.1, 0.12, 0.06, -0.07, -0.02, this.copper);
      vent(0.045, -0.01, -0.33, 1, 5, 0.03);
      box(0.05, 0.08, 0.035, 0, 0.1, 0.08, this.dark);
      box(0.07, 0.11, 0.03, 0, -0.11, 0.34, this.rubber);
      box(0.012, 0.035, 0.12, 0.052, -0.02, -0.54, this.chrome);
      screw(0.045, 0.0, 0.12);
      screw(-0.045, 0.0, 0.12, -1);
      if (key === 'skewer') {
        box(0.09, 0.09, 0.2, 0, 0.0, -0.61, this.dark);
        box(0.05, 0.05, 0.25, 0, 0.0, -0.76, this.chrome);
        box(0.04, 0.16, 0.2, 0.07, -0.11, -0.02, this.accent);
        box(0.04, 0.16, 0.2, -0.07, -0.11, -0.02, this.accent);
      }
    } else if (id === 'nailer') {
      box(0.08, 0.13, 0.14, -0.085, -0.07, -0.03, this.copper);
      for (let i = 0; i < 3; i++) box(0.02, 0.02, 0.2, -0.085, -0.02 + i * 0.03, -0.16, this.rubber);
      box(0.035, 0.035, 0.035, 0, 0.09, -0.08, this.glass);
      box(0.075, 0.04, 0.1, 0, 0.1, -0.15, this.dark);
      box(0.045, 0.012, 0.28, 0, 0.08, -0.25, this.steel);
      for (let i = 0; i < 6; i++) box(0.008, 0.02, 0.012, 0, 0.07, -0.35 + i * 0.035, this.chrome);
      box(0.06, 0.13, 0.03, 0, -0.08, 0.34, this.rubber);
      screw(0.055, 0.02, 0.02);
      screw(-0.055, 0.02, 0.02, -1);
      if (key === 'hive') {
        box(0.1, 0.2, 0.16, 0.1, -0.03, -0.16, this.olive);
        for (let i = 0; i < 3; i++) box(0.018, 0.14, 0.018, 0.14, 0.04, -0.2 + i * 0.04, this.accent);
        box(0.16, 0.04, 0.05, 0, 0.12, -0.25, this.accent);
      }
    } else if (id === 'scatter') {
      box(0.008, 0.04, 0.6, 0, 0.055, -0.3, this.chrome);
      box(0.02, 0.03, 0.05, 0, 0.075, -0.58, this.steel);
      box(0.16, 0.035, 0.18, 0, 0.09, -0.02, this.dark);
      box(0.06, 0.05, 0.24, 0, -0.075, -0.32, this.wood);
      box(0.025, 0.04, 0.08, 0, 0.07, 0.0, this.steel);
      box(0.06, 0.12, 0.03, 0, -0.05, 0.35, this.rubber);
      for (let i = 0; i < 2; i++) {
        box(0.05, 0.05, 0.022, -0.035, 0.02, -0.655 - i * 0.002, this.chrome);
        box(0.05, 0.05, 0.022, 0.035, 0.02, -0.655 - i * 0.002, this.chrome);
        box(0.018, 0.018, 0.008, -0.035, 0.02, -0.667, this.rubber);
        box(0.018, 0.018, 0.008, 0.035, 0.02, -0.667, this.rubber);
      }
      screw(0.085, 0.0, 0.02);
      screw(-0.085, 0.0, 0.02, -1);
      if (key === 'gravedigger') {
        box(0.05, 0.05, 0.7, 0, 0.02, -0.3, this.steel);
        box(0.05, 0.05, 0.022, 0, 0.02, -0.655, this.chrome);
        box(0.018, 0.018, 0.008, 0, 0.02, -0.667, this.rubber);
        box(0.06, 0.02, 0.22, 0, 0.11, -0.1, this.dark);
        for (let i = 0; i < 3; i++) box(0.018, 0.06, 0.018, 0.06, 0.02, 0.02 + i * 0.04, this.brass);
      }
    } else if (id === 'hammer') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        box(0.014, 0.06, 0.02, Math.cos(a) * 0.055, Math.sin(a) * 0.055 + 0.01, -0.05, this.dark);
      }
      box(0.06, 0.018, 0.44, 0, 0.095, -0.28, this.steel);
      box(0.08, 0.04, 0.08, 0, 0.13, -0.07, this.dark);
      box(0.09, 0.06, 0.03, 0, 0.06, 0.07, this.dark);
      box(0.056, 0.14, 0.03, 0.055, -0.13, 0.04, this.tan);
      box(0.056, 0.14, 0.03, -0.055, -0.13, 0.04, this.tan);
      box(0.06, 0.12, 0.03, 0, -0.12, 0.4, this.rubber);
      box(0.018, 0.06, 0.018, 0.05, 0.13, -0.6, this.chrome);
      screw(0.05, 0.02, 0.02);
      screw(-0.05, 0.02, 0.02, -1);
      muzzleCrown(-0.69, 0.075, 0.06, 0.015);
      if (key === 'godhand') {
        box(0.17, 0.17, 0.18, 0, 0.01, -0.1, this.steel);
        box(0.18, 0.04, 0.16, 0, 0.11, -0.1, this.accent);
        box(0.09, 0.07, 0.2, 0, 0.13, -0.35, this.dark);
        box(0.1, 0.06, 0.06, 0, 0.13, -0.46, this.accent);
        for (let i = 0; i < 4; i++) box(0.018, 0.018, 0.018, 0.06, 0.11, -0.15 + i * 0.04, this.brass);
      }
    } else if (id === 'siege') {
      box(0.22, 0.025, 0.55, 0, 0.14, -0.3, this.steel);
      for (let i = 0; i < 5; i++) box(0.2, 0.018, 0.018, 0, 0.155, -0.52 + i * 0.08, this.dark);
      box(0.285, 0.285, 0.035, 0, 0.025, -0.69, this.dark);
      box(0.2, 0.07, 0.08, 0, 0.16, -0.2, this.dark);
      box(0.12, 0.12, 0.14, 0, -0.03, 0.02, this.dark);
      box(0.07, 0.16, 0.03, 0, -0.09, 0.4, this.rubber);
      box(0.025, 0.1, 0.03, 0.13, 0.02, -0.56, this.steel);
      screw(0.1, 0.02, 0.08);
      screw(-0.1, 0.02, 0.08, -1);
      if (key === 'omen') {
        box(0.19, 0.19, 0.7, -0.105, 0.025, -0.28, this.dark);
        box(0.26, 0.26, 0.22, -0.105, 0.025, -0.67, this.steel);
        box(0.05, 0.16, 0.22, 0.16, 0.02, -0.25, this.olive);
        box(0.03, 0.22, 0.03, 0.12, 0.08, -0.18, this.accent);
      }
    } else if (id === 'cleaver') {
      box(0.115, 0.012, 0.026, 0.045, 0.115, -0.29, this.chrome);
      box(0.012, 0.12, 0.028, 0.095, 0.02, -0.29, this.steel);
      for (let i = 0; i < 4; i++) box(0.04, 0.018, 0.012, 0, -0.075 + i * 0.045, 0.01, this.rubber);
      for (let i = 0; i < 3; i++) box(0.012, 0.012, 0.008, 0.0, 0.04, -0.35 + i * 0.05, this.steel);
    } else if (id === 'maul') {
      for (let i = 0; i < 4; i++) box(0.05, 0.02, 0.02, 0, -0.03 + i * 0.08, -0.15, this.rubber);
      box(0.27, 0.02, 0.16, 0, 0.13, -0.6, this.chrome);
      box(0.22, 0.02, 0.15, 0, -0.01, -0.6, this.dark);
      for (let i = 0; i < 2; i++) box(0.012, 0.012, 0.012, 0.06 + i * 0.04, 0.09, -0.68, this.steel);
    }

    // ---- production furniture pass -----------------------------------------
    // Long guns no longer end in one featureless block. A recoil pad, raised
    // comb, toe line, sling socket and a narrow inlay catch separate highlights,
    // so wood and polymer read as shaped furniture rather than a painted cube.
    // These are overlays: grip positions, muzzle points and reload rigs do not
    // move, and the silhouettes stay voxel-blocky on purpose.
    const stockKit = {
      sawedoff: { y: -0.09, z: 0.18, w: 0.09, h: 0.16, d: 0.3, rx: -0.16, wood: true },
      shotgun: { y: -0.075, z: 0.26, w: 0.07, h: 0.15, d: 0.3, rx: -0.12, wood: true },
      rifle: { y: -0.065, z: 0.2, w: 0.065, h: 0.15, d: 0.28, rx: 0, wood: false },
      lmg: { y: -0.06, z: 0.2, w: 0.06, h: 0.16, d: 0.28, rx: 0, wood: false },
      carbine: { y: -0.04, z: 0.18, w: 0.055, h: 0.12, d: 0.28, rx: 0, wood: false },
      minigun: { y: -0.12, z: 0.18, w: 0.12, h: 0.16, d: 0.26, rx: 0, wood: false },
      thumper: { y: -0.05, z: 0.23, w: 0.11, h: 0.15, d: 0.27, rx: 0, wood: true },
      impaler: { y: -0.025, z: 0.18, w: 0.08, h: 0.1, d: 0.25, rx: 0, wood: false },
      nailer: { y: -0.065, z: 0.19, w: 0.07, h: 0.16, d: 0.27, rx: 0, wood: false },
      scatter: { y: -0.04, z: 0.17, w: 0.14, h: 0.18, d: 0.28, rx: -0.12, wood: true },
      hammer: { y: -0.055, z: 0.24, w: 0.1, h: 0.16, d: 0.32, rx: 0.04, wood: true },
      siege: { y: -0.04, z: 0.28, w: 0.12, h: 0.17, d: 0.24, rx: 0, wood: true },
    };
    const stock = stockKit[id];
    if (stock) {
      const rear = stock.z + stock.d * 0.5;
      const top = stock.y + stock.h * 0.5;
      const bottom = stock.y - stock.h * 0.5;
      box(stock.w * 1.08, stock.h * 0.98, 0.018, 0, stock.y, rear - 0.004, this.rubber, stock.rx);
      box(stock.w * 0.9, 0.025, stock.d * 0.44, 0, top - 0.002, stock.z + stock.d * 0.02, stock.wood ? this.tan : this.dark, stock.rx);
      box(stock.w * 1.02, 0.013, stock.d * 0.2, 0, bottom + 0.013, rear - 0.07, this.dark, stock.rx);
      box(stock.w * 0.22, 0.022, 0.06, 0, bottom + 0.04, rear - 0.06, this.chrome, stock.rx);
      for (const side of [-1, 1]) {
        box(0.004, 0.012, stock.d * 0.38, side * (stock.w * 0.5 + 0.002), stock.y + stock.h * 0.22, stock.z - stock.d * 0.04, stock.wood ? this.accent : this.steel, stock.rx);
        box(0.004, 0.008, 0.06, side * (stock.w * 0.5 + 0.002), stock.y + stock.h * 0.02, rear - 0.06, this.chrome, stock.rx);
      }
    }

    // A milled panel border, pin and selector break up the receiver without
    // turning it into a different gun. Only conventional receivers are listed:
    // the launchers and minigun already have their own large mechanical shapes.
    const receiverKit = {
      sawedoff: { y: -0.015, z: -0.02, w: 0.13, h: 0.09, d: 0.14 },
      pistol: { y: 0.02, z: -0.1, w: 0.075, h: 0.075, d: 0.3 },
      smg: { y: 0.015, z: -0.14, w: 0.085, h: 0.1, d: 0.34 },
      shotgun: { y: -0.02, z: 0.06, w: 0.095, h: 0.115, d: 0.3 },
      rifle: { y: -0.01, z: -0.02, w: 0.08, h: 0.1, d: 0.36 },
      magnum: { y: -0.005, z: -0.04, w: 0.085, h: 0.095, d: 0.14 },
      lmg: { y: -0.01, z: -0.18, w: 0.11, h: 0.14, d: 0.5 },
      carbine: { y: 0, z: -0.14, w: 0.08, h: 0.095, d: 0.36 },
      impaler: { y: 0.01, z: -0.18, w: 0.065, h: 0.075, d: 0.42 },
      nailer: { y: -0.01, z: -0.14, w: 0.11, h: 0.12, d: 0.34 },
      hammer: { y: 0.015, z: -0.3, w: 0.075, h: 0.075, d: 0.52 },
    };
    const receiver = receiverKit[id];
    if (receiver) {
      const hx = receiver.w * 0.5 + 0.002;
      for (const side of [-1, 1]) {
        box(0.004, 0.006, receiver.d * 0.44, side * hx, receiver.y + receiver.h * 0.22, receiver.z, this.dark);
        box(0.004, 0.006, receiver.d * 0.44, side * hx, receiver.y - receiver.h * 0.16, receiver.z, this.dark);
        box(0.004, receiver.h * 0.38, 0.008, side * hx, receiver.y + receiver.h * 0.03, receiver.z - receiver.d * 0.22, this.dark);
        box(0.004, receiver.h * 0.38, 0.008, side * hx, receiver.y + receiver.h * 0.03, receiver.z + receiver.d * 0.22, this.dark);
        box(0.006, 0.012, 0.045, side * (hx + 0.002), receiver.y + receiver.h * 0.14, receiver.z - receiver.d * 0.1, this.chrome);
        box(0.004, 0.008, 0.008, side * (hx + 0.002), receiver.y - receiver.h * 0.1, receiver.z + receiver.d * 0.16, this.brass);
      }
      box(receiver.w * 0.78, 0.018, receiver.d * 0.26, 0, receiver.y - receiver.h * 0.5 - 0.004, receiver.z + receiver.d * 0.14, this.dark);
      if (premium) {
        for (const side of [-1, 1]) {
          box(0.004, 0.012, receiver.d * 0.22, side * (hx + 0.004), receiver.y + receiver.h * 0.06, receiver.z - receiver.d * 0.05, this.accent);
        }
      }
    }

    // A muzzle device with side cuts reads as machined steel at gameplay scale.
    const brakeKit = {
      sawedoff: { y: 0.02, w: 0.09 },
      pistol: { y: 0.02, w: 0.05 },
      smg: { y: 0.0, w: 0.05 },
      shotgun: { y: 0.005, w: 0.058 },
      rifle: { y: 0.0, w: 0.058 },
      magnum: { y: 0.02, w: 0.055 },
      lmg: { y: 0.0, w: 0.07 },
      carbine: { y: 0.005, w: 0.05 },
      impaler: { y: 0.01, w: 0.055 },
      nailer: { y: 0.015, w: 0.05 },
      hammer: { y: 0.015, w: 0.075 },
    };
    const brake = brakeKit[id];
    if (brake) {
      const z = this.weapon.muzzleZ;
      box(brake.w * 1.3, 0.016, 0.028, 0, brake.y + 0.024, z - 0.006, this.dark);
      for (const side of [-1, 1]) {
        box(0.005, 0.012, 0.018, side * brake.w * 0.48, brake.y + 0.004, z - 0.006, this.steel);
      }
    }
  }

  /**
   * Physical Black Market hardware. Every installed item is built onto the
   * current gun group, so it follows muzzle position, aiming pose, reload lift
   * and the 3D market turntable instead of existing only in a menu.
   */
  addAttachments(box) {
    const installed = this.weapon.attachments || {};
    if (!Object.keys(installed).length) return;
    const mounts = weaponMounts(this.weapon);
    const mods = new THREE.Group();
    mods.userData.attachments = new THREE.Group();
    this.gun.add(mods);
    const part = (w, h, d, x, y, z, mat, rx = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      mesh.rotation.z = rz;
      mods.add(mesh);
      return mesh;
    };

    const optic = attachmentById(installed.optic);
    if (optic && mounts.optic) {
      const [x, y, z] = mounts.optic;
      if (optic.id.startsWith('scope_')) {
        part(0.078, 0.024, 0.16, x, y, z, this.dark);
        part(0.062, 0.062, 0.16, x, y + 0.045, z, this.steel);
        part(0.082, 0.082, 0.24, x, y + 0.053, z - 0.02, this.dark);
        part(0.092, 0.092, 0.045, x, y + 0.053, z - 0.16, this.chrome);
        part(0.086, 0.086, 0.012, x, y + 0.053, z - 0.186, this.glass);
        part(0.074, 0.074, 0.035, x, y + 0.053, z + 0.105, this.chrome);
        for (const side of [-1, 1]) {
          part(0.015, 0.075, 0.025, x + side * 0.048, y + 0.03, z - 0.06, this.dark);
          part(0.015, 0.075, 0.025, x + side * 0.048, y + 0.03, z + 0.035, this.dark);
        }
        for (let i = 0; i < 4; i++) part(0.072, 0.01, 0.014, x, y + 0.096, z - 0.11 + i * 0.045, this.chrome);
        part(0.035, 0.018, 0.035, x + 0.052, y + 0.053, z + 0.07, this.dark);
      } else if (optic.id === 'holo') {
        part(0.09, 0.022, 0.12, x, y, z, this.dark);
        part(0.018, 0.075, 0.018, x - 0.045, y + 0.046, z - 0.015, this.steel);
        part(0.018, 0.075, 0.018, x + 0.045, y + 0.046, z - 0.015, this.steel);
        part(0.108, 0.016, 0.018, x, y + 0.085, z - 0.015, this.steel);
        part(0.09, 0.065, 0.005, x, y + 0.049, z - 0.035, this.glass);
        part(0.012, 0.012, 0.008, x, y + 0.052, z - 0.041, this.accent);
        for (let i = 0; i < 3; i++) part(0.014, 0.04, 0.022, x - 0.035 + i * 0.035, y + 0.068, z + 0.045, this.dark);
      } else if (optic.id === 'red_dot') {
        part(0.062, 0.018, 0.085, x, y, z, this.dark);
        part(0.014, 0.055, 0.014, x - 0.03, y + 0.035, z - 0.01, this.steel);
        part(0.014, 0.055, 0.014, x + 0.03, y + 0.035, z - 0.01, this.steel);
        part(0.074, 0.012, 0.014, x, y + 0.065, z - 0.01, this.steel);
        part(0.058, 0.045, 0.004, x, y + 0.039, z - 0.018, this.glass);
        part(0.008, 0.008, 0.006, x, y + 0.04, z - 0.023, this.accent);
        part(0.033, 0.018, 0.03, x + 0.04, y + 0.02, z + 0.045, this.steel);
      } else if (optic.id === 'fiber_irons') {
        part(0.012, 0.03, 0.012, x, y + 0.015, z - 0.07, this.dark);
        part(0.035, 0.014, 0.014, x, y + 0.004, z - 0.07, this.steel);
        part(0.008, 0.008, 0.012, x, y + 0.026, z - 0.07, this.accent);
        part(0.008, 0.026, 0.012, x - 0.022, y + 0.013, z + 0.04, this.dark);
        part(0.008, 0.026, 0.012, x + 0.022, y + 0.013, z + 0.04, this.dark);
      }
    }

    const muzzle = attachmentById(installed.muzzle);
    if (muzzle && mounts.muzzle) {
      const [x, y, z] = mounts.muzzle;
      if (muzzle.effect?.suppressed) {
        part(0.066, 0.066, 0.062, x, y, z - 0.035, this.steel);
        part(0.078, 0.078, 0.21, x, y, z - 0.17, this.dark);
        for (let i = 0; i < 6; i++) part(0.084, 0.084, 0.012, x, y, z - 0.09 - i * 0.028, this.steel);
        part(0.054, 0.054, 0.006, x, y, z - 0.278, this.rubber);
      } else if (muzzle.id === 'compensator') {
        part(0.06, 0.055, 0.09, x, y, z - 0.046, this.steel);
        for (const side of [-1, 1]) {
          part(0.012, 0.03, 0.025, x + side * 0.033, y + 0.012, z - 0.035, this.rubber);
          part(0.012, 0.03, 0.025, x + side * 0.033, y + 0.012, z - 0.072, this.rubber);
        }
        part(0.07, 0.014, 0.09, x, y + 0.032, z - 0.046, this.dark);
      } else {
        part(0.072, 0.06, 0.12, x, y, z - 0.06, this.steel);
        for (const side of [-1, 1]) {
          part(0.015, 0.05, 0.075, x + side * 0.038, y, z - 0.055, this.dark);
          for (let i = 0; i < 3; i++) part(0.008, 0.028, 0.014, x + side * 0.045, y + 0.01, z - 0.035 - i * 0.024, this.rubber);
        }
        part(0.088, 0.016, 0.05, x, y + 0.033, z - 0.05, this.dark);
      }
    }

    const grip = attachmentById(installed.underbarrel);
    if (grip && mounts.underbarrel) {
      const [x, y, z] = mounts.underbarrel;
      part(0.075, 0.025, 0.11, x, y, z, this.dark);
      if (grip.id === 'angled_grip') {
        part(0.055, 0.16, 0.06, x, y - 0.08, z + 0.025, this.polymer, 0.34);
        part(0.045, 0.05, 0.04, x, y - 0.16, z + 0.075, this.rubber, 0.34);
      } else {
        part(0.055, 0.17, 0.06, x, y - 0.09, z, this.polymer, -0.08);
        for (let i = 0; i < 3; i++) part(0.058, 0.012, 0.063, x, y - 0.07 - i * 0.045, z, this.rubber, -0.08);
      }
    }

    const magazine = attachmentById(installed.magazine);
    if (magazine && mounts.magazine) {
      const [x, y, z] = mounts.magazine;
      part(0.085, 0.19, 0.115, x, y - 0.06, z, this.dark);
      part(0.09, 0.03, 0.12, x, y - 0.16, z + 0.005, this.steel);
      part(0.018, 0.085, 0.012, x, y - 0.09, z - 0.06, this.chrome);
      for (let i = 0; i < 3; i++) part(0.008, 0.05, 0.125, x - 0.042, y - 0.03 - i * 0.04, z, this.steel);
    }

    const stock = attachmentById(installed.stock);
    if (stock && mounts.stock) {
      const [x, y, z] = mounts.stock;
      part(0.075, 0.055, 0.22, x, y, z, this.dark);
      if (stock.id === 'precision_stock') {
        part(0.1, 0.16, 0.2, x, y - 0.02, z + 0.08, this.olive);
        part(0.105, 0.055, 0.055, x, y + 0.04, z + 0.14, this.dark);
        part(0.06, 0.08, 0.025, x, y - 0.07, z + 0.16, this.rubber);
        part(0.12, 0.04, 0.06, x, y + 0.105, z + 0.05, this.dark);
      } else if (stock.id === 'light_stock') {
        part(0.07, 0.12, 0.18, x, y - 0.03, z + 0.04, this.polymer);
        part(0.075, 0.15, 0.025, x, y - 0.03, z + 0.15, this.rubber);
        part(0.08, 0.025, 0.12, x, y + 0.035, z + 0.03, this.steel);
      } else {
        part(0.085, 0.14, 0.22, x, y - 0.02, z + 0.02, this.polymer);
        part(0.09, 0.16, 0.026, x, y - 0.02, z + 0.15, this.rubber);
        part(0.055, 0.06, 0.2, x, y + 0.07, z + 0.07, this.dark);
        for (let i = 0; i < 3; i++) part(0.01, 0.035, 0.055, x - 0.048, y - 0.03, z + 0.02 + i * 0.05, this.steel);
      }
    }
  }

  /** Visible trigger and support hands with individual gripping fingers. */
  buildHands() {
    // Viewmodel hands are lit separately from the world so muzzle flash and
    // the street lighting cannot wash the fingers into one white silhouette.
    // The hands are gloved for the same reason real weapon references use a
    // dark glove: bare skin reads as one bright orange slab beside the dark
    // receiver and hides the mechanical shapes the player is meant to see.
    const skin = new THREE.MeshBasicMaterial({ color: 0x5b4a39 });
    const knuckle = new THREE.MeshBasicMaterial({ color: 0x3e3227 });
    this.handMat = skin;
    this.knuckleMat = knuckle;
    const make = (side) => {
      const group = new THREE.Group();
      // Only a short wrist and the hand itself enter the camera volume. The
      // earlier forearm slabs filled the lens and hid every reload action.
      const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.065, 0.09), skin);
      wrist.position.set(side * 0.012, -0.032, 0.045);
      wrist.rotation.x = -0.1;
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.072, 0.11), skin);
      palm.position.set(0, 0, -0.025);
      palm.rotation.x = 0.12;
      group.add(wrist, palm);
      // Two visibly bent segments per finger. Seen from behind the gun the
      // knuckles sit above the grip and the tips curl underneath it, so the
      // hand reads as gripping rather than as a flat block.
      for (let i = 0; i < 4; i++) {
        const proximal = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.018), knuckle);
        proximal.position.set((i - 1.5) * 0.018, -0.038, -0.052);
        proximal.rotation.x = 0.62;
        const distal = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.045, 0.016), skin);
        distal.position.set((i - 1.5) * 0.018, -0.074, -0.071);
        distal.rotation.x = 1.22;
        group.add(proximal, distal);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.052, 0.024), skin);
      thumb.position.set(side * 0.047, -0.022, -0.042);
      thumb.rotation.z = side * 0.42;
      thumb.rotation.x = 0.5;
      group.add(thumb);
      group.scale.setScalar(0.78);
      return group;
    };
    this.handL = make(-1);
    this.handR = make(1);
    this.handLBase = new THREE.Vector3(-0.045, -0.075, -0.25);
    this.handRBase = new THREE.Vector3(0.038, -0.14, 0.015);
    this.handL.position.copy(this.handLBase);
    this.handR.position.copy(this.handRBase);
    this.viewModel.add(this.handL, this.handR);
  }

  resetHands() {
    if (!this.handL || !this.handR) return;
    this.handL.position.copy(this.handLBase);
    this.handR.position.copy(this.handRBase);
    this.handL.rotation.set(0, 0, 0);
    this.handR.rotation.set(0, 0, 0);
  }

  /** Keep both working hands readable over the weapon during a reload. */
  setHandOverlay(on) {
    if (!this.handMat || !this.knuckleMat) return;
    const overlay = !!on;
    this.handMat.depthTest = !overlay;
    this.handMat.depthWrite = !overlay;
    this.knuckleMat.depthTest = !overlay;
    this.knuckleMat.depthWrite = !overlay;
    for (const hand of [this.handL, this.handR]) {
      if (!hand) continue;
      hand.traverse((child) => { child.renderOrder = overlay ? 30 : 0; });
    }
  }

  /**
   * Build the mechanical hardware for the current reload family. The hands and
   * these parts are all viewmodel geometry, so the sequence works with the
   * existing first-person camera without a parallel animation rig.
   */
  /**
   * Idle grips. Reload profiles deliberately describe where a hand travels
   * during a reload, not where it rests on the gun. Without this pass the
   * support hand sat beside the receiver instead of on the fore-end.
   */
  applyHandHold() {
    const id = this.weapon.model || this.weapon.id;
    const family = this.reloadSpec?.family;
    const holds = {
      pistol: [[-0.045, -0.155, -0.01], [0.035, -0.14, 0.025]],
      revolver: [[-0.045, -0.16, -0.01], [0.04, -0.15, 0.035]],
      smg: [[-0.045, -0.15, -0.24], [0.04, -0.15, 0.04]],
      carbine: [[-0.04, -0.15, -0.26], [0.04, -0.15, 0.045]],
      boltRifle: [[-0.04, -0.14, -0.23], [0.04, -0.14, 0.05]],
      shellTube: [[-0.04, -0.145, -0.34], [0.04, -0.15, 0.07]],
      belt: [[-0.045, -0.14, -0.33], [0.045, -0.15, 0.05]],
      minigun: [[-0.06, -0.16, -0.2], [0.05, -0.16, 0.04]],
      nailer: [[-0.045, -0.14, -0.31], [0.04, -0.15, 0.05]],
      impaler: [[-0.045, -0.14, -0.3], [0.04, -0.15, 0.05]],
      crossbow: [[-0.04, -0.14, -0.28], [0.04, -0.15, 0.05]],
      breakAction: [[-0.05, -0.145, -0.24], [0.04, -0.15, 0.06]],
      launcher: [[-0.05, -0.15, -0.28], [0.04, -0.15, 0.05]],
      rocket: [[-0.05, -0.15, -0.3], [0.04, -0.15, 0.05]],
    };
    let hold = holds[family];
    if (id === 'cleaver') hold = [[-0.03, -0.18, -0.01], [0.04, -0.15, 0.045]];
    else if (id === 'sword') hold = [[-0.025, -0.055, 0.015], [0.012, -0.055, 0.12]];
    else if (id === 'maul') hold = [[-0.04, -0.145, -0.22], [0.045, -0.15, 0.02]];
    if (!hold) return;
    this.handLBase.fromArray(hold[0]);
    this.handRBase.fromArray(hold[1]);
    this.handL.position.copy(this.handLBase);
    this.handR.position.copy(this.handRBase);
  }

  buildReloadParts() {
    if (this.reloadRig) {
      this.reloadRig.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
      if (this.reloadRig.parent) this.reloadRig.parent.remove(this.reloadRig);
      this.reloadRig = null;
    }
    this.reloadPart = null;
    this.reloadSpare = null;
    this.reloadCharge = null;
    this.reloadProps = {};
    this.loadedRounds = [];
    this.cylinderRounds = [];
    this.reloadSpec = reloadSpecFor(this.weapon);
    if (!this.reloadSpec) {
      this.reloadKind = 'none';
      this.reloadType = 'none';
      return;
    }

    const spec = this.reloadSpec;
    this.reloadKind = spec.kind;
    this.reloadType = spec.family;
    const rig = new THREE.Group();
    this.gun.add(rig);
    this.reloadRig = rig;

    const remember = (mesh) => {
      mesh.userData.base = mesh.position.clone();
      mesh.userData.baseRot = mesh.rotation.clone();
      mesh.visible = false;
      this.reloadProps[mesh.userData.reloadKey] = mesh;
      rig.add(mesh);
      return mesh;
    };
    const box = (key, w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.userData.reloadKey = key;
      return remember(mesh);
    };
    const cylinder = (key, rt, rb, h, x, y, z, mat, segments = 10) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.x = Math.PI / 2;
      mesh.userData.reloadKey = key;
      return remember(mesh);
    };
    const group = (key, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.userData.reloadKey = key;
      return remember(g);
    };

    const [mw, mh, md] = spec.magDims;
    const mag = box('mag', mw, mh, md, spec.mag[0], spec.mag[1], spec.mag[2], this.dark);
    // Keep the fresh magazine inside the viewmodel frame. The old -0.27 m
    // staging point put the magazine and the hand holding it below the HUD;
    // -0.045 m presents it just beside the magwell where the hand can reach.
    const spare = box('spare', mw, mh, md, spec.mag[0], spec.mag[1] - 0.045, spec.mag[2], this.dark);
    // A contrasting floorplate makes a dark magazine readable inside the
    // darker palm and gives the eye a concrete object to follow into the well.
    const floorplate = new THREE.Mesh(new THREE.BoxGeometry(mw * 1.14, 0.018, md * 1.06), this.brass);
    floorplate.position.y = -mh * 0.5 + 0.009;
    floorplate.castShadow = false;
    spare.add(floorplate);
    this.reloadPart = mag;
    this.reloadSpare = spare;

    // Hardware that visibly actuates. Each family gets only the parts that its
    // real mechanism would have, but the geometry is shared where appropriate.
    if (spec.mech === 'slide') {
      this.reloadCharge = box('slide', 0.075, 0.026, 0.23, 0, 0.06, -0.075, this.steel);
    } else if (spec.mech === 'charging') {
      this.reloadCharge = box('charging', 0.026, 0.03, 0.095, -0.065, 0.035, -0.11, this.steel);
    } else if (spec.mech === 'bolt') {
      this.reloadCharge = box('bolt', 0.055, 0.026, 0.032, 0.052, 0.055, -0.055, this.steel);
      this.reloadCharge.rotation.z = -0.32;
      this.reloadProps.casing = box('casing', 0.018, 0.018, 0.055, 0.07, 0.075, -0.12, this.brass);
    } else if (spec.mech === 'pump') {
      // The shotgun already has a detailed wooden fore-end on a moving group.
      // Drive that instead of stacking a second, plainer pump block on top of
      // it; other pump-fed weapons still get their own charging handle.
      if (this.firePump) {
        this.reloadProps.pump = this.firePump;
        this.firePump.userData.base = new THREE.Vector3(0, 0, 0);
        this.firePump.userData.baseRot = this.firePump.rotation.clone();
      } else {
        this.reloadCharge = box('pump', 0.08, 0.06, 0.16, 0, -0.07, -0.33, this.polymer);
      }
    } else if (spec.mech === 'cylinder') {
      const g = group('cylinderGroup', 0, 0.025, -0.1);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.095, 12), this.steel);
      c.rotation.x = Math.PI / 2;
      c.userData.reloadKey = 'cylinder';
      c.userData.base = c.position.clone();
      c.userData.baseRot = c.rotation.clone();
      g.add(c);
      this.reloadCharge = g;
      this.reloadProps.cylinder = c;
    } else if (spec.mech === 'breech') {
      this.reloadCharge = box('door', 0.09, 0.09, 0.035, 0, -0.005, -0.04, this.steel);
      this.reloadCharge.rotation.x = -0.1;
    } else if (spec.mech === 'break') {
      const g = group('breechGroup', 0, -0.02, -0.16);
      const breech = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.22), this.steel);
      breech.userData.reloadKey = 'breech';
      breech.userData.base = breech.position.clone();
      breech.userData.baseRot = breech.rotation.clone();
      g.add(breech);
      this.reloadCharge = g;
      this.reloadProps.breech = breech;
    } else if (spec.mech === 'crank') {
      this.reloadCharge = cylinder('drum', 0.075, 0.075, 0.13, 0, -0.055, 0.02, this.steel, 12);
      this.reloadProps.drum.rotation.x = Math.PI / 2;
      box('feed', 0.045, 0.045, 0.2, 0, -0.12, -0.16, this.dark);
    } else if (spec.mech === 'draw') {
      this.reloadCharge = box('string', 0.012, 0.012, 0.34, 0, 0.075, -0.18, this.steel);
      box('draw', 0.026, 0.07, 0.03, 0, 0.06, -0.045, this.dark);
    }

    if (spec.kind === 'belly' || spec.kind === 'belt') {
      box('belt', 0.045, 0.025, 0.32, 0, -0.17, -0.02, this.brass || this.steel);
    }

    // The held round is the object the left hand actually loads. Each profile
    // gives it a different silhouette: shell, cartridge, grenade, rocket, bolt.
    let held;
    if (spec.kind === 'shell' || spec.kind === 'break') {
      held = cylinder('round', 0.019, 0.019, 0.12, 0, -0.24, -0.23, this.gripMat);
      held.userData.roundKind = 'shell';
    } else if (spec.kind === 'revolver') {
      held = cylinder('round', 0.016, 0.016, 0.052, 0, -0.24, -0.1, this.brass || this.steel, 8);
      held.userData.roundKind = 'cartridge';
    } else if (spec.kind === 'launcher') {
      held = new THREE.Mesh(new THREE.SphereGeometry(0.043, 8, 6), this.dark);
      held.position.set(0, -0.26, -0.16);
      held.userData.reloadKey = 'round';
      held.userData.roundKind = 'grenade';
      remember(held);
    } else if (spec.kind === 'rocket') {
      held = cylinder('round', 0.038, 0.038, 0.26, 0, -0.25, -0.16, this.dark, 8);
      held.userData.roundKind = 'rocket';
    } else if (spec.kind === 'bolt') {
      const g = group('boltLoad', 0, 0.05, -0.27);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.38, 6), this.steel);
      shaft.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 6), this.steel);
      tip.rotation.x = -Math.PI / 2;
      tip.position.z = 0.21;
      const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.007, 0.065), this.gripMat);
      fletch.position.z = -0.15;
      g.add(shaft, tip, fletch);
      held = g;
      held.userData.roundKind = 'bolt';
    }
    this.reloadHeld = held;
    if (held) this.reloadPart = held;

    // Loaded rounds visibly accumulate in the weapon. These are separate from
    // the held projectile so the hand can be seen seating each one.
    if (spec.kind === 'shell' || spec.kind === 'break') {
      const count = Math.min(8, this.magSize);
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.12, 8), this.gripMat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(-0.085 + i * 0.033, -0.066, -0.24);
        mesh.visible = false;
        mesh.userData.reloadKey = `loaded${i}`;
        mesh.userData.base = mesh.position.clone();
        mesh.userData.baseRot = mesh.rotation.clone();
        rig.add(mesh);
        this.loadedRounds.push(mesh);
      }
    } else if (spec.kind === 'revolver' || spec.kind === 'launcher') {
      const count = Math.min(8, this.magSize);
      const cylinderGroup = this.reloadProps.cylinderGroup;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const mesh = spec.kind === 'launcher'
          ? new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), this.dark)
          : new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.052, 8), this.brass || this.steel);
        if (spec.kind === 'revolver') mesh.rotation.x = Math.PI / 2;
        mesh.position.set(Math.cos(a) * 0.042, Math.sin(a) * 0.042, 0.052);
        mesh.visible = false;
        mesh.userData.reloadKey = `chamber${i}`;
        mesh.userData.base = mesh.position.clone();
        mesh.userData.baseRot = mesh.rotation.clone();
        if (cylinderGroup) cylinderGroup.add(mesh); else rig.add(mesh);
        this.cylinderRounds.push(mesh);
      }
      if (spec.kind === 'launcher') {
        // A rotary launcher has its own larger cylinder, independent of the
        // revolver's six small chambers.
        if (cylinderGroup) cylinderGroup.scale.setScalar(1.3);
      }
    } else if (spec.kind === 'rocket') {
      const count = Math.min(2, this.magSize);
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.2, 8), this.dark);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(-0.035 + i * 0.07, -0.03, -0.12);
        mesh.visible = false;
        mesh.userData.reloadKey = `rocket${i}`;
        mesh.userData.base = mesh.position.clone();
        mesh.userData.baseRot = mesh.rotation.clone();
        rig.add(mesh);
        this.loadedRounds.push(mesh);
      }
    }

    // A small brass deflector makes bolt-action and revolver cycles read.
    if (spec.mech === 'bolt') {
      const casing = this.reloadProps.casing;
      if (casing) casing.userData.roundKind = 'casing';
    }

    this.reloadHandL = new THREE.Vector3().fromArray(spec.handL);
    this.reloadHandR = new THREE.Vector3().fromArray(spec.handR);
    this.updateIdleReloadVisuals();
  }

  resetReloadProps() {
    if (!this.reloadRig) return;
    for (const key in this.reloadProps) {
      const mesh = this.reloadProps[key];
      if (!mesh?.userData?.base) continue;
      mesh.position.copy(mesh.userData.base);
      mesh.rotation.copy(mesh.userData.baseRot);
      mesh.scale.set(1, 1, 1);
      mesh.visible = false;
    }
    for (const mesh of this.loadedRounds) {
      mesh.position.copy(mesh.userData.base);
      mesh.rotation.copy(mesh.userData.baseRot);
      mesh.visible = false;
    }
    for (const mesh of this.cylinderRounds) {
      mesh.position.copy(mesh.userData.base);
      mesh.rotation.copy(mesh.userData.baseRot);
      mesh.visible = false;
    }
  }

  showReloadProp(key, visible = true) {
    const mesh = this.reloadProps[key];
    if (mesh) mesh.visible = visible;
  }

  /** The weapon at rest: installed magazine, chambered rounds and mechanisms. */
  updateIdleReloadVisuals() {
    if (!this.reloadSpec || !this.reloadRig) return;
    this.resetReloadProps();
    this.resetHands();
    const spec = this.reloadSpec;
    if (spec.kind === 'mag' || spec.kind === 'belt' || spec.kind === 'canister' || spec.kind === 'drum') {
      this.showReloadProp('mag', this.mag > 0);
      if (spec.kind === 'belt') this.showReloadProp('belt', this.mag > 0);
    }
    if (spec.kind === 'bolt') this.showReloadProp('boltLoad', this.mag > 0);
    if (spec.kind === 'revolver' || spec.kind === 'launcher') {
      this.showReloadProp('cylinderGroup', true);
      for (let i = 0; i < this.cylinderRounds.length; i++) this.cylinderRounds[i].visible = i < this.mag;
    }
    if (spec.kind === 'rocket') {
      this.showReloadProp('door', true);
      for (let i = 0; i < this.loadedRounds.length; i++) this.loadedRounds[i].visible = i < this.mag;
    }
    if (spec.kind === 'shell' || spec.kind === 'break') {
      for (let i = 0; i < this.loadedRounds.length; i++) this.loadedRounds[i].visible = i < this.mag;
    }
    if (spec.mech === 'slide') this.showReloadProp('slide', true);
    else if (spec.mech === 'charging') this.showReloadProp('charging', true);
    else if (spec.mech === 'bolt') this.showReloadProp('bolt', true);
    else if (spec.mech === 'pump') this.showReloadProp('pump', true);
    else if (spec.mech === 'breech') this.showReloadProp('door', true);
    else if (spec.mech === 'break') this.showReloadProp('breechGroup', true);
    else if (spec.mech === 'cylinder') this.showReloadProp('cylinderGroup', true);
    else if (spec.mech === 'crank') {
      this.showReloadProp('drum', true);
      this.showReloadProp('feed', true);
    } else if (spec.mech === 'draw') {
      this.showReloadProp('string', true);
      this.showReloadProp('draw', true);
    }
  }

  /**
   * Drive the mechanical reload from normalized progress. The ammo state is
   * advanced by applyReloadProgress before this runs; the visuals therefore
   * show the exact stage the ammunition count has reached.
   */
  _updateReloadVisuals(dt) {
    this.setHandOverlay(this.reloading);
    if (!this.reloadSpec || !this.reloadRig) return;
    this.updateIdleReloadVisuals();
    if (!this.reloading) return;

    const p = Math.max(0, Math.min(1, this.reloadT / Math.max(0.001, this.reloadDuration)));
    const smooth = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / Math.max(0.001, b - a)));
      return t * t * (3 - 2 * t);
    };
    const spec = this.reloadSpec;
    const bL = this.reloadHandL || this.handLBase;
    const bR = this.reloadHandR || this.handRBase;
    const mag = this.reloadProps.mag;
    const spare = this.reloadProps.spare;
    const magBase = mag?.userData.base;
    const spareBase = spare?.userData.base;
    const mech = this.reloadCharge;
    const mechBase = mech?.userData.base;
    const missing = Math.max(0, this.magSize - this.reloadStartMag);

    // Shared magazine-based families: pistol, SMG, carbine, rifle, spike gun.
    if (spec.kind === 'mag') {
      const remove = smooth(0.05, 0.25, p);
      const stow = smooth(0.26, 0.4, p);
      const insert = smooth(0.48, 0.64, p);
      const charge = smooth(0.74, 0.9, p);
      if (magBase) {
        mag.visible = p < 0.28 || p >= 0.64;
        mag.position.y = magBase.y - remove * 0.16;
        mag.position.z = magBase.z + remove * 0.025;
        if (p >= 0.64) mag.position.copy(magBase);
      }
      if (spareBase) {
        spare.visible = p >= 0.28 && p < 0.66;
        spare.position.y = spareBase.y + (1 - stow) * 0.04;
        if (insert > 0) {
          spare.position.y = spareBase.y + (1 - insert) * 0.08;
          spare.position.z = spareBase.z;
        }
      }
      const l = [];
      const magX = magBase?.x ?? 0;
      const magY = magBase?.y ?? -0.13;
      const magZ = magBase?.z ?? -0.02;
      l.push([0, bL.x, bL.y, bL.z], [0.04, bL.x, bL.y, bL.z]);
      l.push([0.15, magX - 0.01, magY - 0.01, magZ - 0.005]);
      l.push([0.25, magX - 0.01, magY - 0.1, magZ + 0.02]);
      l.push([0.32, magX - 0.01, magY - 0.045, magZ + 0.01]);
      l.push([0.4, magX - 0.01, magY - 0.045, magZ + 0.01]);
      l.push([0.49, magX - 0.01, magY - 0.045, magZ + 0.01]);
      l.push([0.61, magX, magY, magZ]);
      l.push([0.69, magX, magY, magZ]);
      l.push([0.82, bL.x, bL.y, bL.z], [1, bL.x, bL.y, bL.z]);
      sampleReloadPose(this.handL, l, p);
      const r = [[0, bR.x, bR.y, bR.z], [0.72, bR.x, bR.y, bR.z]];
      if (mechBase) {
        const mx = mechBase.x;
        const my = mechBase.y;
        const mz = mechBase.z;
        r.push([0.78, mx, my, mz], [0.9, mx, my, mz], [1, bR.x, bR.y, bR.z]);
      } else {
        r.push([0.82, bR.x, bR.y, bR.z], [1, bR.x, bR.y, bR.z]);
      }
      sampleReloadPose(this.handR, r, p);
      if (mechBase) {
        if (spec.mech === 'slide') {
          mech.position.z = mechBase.z + charge * 0.045;
          mech.position.y = mechBase.y - charge * 0.006;
        } else if (spec.mech === 'charging') {
          mech.position.z = mechBase.z + charge * 0.055;
          mech.position.y = mechBase.y - charge * 0.012;
        } else if (spec.mech === 'bolt') {
          mech.position.z = mechBase.z + charge * 0.075;
          mech.rotation.z = -0.32 - charge * 0.55;
          const ejected = this.reloadProps.ejected;
          if (ejected) {
            ejected.visible = charge > 0.25 && charge < 0.82;
            ejected.position.z = -0.1 + charge * 0.18;
            ejected.position.y = 0.08 + charge * 0.16;
            ejected.rotation.x += charge * 1.8;
          }
        }
      }
      if (spec.mech === 'bolt') {
        this.showReloadProp('bolt', true);
        const casing = this.reloadProps.casing;
        if (casing) casing.visible = p > 0.18 && p < 0.72;
      }
      // A fresh magazine is visibly present as soon as it is seated.
      if (p >= 0.64 && mag) mag.visible = true;
      return;
    }

    if (spec.kind === 'belt') {
      const cover = smooth(0.03, 0.22, p);
      const lift = smooth(0.16, 0.38, p);
      const insert = smooth(0.42, 0.6, p);
      const charge = smooth(0.74, 0.92, p);
      if (magBase) {
        mag.visible = p < 0.25 || p >= 0.6;
        mag.position.y = magBase.y - cover * 0.15;
        if (p >= 0.6) mag.position.copy(magBase);
      }
      if (spareBase) {
        spare.visible = p >= 0.24 && p < 0.64;
        spare.position.y = spareBase.y + (1 - insert) * 0.18;
      }
      this.showReloadProp('belt', this.mag > 0 || p >= 0.58);
      const belt = this.reloadProps.belt;
      if (belt) {
        belt.position.z = (belt.userData.base?.z ?? -0.02) - lift * 0.08 + charge * 0.03;
        belt.rotation.x = lift * 0.18;
      }
      const l = [
        [0, bL.x, bL.y, bL.z],
        [0.08, bL.x, bL.y, bL.z],
        [0.2, magBase.x, magBase.y, magBase.z],
        [0.3, magBase.x, magBase.y - 0.16, magBase.z],
        [0.4, spareBase.x, spareBase.y, spareBase.z],
        [0.55, magBase.x, magBase.y, magBase.z],
        [0.66, bL.x, bL.y, bL.z],
        [1, bL.x, bL.y, bL.z],
      ];
      sampleReloadPose(this.handL, l, p);
      const r = [
        [0, bR.x, bR.y, bR.z],
        [0.12, bR.x, bR.y, bR.z],
        [0.22, -0.06, 0.08, -0.1],
        [0.4, -0.06, 0.08, -0.1],
        [0.58, bR.x, bR.y, bR.z],
        [0.76, 0.06, 0.02, 0.02],
        [0.9, 0.06, 0.02, 0.02],
        [1, bR.x, bR.y, bR.z],
      ];
      sampleReloadPose(this.handR, r, p);
      if (mechBase) {
        mech.position.z = mechBase.z + charge * 0.05;
        mech.position.y = mechBase.y - charge * 0.01;
      }
      return;
    }

    if (spec.kind === 'shell' || spec.kind === 'break') {
      const breakAction = spec.kind === 'break';
      const open = breakAction ? smooth(0.03, 0.2, p) * (1 - smooth(0.82, 0.96, p)) : 0;
      const start = spec.insertStart ?? 0.2;
      const end = spec.insertEnd ?? 0.82;
      const u = Math.max(0, Math.min(1, (p - start) / Math.max(0.001, end - start)));
      const count = Math.max(1, missing);
      const slot = Math.min(count - 1, Math.floor(u * count));
      const frac = u * count - slot;
      const portX = magBase?.x ?? 0;
      const portY = magBase?.y ?? -0.1;
      const portZ = magBase?.z ?? -0.24;
      const lift = Math.sin(Math.PI * Math.max(0, Math.min(1, frac)));
      const active = p >= start && p < end && missing > 0;
      const held = this.reloadProps.round;
      if (held) {
        held.visible = active;
        if (active) {
          const hx = bL.x + (portX - bL.x) * lift;
          const hy = bL.y + (portY - bL.y) * lift;
          const hz = bL.z + (portZ - bL.z) * lift;
          held.position.set(hx, hy - 0.02, hz - 0.025);
          held.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        }
      }
      const l = [
        [0, bL.x, bL.y, bL.z],
        [0.08, bL.x, bL.y, bL.z],
      ];
      l.push([start, bL.x, bL.y, bL.z]);
      for (let i = 0; i < count; i++) {
        const a = start + ((i + 0.02) / count) * (end - start);
        const b = start + ((i + 0.5) / count) * (end - start);
        l.push([a, bL.x, bL.y, bL.z]);
        l.push([b, portX, portY, portZ]);
      }
      l.push([end, bL.x, bL.y, bL.z], [1, bL.x, bL.y, bL.z]);
      sampleReloadPose(this.handL, l, p);
      // The support hand feeds shells; the trigger hand keeps its grip.
      const r = [[0, bR.x, bR.y, bR.z], [1, bR.x, bR.y, bR.z]];
      sampleReloadPose(this.handR, r, p);
      if (breakAction) {
        const g = this.reloadProps.breechGroup;
        if (g) {
          g.rotation.x = open * 0.72;
          g.position.y = (g.userData.base?.y ?? -0.02) - open * 0.025;
        }
      } else if (this.reloadProps.pump?.userData.base) {
        const pumpBase = this.reloadProps.pump.userData.base;
        const pump = smooth(0.84, 0.98, p);
        this.reloadProps.pump.position.z = pumpBase.z + pump * 0.065;
        this.reloadProps.pump.position.y = pumpBase.y - pump * 0.01;
      }
      for (let i = 0; i < this.loadedRounds.length; i++) this.loadedRounds[i].visible = i < this.mag;
      return;
    }

    if (spec.kind === 'revolver' || spec.kind === 'launcher') {
      const revolver = spec.kind === 'revolver';
      const open = smooth(0.03, 0.18, p) * (1 - smooth(0.8, 0.95, p));
      const group = this.reloadProps.cylinderGroup;
      if (group) {
        group.rotation.z = -open * (revolver ? 1.25 : 0.72);
        group.position.x = -open * 0.035;
      }
      const start = spec.insertStart ?? 0.2;
      const end = spec.insertEnd ?? 0.78;
      const u = Math.max(0, Math.min(1, (p - start) / Math.max(0.001, end - start)));
      const count = Math.max(1, missing);
      const slot = Math.min(count - 1, Math.floor(u * count));
      const frac = u * count - slot;
      const lift = Math.sin(Math.PI * Math.max(0, Math.min(1, frac)));
      const portX = -0.02;
      const portY = 0.02;
      const portZ = -0.1;
      const held = this.reloadProps.round;
      if (held) {
        held.visible = p >= start && p < end && missing > 0;
        const hx = bL.x + (portX - bL.x) * lift;
        const hy = bL.y + (portY - bL.y) * lift;
        const hz = bL.z + (portZ - bL.z) * lift;
        held.position.set(hx, hy, hz);
      }
      const l = [
        [0, bL.x, bL.y, bL.z],
        [0.06, bL.x, bL.y, bL.z],
        [0.16, portX - 0.04, portY, portZ + 0.03],
        [start, portX - 0.04, portY, portZ + 0.03],
      ];
      for (let i = 0; i < count; i++) {
        const a = start + ((i + 0.15) / count) * (end - start);
        const b = start + ((i + 0.55) / count) * (end - start);
        l.push([a, portX - 0.04, portY, portZ + 0.03]);
        l.push([b, portX, portY, portZ]);
      }
      l.push([end, bL.x, bL.y, bL.z], [1, bL.x, bL.y, bL.z]);
      sampleReloadPose(this.handL, l, p);
      const r = [
        [0, bR.x, bR.y, bR.z],
        [0.18, bR.x, bR.y, bR.z],
        [0.4, 0.06, 0.02, -0.04],
        [0.75, 0.06, 0.02, -0.04],
        [0.92, bR.x, bR.y, bR.z],
        [1, bR.x, bR.y, bR.z],
      ];
      sampleReloadPose(this.handR, r, p);
      if (group) {
        group.rotation.z += smooth(start, end, p) * (Math.PI * 2 / Math.max(1, this.magSize));
      }
      for (let i = 0; i < this.cylinderRounds.length; i++) this.cylinderRounds[i].visible = i < this.mag;
      return;
    }

    if (spec.kind === 'rocket') {
      const open = smooth(0.03, 0.2, p) * (1 - smooth(0.75, 0.94, p));
      const door = this.reloadProps.door;
      if (door?.userData.base) {
        door.rotation.x = door.userData.baseRot.x - open * 1.05;
        door.position.y = door.userData.base.y + open * 0.045;
      }
      const start = spec.insertStart ?? 0.22;
      const end = spec.insertEnd ?? 0.7;
      const u = Math.max(0, Math.min(1, (p - start) / Math.max(0.001, end - start)));
      const count = Math.max(1, missing);
      const frac = u * count - Math.min(count - 1, Math.floor(u * count));
      const lift = Math.sin(Math.PI * Math.max(0, Math.min(1, frac)));
      const held = this.reloadProps.round;
      if (held) {
        held.visible = p >= start && p < end && missing > 0;
        held.position.set(bL.x + (0 - bL.x) * lift, bL.y + (-0.03 - bL.y) * lift, bL.z + (-0.16 - bL.z) * lift);
      }
      const l = [
        [0, bL.x, bL.y, bL.z],
        [0.08, bL.x, bL.y, bL.z],
        [start, 0, -0.12, -0.16],
        [end, 0, -0.03, -0.16],
        [0.82, bL.x, bL.y, bL.z],
        [1, bL.x, bL.y, bL.z],
      ];
      sampleReloadPose(this.handL, l, p);
      const r = [
        [0, bR.x, bR.y, bR.z],
        [0.2, bR.x, bR.y, bR.z],
        [0.4, 0.06, 0.02, -0.04],
        [0.8, 0.06, 0.02, -0.04],
        [0.95, bR.x, bR.y, bR.z],
        [1, bR.x, bR.y, bR.z],
      ];
      sampleReloadPose(this.handR, r, p);
      for (let i = 0; i < this.loadedRounds.length; i++) this.loadedRounds[i].visible = i < this.mag;
      return;
    }

    if (spec.kind === 'bolt') {
      const seat = smooth(0.56, 0.68, p);
      const draw = smooth(0.68, 0.9, p);
      const bolt = this.reloadProps.boltLoad;
      if (bolt) {
        bolt.visible = p >= 0.54;
        const base = bolt.userData.base;
        if (base) {
          bolt.position.set(base.x, base.y + (1 - seat) * 0.13, base.z + (1 - seat) * 0.03);
          bolt.visible = p >= 0.54;
        }
      }
      const string = this.reloadProps.string;
      if (string?.userData.base) {
        string.position.z = string.userData.base.z + draw * 0.07;
        string.position.x = string.userData.base.x;
      }
      const drawHandle = this.reloadProps.draw;
      if (drawHandle?.userData.base) {
        drawHandle.position.z = drawHandle.userData.base.z + draw * 0.07;
      }
      const l = [
        [0, bL.x, bL.y, bL.z],
        [0.12, bL.x, bL.y, bL.z],
        [0.36, -0.02, -0.02, -0.24],
        [0.58, 0, 0.045, -0.34],
        [0.7, 0, 0.045, -0.34],
        [0.82, bL.x, bL.y, bL.z],
        [1, bL.x, bL.y, bL.z],
      ];
      sampleReloadPose(this.handL, l, p);
      const r = [
        [0, bR.x, bR.y, bR.z],
        [0.18, bR.x, bR.y, bR.z],
        [0.45, 0, 0.07, -0.06],
        [0.78, 0, 0.07, 0.01],
        [0.9, bR.x, bR.y, bR.z],
        [1, bR.x, bR.y, bR.z],
      ];
      sampleReloadPose(this.handR, r, p);
      return;
    }

    if (spec.kind === 'drum') {
      const lift = smooth(0.03, 0.25, p);
      const insert = smooth(0.4, 0.62, p);
      const spin = smooth(0.68, 0.94, p);
      const drum = this.reloadProps.drum;
      if (drum?.userData.base) {
        drum.position.y = drum.userData.base.y - lift * 0.08 + insert * 0.08;
        drum.rotation.z = spin * Math.PI * 2;
      }
      const l = [
        [0, bL.x, bL.y, bL.z],
        [0.08, bL.x, bL.y, bL.z],
        [0.22, magBase?.x ?? 0, magBase?.y ?? -0.12, magBase?.z ?? 0],
        [0.38, bL.x, bL.y, bL.z],
        [0.5, spareBase?.x ?? 0, spareBase?.y ?? -0.3, spareBase?.z ?? 0],
        [0.66, bL.x, bL.y, bL.z],
        [1, bL.x, bL.y, bL.z],
      ];
      sampleReloadPose(this.handL, l, p);
      const r = [
        [0, bR.x, bR.y, bR.z],
        [0.2, bR.x, bR.y, bR.z],
        [0.38, 0.07, 0.07, -0.12],
        [0.88, 0.07, 0.07, -0.12],
        [1, bR.x, bR.y, bR.z],
      ];
      sampleReloadPose(this.handR, r, p);
      this.showReloadProp('drum', true);
      this.showReloadProp('feed', true);
      return;
    }

    if (spec.kind === 'canister') {
      const swap = smooth(0.04, 0.28, p);
      const slide = smooth(0.4, 0.62, p);
      const pump = smooth(0.74, 0.94, p);
      if (magBase) {
        mag.visible = p < 0.3 || p >= 0.62;
        mag.position.y = magBase.y - swap * 0.12;
      }
      if (spareBase) {
        // The fresh canister must exist while the hand carries it; otherwise
        // the hand mimes a swap and the canister teleports into the well.
        spare.visible = p >= 0.3 && p < 0.62;
        spare.position.y = spareBase.y + (1 - slide) * 0.06;
        spare.position.z = spareBase.z;
      }
      const l = [
        [0, bL.x, bL.y, bL.z],
        [0.08, bL.x, bL.y, bL.z],
        [0.2, magBase?.x ?? 0, magBase?.y ?? -0.12, magBase?.z ?? 0],
        [0.34, bL.x, bL.y, bL.z],
        [0.48, spareBase?.x ?? 0, spareBase?.y ?? -0.3, spareBase?.z ?? 0],
        [0.62, magBase?.x ?? 0, magBase?.y ?? -0.12, magBase?.z ?? 0],
        [0.8, bL.x, bL.y, bL.z],
        [1, bL.x, bL.y, bL.z],
      ];
      sampleReloadPose(this.handL, l, p);
      sampleReloadPose(this.handR, [[0, bR.x, bR.y, bR.z], [1, bR.x, bR.y, bR.z]], p);
      if (mechBase) {
        mech.position.z = mechBase.z + pump * 0.07;
      }
      return;
    }
  }
  /** Rebuild active gun stats and the physical model after a market change. */
  refreshWeaponMods() {
    const weapon = this.weapon;
    if (!weapon || weapon.melee) return;
    applyWeaponMods(weapon);
    this.magSize = weapon.magSize;
    this.mag = Math.min(this.mag, this.magSize);
    weapon.mag = this.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.cooldown = Math.max(this.cooldown, 0.15);
    this.cancelAim();
    this.buildGunModel();
    this.onWeapon?.();
    this.onAmmo?.();
    this.onAim?.();
  }

  /** Restore a saved ten-slot loadout without changing any saved attachments. */
  restoreLoadout(defs, index = 0) {
    if (!Array.isArray(defs) || !defs.length) return false;
    const next = [];
    for (let i = 0; i < LOADOUT_SIZE; i++) {
      const def = defs[i] || this.baseWeapons[i];
      if (!def) continue;
      const weapon = {
        ...def,
        attachments: { ...(def.attachments || {}) },
        mag: Number.isFinite(def.magSize) ? def.magSize : 0,
      };
      applyWeaponMods(weapon);
      weapon.mag = Number.isFinite(weapon.magSize) ? weapon.magSize : 0;
      next.push(weapon);
    }
    if (!next.length) return false;
    this.weapons = next;
    this.baseWeapons = next.map((weapon) => ({ ...weapon, attachments: { ...(weapon.attachments || {}) } }));
    this.weaponIndex = Math.max(0, Math.min(next.length - 1, index));
    this.weapon = this.weapons[this.weaponIndex];
    this.magSize = this.weapon.magSize;
    this.mag = this.weapon.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDuration = this.weapon.reload;
    this.cooldown = 0.2;
    this.blocking = false;
    this.meleeCombo = 0;
    this.buildGunModel();
    this.onWeapon?.();
    this.onAmmo?.();
    this.onAim?.();
    return true;
  }

  /**
   * Reorder the loadout without changing the gun in your hands. Ammo stays
   * with the slot it belongs to, and the selected index follows that gun.
   */
  swapWeapons(a, b) {
    if (a === b || a < 0 || b < 0 || a >= this.weapons.length || b >= this.weapons.length) return false;
    [this.weapons[a], this.weapons[b]] = [this.weapons[b], this.weapons[a]];
    if (this.weaponIndex === a) this.weaponIndex = b;
    else if (this.weaponIndex === b) this.weaponIndex = a;
    this.weapon = this.weapons[this.weaponIndex];
    this.magSize = this.weapon.magSize;
    this.mag = this.weapon.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDuration = this.weapon.reload;
    this.cooldown = 0.25;
    this.recoil = 0;
    this.triggerHeld = false;
    this.flash.visible = false;
    this.flashLight.intensity = 0;
    this.buildGunModel();
    this.sound.switchGun?.();
    this.onWeapon?.();
    this.onAmmo?.();
    this.onAim?.();
    return true;
  }

  /** Swap a whole slot for another weapon definition (shop purchase / revert). */
  replaceWeapon(index, def) {
    if (index < 0 || index >= this.weapons.length || !def) return;
    const weapon = { ...def, attachments: { ...(def.attachments || {}) }, mag: def.magSize };
    applyWeaponMods(weapon);
    weapon.mag = weapon.magSize;
    this.weapons[index] = weapon;
    if (index !== this.weaponIndex) return;
    this.weapon = weapon;
    this.magSize = weapon.magSize;
    this.mag = weapon.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDuration = weapon.reload;
    this.cooldown = 0.25;
    // Market assignment is an equip action: play this weapon's own raise.
    this.drawDuration = weapon.drawTime ?? 0.26;
    this.drawT = this.drawDuration;
    this.recoil = 0;
    this.triggerHeld = false;
    this.flash.visible = false;
    this.flashLight.intensity = 0;
    this.buildGunModel();
    this.sound.switchGun?.();
    this.onWeapon?.();
    this.onAmmo?.();
    this.onAim?.();
  }

  setAiming(on) {
    const next = !!on && !this.dead;
    if (this.weapon.melee) {
      const blocking = next && !!this.weapon.block;
      if (this.blocking === blocking) return;
      this.blocking = blocking;
      this.aiming = false;
      this.scoped = false;
      this.viewModel.visible = true;
      this.onAim?.();
      return;
    }
    if (this.aiming === next) return;
    this.aiming = next;
    this.blocking = false;
    if (!next) {
      this.scoped = false;
      this.viewModel.visible = true;
    }
    this.onAim?.();
  }

  cancelAim() {
    this.aiming = false;
    this.scoped = false;
    this.blocking = false;
    this.viewModel.visible = true;
    this.onAim?.();
  }

  /** Cycle the ten equipped gun slots. */
  cycleWeapon(dir) {
    if (!dir) return;
    const n = this.weapons.length;
    for (let step = 1; step < n; step++) {
      const index = (this.weaponIndex + dir * step + n * 4) % n;
      if (this.weapons[index]) {
        this.switchWeapon(index);
        return;
      }
    }
  }

  switchWeapon(index) {
    if (index < 0 || index >= this.weapons.length || index === this.weaponIndex) return false;
    if (!this.weapons[index]) return false;
    this.weaponIndex = index;
    this.weapon = this.weapons[index];
    applyWeaponMods(this.weapon);
    this.magSize = this.weapon.magSize;
    this.mag = Math.min(this.weapon.mag, this.magSize);
    this.reloading = false;
    this.reloadT = 0;
    this.reloadDuration = this.weapon.reload;
    this.cooldown = 0.25;
    this.recoil = 0;
    this.triggerHeld = false;
    this.blocking = false;
    this.meleeCombo = 0;
    this.bashT = 0;
    this.bashDur = 0;
    this.bashImpacted = false;
    this.bashDef = null;
    this.flash.visible = false;
    this.flashLight.intensity = 0;
    // A short draw cycle lowers the fresh weapon and raises it into the hold
    // pose. It is presentation only; the existing cooldown owns readiness.
    this.drawDuration = this.weapon.drawTime ?? 0.26;
    this.drawT = this.drawDuration;
    this.buildGunModel();
    this.sound.switchGun?.();
    this.onWeapon?.();
    this.onAmmo?.();
    this.onAim?.();
    return true;
  }

  look(dx, dy) {
    const sensitivity =
      0.0022 * GAME_SETTINGS.sensitivity * (this.aiming ? GAME_SETTINGS.adsSensitivity : 1);
    this.yaw -= dx * sensitivity;
    this.pitch -= (GAME_SETTINGS.invertY ? -dy : dy) * sensitivity;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  /** Enter or leave the low stance. The camera eases down in update(). */
  setCrouch(on) {
    this.crouching = !!on && !this.dead;
  }

  toggleCrouch() {
    this.crouching = !this.crouching && !this.dead;
  }

  /** World-space body centre used by enemy aim and hit resolution. */
  bodyCenterY() {
    return this.pos.y + this.hitCenterStand + (this.hitCenterCrouch - this.hitCenterStand) * this.crouchBlend;
  }

  eyeY() {
    return this.pos.y + this.eyeHeight;
  }

  /** Hide the firearm and hand input to the build tool. */
  setBuildMode(on) {
    this.buildMode = !!on;
    if (this.buildMode) {
      this.triggerHeld = false;
      this.cancelAim();
      this.viewModel.visible = false;
    } else {
      this.viewModel.visible = this.weapon.melee || !this.scoped;
    }
    this.onAim?.();
  }

  /** Reset to a clean 1v1 loadout without touching the saved armoury. */
  configureMatch({ spawn, yaw = 0, maxHealth = 150, regenRate = 0, maxShield = 0 }) {
    this.maxShield = maxShield;
    this.shield = 0;
    if (spawn) {
      this.pos.copy(spawn);
      this.spawn.copy(spawn);
    }
    this.vel.set(0, 0, 0);
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.regenRate = regenRate;
    this.dead = false;
    this.respawnT = 0;
    this.invuln = 1;
    this.hurtT = 0;
    this.shake = 0;
    this.regenDelay = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.crouching = false;
    this.crouchBlend = 0;
    this.buildMode = false;
    this.reloading = false;
    this.reloadT = 0;
    this.drawT = 0;
    this.bashT = 0;
    this.bashDur = 0;
    this.bashImpacted = false;
    this.bashDef = null;
    this.strafeRoll = 0;
    this.triggerHeld = false;
    this.cancelAim();
    this.viewModel.visible = true;
    for (const weapon of this.weapons) weapon.mag = weapon.magSize;
    this.magSize = this.weapon.magSize;
    this.mag = this.weapon.magSize;
    this.weapon.mag = this.mag;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.onHealth?.(this.health);
    this.onAmmo?.();
    this.onWeapon?.();
  }

  /** Restore the sandbox health model when a 1v1 match ends. */
  restoreSandbox() {
    this.maxHealth = 100;
    this.health = 100;
    this.regenRate = 3.5;
    this.shield = 0;
    this.maxShield = 0;
    this.brMode = false;
    this.dead = false;
    this.respawnT = 0;
    this.bashT = 0;
    this.bashDur = 0;
    this.bashDef = null;
    this.setBuildMode(false);
    this.onHealth?.(this.health);
  }

  pressTrigger() {
    this.triggerHeld = true;
    this.tryFire();
  }

  releaseTrigger() {
    this.triggerHeld = false;
  }

  tryFire() {
    if (this.buildMode || this.reloading || this.bashT > 0 || this.cooldown > 0 || this.dead) return;
    const w = this.weapon;
    if (w.melee) {
      this.meleeStrike(w);
      return;
    }
    if (this.mag <= 0) {
      this.sound.empty();
      this.onEmpty?.();
      this.cooldown = 0.28;
      return;
    }
    this.mag--;
    w.mag = this.mag;
    if (this.reloadPart && this.reloadKind === 'bolt') this.reloadPart.visible = false;
    this.cooldown = w.cooldown;
    // The pump shotgun's action cycle is part of its firing animation, not a
    // hidden timer. Keep the heavy recoil but let the next shell be ready
    // sooner once the slide has been worked.
    if (w.id === 'shotgun' && this.firePump) {
      this.fireCycleDur = 0.24;
      this.fireCycleT = this.fireCycleDur;
    }
    this.fireCount++;
    this.recoil = w.recoil * (1 - this.aimBlend * 0.22);
    const kickScale = 1 - this.aimBlend * 0.3;
    this.pitch = Math.min(1.45, this.pitch + (w.kick + Math.random() * w.kick * 0.5) * kickScale);
    this.yaw += (Math.random() - 0.5) * w.kick * 0.35 * kickScale;

    const suppression = w.suppressed ? 0.16 : 1;
    this.flash.visible = true;
    this.flashTimer = w.suppressed ? 0.025 : 0.05;
    this.flash.rotation.z = Math.random() * 6.28;
    this.flash.scale.setScalar((0.8 + Math.random() * 0.7) * w.flashSize * suppression);
    this.flashLight.intensity = w.flashLight * suppression * suppression;

    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(_origin);
    _aim.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.flash.getWorldPosition(_muzzle);
    const muzzle = _muzzle.clone();

    const ballistics = ballisticSpec(w);
    const aimSpread = this.aiming ? (w.scope ? 0.15 : 0.55) : 1;
    for (let p = 0; p < w.pellets; p++) {
      _dir.copy(_aim);
      const spread = w.spread * aimSpread * (p === 0 ? 0.6 : 1);
      _dir.x += (Math.random() - 0.5) * spread * 2;
      _dir.y += (Math.random() - 0.5) * spread * 2;
      _dir.z += (Math.random() - 0.5) * spread * 2;
      _dir.normalize();
      this.onFire?.(_origin.clone(), _dir.clone(), muzzle, {
        damage: w.damage,
        ap: w.ap,
        force: w.force ?? 0.3,
        impact: w.force ?? 0.3,
        weapon: w.id,
        sound: w.sound || w.id,
        shell: w.shell !== false,
        falloff: w.falloff || null,
        projectile: w.projectile || null,
        projectileType: w.projectileType || null,
        projectileSpeed: w.projectileSpeed || null,
        projectileGravity: w.projectileGravity ?? null,
        velocity: ballistics?.speed ?? null,
        maxRange: ballistics?.range ?? 120,
        dropScale: ballistics?.drop ?? 1,
        blast: w.blast || null,
        scope: !!w.scope,
        suppressed: !!w.suppressed,
        sight: w.sight || 'iron',
        bolt: w.sound === 'crossbow' || w.id === 'crossbow' || w.id === 'railbow',
        pellet: p,
        pellets: w.pellets,
      });
    }

    this.sound.shot(w.sound || w.id, { suppressed: !!w.suppressed });
    this.onAmmo?.();
  }

  /** One physical melee swing. Main resolves the blade fan against the world
   * and bodies; this method owns the swing style, timing and viewmodel pose. */
  meleeStrike(def = this.weapon, quick = false) {
    if (this.dead || this.cooldown > 0) return false;
    const styles = def.styles || ['slash'];
    const style = styles[this.meleeCombo % styles.length];
    this.cooldown = quick ? Math.min(0.44, def.cooldown) : def.cooldown;
    this.fireCount++;
    this.meleeStyle = style;
    this.meleeSwingDur = def.swing * (style === 'thrust' ? 0.78 : 1);
    this.meleeSwingT = this.meleeSwingDur;
    this.recoil = def.recoil * 0.25;
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(_origin);
    _aim.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    _r.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _meleeUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const arc = style === 'thrust' ? def.arc * 0.28 : style === 'overhead' ? def.arc * 0.78 : def.arc;
    const range = style === 'thrust' ? def.range * 1.08 : def.range;
    const damage = style === 'overhead' ? def.damage * 1.12 : style === 'thrust' ? def.damage * 1.05 : def.damage;
    // Start the blade fan from the weapon rather than the pupil. The offset
    // also keeps a close wall from absorbing a hit the blade visibly reaches.
    _origin
      .addScaledVector(_r, style === 'overhead' ? 0.04 : 0.16)
      .addScaledVector(_meleeUp, style === 'overhead' ? 0.2 : -0.1)
      .addScaledVector(_aim, style === 'thrust' ? 0.52 : 0.32);
    this.onMelee?.(_origin.clone(), _aim.clone(), {
      ...def,
      style,
      arc,
      range,
      damage,
      slash: _r.clone(),
    });
    this.sound.melee?.(def.cut, def.id);
    this.meleeCombo = (this.meleeCombo + 1) % Math.max(1, styles.length);
    return true;
  }

  quickMelee() {
    this.meleeStrike(QUICK_MELEE, true);
  }

  /**
   * A firearm bash. This is a physical stock/pistol strike, not the old quick
   * knife action. Contact is resolved at the strike frame, not on key-down.
   */
  weaponBash() {
    if (this.dead || this.buildMode || this.reloading || this.cooldown > 0) return false;
    const w = this.weapon;
    if (!w || w.melee) return false;
    const heavy = /shotgun|rifle|magnum|lmg|minigun|thumper|siege|hammer|scatter|sawedoff/.test(w.id);
    const veryHeavy = /lmg|minigun|thumper|siege/.test(w.id);
    const dur = 0.42 + Math.min(0.38, (w.force || 0.4) * 0.2) + (veryHeavy ? 0.16 : 0);
    const range = 1.55 + Math.min(0.75, (w.force || 0.4) * 0.16) + (heavy ? 0.22 : 0);
    this.cancelAim();
    this.triggerHeld = false;
    this.bashDur = dur;
    this.bashT = dur;
    this.bashHitAt = 0.13 + (heavy ? 0.08 : 0);
    this.bashImpacted = false;
    this.bashDef = {
      ...w,
      id: `${w.id}-bash`,
      name: `${w.name} BASH`,
      bash: true,
      melee: false,
      cut: 'blunt',
      style: 'thrust',
      damage: 17 + (w.force || 0.4) * 23 + (heavy ? 8 : 0) + (veryHeavy ? 7 : 0),
      ap: 0.08,
      force: 1.25 + (w.force || 0.4) * 1.4 + (veryHeavy ? 0.5 : 0),
      range,
      arc: 0.075,
      swing: dur,
      recoil: Math.min(4.5, 1.2 + (w.force || 0.4) * 1.8),
    };
    this.cooldown = dur + (veryHeavy ? 0.2 : 0.08);
    this.viewModel.visible = true;
    this.sound.melee?.('blunt', w.id);
    return true;
  }

  /** Called once, at the physical strike frame of a weapon bash. */
  _triggerBashImpact() {
    if (this.bashImpacted || !this.bashDef) return;
    this.bashImpacted = true;
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(_origin);
    _aim.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    _r.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _meleeUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    _origin
      .addScaledVector(_r, 0.12)
      .addScaledVector(_meleeUp, -0.06)
      .addScaledVector(_aim, 0.25);
    this.onBash?.(_origin.clone(), _aim.clone(), { ...this.bashDef, slash: _r.clone() });
  }

  updateReloadVisuals(dt) {
    this._updateReloadVisuals(dt);
    this.settleReloadHands();
  }

  /** Blend the hands on and off their reload rests at the ends of the action. */
  settleReloadHands() {
    if (!this.reloading || !this.reloadHandL || !this.reloadHandR) return;
    const p = Math.max(0, Math.min(1, this.reloadT / Math.max(0.001, this.reloadDuration)));
    if (p < 0.08) {
      const t = p / 0.08;
      const w = t * t * (3 - 2 * t);
      this.handL.position.lerpVectors(this.handLBase, this.handL.position, w);
      this.handR.position.lerpVectors(this.handRBase, this.handR.position, w);
    } else if (p > 0.92) {
      const t = (p - 0.92) / 0.08;
      const w = t * t * (3 - 2 * t);
      this.handL.position.lerpVectors(this.handL.position, this.handLBase, w);
      this.handR.position.lerpVectors(this.handR.position, this.handRBase, w);
    }
  }

  /** Work the shotgun's fore-end after each shot, synced to its short cycle. */
  updateFireCycle(dt) {
    if (!this.firePump) return;
    // Reload visuals own the fore-end while shells are being loaded. Do not
    // snap it back to rest underneath the insertion animation.
    if (this.reloading) {
      this.fireCycleT = 0;
      return;
    }
    if (this.fireCycleT > 0) {
      this.fireCycleT = Math.max(0, this.fireCycleT - dt);
      const p = 1 - this.fireCycleT / Math.max(0.001, this.fireCycleDur);
      // Pull rearward, then drive forward. The sin gives a firm stop at both
      // ends of the stroke instead of a sliding linear shove.
      const stroke = Math.sin(Math.min(1, p) * Math.PI);
      this.firePump.position.set(
        this.firePumpBase.x,
        this.firePumpBase.y,
        this.firePumpBase.z + stroke * 0.062,
      );
      this.firePump.rotation.x = stroke * -0.05;
    } else {
      this.fireCycleT = 0;
      this.firePump.position.copy(this.firePumpBase);
      this.firePump.rotation.x = 0;
    }
  }

  /**
   * Advance the ammunition state in lockstep with the visible mechanical
   * stage. A box magazine becomes live when it is seated; shells, cartridges,
   * grenades and rockets become live one at a time as each is inserted.
   */
  applyReloadProgress() {
    const spec = this.reloadSpec;
    if (!spec) return;
    const p = Math.max(0, Math.min(1, this.reloadT / Math.max(0.001, this.reloadDuration)));
    let target = this.mag;
    if (spec.roundBased) {
      const start = spec.insertStart ?? 0.2;
      const end = spec.insertEnd ?? 0.82;
      const missing = Math.max(0, this.magSize - this.reloadStartMag);
      if (!missing) return;
      const raw = Math.max(0, (p - start) / Math.max(0.001, end - start));
      target = Math.min(this.magSize, this.reloadStartMag + Math.floor(raw * missing + 1e-7));
    } else if (p >= (spec.seatAt ?? 0.58)) {
      target = this.magSize;
    }
    if (target !== this.mag) {
      this.mag = target;
      this.weapon.mag = target;
      this.onAmmo?.();
    }
  }

  startReload() {
    if (this.weapon.melee || this.reloading || this.bashT > 0 || this.mag >= this.magSize || this.dead) return;
    if (this.brMode) {
      const reserve = Math.max(0, Number(this.weapon.brReserve) || 0);
      if (reserve <= 0) {
        this.sound.empty?.();
        this.onEmpty?.();
        return;
      }
      const need = Math.max(1, this.magSize - this.mag);
      this.weapon.brReserve = Math.max(0, reserve - need);
      this.onAmmo?.();
    }
    const spec = reloadSpecFor(this.weapon);
    if (!spec) return;
    this.reloadSpec = spec;
    this.reloadType = spec.family;
    this.reloadKind = spec.kind;
    this.reloadStartMag = this.mag;
    this.reloadT = 0;
    this.reloadDuration = reloadDurationFor(this.weapon, spec, this.mag);
    this.reloading = true;
    // Reloading is a sighted, two-handed action. Leaving ADS (and especially
    // a scope) up would hide the whole viewmodel behind the optic mask.
    this.cancelAim();
    this.sound.reload();
    this.onReload?.();
  }

  damage(amount, dir = null) {
    if (this.dead || this.invuln > 0) return;
    let blocked = false;
    if (this.blocking && dir && this.weapon.block && !this.weapon.melee) blocked = false;
    else if (this.blocking && dir && this.weapon.block) {
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      // NPC attack vectors point from the attacker to the player. The guard
      // only catches blows arriving in front of the blade.
      const facing = (-dir.x) * fx + (-dir.z) * fz;
      blocked = facing > 0.35;
    }
    if (blocked) {
      amount *= 0.18;
      this.blockT = 0.24;
      this.shake = Math.min(0.25, this.shake + 0.05);
      this.sound.block?.();
      this.onBlock?.();
    } else {
      this.hurtT = 0.55;
      this.regenDelay = 8;
      this.shake = Math.min(0.55, this.shake + 0.2);
      this.sound.hurt();
    }
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      if (absorbed > 0) {
        this.blockT = Math.max(this.blockT, 0.12);
        this.shake = Math.min(0.4, this.shake + 0.08);
        this.onBlock?.();
      }
    }
    this.health = Math.max(0, this.health - amount);
    if (dir && !blocked) {
      this.vel.x += dir.x * 2.6;
      this.vel.z += dir.z * 2.6;
      this.vel.y = Math.max(this.vel.y, 1.5);
      this.grounded = false;
    }
    this.onHealth?.(this.health);
    this.onDamage?.(amount);
    if (this.health <= 0) {
      this.dead = true;
      this.triggerHeld = false;
      this.respawnT = 2.4;
      this.cancelAim();
      this.onDeath?.();
    }
  }

  respawn() {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.dead = false;
    this.invuln = 2;
    this.hurtT = 0;
    this.shake = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.reloading = false;
    this.cancelAim();
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.aimBlend = 0;
    this.mag = this.weapon.magSize;
    this.weapon.mag = this.mag;
    this.onHealth?.(this.health);
    this.onRespawn?.();
    this.onAmmo?.();
  }

  update(dt) {
    const crouchTarget = this.crouching && !this.dead ? 1 : 0;
    this.crouchBlend += (crouchTarget - this.crouchBlend) * Math.min(1, dt * 11);
    this.eyeHeight = this.standHeight + (this.crouchHeight - this.standHeight) * this.crouchBlend;
    this.height = this.eyeHeight;

    this.cooldown = Math.max(0, this.cooldown - dt);
    this.drawT = Math.max(0, this.drawT - dt);
    this.meleeSwingT = Math.max(0, this.meleeSwingT - dt);
    if (this.bashT > 0) {
      const before = this.bashT;
      this.bashT = Math.max(0, this.bashT - dt);
      if (!this.bashImpacted && before > this.bashDur - this.bashHitAt && this.bashT <= this.bashDur - this.bashHitAt) {
        this._triggerBashImpact();
      }
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.regenDelay = Math.max(0, this.regenDelay - dt);
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.recoil = Math.max(0, this.recoil - dt * 6.5);
    this.blockT = Math.max(0, this.blockT - dt);

    // Aim down sights: FOV squeeze, tighter grouping, and a scope mask for
    // weapons with real optics. The blend also drives the viewmodel.
    const targetFov = this.aiming ? (this.weapon.adsFov ?? (this.weapon.scope ? 30 : 58)) : this.baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 13);
      this.camera.updateProjectionMatrix();
    }
    this.aimBlend += ((this.aiming ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 15);
    if (this.aiming && this.weapon.scope && this.aimBlend > 0.55) {
      if (!this.scoped) {
        this.scoped = true;
        this.viewModel.visible = false;
        this.onAim?.();
      }
    } else if (this.scoped) {
      this.scoped = false;
      this.viewModel.visible = true;
      this.onAim?.();
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 220);
    }

    if (this.dead) {
      this.respawnT -= dt;
      this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight - 0.55, this.pos.z);
      this.camera.rotation.set(this.pitch * 0.3, this.yaw, 0.28, 'YXZ');
      if (this.respawnT <= 0) this.respawn();
      return;
    }

    if (this.triggerHeld && this.weapon.auto) this.tryFire();

    if (this.regenDelay <= 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * this.regenRate);
      this.healthUiT -= dt;
      if (this.healthUiT <= 0) {
        this.healthUiT = 0.15;
        this.onHealth?.(this.health);
      }
    }

    // ---- movement ----
    const sprint = this.keys.sprint && !this.aiming && this.crouchBlend < 0.35 ? 1.75 : 1;
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _mid.set(0, 0, 0);
    if (this.keys.forward) _mid.add(_f);
    if (this.keys.back) _mid.sub(_f);
    if (this.keys.right) _mid.add(_r);
    if (this.keys.left) _mid.sub(_r);
    if (_mid.lengthSq() > 0) _mid.normalize();

    const maxSpeed = 5.2 * sprint * (this.aiming ? 0.55 : 1) * (1 - this.crouchBlend * 0.52);
    const hasInput = _mid.lengthSq() > 0.0001;
    if (hasInput) {
      // Ground movement accelerates toward the requested speed instead of
      // assigning it. Air input nudges the existing velocity and keeps most of
      // the momentum the body carried off the ledge.
      const accel = this.grounded ? this.groundAccel : this.airAccel;
      const response = 1 - Math.exp(-accel * dt);
      this.vel.x += (_mid.x * maxSpeed - this.vel.x) * response;
      this.vel.z += (_mid.z * maxSpeed - this.vel.z) * response;
    } else {
      const damping = Math.exp(-(this.grounded ? this.groundFriction : this.airDrag) * dt);
      this.vel.x *= damping;
      this.vel.z *= damping;
      if (this.grounded && Math.hypot(this.vel.x, this.vel.z) < 0.035) {
        this.vel.x = 0;
        this.vel.z = 0;
      }
    }

    // A direction key released in the air must not erase horizontal momentum.
    // Only the mild airDrag above bleeds it away.
    if (this.keys.jump && this.grounded) {
      // Jumping out of a crouch is a deliberate stand-up, not a hop in place.
      this.crouching = false;
      this.crouchHold = false;
      this.vel.y = 7.2;
      this.grounded = false;
    }
    this.keys.jump = false;

    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    const next = { x: prevX + this.vel.x * dt, z: prevZ + this.vel.z * dt };
    this.world.resolveCircle(next, this.radius, this.pos.y);
    const movedX = next.x - prevX;
    const movedZ = next.z - prevZ;
    const intended = Math.hypot(this.vel.x, this.vel.z) * dt;
    const actual = Math.hypot(movedX, movedZ);
    // Feed collision response back into real velocity. Sliding along a wall
    // keeps the tangential component; a square hit kills that component.
    if (intended > 0.001 && actual < intended * 0.82) {
      this.vel.x = movedX / Math.max(0.001, dt);
      this.vel.z = movedZ / Math.max(0.001, dt);
    }
    this.pos.x = next.x;
    this.pos.z = next.z;

    this.vel.y -= 24 * dt;
    this.pos.y += this.vel.y * dt;
    const ground = this.world.sampleGround(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    // Climbing a step or ramp costs a little horizontal energy instead of
    // being a free teleport up the slope.
    if (this.grounded && ground > this.world.sampleGround(prevX, prevZ, this.pos.y) + 0.01) {
      this.vel.x *= 0.985;
      this.vel.z *= 0.985;
    }

    // ---- head bob ----
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const lateralSpeed = this.vel.x * _r.x + this.vel.z * _r.z;
    const strafeTarget = Math.max(-1, Math.min(1, lateralSpeed / 7));
    this.strafeRoll += (strafeTarget - this.strafeRoll) * Math.min(1, dt * 8);
    if (this.grounded && speed > 0.4) {
      const prevBob = this.bob;
      this.bob += dt * speed * 1.9;
      if (Math.floor(prevBob / Math.PI) !== Math.floor(this.bob / Math.PI)) this.sound.step();
    }
    const bobScale = 1 - this.crouchBlend * 0.55;
    const bobY = this.grounded ? Math.sin(this.bob * 2) * 0.022 * Math.min(1, speed / 5) * bobScale : 0;
    const bobX = this.grounded ? Math.cos(this.bob) * 0.014 * Math.min(1, speed / 5) * bobScale : 0;

    const sx = (Math.random() - 0.5) * this.shake * 0.06;
    const sy = (Math.random() - 0.5) * this.shake * 0.06;
    this.camera.position.set(this.pos.x + bobX + sx, this.pos.y + this.eyeHeight + bobY + sy, this.pos.z);
    this.camera.rotation.set(
      this.pitch,
      this.yaw,
      this.strafeRoll * 0.045 + (Math.random() - 0.5) * this.shake * 0.05,
      'YXZ',
    );

    // ---- reload + viewmodel ----
    if (this.reloading) {
      this.reloadT += dt;
      this.applyReloadProgress();
      if (this.reloadT >= this.reloadDuration) {
        this.reloadT = this.reloadDuration;
        this.reloading = false;
        this.mag = this.magSize;
        this.weapon.mag = this.mag;
        this.onAmmo?.();
      }
    }

    this.updateReloadVisuals(dt);
    this.updateFireCycle(dt);

    const sway = Math.sin(this.bob) * 0.012 * Math.min(1, speed / 5);
    const swayY = Math.cos(this.bob * 2) * 0.008 * Math.min(1, speed / 5);
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (this.reloading) {
      const p = Math.max(0, Math.min(1, this.reloadT / this.reloadDuration));
      const settle = smoothStep(0.015, 0.12, p) * (1 - smoothStep(0.91, 0.995, p));
      const lift = Math.sin(p * Math.PI);
      // Lower and angle the gun toward the centre of the body instead of
      // standing it up in front of the camera. The hands work in the open
      // space this creates; the weapon stays readable at the bottom right.
      dx = settle * 0.04;
      dy = settle * 0.085 - lift * 0.008;
      dz = settle * 0.01;
      rx = settle * 0.26 + lift * 0.016;
      ry = settle * 0.3;
      rz = settle * -0.1;
    }
    const b = this.aimBlend;
    // Sight axis and reticle share the camera centre. Only hip-fire is offset.
    const aimX = 0.0;
    const aimY = this.basePos.y + 0.025;
    const aimZ = this.basePos.z + 0.035;
    const bx = this.basePos.x + (aimX - this.basePos.x) * b;
    const by = this.basePos.y + (aimY - this.basePos.y) * b;
    const bz = this.basePos.z + (aimZ - this.basePos.z) * b;
    const draw = this.drawDuration > 0 ? this.drawT / this.drawDuration : 0;
    this.viewModel.position.set(
      bx + sway * (1 - b) + dx - this.strafeRoll * 0.014,
      by + (swayY + dy) * (1 - b * 0.55) - this.recoil * 0.012 - this.crouchBlend * 0.055 - draw * 0.16,
      bz + this.recoil * 0.06 * (1 - b * 0.3) + dz + draw * 0.04,
    );
    this.viewModel.visible = !this.buildMode && !(this.scoped && this.aiming);
    // Shrink the reload pose enough to open a work area between the gun and
    // hands. Normal hip-fire and ADS geometry remain unchanged.
    this.viewModel.scale.setScalar(
      1 - (this.reloading
        ? smoothStep(0.015, 0.12, this.reloadT / this.reloadDuration) *
          (1 - smoothStep(0.91, 0.995, this.reloadT / this.reloadDuration)) *
          0.2
        : 0),
    );
    this.viewModel.rotation.set(
      0.02 + this.baseRot.x + rx * (1 - b * 0.55) - this.recoil * 0.08 + draw * 0.18,
      0.1 + this.baseRot.y + ry * (1 - b * 0.6),
      0.02 + this.baseRot.z + rz + sway * 0.6 * (1 - b) - this.strafeRoll * 0.055,
    );
    this.applyMeleePose();
    this.applyBashPose();
  }

  /** Firearm bash presentation. The stock sweeps across the body; pistols
   * jab; support weapons carry a wider, heavier arc. */
  applyBashPose() {
    if (this.bashT <= 0 || !this.bashDef) return;
    const p = Math.max(0, Math.min(1, 1 - this.bashT / Math.max(0.001, this.bashDur)));
    const wind = smoothStep(0, 0.3, p);
    const strike = smoothStep(0.24, 0.62, p);
    const settle = smoothStep(0.62, 1, p);
    const id = this.weapon.id;
    const pistol = /pistol|magnum/.test(id);
    const heavy = /lmg|minigun|thumper|siege/.test(id);
    if (pistol) {
      this.viewModel.position.z += wind * 0.1 - strike * 0.3 + settle * 0.2;
      this.viewModel.position.x -= wind * 0.05 - strike * 0.12;
      this.viewModel.rotation.x += -wind * 0.3 + strike * 0.42;
      this.viewModel.rotation.y += wind * 0.22 - strike * 0.48 + settle * 0.26;
      this.viewModel.rotation.z += wind * 0.1 - strike * 0.18;
      this.handL.rotation.x = wind * 0.12;
      return;
    }
    if (heavy) {
      this.viewModel.position.x += wind * 0.22 - strike * 0.42 + settle * 0.2;
      this.viewModel.position.z += -wind * 0.18 + strike * 0.3;
      this.viewModel.position.y += wind * 0.14 - strike * 0.2;
      this.viewModel.rotation.x += wind * 0.24 - strike * 0.5 + settle * 0.26;
      this.viewModel.rotation.y += wind * 0.7 - strike * 1.35 + settle * 0.65;
      this.viewModel.rotation.z += -wind * 0.28 + strike * 0.5 - settle * 0.22;
      return;
    }
    this.viewModel.position.x += wind * 0.16 - strike * 0.28 + settle * 0.12;
    this.viewModel.position.z += -wind * 0.14 + strike * 0.34 - settle * 0.2;
    this.viewModel.position.y += wind * 0.08 - strike * 0.12;
    this.viewModel.rotation.x += wind * 0.3 - strike * 0.55 + settle * 0.25;
    this.viewModel.rotation.y += wind * 0.5 - strike * 0.82 + settle * 0.32;
    this.viewModel.rotation.z += -wind * 0.18 + strike * 0.34 - settle * 0.16;
    this.handL.rotation.x = wind * 0.2 - strike * 0.35;
  }

  /** First-person melee hold, block and per-weapon attack arcs. */
  applyMeleePose() {
    if (!this.weapon.melee) return;
    if (this.blocking && this.meleeSwingT <= 0) {
      this.viewModel.position.x -= 0.055;
      this.viewModel.position.y += 0.025;
      this.viewModel.position.z += 0.09;
      this.viewModel.rotation.x += 0.12;
      this.viewModel.rotation.y -= 0.62;
      this.viewModel.rotation.z += 0.42;
      return;
    }
    if (this.meleeSwingT <= 0) return;
    const p = Math.max(0, Math.min(1, 1 - this.meleeSwingT / Math.max(0.001, this.meleeSwingDur)));
    const smooth = (a, b, x) => {
      const t = Math.max(0, Math.min(1, (x - a) / Math.max(0.001, b - a)));
      return t * t * (3 - 2 * t);
    };
    const wind = smooth(0, 0.28, p);
    const strike = smooth(0.22, 0.68, p);
    const settle = smooth(0.66, 1, p);
    const style = this.meleeStyle;
    const profile = this.weapon.anim || (this.weapon.id === 'sword' ? 'sword' : 'generic');
    const mass = Math.max(0.25, this.weapon.weight || 0.6);
    const heavy = Math.min(1.55, mass);
    if (profile === 'sword') {
      if (style === 'overhead') {
        this.viewModel.position.y += wind * 0.18 - strike * 0.34 + settle * 0.16;
        this.viewModel.position.z += -wind * 0.12 + strike * 0.28;
        this.viewModel.rotation.x += -wind * 0.8 + strike * 1.65 - settle * 0.85;
        this.viewModel.rotation.z += wind * 0.12 - strike * 0.2;
        this.handL.rotation.x = wind * -0.4 + strike * 0.8;
      } else if (style === 'thrust') {
        this.viewModel.position.z += wind * 0.13 - strike * 0.52 + settle * 0.39;
        this.viewModel.position.x -= wind * 0.05 - strike * 0.08;
        this.viewModel.rotation.x += -wind * 0.18 + strike * 0.32 - settle * 0.14;
        this.viewModel.rotation.y += wind * 0.3 - strike * 0.22;
        this.handL.rotation.x = 0;
      } else {
        this.viewModel.position.x += wind * 0.12 - strike * 0.45 + settle * 0.33;
        this.viewModel.position.z += -wind * 0.08 + strike * 0.25 - settle * 0.17;
        this.viewModel.rotation.x += wind * 0.16 - strike * 0.24;
        this.viewModel.rotation.y += wind * 0.72 - strike * 1.42 + settle * 0.7;
        this.viewModel.rotation.z += -wind * 0.34 + strike * 0.62 - settle * 0.28;
        this.handL.rotation.x = wind * 0.25 - strike * 0.5;
      }
      return;
    }
    if (profile === 'katana') {
      // Long, clean cuts: less shoulder wind-up and a faster lateral snap.
      this.viewModel.position.x += wind * 0.10 - strike * 0.28 + settle * 0.18;
      this.viewModel.position.z += -wind * 0.18 + strike * 0.38 - settle * 0.20;
      this.viewModel.rotation.x += -wind * 0.16 + strike * 0.26;
      this.viewModel.rotation.y += wind * 0.66 - strike * 1.38 + settle * 0.72;
      this.viewModel.rotation.z += -wind * 0.20 + strike * 0.40 - settle * 0.20;
      this.handL.rotation.x = wind * 0.2 - strike * 0.35;
      return;
    }
    if (profile === 'stab') {
      // A compact pull-back and linear pierce, with the off-hand tucked in.
      this.viewModel.position.z += wind * 0.14 - strike * (style === 'thrust' ? 0.34 : 0.22) + settle * 0.16;
      this.viewModel.position.x += -wind * 0.04 + strike * 0.08;
      this.viewModel.rotation.x += -wind * 0.12 + strike * 0.18;
      this.viewModel.rotation.y += wind * 0.12 - strike * 0.08;
      this.handL.rotation.x = wind * 0.12;
      return;
    }
    if (profile === 'smash' || profile === 'chop') {
      // Two-handed overhead: a visible wind-up, a deep drop and a heavy settle.
      const drop = profile === 'smash' ? 1.35 : 1.0;
      this.viewModel.position.y += wind * 0.26 * heavy - strike * 0.40 * drop + settle * 0.14;
      this.viewModel.position.z += -wind * 0.20 + strike * 0.30;
      this.viewModel.rotation.x += -wind * 0.92 + strike * (1.8 * drop) - settle * 0.88;
      this.viewModel.rotation.z += wind * 0.14 - strike * 0.23;
      this.handL.rotation.x = wind * -0.45 + strike * 0.9;
      return;
    }
    if (profile === 'cleave' || profile === 'blunt' || profile === 'club') {
      // Broad horizontal swings; heavier tools drag the whole viewmodel across.
      const sweep = profile === 'blunt' ? 1.2 : 1;
      this.viewModel.position.x += wind * 0.16 * heavy - strike * 0.46 * sweep + settle * 0.30;
      this.viewModel.position.z += -wind * 0.10 + strike * 0.20;
      this.viewModel.position.y += -wind * 0.05 + strike * 0.08;
      this.viewModel.rotation.x += wind * 0.10 - strike * 0.20;
      this.viewModel.rotation.y += wind * 0.52 * heavy - strike * 1.25 * sweep + settle * 0.73;
      this.viewModel.rotation.z += -wind * 0.20 + strike * 0.52 * sweep - settle * 0.27;
      this.handL.rotation.x = wind * 0.20 - strike * 0.45;
      return;
    }
    if (profile === 'hook') {
      this.viewModel.position.y += wind * 0.18 - strike * 0.26 + settle * 0.10;
      this.viewModel.position.z += -wind * 0.12 + strike * 0.34 - settle * 0.18;
      this.viewModel.position.x += wind * 0.08 - strike * 0.22 + settle * 0.14;
      this.viewModel.rotation.x += -wind * 0.42 + strike * 0.85 - settle * 0.36;
      this.viewModel.rotation.z += wind * 0.24 - strike * 0.46 + settle * 0.22;
      this.handL.rotation.x = wind * 0.18 - strike * 0.36;
      return;
    }
    if (profile === 'quick' || profile === 'baton') {
      // Short, snappy strikes stay close to the centre of the screen.
      const snap = profile === 'baton' ? 1.0 : 0.8;
      this.viewModel.position.x += wind * 0.06 - strike * 0.18 * snap + settle * 0.12;
      this.viewModel.position.z += -wind * 0.05 + strike * 0.16 * snap;
      this.viewModel.rotation.y += wind * 0.34 - strike * 0.78 * snap + settle * 0.44;
      this.viewModel.rotation.z += -wind * 0.10 + strike * 0.28 * snap - settle * 0.18;
      this.handL.rotation.x = wind * 0.10 - strike * 0.22;
      return;
    }
    // Fallback for legacy melee definitions.
    const legacyArc = Math.sin(Math.PI * p);
    this.viewModel.position.x += legacyArc * -0.15;
    this.viewModel.position.z += legacyArc * 0.16;
    this.viewModel.rotation.x += legacyArc * 0.52;
    this.viewModel.rotation.z += legacyArc * -1.05;
  }
}
