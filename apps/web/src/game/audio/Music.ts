/**
 * Menu soundtrack: one looping track streamed from assets/audio/theme.mp3 (never decoded whole —
 * a decoded three-minute track would take ~60 MB). It plays in menus and lobbies and fades out
 * when a match starts. Browsers (and Telegram on iOS) only allow audio after a user gesture, so
 * nothing plays before the first tap. The volume goes through WebAudio where available because
 * iOS ignores HTMLMediaElement.volume. The single-file offline demo ships without the track.
 */
import { asset } from '../../ui/dom.js';
import { isSingleFile } from '../../app/inline.js';
import { getSettings, updateSettings } from '../../app/settings.js';
import { sfx } from './Sfx.js';

const FADE_IN_MS = 1400;
const FADE_OUT_MS = 700;
/** Menu music sits under the interface sounds. */
const MUSIC_GAIN = 0.55;

class MusicPlayer {
  private el: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private wanted = false;
  private unlocked = false;
  private level = 0;
  private target = 0;
  private raf = 0;
  private lastTick = 0;
  private hidden = false;
  private failed = false;

  available(): boolean {
    return !isSingleFile() && typeof Audio !== 'undefined' && !this.failed;
  }

  /** Call from a user gesture (pointerdown / keydown). */
  unlock(): void {
    if (this.unlocked || !this.available()) return;
    this.unlocked = true;
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.src = asset('assets/audio/theme.mp3');
    el.addEventListener('error', () => {
      this.failed = true;
      this.stopRaf();
    });
    this.el = el;
    const ctx = sfx.context();
    if (ctx) {
      try {
        const src = ctx.createMediaElementSource(el);
        this.gain = ctx.createGain();
        this.gain.gain.value = 0;
        src.connect(this.gain).connect(ctx.destination);
      } catch {
        this.gain = null;
      }
    }
    this.apply();
    if (this.wanted) this.start();
  }

  /** Menus want music, matches do not. */
  setWanted(on: boolean): void {
    if (on === this.wanted) return;
    this.wanted = on;
    if (on) this.start();
    else this.fadeTo(0, FADE_OUT_MS);
  }

  /** 0…1 from the settings slider (0 = off). */
  setVolume(v: number): void {
    updateSettings({ musicVolume: Math.max(0, Math.min(1, v)) });
    if (this.wanted) this.start();
    else this.apply();
  }

  volume(): number {
    return getSettings().musicVolume;
  }

  /** Quick toggle in the menu corner: mute ↔ the last audible volume. */
  toggle(): boolean {
    const v = this.volume();
    if (v > 0) {
      try {
        localStorage.setItem('blatkom89.music.last', String(v));
      } catch {
        /* ignore */
      }
      this.setVolume(0);
      return false;
    }
    let last = 0.4;
    try {
      last = Number(localStorage.getItem('blatkom89.music.last')) || 0.4;
    } catch {
      /* ignore */
    }
    this.setVolume(last);
    return true;
  }

  /** Page hidden (tab switched, Telegram minimised): pause; shown again: resume if still wanted. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) {
      this.el?.pause();
      this.level = 0;
      this.apply();
    } else if (this.wanted) this.start();
  }

  private start() {
    const el = this.el;
    if (!el || !this.unlocked || this.hidden || this.failed) return;
    const vol = this.volume();
    if (vol <= 0) return this.fadeTo(0, FADE_OUT_MS);
    void sfx.context()?.resume?.();
    if (el.paused) {
      const p = el.play();
      if (p) p.catch(() => {
        /* blocked until the next gesture */
      });
    }
    this.fadeTo(1, FADE_IN_MS);
  }

  private fadeTo(target: number, ms: number) {
    this.target = target;
    this.stopRaf();
    this.lastTick = performance.now();
    const step = (now: number) => {
      const dt = now - this.lastTick;
      this.lastTick = now;
      const d = dt / ms;
      this.level = this.target > this.level ? Math.min(this.target, this.level + d) : Math.max(this.target, this.level - d);
      this.apply();
      if (this.level !== this.target) this.raf = requestAnimationFrame(step);
      else {
        this.raf = 0;
        if (this.level === 0) this.el?.pause();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  private stopRaf() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private apply() {
    const v = this.level * this.volume() * MUSIC_GAIN;
    if (this.gain) this.gain.gain.value = v;
    else if (this.el) this.el.volume = Math.max(0, Math.min(1, v));
  }
}

export const music = new MusicPlayer();
