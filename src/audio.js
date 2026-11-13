// Tiny synthesised soundscape: no audio files.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.5; this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // a slow organ-like drone
      for (const [f, v] of [[55, 0.05], [82.6, 0.03], [110.4, 0.018]]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), l = this.ctx.createOscillator(), lg = this.ctx.createGain();
        o.type = 'sine'; o.frequency.value = f; g.gain.value = v;
        l.frequency.value = 0.05 + Math.random() * 0.1; lg.gain.value = v * 0.6;
        l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(this.out); o.start(); l.start();
      }
    } catch { this.ctx = null; }
  }

  toggleMute() { this.muted = !this.muted; if (this.out) this.out.gain.value = this.muted ? 0 : 0.5; return this.muted; }

  tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }

  hiss(dur, f0, f1, vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur + 0.05);
  }

  step() { this.hiss(0.07, 500 + Math.random() * 300, 180, 0.09); }
  land(k) { this.hiss(0.2, 300, 70, Math.min(0.4, 0.12 + k * 0.03)); this.tone(70, 0.2, { vol: 0.2, slide: 0.5 }); }
  flip() { this.hiss(0.65, 200, 1800, 0.16); this.tone(196, 0.7, { vol: 0.07, slide: 1.5, type: 'triangle' }); }
  key() { [659, 880, 1319].forEach((f, i) => this.tone(f, 0.5, { delay: i * 0.08, vol: 0.12, type: 'triangle' })); }
  invert(toNight) { const fs = toNight ? [523, 392, 262] : [262, 392, 523]; fs.forEach((f, i) => this.tone(f, 0.7, { delay: i * 0.1, vol: 0.1 })); this.hiss(0.8, 2400, 300, 0.1); }
  deny() { this.tone(140, 0.25, { type: 'square', vol: 0.05, slide: 0.7 }); }
  hint() { this.tone(988, 0.3, { vol: 0.06 }); }
  win() { [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 0.9, { delay: i * 0.12, vol: 0.11, type: 'triangle' })); }
}
