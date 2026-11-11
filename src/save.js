const SAVE_KEY = 'bloodvox.blackmarket.v1';

function validLoadout(loadout) {
  if (!Array.isArray(loadout)) return false;
  return loadout.every((entry) => entry && typeof entry.id === 'string');
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return {
      credits: Number.isFinite(data.credits) ? Math.max(0, Math.floor(data.credits)) : 250,
      ownedUpgrades: Array.isArray(data.ownedUpgrades) ? data.ownedUpgrades.filter((id) => typeof id === 'string') : [],
      ownedAttachments: Array.isArray(data.ownedAttachments) ? data.ownedAttachments.filter((id) => typeof id === 'string') : [],
      loadout: validLoadout(data.loadout) ? data.loadout : null,
      weaponIndex: Number.isInteger(data.weaponIndex) ? data.weaponIndex : 0,
    };
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    const payload = {
      version: 1,
      credits: Math.max(0, Math.floor(state.credits ?? 0)),
      ownedUpgrades: [...(state.ownedUpgrades || [])],
      ownedAttachments: [...(state.ownedAttachments || [])],
      loadout: (state.loadout || []).map((weapon) => ({
        id: weapon.id,
        shopId: weapon.shopId || null,
        baseId: weapon.baseId || null,
        attachments: { ...(weapon.attachments || {}) },
      })),
      weaponIndex: state.weaponIndex ?? 0,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export { SAVE_KEY };
