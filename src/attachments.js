/**
 * Black Market attachment data.
 *
 * Compatibility is expressed by platform tag, not by a flat list of gun ids.
 * That keeps every current and future model on the same rules: a pistol optic
 * can fit another pistol, a precision stock cannot be bolted to a revolver,
 * and a suppressor never becomes a decorative item on a launcher.
 */

export const ATTACHMENT_SLOTS = [
  { id: 'optic', label: 'OPTIC / SIGHT', hint: 'Magnification and sight picture' },
  { id: 'muzzle', label: 'MUZZLE DEVICE', hint: 'Sound, flash and recoil' },
  { id: 'underbarrel', label: 'UNDERBARREL', hint: 'Recoil control and stability' },
  { id: 'magazine', label: 'MAGAZINE', hint: 'Ammunition capacity' },
  { id: 'stock', label: 'STOCK', hint: 'Recoil and weapon stability' },
];

const MODEL_TAG = {
  pistol: 'pistol',
  viper: 'pistol',
  smg: 'smg',
  vector: 'smg',
  shotgun: 'shotgun',
  breacher: 'shotgun',
  jackhammer: 'shotgun',
  sawedoff: 'shotgun',
  scatter: 'shotgun',
  gravedigger: 'shotgun',
  rifle: 'precision',
  longshot: 'precision',
  magnum: 'revolver',
  judge: 'revolver',
  hammer: 'revolver',
  godhand: 'revolver',
  carbine: 'carbine',
  wraith: 'carbine',
  lmg: 'lmg',
  vulcan: 'lmg',
  minigun: 'minigun',
  ripper: 'minigun',
  thumper: 'launcher',
  havoc: 'launcher',
  siege: 'launcher',
  omen: 'launcher',
  crossbow: 'crossbow',
  railbow: 'crossbow',
  impaler: 'exotic',
  skewer: 'exotic',
  nailer: 'exotic',
  hive: 'exotic',
};

const SLOTS_BY_TAG = {
  pistol: ['optic', 'muzzle', 'magazine'],
  smg: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock'],
  shotgun: ['optic', 'stock'],
  precision: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock'],
  carbine: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock'],
  lmg: ['optic', 'muzzle', 'underbarrel', 'stock'],
  minigun: ['optic'],
  launcher: ['optic'],
  crossbow: [],
  exotic: ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock'],
  revolver: [],
};

const MOUNTS_BY_TAG = {
  pistol: {
    optic: [0, 0.108, -0.085],
    muzzle: [0, 0.02, -0.3],
    magazine: [0, -0.205, 0.025],
  },
  smg: {
    optic: [0, 0.095, -0.12],
    muzzle: [0, 0.005, -0.48],
    underbarrel: [0, -0.105, -0.3],
    magazine: [0, -0.225, -0.02],
    stock: [0, -0.03, 0.3],
  },
  shotgun: {
    optic: [0, 0.09, -0.09],
    stock: [0, -0.055, 0.42],
  },
  precision: {
    optic: [0, 0.19, -0.11],
    muzzle: [0, 0.0, -0.67],
    underbarrel: [0, -0.1, -0.33],
    magazine: [0, -0.15, -0.02],
    stock: [0, -0.06, 0.36],
  },
  carbine: {
    optic: [0, 0.13, -0.04],
    muzzle: [0, 0.005, -0.64],
    underbarrel: [0, -0.11, -0.28],
    magazine: [0, -0.225, -0.03],
    stock: [0, -0.04, 0.31],
  },
  lmg: {
    optic: [0, 0.18, -0.09],
    muzzle: [0, 0.0, -0.71],
    underbarrel: [0, -0.13, -0.35],
    stock: [0, -0.06, 0.33],
  },
  minigun: {
    optic: [0, 0.18, 0.0],
  },
  launcher: {
    optic: [0, 0.16, -0.1],
  },
  exotic: {
    optic: [0, 0.14, -0.09],
    muzzle: [0, 0.01, -0.59],
    underbarrel: [0, -0.11, -0.32],
    magazine: [0, -0.22, -0.04],
    stock: [0, -0.05, 0.32],
  },
};

export function weaponTag(weapon) {
  if (!weapon || weapon.melee) return 'melee';
  return MODEL_TAG[weapon.model || weapon.id] || MODEL_TAG[weapon.id] || 'exotic';
}

export function weaponModSlots(weapon) {
  return SLOTS_BY_TAG[weaponTag(weapon)] || [];
}

export function weaponMounts(weapon) {
  const tag = weaponTag(weapon);
  const mounts = MOUNTS_BY_TAG[tag] || {};
  return {
    ...mounts,
    muzzle: [0, mounts.muzzle?.[1] ?? 0.01, weapon.muzzleZ ?? -0.45],
  };
}

export const ATTACHMENTS = [
  // ---- optics -------------------------------------------------------------
  {
    id: 'fiber_irons',
    slot: 'optic',
    name: 'TRUGLO FIBER IRONS',
    price: 70,
    fits: ['pistol', 'smg', 'shotgun', 'precision', 'carbine', 'lmg', 'exotic'],
    effect: { sight: 'iron', adsFov: 64 },
    desc: 'Bright fiber-optic front blade on a low, snag-free rear notch.',
  },
  {
    id: 'red_dot',
    slot: 'optic',
    name: 'AIMPOINT MICRO T-2',
    price: 180,
    fits: ['pistol', 'smg', 'shotgun', 'precision', 'carbine', 'lmg', 'exotic', 'launcher'],
    effect: { sight: 'reddot', adsFov: 60 },
    desc: '2 MOA red dot. Unmagnified, fast on close targets and easy to track.',
  },
  {
    id: 'holo',
    slot: 'optic',
    name: 'EOTECH EXPS3 HOLO',
    price: 235,
    fits: ['smg', 'shotgun', 'precision', 'carbine', 'lmg', 'exotic'],
    effect: { sight: 'holo', adsFov: 58 },
    desc: 'Holographic ring-and-dot reticle with a wider, clearer window.',
  },
  {
    id: 'scope_2x',
    slot: 'optic',
    name: 'PRIMARY ARMS SLx 2x',
    price: 270,
    fits: ['precision', 'carbine', 'lmg', 'exotic'],
    effect: { sight: 'scope', scope: true, magnification: 2, adsFov: 46 },
    desc: 'Low-power prism scope. Keep both eyes open while the sight picture doubles.',
  },
  {
    id: 'scope_4x',
    slot: 'optic',
    name: 'VORTEX VIPER PST 4x',
    price: 410,
    fits: ['precision', 'carbine', 'lmg'],
    effect: { sight: 'scope', scope: true, magnification: 4, adsFov: 30 },
    desc: 'Four-power tactical scope. Sharp reticle, narrow field and a hard magnification jump.',
  },
  {
    id: 'scope_6x',
    slot: 'optic',
    name: 'NIGHTFORCE NX8 6x',
    price: 560,
    fits: ['precision', 'lmg'],
    effect: { sight: 'scope', scope: true, magnification: 6, adsFov: 22 },
    desc: 'Six-power precision optic. Built for long lanes and small targets.',
  },

  // ---- muzzle devices -----------------------------------------------------
  {
    id: 'obsidian9',
    slot: 'muzzle',
    name: 'RUGGED OBSIDIAN 9',
    price: 330,
    fits: ['pistol', 'smg'],
    effect: { suppressed: true, flashScale: 0.16, soundMuffle: true, recoil: 0.92 },
    desc: '9 mm pistol suppressor. Cuts the report, hides the flash and softens muzzle rise.',
  },
  {
    id: 'saker30',
    slot: 'muzzle',
    name: 'SIG SAUER SRD762Ti',
    price: 460,
    fits: ['precision', 'carbine', 'lmg', 'exotic'],
    effect: { suppressed: true, flashScale: 0.2, soundMuffle: true, recoil: 0.9 },
    desc: 'Rifle-calibre suppressor. A low thump instead of a muzzle blast.',
  },
  {
    id: 'compensator',
    slot: 'muzzle',
    name: 'JP ENTERPRISES COMP',
    price: 125,
    fits: ['pistol', 'smg', 'carbine', 'exotic'],
    effect: { recoil: 0.78, kick: 0.82, flashScale: 1.08 },
    desc: 'Ported compensator. Less muzzle climb, at the cost of a sharper flash.',
  },
  {
    id: 'muzzle_brake',
    slot: 'muzzle',
    name: 'APA LITTLE BASTARD',
    price: 155,
    fits: ['precision', 'carbine', 'lmg', 'exotic'],
    effect: { recoil: 0.7, kick: 0.74, flashScale: 1.22 },
    desc: 'Aggressive brake. Strongest recoil reduction in the catalogue, with a loud side blast.',
  },

  // ---- underbarrel -------------------------------------------------------
  {
    id: 'vertical_grip',
    slot: 'underbarrel',
    name: 'MAGPUL RVG VERTICAL',
    price: 95,
    fits: ['smg', 'precision', 'carbine', 'lmg', 'exotic'],
    effect: { recoil: 0.82, spread: 0.9 },
    desc: 'Vertical foregrip. Pulls the muzzle down and tightens sustained fire.',
  },
  {
    id: 'angled_grip',
    slot: 'underbarrel',
    name: 'MAGPUL AFG ANGLED',
    price: 110,
    fits: ['smg', 'precision', 'carbine', 'lmg', 'exotic'],
    effect: { recoil: 0.87, spread: 0.94 },
    desc: 'Angled foregrip. A flatter wrist and faster transitions with modest control.',
  },

  // ---- magazines --------------------------------------------------------
  {
    id: 'ext_pistol',
    slot: 'magazine',
    name: 'GLOCK +6 EXTENSION',
    price: 85,
    fits: ['pistol'],
    effect: { magBonus: 6 },
    desc: 'Extended pistol floorplate. Six more rounds before the slide locks back.',
  },
  {
    id: 'ext_smg',
    slot: 'magazine',
    name: 'MP5 40-ROUND MAG',
    price: 130,
    fits: ['smg'],
    effect: { magBonus: 10 },
    desc: 'Straight extended SMG magazine. Ten extra rounds and a longer silhouette.',
  },
  {
    id: 'ext_rifle',
    slot: 'magazine',
    name: 'AICS 10-ROUND MAG',
    price: 145,
    fits: ['precision', 'carbine', 'exotic'],
    effect: { magBonus: 8 },
    desc: 'High-capacity box magazine. Eight extra rounds with a visible baseplate.',
  },

  // ---- stocks -----------------------------------------------------------
  {
    id: 'tactical_stock',
    slot: 'stock',
    name: 'BCM SOPMOD STOCK',
    price: 165,
    fits: ['smg', 'shotgun', 'precision', 'carbine', 'lmg', 'exotic'],
    effect: { recoil: 0.84, kick: 0.88 },
    desc: 'Adjustable tactical stock. More shoulder contact, less muzzle wander.',
  },
  {
    id: 'precision_stock',
    slot: 'stock',
    name: 'MDT ESS CHASSIS STOCK',
    price: 210,
    fits: ['precision', 'lmg'],
    effect: { recoil: 0.76, kick: 0.8, spread: 0.94 },
    desc: 'Heavy precision chassis. The most stable stock in the Black Market.',
  },
  {
    id: 'light_stock',
    slot: 'stock',
    name: 'MFT MINIMALIST STOCK',
    price: 120,
    fits: ['smg', 'carbine', 'shotgun'],
    effect: { recoil: 0.91, kick: 0.94 },
    desc: 'Lightweight collapsible stock. A small stability gain without the bulk.',
  },
];

export const ATTACHMENT_BY_ID = new Map(ATTACHMENTS.map((attachment) => [attachment.id, attachment]));

export function attachmentById(id) {
  return ATTACHMENT_BY_ID.get(id) || null;
}

export function isAttachmentCompatible(weapon, attachment) {
  if (!weapon || !attachment || weapon.melee) return false;
  if (!weaponModSlots(weapon).includes(attachment.slot)) return false;
  return attachment.fits.includes(weaponTag(weapon));
}

export function compatibleAttachments(weapon, slot = null) {
  return ATTACHMENTS.filter((attachment) => {
    if (slot && attachment.slot !== slot) return false;
    return isAttachmentCompatible(weapon, attachment);
  });
}

function ensureBaseStats(weapon) {
  if (weapon.baseStats) return weapon.baseStats;
  const builtInSight = weapon.scope ? 'scope' : 'iron';
  weapon.baseStats = {
    magSize: weapon.magSize,
    adsFov: weapon.adsFov ?? 58,
    scope: !!weapon.scope,
    sight: weapon.sight ?? builtInSight,
    magnification: weapon.magnification ?? (weapon.scope ? 4 : 1),
    recoil: weapon.recoil ?? 1,
    kick: weapon.kick ?? 0,
    spread: weapon.spread ?? 0.01,
    flashSize: weapon.flashSize ?? 1,
    flashLight: weapon.flashLight ?? 0,
    suppressed: !!weapon.suppressed,
    soundMuffle: !!weapon.soundMuffle,
  };
  return weapon.baseStats;
}

/**
 * Rebuild the effective gun from its immutable base stats plus installed mods.
 * Call this after every equip/remove, and on load from a saved configuration.
 */
export function applyWeaponMods(weapon) {
  if (!weapon || weapon.melee) return weapon;
  const base = ensureBaseStats(weapon);
  weapon.magSize = base.magSize;
  weapon.adsFov = base.adsFov;
  weapon.scope = base.scope;
  weapon.sight = base.sight;
  weapon.magnification = base.magnification;
  weapon.attachments = weapon.attachments || {};
  weapon.recoil = base.recoil;
  weapon.kick = base.kick;
  weapon.spread = base.spread;
  weapon.flashSize = base.flashSize;
  weapon.flashLight = base.flashLight;
  weapon.suppressed = base.suppressed;
  weapon.soundMuffle = base.soundMuffle;
  weapon.modSummary = {};

  const installed = weapon.attachments || {};
  for (const slot of Object.keys(installed)) {
    const attachment = attachmentById(installed[slot]);
    if (!attachment || attachment.slot !== slot || !isAttachmentCompatible(weapon, attachment)) {
      delete installed[slot];
      continue;
    }
    const effect = attachment.effect || {};
    if (effect.adsFov != null) weapon.adsFov = effect.adsFov;
    if (effect.scope != null) weapon.scope = !!effect.scope;
    if (effect.sight) weapon.sight = effect.sight;
    if (effect.magnification != null) weapon.magnification = effect.magnification;
    if (effect.recoil) weapon.recoil *= effect.recoil;
    if (effect.kick) weapon.kick *= effect.kick;
    if (effect.spread) weapon.spread *= effect.spread;
    if (effect.flashScale) weapon.flashSize *= effect.flashScale;
    if (effect.suppressed) weapon.suppressed = true;
    if (effect.soundMuffle) weapon.soundMuffle = true;
    if (effect.magBonus) weapon.magSize += effect.magBonus;
    weapon.modSummary[slot] = attachment.id;
  }

  weapon.magSize = Math.max(0, Math.round(weapon.magSize));
  if (Number.isFinite(weapon.mag)) weapon.mag = Math.min(weapon.mag, weapon.magSize);
  return weapon;
}

export function attachmentEffectLines(weapon, attachment) {
  const effect = attachment.effect || {};
  const lines = [];
  if (effect.sight === 'scope') {
    lines.push(`${effect.magnification}× MAGNIFICATION`);
    lines.push(`ADS FIELD OF VIEW ${effect.adsFov}°`);
  } else if (effect.sight === 'reddot') {
    lines.push('2 MOA RED DOT');
    lines.push(`ADS FIELD OF VIEW ${effect.adsFov}°`);
  } else if (effect.sight === 'holo') {
    lines.push('HOLOGRAPHIC RETICLE');
    lines.push(`ADS FIELD OF VIEW ${effect.adsFov}°`);
  } else if (effect.sight === 'iron') {
    lines.push('IRON-SIGHT PICTURE');
    lines.push(`ADS FIELD OF VIEW ${effect.adsFov}°`);
  }
  if (effect.suppressed) lines.push('SUPPRESSED REPORT');
  if (effect.flashScale && effect.flashScale < 1) lines.push('REDUCED MUZZLE FLASH');
  if (effect.flashScale && effect.flashScale > 1) lines.push('INCREASED MUZZLE FLASH');
  if (effect.recoil) lines.push(`RECOIL ${Math.round((1 - effect.recoil) * 100)}% LESS`);
  if (effect.kick) lines.push(`MUZZLE CLIMB ${Math.round((1 - effect.kick) * 100)}% LESS`);
  if (effect.spread) lines.push(`SPREAD ${Math.round((1 - effect.spread) * 100)}% TIGHTER`);
  if (effect.magBonus) lines.push(`+${effect.magBonus} ROUNDS · ${(weapon.baseStats?.magSize ?? weapon.magSize) + effect.magBonus} TOTAL`);
  return lines;
}
