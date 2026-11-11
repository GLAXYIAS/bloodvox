import * as THREE from 'three';
import {
  ATTACHMENTS,
  ATTACHMENT_SLOTS,
  applyWeaponMods,
  attachmentById,
  attachmentEffectLines,
  compatibleAttachments,
  isAttachmentCompatible,
  weaponModSlots,
} from './attachments.js';
import {
  ALL_SHOP_WEAPONS,
  GUN_WEAPONS,
  LOADOUT_SIZE,
  MELEE_SHOP_WEAPONS,
  SHOP_WEAPONS,
} from './player.js';
import { loadGame, saveGame } from './save.js';

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

const keyLabel = (index) => (index === 9 ? '0' : String(index + 1));
const gunKey = (weapon) => (weapon ? weapon.shopId || `base:${weapon.id}` : '');

function weaponMeta(weapon) {
  if (!weapon) return '';
  if (weapon.melee) return `${weapon.damage} DMG · ${weapon.range.toFixed(2)} M · ${weapon.cut.toUpperCase()}${weapon.block ? ' · BLOCK' : ''}`;
  const pellets = weapon.pellets > 1 ? ` × ${weapon.pellets}` : '';
  return `${weapon.magSize} RDS · ${weapon.damage} DMG${pellets} · ${weapon.auto ? 'AUTO' : 'SEMI'}`;
}

function resolveSavedWeapon(entry) {
  if (!entry) return null;
  const shop = ALL_SHOP_WEAPONS.find((weapon) => weapon.shopId === entry.shopId);
  if (shop) return shop;
  const base = GUN_WEAPONS.find((weapon) => weapon.id === entry.id) ||
    MELEE_SHOP_WEAPONS.find((weapon) => weapon.id === entry.id);
  return base || null;
}

/**
 * Black Market controller. It owns the wallet, purchases, slots, attachments,
 * saved loadout and the physical preview. Gameplay systems only need the
 * player's current weapon definitions, so this avoids a second inventory.
 */
export class Market {
  constructor({ player, sound, ui, pause, refreshAim, onClose }) {
    this.player = player;
    this.sound = sound;
    this.ui = ui;
    this.pause = pause;
    this.refreshAim = refreshAim;
    this.onClose = onClose;
    const saved = loadGame();
    this.credits = saved?.credits ?? 250;
    this.ownedUpgrades = new Set(saved?.ownedUpgrades || []);
    this.ownedAttachments = new Set(saved?.ownedAttachments || []);
    this.selectedSlot = 0;
    this.tab = 'firearms';
    this.openState = false;
    this.dragSlot = null;
    this.loadoutCards = [];
    this.weaponCards = [];
    this.modGunCards = [];
    this.modCards = [];
    this.previewState = null;
    this.previewRenderer = null;
    this.previewScene = null;
    this.previewCamera = null;
    this.previewRig = null;
    this.previewLoaded = false;

    if (saved?.loadout?.length) {
      const defs = saved.loadout.map((entry) => {
        const def = resolveSavedWeapon(entry);
        return def ? { ...def, attachments: { ...(entry.attachments || {}) } } : null;
      }).filter(Boolean);
      if (defs.length) player.restoreLoadout(defs, saved.weaponIndex || 0);
    }
    this.build();
    this.refresh();
  }

  syncWallet() {
    const label = `$ ${Math.max(0, Math.floor(this.credits))}`;
    if (this.ui.credits) this.ui.credits.textContent = label;
    if (this.ui.armoryCredits) this.ui.armoryCredits.textContent = label;
  }

  addCredits(amount) {
    this.credits = Math.max(0, this.credits + Math.floor(amount));
    this.syncWallet();
    this.persist();
  }

  persist() {
    // Battle Royale swaps the live weapon array for a match loadout; never
    // let that temporary inventory replace the player's purchased armoury.
    if (this.player?.brMode) return;
    saveGame({
      credits: this.credits,
      ownedUpgrades: [...this.ownedUpgrades],
      ownedAttachments: [...this.ownedAttachments],
      loadout: this.player.weapons,
      weaponIndex: this.player.weaponIndex,
    });
  }

  // ---------------------------------------------------------------- shell
  build() {
    this.ui.marketTabs = [...document.querySelectorAll('[data-market-tab]')];
    this.ui.marketViews = [...document.querySelectorAll('[data-market-view]')];
    this.ui.meleeGrid = document.getElementById('melee-grid');
    this.ui.modGunList = document.getElementById('mod-gun-list');
    this.ui.modAttachmentGrid = document.getElementById('mod-attachment-grid');
    this.ui.modName = document.getElementById('mod-name');
    this.ui.modStats = document.getElementById('mod-stats');
    this.ui.modMsg = document.getElementById('mod-msg');
    this.ui.modPreviewCanvas = document.getElementById('mod-preview');
    this.ui.modSlotFilters = document.getElementById('mod-slot-filters');

    this.ui.marketTabs.forEach((button) => {
      button.addEventListener('click', () => this.setTab(button.dataset.marketTab));
    });
    this.buildLoadout();
    this.buildWeaponCards();
    this.buildMeleeCards();
    this.buildMods();
    this.ui.armoryClose?.addEventListener('click', () => this.close());
    window.addEventListener('beforeunload', () => this.persist());
  }

  setTab(tab) {
    this.tab = tab;
    for (const button of this.ui.marketTabs) {
      const on = button.dataset.marketTab === tab;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const view of this.ui.marketViews) {
      view.hidden = view.dataset.marketView !== tab;
    }
    if (tab === 'mods') this.renderMods();
  }

  open() {
    if (this.openState) return;
    this.openState = true;
    this.pause?.();
    if (document.pointerLockElement) document.exitPointerLock();
    this.selectedSlot = Math.max(0, Math.min(LOADOUT_SIZE - 1, this.player.weaponIndex));
    this.ui.armory?.classList.add('open');
    if (this.ui.armoryMsg) this.ui.armoryMsg.textContent = `SLOT ${keyLabel(this.selectedSlot)} SELECTED · ${this.player.weapons[this.selectedSlot].name}.`;
    this.syncWallet();
    this.refresh();
    this.setTab(this.tab);
    if (this.tab === 'mods') this.initPreview();
  }

  close() {
    if (!this.openState) return;
    this.openState = false;
    this.clearPreview();
    this.ui.armory?.classList.remove('open');
    // The viewmodel may have been rebuilt to show an unbought candidate.
    this.player.cancelAim();
    this.player.buildGunModel();
    this.player.onWeapon?.();
    this.player.onAmmo?.();
    this.player.onAim?.();
    this.syncWallet();
    this.persist();
    this.onClose?.();
  }

  // ---------------------------------------------------------------- loadout
  buildLoadout() {
    this.ui.loadoutGrid.innerHTML = '';
    this.loadoutCards = [];
    for (let index = 0; index < LOADOUT_SIZE; index++) {
      const card = document.createElement('div');
      card.className = 'loadout-card';
      card.tabIndex = 0;
      card.draggable = true;
      card.dataset.slot = String(index);
      card.innerHTML = `
        <span class="loadout-key">${keyLabel(index)}</span>
        <span class="loadout-copy"><strong data-name>EMPTY</strong><small data-meta></small></span>
        <span class="loadout-kind" data-kind></span>
        <span class="loadout-state" data-state></span>
        <span class="loadout-order">
          <button type="button" data-step="-1" aria-label="Move slot ${keyLabel(index)} earlier">←</button>
          <button type="button" data-step="1" aria-label="Move slot ${keyLabel(index)} later">→</button>
        </span>`;
      card.querySelector('[data-step="-1"]').disabled = index === 0;
      card.querySelector('[data-step="1"]').disabled = index === LOADOUT_SIZE - 1;
      card.addEventListener('click', (event) => {
        const step = event.target.closest('[data-step]');
        if (step) {
          event.stopPropagation();
          const to = index + Number(step.dataset.step);
          if (to >= 0 && to < LOADOUT_SIZE) this.moveSlot(index, to);
          return;
        }
        this.selectSlot(index);
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.selectSlot(index);
        } else if (event.key === 'ArrowLeft' && index > 0) {
          event.preventDefault();
          this.moveSlot(index, index - 1);
        } else if (event.key === 'ArrowRight' && index < LOADOUT_SIZE - 1) {
          event.preventDefault();
          this.moveSlot(index, index + 1);
        }
      });
      card.addEventListener('dragstart', (event) => {
        this.dragSlot = index;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        this.dragSlot = null;
        this.loadoutCards.forEach((c) => c.classList.remove('dragging', 'drag-over'));
      });
      card.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        card.classList.remove('drag-over');
        const raw = event.dataTransfer.getData('text/plain');
        const from = raw === '' ? this.dragSlot : Number(raw);
        if (Number.isInteger(from) && from >= 0 && from < LOADOUT_SIZE && from !== index) {
          this.moveSlot(from, index);
        }
      });
      this.loadoutCards.push(card);
      this.ui.loadoutGrid.appendChild(card);
    }
  }

  selectSlot(index) {
    this.selectedSlot = index;
    if (this.ui.armoryMsg) this.ui.armoryMsg.textContent = `SLOT ${keyLabel(index)} SELECTED · ${this.player.weapons[index].name}. PICK A GUN.`;
    this.refresh();
  }

  moveSlot(from, to) {
    if (!this.player.swapWeapons(from, to)) return;
    this.selectedSlot = to;
    if (this.ui.armoryMsg) this.ui.armoryMsg.textContent = `${this.player.weapons[to].name} MOVED TO SLOT ${keyLabel(to)}.`;
    this.persist();
    this.refresh();
  }

  assignGun(def) {
    const key = gunKey(def);
    const existing = this.player.weapons.findIndex((weapon) => gunKey(weapon) === key);
    let message;
    if (existing === this.selectedSlot) {
      message = `${def.name} IS ALREADY IN SLOT ${keyLabel(this.selectedSlot)}.`;
    } else if (existing >= 0) {
      const displaced = this.player.weapons[this.selectedSlot];
      this.player.swapWeapons(this.selectedSlot, existing);
      message = `${def.name} MOVED TO SLOT ${keyLabel(this.selectedSlot)} · ${displaced.name} NOW IN SLOT ${keyLabel(existing)}.`;
    } else {
      this.player.replaceWeapon(this.selectedSlot, def);
      message = `${def.name} ASSIGNED TO SLOT ${keyLabel(this.selectedSlot)}.`;
    }
    if (this.ui.armoryMsg) this.ui.armoryMsg.textContent = message;
    this.persist();
    this.refresh();
  }

  buyGun(def) {
    const owned = !!def.shopId && this.ownedUpgrades.has(def.shopId);
    if (!owned && def.shopId) {
      if (this.credits < def.price) {
        if (this.ui.armoryMsg) this.ui.armoryMsg.textContent = `NOT ENOUGH CREDITS — ${def.name} NEEDS $${def.price}.`;
        this.sound.empty();
        return;
      }
      this.credits -= def.price;
      this.ownedUpgrades.add(def.shopId);
      this.syncWallet();
    }
    this.assignGun(def);
    if (!owned) {
      if (this.ui.armoryMsg) this.ui.armoryMsg.textContent = `PURCHASED · ${this.ui.armoryMsg.textContent}`;
    }
    this.persist();
  }

  // ---------------------------------------------------------------- cards
  buildWeaponCards() {
    if (!this.ui.armoryGrid) return;
    this.ui.armoryGrid.innerHTML = '';
    this.weaponCards = [];
    const add = (def, market) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `armory-card ${market ? 'shop-card' : 'service-card'}`;
      card.dataset.key = gunKey(def);
      card.innerHTML = `
        <span class="armory-slot">${market ? 'BLACK MARKET · FIREARM' : 'SERVICE FIREARM'}</span>
        <strong>${def.name}</strong>
        <p>${def.desc || weaponMeta(def)}</p>
        <span class="armory-stat">${weaponMeta(def)}</span>
        ${market ? `<span class="armory-price">$ ${def.price}</span>` : ''}
        <span class="armory-state"></span>`;
      card.addEventListener('click', () => (market ? this.buyGun(def) : this.assignGun(def)));
      this.weaponCards.push({ card, def, market });
      this.ui.armoryGrid.appendChild(card);
    };
    GUN_WEAPONS.forEach((gun) => add(gun, false));
    SHOP_WEAPONS.forEach((gun) => add(gun, true));
    this.ui.armoryCount.textContent = `${GUN_WEAPONS.length + SHOP_WEAPONS.length} FIREARMS`;
    this.ui.marketGrid?.remove();
    this.ui.marketGrid = null;
  }

  buildMeleeCards() {
    if (!this.ui.meleeGrid) return;
    this.ui.meleeGrid.innerHTML = '';
    for (const def of MELEE_SHOP_WEAPONS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'armory-card melee-card';
      card.dataset.key = gunKey(def);
      card.innerHTML = `
        <span class="armory-slot">BLACK MARKET · MELEE</span>
        <strong>${def.name}</strong>
        <p>${def.desc}</p>
        <span class="armory-stat">${weaponMeta(def)}${def.block ? ' · BLOCK RMB' : ''}</span>
        <span class="armory-price">$ ${def.price}</span>
        <span class="armory-state"></span>`;
      card.addEventListener('click', () => this.buyGun(def));
      this.weaponCards.push({ card, def, market: true });
      this.ui.meleeGrid.appendChild(card);
    }
    if (this.ui.meleeCount) this.ui.meleeCount.textContent = `${MELEE_SHOP_WEAPONS.length} MELEE`;
  }

  buildMods() {
    if (!this.ui.modGunList) return;
    this.ui.modGunList.innerHTML = '';
    this.modGunCards = [];
    this.player.weapons.forEach((weapon, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mod-gun-card';
      card.dataset.slot = String(index);
      card.innerHTML = `<span>SLOT ${keyLabel(index)}</span><strong>${weapon.name}</strong><small>${weapon.melee ? 'MELEE' : weaponMeta(weapon)}</small>`;
      card.addEventListener('click', () => {
        if (this.player.weaponIndex !== index) this.player.switchWeapon(index);
        this.renderMods();
        this.persist();
      });
      this.modGunCards.push(card);
      this.ui.modGunList.appendChild(card);
    });
  }

  // ---------------------------------------------------------------- status
  refresh() {
    this.syncWallet();
    this.loadoutCards.forEach((card, index) => {
      const weapon = this.player.weapons[index];
      const active = index === this.player.weaponIndex;
      const selected = index === this.selectedSlot;
      card.classList.toggle('selected', selected);
      card.classList.toggle('active', active);
      card.classList.toggle('premium', !!weapon.shopId);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
      card.querySelector('[data-name]').textContent = weapon.name;
      card.querySelector('[data-meta]').textContent = weaponMeta(weapon);
      card.querySelector('[data-kind]').textContent = weapon.melee ? 'MELEE' : weapon.shopId ? 'BLACK MARKET' : 'SERVICE';
      card.querySelector('[data-state]').textContent = active ? 'IN HAND' : selected ? 'SELECTED' : '';
    });

    for (const { card, def, market } of this.weaponCards) {
      const owned = !market || !def.shopId || this.ownedUpgrades.has(def.shopId);
      const equippedIndex = this.player.weapons.findIndex((weapon) => gunKey(weapon) === gunKey(def));
      const selected = gunKey(this.player.weapons[this.selectedSlot]) === gunKey(def);
      card.classList.toggle('owned', owned);
      card.classList.toggle('equipped', equippedIndex >= 0);
      card.classList.toggle('selected', selected);
      card.classList.toggle('poor', market && !owned && this.credits < def.price);
      const state = card.querySelector('.armory-state');
      if (equippedIndex >= 0) state.textContent = `IN SLOT ${keyLabel(equippedIndex)}`;
      else if (owned) state.textContent = `OWNED · ASSIGN → ${keyLabel(this.selectedSlot)}`;
      else state.textContent = this.credits >= def.price ? `BUY + ASSIGN → ${keyLabel(this.selectedSlot)}` : `NEED $${def.price - this.credits} MORE`;
    }

    this.modGunCards.forEach((card, index) => {
      const weapon = this.player.weapons[index];
      card.querySelector('strong').textContent = weapon.name;
      card.querySelector('small').textContent = weapon.melee ? 'MELEE' : weaponMeta(weapon);
      card.classList.toggle('active', index === this.player.weaponIndex);
    });
    if (this.ui.armoryMsg && !this.openState) {
      this.ui.armoryMsg.textContent = 'SELECT A SLOT, THEN CHOOSE A FIREARM OR MELEE WEAPON.';
    }
    if (this.tab === 'mods' && this.openState) this.renderMods();
  }

  // ---------------------------------------------------------------- mods
  initPreview() {
    if (this.previewLoaded || !this.ui.modPreviewCanvas) return;
    const canvas = this.ui.modPreviewCanvas;
    try {
      this.previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.previewRenderer.setPixelRatio(1);
      this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.previewRenderer.setClearColor(0x0b0d10, 1);
      this.previewScene = new THREE.Scene();
      this.previewCamera = new THREE.PerspectiveCamera(30, 2, 0.01, 10);
      this.previewCamera.position.set(0.65, 0.32, 1.45);
      this.previewCamera.lookAt(0, 0, -0.3);
      this.previewScene.add(new THREE.HemisphereLight(0xd8e1ec, 0x2a2118, 2.2));
      const key = new THREE.DirectionalLight(0xffefd5, 3.2);
      key.position.set(2, 3, 2);
      this.previewScene.add(key);
      const rim = new THREE.DirectionalLight(0x88bce8, 1.8);
      rim.position.set(-2, 1, -2);
      this.previewScene.add(rim);
      this.previewRig = new THREE.Group();
      this.previewScene.add(this.previewRig);
      this.previewLoaded = true;
      this.resizePreview();
    } catch {
      this.previewLoaded = false;
    }
  }

  resizePreview() {
    if (!this.previewLoaded || !this.ui.modPreviewCanvas) return;
    const rect = this.ui.modPreviewCanvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(160, Math.floor(rect.height));
    this.previewRenderer.setSize(width, height, false);
    this.previewCamera.aspect = width / height;
    this.previewCamera.updateProjectionMatrix();
  }

  clearPreview() {
    if (!this.previewRig) return;
    while (this.previewRig.children.length) this.previewRig.remove(this.previewRig.children[0]);
  }

  previewCandidate(slot, attachmentId) {
    if (!this.previewLoaded) this.initPreview();
    if (!this.previewLoaded) return;
    const weapon = this.player.weapon;
    this.clearPreview();
    const actual = { ...(weapon.attachments || {}) };
    const preview = { ...actual };
    if (slot) {
      if (attachmentId) preview[slot] = attachmentId;
      else delete preview[slot];
    }
    weapon.attachments = preview;
    if (!weapon.melee) {
      applyWeaponMods(weapon);
      this.player.magSize = weapon.magSize;
    }
    this.player.buildGunModel();
    const clone = this.player.gun.clone(true);
    const holder = new THREE.Group();
    holder.add(clone);
    this.previewRig.add(holder);
    clone.updateMatrixWorld(true);
    _box.setFromObject(clone);
    _box.getCenter(_center);
    _box.getSize(_size);
    clone.position.sub(_center);
    const maxDim = Math.max(_size.x, _size.y, _size.z, 0.3);
    const fit = weapon.melee ? 1.55 : Math.min(1.9, 1.65 / maxDim);
    holder.scale.setScalar(fit);
    holder.rotation.set(weapon.melee ? -0.08 : 0.08, weapon.melee ? 0.52 : 0.45, 0);
    holder.position.y = weapon.melee ? -0.05 : 0.02;
    // Restore the real state; the temporary viewmodel stays behind the modal
    // until close() rebuilds the equipped configuration.
    weapon.attachments = actual;
    if (!weapon.melee) {
      applyWeaponMods(weapon);
      this.player.magSize = weapon.magSize;
    }
    this.previewRenderer.render(this.previewScene, this.previewCamera);
  }

  renderMods() {
    if (!this.ui.modGunList) return;
    this.initPreview();
    this.modGunCards.forEach((card, index) => {
      card.classList.toggle('active', index === this.player.weaponIndex);
    });
    const weapon = this.player.weapon;
    if (this.ui.modName) this.ui.modName.textContent = weapon.name;
    if (this.ui.modStats) {
      this.ui.modStats.innerHTML = weapon.melee
        ? `${weapon.damage} DMG · ${weapon.range.toFixed(2)} M · BLOCK WITH RMB`
        : `${weapon.magSize} ROUNDS · ${weapon.damage} DMG · ADS ${weapon.adsFov}°${weapon.suppressed ? ' · SUPPRESSED' : ''}`;
    }
    const slots = weapon.melee ? [] : weaponModSlots(weapon);
    this.ui.modAttachmentGrid.innerHTML = '';
    if (!slots.length) {
      this.ui.modAttachmentGrid.innerHTML = '<p class="mod-empty">NO COMPATIBLE ATTACHMENT SLOTS FOR THIS WEAPON.</p>';
    }
    for (const slotId of slots) {
      const slotInfo = ATTACHMENT_SLOTS.find((slot) => slot.id === slotId);
      const installedId = weapon.attachments?.[slotId];
      const installed = attachmentById(installedId);
      const section = document.createElement('section');
      section.className = 'mod-slot';
      section.innerHTML = `<div class="mod-slot-head"><b>${slotInfo.label}</b><span>${slotInfo.hint}</span><em>${installed ? installed.name : 'EMPTY'}</em></div>`;
      const list = document.createElement('div');
      list.className = 'mod-options';
      if (installed) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'mod-option remove';
        remove.innerHTML = `<strong>REMOVE ${installed.name}</strong><span>Keep the part owned · revert to standard</span>`;
        remove.addEventListener('click', () => this.installAttachment(slotId, null));
        remove.addEventListener('mouseenter', () => this.previewCandidate(slotId, null));
        list.appendChild(remove);
      }
      for (const attachment of compatibleAttachments(weapon, slotId)) {
        const owned = this.ownedAttachments.has(attachment.id);
        const active = installedId === attachment.id;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mod-option${active ? ' active' : ''}${owned ? ' owned' : ''}`;
        button.innerHTML = `
          <strong>${attachment.name}</strong>
          <span>${attachmentEffectLines(weapon, attachment).join(' · ')}</span>
          <small>${attachment.desc}</small>
          <em>${active ? 'INSTALLED' : owned ? 'EQUIP' : `$ ${attachment.price}`}</em>`;
        button.addEventListener('click', () => this.installAttachment(slotId, attachment.id));
        button.addEventListener('mouseenter', () => this.previewCandidate(slotId, attachment.id));
        button.addEventListener('focus', () => this.previewCandidate(slotId, attachment.id));
        button.addEventListener('mouseleave', () => this.previewCandidate(slotId, installedId || null));
        button.addEventListener('blur', () => this.previewCandidate(slotId, installedId || null));
        list.appendChild(button);
      }
      section.appendChild(list);
      this.ui.modAttachmentGrid.appendChild(section);
    }
    this.previewCandidate(null, null);
    this.resizePreview();
  }

  installAttachment(slot, attachmentId) {
    const weapon = this.player.weapon;
    if (weapon.melee) return;
    const attachment = attachmentId ? attachmentById(attachmentId) : null;
    if (attachment && !isAttachmentCompatible(weapon, attachment)) {
      if (this.ui.modMsg) this.ui.modMsg.textContent = `${attachment.name} IS NOT COMPATIBLE WITH ${weapon.name}.`;
      return;
    }
    const owned = !attachment || this.ownedAttachments.has(attachment.id);
    if (attachment && !owned) {
      if (this.credits < attachment.price) {
        if (this.ui.modMsg) this.ui.modMsg.textContent = `NOT ENOUGH CREDITS — ${attachment.name} NEEDS $${attachment.price}.`;
        this.sound.empty();
        return;
      }
      this.credits -= attachment.price;
      this.ownedAttachments.add(attachment.id);
      this.syncWallet();
    }
    weapon.attachments = { ...(weapon.attachments || {}) };
    if (attachment) weapon.attachments[slot] = attachment.id;
    else delete weapon.attachments[slot];
    applyWeaponMods(weapon);
    this.clearPreview();
    this.player.refreshWeaponMods();
    this.persist();
    if (this.ui.modMsg) {
      this.ui.modMsg.textContent = attachment
        ? `${attachment.name} ${owned ? 'EQUIPPED' : 'PURCHASED AND EQUIPPED'} ON ${weapon.name}.`
        : `REMOVED ATTACHMENT FROM ${weapon.name}.`;
    }
    this.renderMods();
  }
}
