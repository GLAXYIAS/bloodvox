// Procedural synth audio — no asset files, everything is generated on the fly.
export class Sound {
  constructor() {
    this.ctx = null;
    this.noise = null;
    this.master = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(rate * 1.5), rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
  }

  noiseBurst({ dur = 0.2, freq = 1800, endFreq = 200, q = 0.8, gain = 0.8, delay = 0, type = 'bandpass' }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 120, endFreq = 50, dur = 0.18, gain = 0.5, type = 'sine', delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot(kind = 'pistol', options = {}) {
    if (options.suppressed) {
      this.noiseBurst({ dur: 0.08, freq: 950, endFreq: 210, q: 1.1, gain: 0.32, type: 'lowpass' });
      this.tone({ freq: 130, endFreq: 58, dur: 0.11, gain: 0.22, type: 'sine' });
      this.noiseBurst({ dur: 0.2, freq: 380, endFreq: 80, q: 0.5, gain: 0.12, type: 'lowpass' });
      return;
    }
    if (kind === 'thumper') {
      this.noiseBurst({ dur: 0.3, freq: 760, endFreq: 80, q: 0.5, gain: 1.1, type: 'lowpass' });
      this.tone({ freq: 92, endFreq: 28, dur: 0.34, gain: 0.8 });
      return;
    }
    if (kind === 'crossbow') {
      this.tone({ freq: 340, endFreq: 120, dur: 0.18, gain: 0.3, type: 'triangle' });
      this.noiseBurst({ dur: 0.12, freq: 900, endFreq: 220, q: 1.4, gain: 0.25 });
      return;
    }
    if (kind === 'magnum') {
      this.noiseBurst({ dur: 0.35, freq: 2400, endFreq: 90, q: 0.55, gain: 1.1 });
      this.noiseBurst({ dur: 0.6, freq: 700, endFreq: 60, q: 0.4, gain: 0.4 });
      this.tone({ freq: 125, endFreq: 34, dur: 0.3, gain: 0.75 });
      return;
    }
    if (kind === 'lmg') {
      this.noiseBurst({ dur: 0.2, freq: 2600, endFreq: 150, q: 0.6, gain: 0.9 });
      this.noiseBurst({ dur: 0.42, freq: 750, endFreq: 80, q: 0.4, gain: 0.28 });
      this.tone({ freq: 145, endFreq: 48, dur: 0.13, gain: 0.5 });
      return;
    }
    if (kind === 'carbine') {
      this.noiseBurst({ dur: 0.2, freq: 3000, endFreq: 220, q: 0.7, gain: 0.92 });
      this.noiseBurst({ dur: 0.4, freq: 800, endFreq: 90, q: 0.4, gain: 0.28 });
      this.tone({ freq: 165, endFreq: 50, dur: 0.14, gain: 0.48 });
      return;
    }
    if (kind === 'shotgun' || kind === 'sawedoff') {
      this.noiseBurst({ dur: 0.4, freq: 1300, endFreq: 60, q: 0.5, gain: 1.15 });
      this.noiseBurst({ dur: 0.7, freq: 480, endFreq: 55, q: 0.35, gain: 0.42 });
      this.tone({ freq: 105, endFreq: 32, dur: 0.3, gain: 0.7, type: 'sine' });
      return;
    }
    if (kind === 'rifle') {
      this.noiseBurst({ dur: 0.3, freq: 3200, endFreq: 120, q: 0.6, gain: 1.05 });
      this.noiseBurst({ dur: 0.55, freq: 900, endFreq: 70, q: 0.4, gain: 0.34 });
      this.tone({ freq: 185, endFreq: 36, dur: 0.22, gain: 0.6, type: 'sine' });
      return;
    }
    if (kind === 'smg') {
      this.noiseBurst({ dur: 0.12, freq: 2800, endFreq: 320, q: 0.9, gain: 0.66 });
      this.noiseBurst({ dur: 0.26, freq: 800, endFreq: 120, q: 0.5, gain: 0.2 });
      this.tone({ freq: 175, endFreq: 70, dur: 0.08, gain: 0.32, type: 'sine' });
      return;
    }
    this.noiseBurst({ dur: 0.22, freq: 2200, endFreq: 180, q: 0.7, gain: 0.95 });
    this.noiseBurst({ dur: 0.5, freq: 700, endFreq: 90, q: 0.4, gain: 0.32 });
    this.tone({ freq: 150, endFreq: 42, dur: 0.16, gain: 0.55, type: 'sine' });
  }

  /** Distant, slightly muffled NPC gunfire so it reads apart from your own. */
  enemyShot(kind = 'pistol') {
    const smg = kind === 'smg';
    this.noiseBurst({ dur: smg ? 0.1 : 0.16, freq: smg ? 1900 : 1500, endFreq: 160, q: 0.8, gain: 0.34 });
    this.tone({ freq: smg ? 125 : 105, endFreq: 46, dur: 0.11, gain: 0.18, type: 'sine' });
  }

  explosion() {
    this.noiseBurst({ dur: 0.9, freq: 900, endFreq: 40, q: 0.35, gain: 1.5, type: 'lowpass' });
    this.noiseBurst({ dur: 0.45, freq: 2600, endFreq: 160, q: 0.5, gain: 0.72 });
    this.tone({ freq: 74, endFreq: 22, dur: 0.85, gain: 0.95, type: 'sine' });
    this.noiseBurst({ dur: 1.4, freq: 260, endFreq: 55, q: 0.3, gain: 0.25, delay: 0.08, type: 'lowpass' });
  }

  armour() {
    this.noiseBurst({ dur: 0.09, freq: 5200, endFreq: 1400, q: 3, gain: 0.32 });
    this.tone({ freq: 2400, endFreq: 900, dur: 0.12, gain: 0.2, type: 'triangle' });
  }

  face() {
    this.noiseBurst({ dur: 0.28, freq: 1100, endFreq: 110, q: 1.1, gain: 0.85, type: 'lowpass' });
    this.tone({ freq: 80, endFreq: 34, dur: 0.2, gain: 0.45 });
  }

  punch() {
    this.noiseBurst({ dur: 0.1, freq: 340, endFreq: 80, q: 1, gain: 0.5, type: 'lowpass' });
    this.tone({ freq: 70, endFreq: 38, dur: 0.13, gain: 0.4 });
  }

  hurt() {
    this.noiseBurst({ dur: 0.22, freq: 650, endFreq: 90, q: 0.7, gain: 0.4, type: 'lowpass' });
    this.tone({ freq: 92, endFreq: 34, dur: 0.32, gain: 0.42 });
  }

  block() {
    this.noiseBurst({ dur: 0.12, freq: 4200, endFreq: 900, q: 2.2, gain: 0.4 });
    this.tone({ freq: 520, endFreq: 260, dur: 0.16, gain: 0.22, type: 'triangle' });
  }

  switchGun() {
    this.noiseBurst({ dur: 0.05, freq: 2400, endFreq: 800, q: 2.5, gain: 0.24 });
    this.tone({ freq: 300, endFreq: 220, dur: 0.05, gain: 0.12, type: 'square' });
  }

  hit() {
    this.noiseBurst({ dur: 0.09, freq: 900, endFreq: 160, q: 1.6, gain: 0.5, type: 'lowpass' });
    this.tone({ freq: 95, endFreq: 55, dur: 0.07, gain: 0.28 });
  }

  impact() {
    this.noiseBurst({ dur: 0.06, freq: 3000, endFreq: 600, q: 2, gain: 0.22 });
  }

  melee(cut = 'sharp', id = 'cleaver') {
    if (cut === 'blunt' || id === 'maul') {
      this.noiseBurst({ dur: 0.16, freq: 380, endFreq: 55, q: 0.8, gain: 0.8, type: 'lowpass' });
      this.tone({ freq: 74, endFreq: 27, dur: 0.22, gain: 0.55 });
      return;
    }
    this.noiseBurst({ dur: 0.11, freq: 4600, endFreq: 1300, q: 2.4, gain: 0.28 });
    this.noiseBurst({ dur: 0.13, freq: 620, endFreq: 120, q: 0.9, gain: 0.34, type: 'lowpass' });
    this.tone({ freq: 190, endFreq: 80, dur: 0.09, gain: 0.18, type: 'triangle' });
  }

  chest() {
    this.noiseBurst({ dur: 0.14, freq: 720, endFreq: 180, q: 1.2, gain: 0.45, type: 'lowpass' });
    this.tone({ freq: 110, endFreq: 62, dur: 0.18, gain: 0.3 });
    this.noiseBurst({ dur: 0.08, freq: 2600, endFreq: 900, q: 2, gain: 0.18, delay: 0.12 });
  }

  empty() {
    this.noiseBurst({ dur: 0.03, freq: 4000, endFreq: 2000, q: 4, gain: 0.3 });
  }

  reload() {
    this.noiseBurst({ dur: 0.05, freq: 2500, endFreq: 900, q: 3, gain: 0.35, delay: 0.08 });
    this.tone({ freq: 420, endFreq: 300, dur: 0.05, gain: 0.16, type: 'square', delay: 0.08 });
    this.noiseBurst({ dur: 0.06, freq: 1800, endFreq: 700, q: 3, gain: 0.4, delay: 0.62 });
    this.tone({ freq: 300, endFreq: 220, dur: 0.06, gain: 0.18, type: 'square', delay: 0.62 });
    this.noiseBurst({ dur: 0.05, freq: 3200, endFreq: 1400, q: 4, gain: 0.35, delay: 1.05 });
  }

  step() {
    this.noiseBurst({ dur: 0.05, freq: 500, endFreq: 160, q: 1.2, gain: 0.09, type: 'lowpass' });
  }
}
