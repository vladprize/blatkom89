/**
 * Procedural sound effects synthesised with WebAudio at startup (no audio files, no licensing).
 * Positional: volume falls off with distance from the listener, stereo pan by horizontal offset.
 */
import type { WeaponSound } from '@blatkom/shared';

type SfxName = WeaponSound | 'hit' | 'ricochet' | 'reload' | 'dry' | 'pickup' | 'death' | 'kill' | 'assist' | 'supply' | 'beep' | 'beepHigh' | 'click' | 'step' | 'end' | 'hurt' | 'respawn' | 'boom' | 'heal' | 'buy' | 'throw' | 'place' | 'deploy' | 'flashbang' | 'tinnitus' | 'ignite' | 'hiss' | 'mineBeep' | 'turret' | 'crash' | 'flagTaken' | 'flagCaptured' | 'flagReturned' | 'flagDropped' | 'baseCaptured' | 'baseLost';

/** Rapid-fire sounds are rate-limited per listener so automatic fire does not turn into noise. */
const MIN_GAP: Partial<Record<SfxName, number>> = { avtomat: 30, smg: 28, lmg: 34, nail: 40, flame: 90, step: 60, turret: 40 };

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

  /** The shared AudioContext once unlocked by a gesture (the menu music is routed through it). */
  context(): AudioContext | null {
    return this.ctx;
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
    this.buffers.set('revolver', shot(0.45, 118, 0.3, 0.07, 1.5));
    this.buffers.set('smg', shot(0.18, 160, 0.52, 0.024, 1.1));
    this.buffers.set('lmg', shot(0.32, 92, 0.4, 0.048, 1.6));
    {
      // rifle: hard crack and a long rolling tail
      const crack = shot(0.95, 78, 0.3, 0.12, 2.2);
      const d = crack.getChannelData(0);
      const sr = crack.sampleRate;
      const f = lp(0.03);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = d[i]! + f(rnd() * 2) * 0.5 * (t > 0.05 ? Math.exp(-(t - 0.05) / 0.35) : 0);
      }
      this.buffers.set('rifle', crack);
    }
    {
      // pump shotgun: the blast, then the pump clack
      const clk = (t: number, at: number, hz: number) => (t > at ? Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-(t - at) / 0.014) : 0);
      const f = lp(0.2);
      this.buffers.set('shotgun', this.buf(0.72, (t) => (f(rnd() * 2) * 1.5 * env(t, 0.001, 0.1) + Math.sin(2 * Math.PI * 72 * t * (1 - t)) * env(t, 0.002, 0.07)) * 0.9 + clk(t, 0.42, 900) * 0.45 + clk(t, 0.52, 650) * 0.5));
    }
    {
      // suppressed: a dull «пфф» and the slide cycling
      const f = lp(0.07);
      this.buffers.set('silenced', this.buf(0.16, (t) => f(rnd() * 2) * env(t, 0.001, 0.02) * 2.2 + (t > 0.02 ? Math.sin(2 * Math.PI * 2100 * (t - 0.02)) * Math.exp(-(t - 0.02) / 0.008) * 0.25 : 0)));
    }
    {
      const f = lp(0.06);
      const g = lp(0.3);
      this.buffers.set('rocket', this.buf(0.9, (t) => f(rnd() * 2) * 2.2 * env(t, 0.01, 0.12) + g(rnd() * 2) * 0.7 * Math.sin(Math.PI * Math.min(1, t / 0.9)) * (0.6 + 0.4 * Math.sin(t * 60))));
    }
    {
      const f = lp(0.12);
      this.buffers.set('flame', this.buf(0.2, (t) => f(rnd() * 2) * 1.6 * Math.sin(Math.PI * Math.min(1, t / 0.2)) * (0.7 + 0.3 * Math.sin(t * 190))));
    }
    this.buffers.set('bow', this.buf(0.32, (t) => Math.sin(2 * Math.PI * (230 - 60 * t) * t) * env(t, 0.002, 0.09) * 0.7 + rnd() * env(t, 0.0005, 0.01) * 0.6));
    {
      const f = lp(0.3);
      this.buffers.set('nail', this.buf(0.12, (t) => f(rnd() * 2) * env(t, 0.001, 0.018) * 1.6 + Math.sin(2 * Math.PI * 1700 * t) * env(t, 0.0005, 0.006) * 0.5));
    }
    {
      const f = lp(0.08);
      this.buffers.set('swing', this.buf(0.22, (t) => f(rnd() * 2) * Math.sin(Math.PI * Math.min(1, t / 0.22)) * 2.2));
      const h = lp(0.045);
      this.buffers.set('heavySwing', this.buf(0.34, (t) => h(rnd() * 2) * Math.sin(Math.PI * Math.min(1, t / 0.34)) * 2.8));
    }
    {
      // explosion: thump + roar + crackle
      const f = lp(0.05);
      const g = lp(0.4);
      this.buffers.set('boom', this.buf(1.6, (t) => Math.sin(2 * Math.PI * (58 - 20 * t) * t) * env(t, 0.004, 0.25) * 1.2 + f(rnd() * 2) * 2.6 * env(t, 0.006, 0.35) + (rnd() > 0.47 ? g(rnd() * 2) * 0.5 * env(t, 0.05, 0.4) : 0)));
    }
    this.buffers.set('heal', this.buf(0.45, (t) => (Math.sin(2 * Math.PI * (t < 0.15 ? 660 : 990) * t) * 0.35) * env(t < 0.15 ? t : t - 0.15, 0.004, 0.14)));
    this.buffers.set('buy', this.buf(0.5, (t) => {
      const notes = [784, 988, 1318];
      const i = Math.min(2, Math.floor(t / 0.09));
      return Math.sin(2 * Math.PI * notes[i]! * t) * 0.3 * env(t - i * 0.09, 0.003, 0.12);
    }));
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
    // assist: a softer, lower confirmation ping
    this.buffers.set('assist', this.buf(0.25, (t) => Math.sin(2 * Math.PI * 1170 * t) * 0.3 * env(t, 0.002, 0.06)));
    // «дефицит завезли»: station-style two-tone chime over a short truck-horn buzz
    this.buffers.set('supply', this.buf(1.1, (t) => {
      const chime = (t < 0.45 ? Math.sin(2 * Math.PI * 784 * t) * env(t, 0.005, 0.3) : Math.sin(2 * Math.PI * 523 * t) * env(t - 0.45, 0.005, 0.35)) * 0.45;
      const horn = t < 0.25 ? Math.sign(Math.sin(2 * Math.PI * 220 * t)) * 0.12 * env(t, 0.01, 0.12) : 0;
      return chime + horn;
    }));
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
    // ── equipment ──
    {
      const f = lp(0.1);
      // a quick whoosh of the throwing arm and a spoon «ting»
      this.buffers.set('throw', this.buf(0.3, (t) => f(rnd() * 2) * Math.sin(Math.PI * Math.min(1, t / 0.22)) * 1.4 + click(t, 0.02, 3200) * 0.25));
      this.buffers.set('place', this.buf(0.28, (t) => click(t, 0.0, 700) * 0.6 + click(t, 0.12, 1900) * 0.5 + click(t, 0.18, 2600) * 0.35));
      this.buffers.set('deploy', this.buf(0.7, (t) => click(t, 0.0, 500) * 0.6 + click(t, 0.18, 800) * 0.5 + (t > 0.3 ? Math.sin(2 * Math.PI * (300 + 700 * (t - 0.3)) * t) * 0.18 * env(t - 0.3, 0.02, 0.15) : 0)));
      const g = lp(0.5);
      this.buffers.set('flashbang', this.buf(0.9, (t) => g(rnd() * 2) * 2.4 * env(t, 0.001, 0.06) + Math.sin(2 * Math.PI * 95 * t) * env(t, 0.002, 0.1) + rnd() * env(t, 0.0003, 0.01) * 2));
      this.buffers.set('tinnitus', this.buf(2.6, (t) => Math.sin(2 * Math.PI * 4100 * t) * 0.08 * env(t, 0.05, 1.1) + Math.sin(2 * Math.PI * 4170 * t) * 0.05 * env(t, 0.05, 0.9)));
      const h = lp(0.25);
      // glass shatters, then the fire catches with a whoosh
      this.buffers.set('ignite', this.buf(1.0, (t) => (t < 0.12 ? (rnd() > 0.2 ? rnd() * 1.6 : 0) * env(t, 0.0005, 0.04) + Math.sin(2 * Math.PI * (5200 - 9000 * t) * t) * 0.2 * env(t, 0.001, 0.03) : 0) + f(rnd() * 2) * 1.8 * Math.sin(Math.PI * Math.min(1, Math.max(0, t - 0.08) / 0.9)) * (0.7 + 0.3 * Math.sin(t * 40))));
      this.buffers.set('hiss', this.buf(1.6, (t) => h(rnd() * 2) * 0.9 * env(t, 0.08, 0.7)));
      this.buffers.set('mineBeep', tone(1760, 0.12, 'sin'));
      this.buffers.set('turret', shot(0.16, 180, 0.6, 0.02, 0.9));
      const k = lp(0.2);
      this.buffers.set('crash', this.buf(0.6, (t) => k(rnd() * 2) * 1.8 * env(t, 0.002, 0.12) + click(t, 0.05, 600) * 0.6 + click(t, 0.15, 400) * 0.5));
    }
    // ── capture the flag / base capture ──
    {
      // flag stolen: a factory klaxon, two short alternating blasts
      this.buffers.set('flagTaken', this.buf(0.62, (t) => {
        const hz = Math.floor(t / 0.15) % 2 === 0 ? 622 : 466;
        const seg = t % 0.15;
        return (Math.sign(Math.sin(2 * Math.PI * hz * t)) * 0.2 + Math.sin(2 * Math.PI * hz * 2 * t) * 0.08) * env(seg, 0.006, 0.09) * (t < 0.6 ? 1 : 0);
      }));
      // flag captured: a bugle call, brassy (odd harmonics), the last note held
      const brass = (hz: number, t: number) => Math.sin(2 * Math.PI * hz * t) * 0.5 + Math.sin(2 * Math.PI * hz * 2 * t) * 0.22 + Math.sin(2 * Math.PI * hz * 3 * t) * 0.14 + Math.sin(2 * Math.PI * hz * 4 * t) * 0.06;
      this.buffers.set('flagCaptured', this.buf(1.5, (t) => {
        const notes: Array<[number, number, number]> = [
          [392, 0, 0.14],
          [523, 0.15, 0.14],
          [659, 0.3, 0.14],
          [784, 0.45, 0.95],
        ];
        let v = 0;
        for (const [hz, at, len] of notes) if (t >= at && t < at + len + 0.05) v += brass(hz, t - at) * env(t - at, 0.012, len * 0.7) * 0.32;
        return v;
      }));
      // flag back home: two soft falling notes
      this.buffers.set('flagReturned', this.buf(0.5, (t) => (t < 0.2 ? Math.sin(2 * Math.PI * 880 * t) * env(t, 0.004, 0.09) : Math.sin(2 * Math.PI * 659 * t) * env(t - 0.2, 0.004, 0.14)) * 0.35));
      // flag dropped: a dull thud and a low tone
      const f = lp(0.05);
      this.buffers.set('flagDropped', this.buf(0.4, (t) => f(rnd() * 2) * env(t, 0.002, 0.04) * 2 + Math.sin(2 * Math.PI * 196 * t) * env(t, 0.004, 0.12) * 0.35));
      // base taken: a station chime, bright major third
      this.buffers.set('baseCaptured', this.buf(0.8, (t) => (t < 0.18 ? Math.sin(2 * Math.PI * 1046 * t) * env(t, 0.003, 0.12) : Math.sin(2 * Math.PI * 1318 * t) * env(t - 0.18, 0.003, 0.3)) * 0.33));
      // base lost: the same chime falling, minor
      this.buffers.set('baseLost', this.buf(0.8, (t) => (t < 0.18 ? Math.sin(2 * Math.PI * 622 * t) * env(t, 0.003, 0.12) : Math.sin(2 * Math.PI * 523 * t) * env(t - 0.18, 0.003, 0.3)) * 0.33));
    }
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
    const minGap = MIN_GAP[name] ?? 15;
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
