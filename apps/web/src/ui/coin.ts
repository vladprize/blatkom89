/**
 * BLATS — the premium currency's coin. v0.2.19 (the owner: «токен BLAT меняем на такой, который на новом
 * баннере»): the red octagonal gem-coin of the owner's banner, drawn as pixel art by tools/make-blat-coin.py —
 * a 16 px drawing and a 32 px one (the 64 and 128 px files are exact 2× / 4× copies of it): the largest file
 * whose size divides the shown size is scaled by a whole number, so every pixel stays square (48 → the 16 px
 * file ×3, 96 → the 32 px one ×3).
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
