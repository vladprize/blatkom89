/**
 * Procedural sound effects synthesised with WebAudio at startup (no audio files, no licensing).
 * Positional: volume falls off with distance from the listener, stereo pan by horizontal offset.
 */
type SfxName = 'pistol' | 'avtomat' | 'obrez' | 'swing' | 'hit' | 'ricochet' | 'reload' | 'dry' | 'pickup' | 'death' | 'kill' | 'beep' | 'beepHigh' | 'click' | 'step' | 'end' | 'hurt' | 'respawn';

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SfxName, AudioBuffer>();
  private volume = 0.8;
  private listener = { x: 0, y: 0 };
  private lastPlay = new Map<SfxName, number>();

  /** Must be called from a user gesture on iOS/Telegram. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.build();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(x: number, y: number): void {
    this.listener.x = x;
    this.listener.y = y;
  }

  private buf(seconds: number, fn: (t: number, i: number, sr: number) => number): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const n = Math.floor(seconds * sr);
    const b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      d[i] = fn(i / sr, i, sr);
      peak = Math.max(peak, Math.abs(d[i]!));
    }
    if (peak > 1) for (let i = 0; i < n; i++) d[i]! /= peak;
    return b;
  }

  private build() {
    let seed = 1234567;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff - 0.5;
    };
    // one-pole low-pass state helpers
    const lp = (k: number) => {
      let y = 0;
      return (x: number) => (y += k * (x - y));
    };
    const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
    const shot = (len: number, bodyHz: number, noiseLp: number, dec: number, crack: number) => {
      const f = lp(noiseLp);
      return this.buf(len, (t) => {
        const n = f(rnd() * 2);
        const body = Math.sin(2 * Math.PI * bodyHz * t * (1 - t * 2)) * env(t, 0.002, dec * 0.6);
        const c = rnd() * env(t, 0.0005, 0.006) * crack;
        return (n * 1.6 * env(t, 0.001, dec) + body * 0.9 + c) * 0.9;
      });
    };
    this.buffers.set('pistol', shot(0.32, 140, 0.35, 0.05, 1.2));
    this.buffers.set('avtomat', shot(0.26, 110, 0.45, 0.038, 1.4));
    this.buffers.set('obrez', shot(0.7, 70, 0.18, 0.13, 1.6));
    {
      const f = lp(0.08);
      this.buffers.set('swing', this.buf(0.22, (t) => f(rnd() * 2) * Math.sin(Math.PI * Math.min(1, t / 0.22)) * 2.2));
    }
    {
      const f = lp(0.05);
      this.buffers.set('hit', this.buf(0.16, (t) => f(rnd() * 2) * env(t, 0.002, 0.04) * 3 + Math.sin(2 * Math.PI * 90 * t) * env(t, 0.001, 0.03)));
    }
    this.buffers.set('ricochet', this.buf(0.18, (t) => Math.sin(2 * Math.PI * (2400 - 5000 * t) * t) * env(t, 0.001, 0.05) * 0.5 + rnd() * env(t, 0.0005, 0.004)));
    const click = (t: number, at: number, hz: number) => (t > at ? Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-(t - at) / 0.012) : 0);
    this.buffers.set('reload', this.buf(0.5, (t) => click(t, 0.02, 1800) * 0.7 + click(t, 0.05, 900) * 0.5 + click(t, 0.34, 1400) * 0.8 + rnd() * 0.15 * (t > 0.33 && t < 0.36 ? 1 : 0)));
    this.buffers.set('dry', this.buf(0.08, (t) => click(t, 0.0, 2200) * 0.6));
    this.buffers.set('click', this.buf(0.05, (t) => click(t, 0.0, 1500) * 0.4));
    const tone = (hz: number, len: number, shape: 'sq' | 'sin' = 'sq') => this.buf(len, (t) => (shape === 'sq' ? Math.sign(Math.sin(2 * Math.PI * hz * t)) * 0.3 : Math.sin(2 * Math.PI * hz * t) * 0.6) * env(t, 0.004, len * 0.4));
    this.buffers.set('beep', tone(440, 0.16));
    this.buffers.set('beepHigh', tone(880, 0.32));
    this.buffers.set('pickup', this.buf(0.25, (t) => Math.sign(Math.sin(2 * Math.PI * (t < 0.08 ? 660 : t < 0.16 ? 880 : 1320) * t)) * 0.25 * env(t, 0.002, 0.12)));
    this.buffers.set('kill', this.buf(0.35, (t) => (Math.sin(2 * Math.PI * 1560 * t) * 0.35 + Math.sin(2 * Math.PI * 2340 * t) * 0.2) * env(t, 0.002, 0.08)));
    {
      const f = lp(0.04);
      this.buffers.set('death', this.buf(0.6, (t) => f(rnd() * 2) * env(t, 0.005, 0.12) * 2.5 + Math.sin(2 * Math.PI * (120 - 80 * t) * t) * env(t, 0.01, 0.15) * 0.6));
    }
    {
      const f = lp(0.12);
      this.buffers.set('step', this.buf(0.07, (t) => f(rnd() * 2) * env(t, 0.001, 0.015) * 1.2));
    }
    this.buffers.set('hurt', this.buf(0.2, (t) => Math.sin(2 * Math.PI * (300 - 600 * t) * t) * env(t, 0.003, 0.06) * 0.5));
    this.buffers.set('respawn', this.buf(0.4, (t) => Math.sin(2 * Math.PI * (330 + 400 * t) * t) * env(t, 0.02, 0.15) * 0.35));
    this.buffers.set('end', this.buf(1.2, (t) => {
      const notes = [523, 659, 784, 1046];
      const i = Math.min(3, Math.floor(t / 0.18));
      return Math.sign(Math.sin(2 * Math.PI * notes[i]! * t)) * 0.18 * env(t - i * 0.18, 0.004, 0.25);
    }));
  }

  play(name: SfxName, opts: { x?: number; y?: number; volume?: number; rate?: number } = {}): void {
    const ctx = this.ctx;
    const b = this.buffers.get(name);
    if (!ctx || !b || !this.master || ctx.state !== 'running') return;
    const now = performance.now();
    const minGap = name === 'avtomat' ? 30 : name === 'step' ? 60 : 15;
    if (now - (this.lastPlay.get(name) ?? 0) < minGap && (opts.x === undefined || name === 'step')) return;
    this.lastPlay.set(name, now);
    let vol = opts.volume ?? 1;
    let pan = 0;
    if (opts.x !== undefined && opts.y !== undefined) {
      const dx = opts.x - this.listener.x;
      const dy = opts.y - this.listener.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      vol *= Math.max(0, 1 - d / 700) ** 1.5;
      pan = Math.max(-0.8, Math.min(0.8, dx / 300));
      if (vol < 0.02) return;
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      src.connect(g).connect(p).connect(this.master);
    } else src.connect(g).connect(this.master);
    src.start();
  }
}

export const sfx = new SfxEngine();
export type { SfxName };
