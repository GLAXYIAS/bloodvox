/**
 * Live simulation settings shared by the UI, body solver and gore effects.
 * Values are multipliers around the tuned baseline, so changing one does not
 * require rebuilding a map or reloading the page.
 *
 * Player-facing settings are persisted to localStorage. The blood sliders are
 * deliberately separate from the presentation switches: a player can keep a
 * large circulating volume simulation while turning the visible spray off.
 */
export const BLOOD_SETTINGS = {
  amount: 1,
  spray: 1,
  decals: 1,
  particles: 1,
  persistence: 1,
  lossRate: 1,
};

export const BLOOD_RANGES = {
  amount: { min: 0.4, max: 2.4, step: 0.05, label: 'BLOOD AMOUNT', hint: 'Circulating volume available to every body.' },
  spray: { min: 0, max: 2, step: 0.05, label: 'SPRAY INTENSITY', hint: 'Pressure and reach of arterial jets and impact mist.' },
  decals: { min: 0, max: 2, step: 0.05, label: 'DECAL AMOUNT', hint: 'How much blood accumulates on floors, walls and props.' },
  particles: { min: 0, max: 2, step: 0.05, label: 'PARTICLE AMOUNT', hint: 'Number of simulated droplets and mist particles.' },
  persistence: { min: 0.2, max: 3, step: 0.05, label: 'BLOOD PERSISTENCE', hint: 'How long decals stay on the arena before expiring.' },
  lossRate: { min: 0.2, max: 2.5, step: 0.05, label: 'BLOOD LOSS RATE', hint: 'Rate at which open wounds drain the blood supply.' },
};

export const GAME_SETTINGS = {
  // Mouse/look
  sensitivity: 1,
  adsSensitivity: 0.52,
  invertY: false,
  // Presentation
  bloodEnabled: true,
  bloodIntensity: 1,
  decalsEnabled: true,
  impactEffects: true,
  violence: 1,
  childSafety: false,
};

export const DEFAULT_GAME_SETTINGS = { ...GAME_SETTINGS };

/**
 * Every gameplay action that can be rebound. Defaults intentionally use one
 * physical key per action (except contextual place/fire) so a fresh profile
 * has no ambiguous bindings.
 */
export const KEYBIND_DEFS = [
  { id: 'forward', label: 'Move forward', group: 'MOVEMENT', default: 'KeyW' },
  { id: 'back', label: 'Move backward', group: 'MOVEMENT', default: 'KeyS' },
  { id: 'left', label: 'Strafe left', group: 'MOVEMENT', default: 'KeyA' },
  { id: 'right', label: 'Strafe right', group: 'MOVEMENT', default: 'KeyD' },
  { id: 'jump', label: 'Jump', group: 'MOVEMENT', default: 'Space' },
  { id: 'sprint', label: 'Sprint', group: 'MOVEMENT', default: 'ShiftLeft' },
  { id: 'crouch', label: 'Crouch', group: 'MOVEMENT', default: 'ControlLeft' },

  { id: 'shoot', label: 'Shoot / place piece', group: 'COMBAT', default: 'Mouse0' },
  { id: 'aim', label: 'Aim / block', group: 'COMBAT', default: 'Mouse2' },
  { id: 'reload', label: 'Reload', group: 'COMBAT', default: 'KeyR' },
  { id: 'interact', label: 'Interact', group: 'COMBAT', default: 'KeyE' },
  { id: 'quickMelee', label: 'Weapon bash', group: 'COMBAT', default: 'KeyF' },

  { id: 'cycleWeapon', label: 'Cycle weapons', group: 'WEAPONS', default: 'Wheel' },
  { id: 'weapon1', label: 'Weapon slot 1', group: 'WEAPONS', default: 'Digit1' },
  { id: 'weapon2', label: 'Weapon slot 2', group: 'WEAPONS', default: 'Digit2' },
  { id: 'weapon3', label: 'Weapon slot 3', group: 'WEAPONS', default: 'Digit3' },
  { id: 'weapon4', label: 'Weapon slot 4', group: 'WEAPONS', default: 'Digit4' },
  { id: 'weapon5', label: 'Weapon slot 5', group: 'WEAPONS', default: 'Digit5' },
  { id: 'weapon6', label: 'Weapon slot 6', group: 'WEAPONS', default: 'Digit6' },
  { id: 'weapon7', label: 'Weapon slot 7', group: 'WEAPONS', default: 'Digit7' },
  { id: 'weapon8', label: 'Weapon slot 8', group: 'WEAPONS', default: 'Digit8' },
  { id: 'weapon9', label: 'Weapon slot 9', group: 'WEAPONS', default: 'Digit9' },
  { id: 'weapon10', label: 'Weapon slot 10', group: 'WEAPONS', default: 'Digit0' },

  { id: 'buildMode', label: 'Building mode', group: 'BUILDING', default: 'KeyQ' },
  { id: 'buildWall', label: 'Build wall', group: 'BUILDING', default: 'KeyZ' },
  { id: 'buildFloor', label: 'Build floor', group: 'BUILDING', default: 'KeyX' },
  { id: 'buildRamp', label: 'Build ramp', group: 'BUILDING', default: 'KeyC' },
  { id: 'buildRoof', label: 'Build roof', group: 'BUILDING', default: 'KeyV' },
  { id: 'edit', label: 'Edit structure', group: 'BUILDING', default: 'KeyT' },
  { id: 'confirmEdit', label: 'Confirm edit', group: 'BUILDING', default: 'KeyY' },
  { id: 'resetEdit', label: 'Reset edit', group: 'BUILDING', default: 'KeyG' },
  { id: 'rotate', label: 'Rotate piece', group: 'BUILDING', default: 'KeyH' },
  { id: 'material', label: 'Next material', group: 'BUILDING', default: 'KeyU' },

  { id: 'armory', label: 'Close armoury (menu)', group: 'INTERFACE', default: 'KeyB' },
  { id: 'settings', label: 'Close settings (menu)', group: 'INTERFACE', default: 'KeyO' },
];

export const DEFAULT_KEYBINDS = Object.fromEntries(
  KEYBIND_DEFS.map((def) => [def.id, def.default]),
);
export const KEYBINDS = { ...DEFAULT_KEYBINDS };

const KEYBIND_STORAGE_KEY = 'bloodvox.keybinds.v1';
const KEYBIND_CODE_RE =
  /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-2])|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Space|Enter|Tab|Backspace|CapsLock|Arrow(?:Up|Down|Left|Right)|Mouse[0-4]|Wheel|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/;

export function isBindableCode(code) {
  return typeof code === 'string' && KEYBIND_CODE_RE.test(code);
}

/** Human-readable label for a KeyboardEvent.code or synthetic mouse code. */
export function keybindLabel(code) {
  if (!code) return '—';
  if (code === 'Wheel') return 'SCROLL';
  if (code === 'Mouse0') return 'LMB';
  if (code === 'Mouse1') return 'MMB';
  if (code === 'Mouse2') return 'RMB';
  if (code.startsWith('Mouse')) return `M${Number(code.slice(5)) + 1}`;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  if (code === 'ControlLeft') return 'L CTRL';
  if (code === 'ControlRight') return 'R CTRL';
  if (code === 'ShiftLeft') return 'L SHIFT';
  if (code === 'ShiftRight') return 'R SHIFT';
  if (code === 'AltLeft') return 'L ALT';
  if (code === 'AltRight') return 'R ALT';
  if (code === 'Space') return 'SPACE';
  if (code === 'Escape') return 'ESC';
  if (code === 'Backquote') return '`';
  if (code === 'Minus') return '-';
  if (code === 'Equal') return '=';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Backslash') return '\\';
  if (code === 'Semicolon') return ';';
  if (code === 'Quote') return "'";
  if (code === 'Comma') return ',';
  if (code === 'Period') return '.';
  if (code === 'Slash') return '/';
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  return code.toUpperCase();
}

/** Return the action currently owning a code, or null. */
export function keybindOwner(code, except = null) {
  if (!code) return null;
  return KEYBIND_DEFS.find((def) => def.id !== except && KEYBINDS[def.id] === code)?.id || null;
}

function persistKeybinds() {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEYBIND_STORAGE_KEY, JSON.stringify(KEYBINDS));
  } catch {
    // The game must still run when storage is unavailable.
  }
}

/** Load custom bindings, rejecting malformed or ambiguous saved maps. */
export function loadKeybinds() {
  const store = storage();
  if (!store) return;
  try {
    const data = JSON.parse(store.getItem(KEYBIND_STORAGE_KEY) || 'null');
    if (!data || typeof data !== 'object') return;
    const used = new Set();
    for (const def of KEYBIND_DEFS) {
      const saved = data[def.id];
      const fallback = DEFAULT_KEYBINDS[def.id];
      const value = isBindableCode(saved) && !used.has(saved) ? saved : fallback;
      KEYBINDS[def.id] = used.has(value) ? fallback : value;
      used.add(KEYBINDS[def.id]);
    }
  } catch {
    // Ignore corrupt bindings; defaults remain active.
  }
}

export function setKeybind(id, code) {
  if (!(id in DEFAULT_KEYBINDS) || !isBindableCode(code)) return false;
  KEYBINDS[id] = code;
  persistKeybinds();
  return true;
}

export function resetKeybinds() {
  Object.assign(KEYBINDS, DEFAULT_KEYBINDS);
  persistKeybinds();
}

loadKeybinds();

export const BASE_BLOOD_VOLUME = 5.2;
export const BASE_DECAL_LIFE = 75;
const STORAGE_KEY = 'bloodvox.settings.v1';

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/** Read persisted player settings. Safe in a headless build. */
export function loadSettings() {
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data?.blood) {
      for (const key of Object.keys(BLOOD_SETTINGS)) {
        const range = BLOOD_RANGES[key];
        const value = clampNumber(data.blood[key], range.min, range.max);
        if (value !== null) BLOOD_SETTINGS[key] = value;
      }
    }
    if (data?.game) {
      const g = data.game;
      const setNum = (key, min, max) => {
        const value = clampNumber(g[key], min, max);
        if (value !== null) GAME_SETTINGS[key] = value;
      };
      setNum('sensitivity', 0.2, 3);
      setNum('adsSensitivity', 0.1, 1.5);
      setNum('bloodIntensity', 0, 2);
      setNum('violence', 0, 1);
      if (typeof g.invertY === 'boolean') GAME_SETTINGS.invertY = g.invertY;
      if (typeof g.bloodEnabled === 'boolean') GAME_SETTINGS.bloodEnabled = g.bloodEnabled;
      if (typeof g.decalsEnabled === 'boolean') GAME_SETTINGS.decalsEnabled = g.decalsEnabled;
      if (typeof g.impactEffects === 'boolean') GAME_SETTINGS.impactEffects = g.impactEffects;
      if (typeof g.childSafety === 'boolean') GAME_SETTINGS.childSafety = g.childSafety;
    }
  } catch {
    // A corrupt or unavailable store must never prevent the game from booting.
  }
}

/** Persist current settings. Called on every committed change. */
export function saveSettings() {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        blood: { ...BLOOD_SETTINGS },
        game: { ...GAME_SETTINGS },
      }),
    );
  } catch {
    // Private-mode storage quotas are not a gameplay failure.
  }
}

export function setGameSetting(key, value) {
  if (!(key in GAME_SETTINGS)) return;
  const current = GAME_SETTINGS[key];
  if (typeof current === 'boolean') {
    GAME_SETTINGS[key] = !!value;
  } else {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const limits = {
      sensitivity: [0.2, 3],
      adsSensitivity: [0.1, 1.5],
      bloodIntensity: [0, 2],
      violence: [0, 1],
    };
    const [min, max] = limits[key] || [0, 1];
    GAME_SETTINGS[key] = Math.max(min, Math.min(max, n));
  }
  saveSettings();
}

export function setBloodSetting(key, value) {
  const range = BLOOD_RANGES[key];
  if (!range) return;
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  BLOOD_SETTINGS[key] = Math.max(range.min, Math.min(range.max, n));
  saveSettings();
}

/** The child filter is an absolute override, not another intensity slider. */
export function childSafetyEnabled() {
  return !!GAME_SETTINGS.childSafety;
}

/** All red effects (blood chunks, decals, pools, arterial jets, gore). */
export function bloodVisualsEnabled() {
  return !!GAME_SETTINGS.bloodEnabled && !GAME_SETTINGS.childSafety;
}

/** Non-graphic injury effects: bone exposure, tissue chunks, organs, dismemberment. */
export function goreEnabled() {
  return !GAME_SETTINGS.childSafety;
}

export function impactVisualsEnabled() {
  return !!GAME_SETTINGS.impactEffects;
}

/** Global multiplier for the amount of violence, separate from the filter. */
export function violenceScale() {
  return Math.max(0, Math.min(1, GAME_SETTINGS.violence));
}

export function bloodAmount() {
  return BLOOD_SETTINGS.amount;
}

export function bloodSprayScale() {
  if (!bloodVisualsEnabled()) return 0;
  return Math.max(0, Math.min(2, BLOOD_SETTINGS.spray * GAME_SETTINGS.bloodIntensity * (0.4 + violenceScale() * 0.6)));
}

export function bloodParticleScale() {
  if (!bloodVisualsEnabled()) return 0;
  return Math.max(0, Math.min(2, BLOOD_SETTINGS.particles * GAME_SETTINGS.bloodIntensity));
}

export function bloodDecalScale() {
  if (!bloodVisualsEnabled() || !GAME_SETTINGS.decalsEnabled) return 0;
  return Math.max(0, Math.min(2, BLOOD_SETTINGS.decals * GAME_SETTINGS.bloodIntensity));
}

export function bloodLossScale() {
  return Math.max(0.2, Math.min(2.5, BLOOD_SETTINGS.lossRate));
}

export function bloodPersistenceSeconds() {
  if (!bloodVisualsEnabled()) return 0;
  return BASE_DECAL_LIFE * Math.max(0.2, Math.min(3, BLOOD_SETTINGS.persistence));
}

loadSettings();
