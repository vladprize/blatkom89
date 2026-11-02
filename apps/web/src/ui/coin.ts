/**
 * BLATS — the premium currency's red coin (v0.2.18; the pixel coin of the retired $BLAT points, the same
 * art). 16 px art (the bigger files are exact 2×/4×/8× copies): the largest file whose size divides the
 * shown size is scaled by a whole number, so every pixel stays square (48 → the 16 px file ×3, 96 → 32 ×3).
 */
import { asset, h } from './dom.js';
import { getLang } from '../i18n/index.js';

export function blatsCoin(size = 16, alt = ''): HTMLImageElement {
  const file = [128, 64, 32, 16].find((s) => size % s === 0) ?? 128;
  return h('img', { class: 'blatcoin', src: asset(`assets/ui/blat_coin_${file}.png`), width: String(size), height: String(size), alt, draggable: 'false' }) as HTMLImageElement;
}

/** 12 345 678 (Russian) / 12,345,678 (English). */
export function fmtNum(n: number): string {
  return new Intl.NumberFormat(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { maximumFractionDigits: 0 }).format(n);
}
