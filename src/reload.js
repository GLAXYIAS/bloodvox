/**
 * Reload families. Each profile describes a real mechanical sequence, not just
 * a duration: magazine + slide, magazine + charging handle, magazine + bolt,
 * shell-by-shell tube, break action, swing-out revolver, belt box, rotary
 * launcher, rocket breech, crossbow cocking, etc.
 *
 * Geometry and hand animation live in player.js. Keeping the mechanical recipe
 * here makes it testable and makes accidental reuse of one gun's sequence for
 * every other gun obvious.
 */

const PROFILES = {
  pistol: {
    family: 'pistol',
    kind: 'mag',
    mech: 'slide',
    label: 'MAGAZINE / SLIDE',
    handL: [-0.05, -0.16, -0.02],
    handR: [0.035, -0.14, 0.025],
    mag: [0, -0.12, 0.015],
    magDims: [0.065, 0.16, 0.08],
    seatAt: 0.6,
  },
  smg: {
    family: 'smg',
    kind: 'mag',
    mech: 'charging',
    label: 'MAGAZINE / CHARGING HANDLE',
    handL: [-0.055, -0.16, -0.03],
    handR: [0.04, -0.15, 0.04],
    mag: [0, -0.14, -0.025],
    magDims: [0.07, 0.2, 0.09],
    seatAt: 0.58,
  },
  carbine: {
    family: 'carbine',
    kind: 'mag',
    mech: 'charging',
    label: 'MAGAZINE / BOLT RELEASE',
    handL: [-0.055, -0.16, -0.03],
    handR: [0.04, -0.15, 0.045],
    mag: [0, -0.14, -0.025],
    magDims: [0.07, 0.18, 0.09],
    seatAt: 0.57,
  },
  boltRifle: {
    family: 'boltRifle',
    kind: 'mag',
    mech: 'bolt',
    label: 'MAGAZINE / BOLT CYCLE',
    handL: [-0.055, -0.16, -0.03],
    handR: [0.04, -0.14, 0.05],
    mag: [0, -0.15, -0.02],
    magDims: [0.07, 0.17, 0.095],
    seatAt: 0.58,
  },
  impaler: {
    family: 'impaler',
    kind: 'mag',
    mech: 'bolt',
    label: 'SPIKE MAGAZINE / BOLT',
    handL: [-0.055, -0.16, -0.03],
    handR: [0.04, -0.15, 0.05],
    mag: [0, -0.15, -0.02],
    magDims: [0.075, 0.2, 0.1],
    seatAt: 0.6,
  },
  nailer: {
    family: 'nailer',
    kind: 'canister',
    mech: 'pump',
    label: 'CANISTER / PUMP',
    handL: [-0.06, -0.17, -0.02],
    handR: [0.04, -0.15, 0.05],
    mag: [0, -0.15, -0.015],
    magDims: [0.08, 0.2, 0.11],
    seatAt: 0.58,
  },
  belt: {
    family: 'belt',
    kind: 'belt',
    mech: 'charging',
    label: 'BELT BOX / FEED COVER',
    handL: [-0.07, -0.17, -0.02],
    handR: [0.045, -0.15, 0.05],
    mag: [0, -0.16, -0.015],
    magDims: [0.11, 0.2, 0.13],
    seatAt: 0.62,
  },
  shellTube: {
    family: 'shellTube',
    kind: 'shell',
    mech: 'pump',
    label: 'SHELL TUBE / PUMP',
    handL: [-0.055, -0.16, -0.27],
    handR: [0.04, -0.15, 0.07],
    mag: [0, -0.11, -0.22],
    magDims: [0.04, 0.06, 0.12],
    roundBased: true,
    insertStart: 0.2,
    insertEnd: 0.82,
  },
  breakAction: {
    family: 'breakAction',
    kind: 'break',
    mech: 'break',
    label: 'BREAK-OPEN / SHELLS',
    handL: [-0.06, -0.16, -0.12],
    handR: [0.04, -0.15, 0.06],
    mag: [0, -0.1, -0.18],
    magDims: [0.04, 0.06, 0.12],
    roundBased: true,
    insertStart: 0.22,
    insertEnd: 0.68,
  },
  revolver: {
    family: 'revolver',
    kind: 'revolver',
    mech: 'cylinder',
    label: 'SWING CYLINDER / LOAD',
    handL: [-0.06, -0.15, -0.06],
    handR: [0.04, -0.15, 0.035],
    mag: [0, 0.015, -0.1],
    magDims: [0.07, 0.07, 0.09],
    roundBased: true,
    insertStart: 0.2,
    insertEnd: 0.77,
  },
  launcher: {
    family: 'launcher',
    kind: 'launcher',
    mech: 'cylinder',
    label: 'ROTARY LAUNCHER / LOAD',
    handL: [-0.06, -0.16, -0.06],
    handR: [0.04, -0.15, 0.05],
    mag: [0, 0.01, -0.1],
    magDims: [0.09, 0.09, 0.1],
    roundBased: true,
    insertStart: 0.2,
    insertEnd: 0.8,
  },
  rocket: {
    family: 'rocket',
    kind: 'rocket',
    mech: 'breech',
    label: 'BREECH / ROCKET',
    handL: [-0.06, -0.17, -0.08],
    handR: [0.04, -0.15, 0.05],
    mag: [0, -0.02, -0.16],
    magDims: [0.08, 0.08, 0.26],
    roundBased: true,
    insertStart: 0.22,
    insertEnd: 0.7,
  },
  minigun: {
    family: 'minigun',
    kind: 'drum',
    mech: 'crank',
    label: 'DRUM / FEED / CRANK',
    handL: [-0.08, -0.18, -0.01],
    handR: [0.05, -0.16, 0.04],
    mag: [0, -0.13, 0.06],
    magDims: [0.14, 0.14, 0.12],
    seatAt: 0.62,
  },
  crossbow: {
    family: 'crossbow',
    kind: 'bolt',
    mech: 'draw',
    label: 'BOLT / COCKING DRAW',
    handL: [-0.035, -0.18, -0.31],
    handR: [0.04, -0.15, 0.05],
    mag: [0, 0.045, -0.3],
    magDims: [0.024, 0.024, 0.4],
    seatAt: 0.63,
  },
};

const MODEL_TO_FAMILY = {
  pistol: 'pistol',
  viper: 'pistol',
  smg: 'smg',
  vector: 'smg',
  shotgun: 'shellTube',
  breacher: 'shellTube',
  jackhammer: 'shellTube',
  rifle: 'boltRifle',
  longshot: 'boltRifle',
  magnum: 'revolver',
  judge: 'revolver',
  hammer: 'revolver',
  godhand: 'revolver',
  carbine: 'carbine',
  wraith: 'carbine',
  lmg: 'belt',
  vulcan: 'belt',
  minigun: 'minigun',
  ripper: 'minigun',
  thumper: 'launcher',
  havoc: 'launcher',
  impaler: 'impaler',
  skewer: 'impaler',
  nailer: 'nailer',
  hive: 'nailer',
  crossbow: 'crossbow',
  railbow: 'crossbow',
  sawedoff: 'breakAction',
  scatter: 'breakAction',
  gravedigger: 'breakAction',
  siege: 'rocket',
  omen: 'rocket',
};

export function reloadSpecFor(weapon) {
  if (!weapon || weapon.melee) return null;
  const model = weapon.model || weapon.id;
  let family = MODEL_TO_FAMILY[model] || MODEL_TO_FAMILY[weapon.id];
  if (!family) {
    if (weapon.sound === 'crossbow') family = 'crossbow';
    else if (weapon.sound === 'shotgun') family = 'shellTube';
    else if (weapon.sound === 'smg') family = 'smg';
    else if (weapon.sound === 'pistol' || weapon.sound === 'magnum') family = 'pistol';
    else family = 'carbine';
  }
  const profile = PROFILES[family];
  return {
    ...profile,
    family,
    model,
    magSize: weapon.magSize,
    roundBased: !!profile.roundBased,
  };
}

/** Partial loads should be quicker than a full empty-gun reload. */
export function reloadDurationFor(weapon, spec, startMag) {
  if (!weapon || !spec || !weapon.reload) return weapon?.reload || 0;
  if (!spec.roundBased) return weapon.reload;
  const missing = Math.max(1, weapon.magSize - startMag);
  const ratio = Math.max(0, Math.min(1, missing / Math.max(1, weapon.magSize)));
  return Math.max(0.55, weapon.reload * (0.42 + 0.58 * ratio));
}

export { PROFILES as RELOAD_PROFILES };
