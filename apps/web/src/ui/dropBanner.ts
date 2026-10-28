/**
 * v0.2.17: the owner's two BLAT DROP banners, live. The pictures (tools/make-drop-banners.py) have their
 * four countdown screens wiped clean; the countdown is drawn over them every second with the design's own
 * digits, so it looks exactly like the design. The time counts down by the server's clock (the same for
 * every player wherever their device's clock is). The whole banner is a button.
 *
 *  • `menu` — «ANNOUNCE DATE IN · до анонса даты дропа $BLAT», under the Dossier and the Arsenal;
 *  • `section` — «$BLAT TOKEN · COMING SOON…», in the $BLAT section.
 */
import { dropCountdown, dropMsLeft } from '@blatkom/shared';
import { asset, h } from './dom.js';
import { t } from '../i18n/index.js';

interface Layout {
  img: string;
  digits: string;
  /** The picture's size and one digit's cell in its pixels. */
  w: number;
  h: number;
  cw: number;
  ch: number;
  /** The four screens' centres (days, hours, minutes, seconds), the digits' middle line, the step between digits. */
  centres: readonly number[];
  y: number;
  pitch: number;
}

/** Printed by tools/make-drop-banners.py. */
export const DROP_BANNERS: Readonly<Record<'menu' | 'section', Layout>> = {
  menu: { img: 'assets/ui/banners/drop_menu.jpg', digits: 'assets/ui/banners/drop_menu_digits.png', w: 1200, h: 572, cw: 32, ch: 56, centres: [139.7, 272.1, 398.5, 517.3], y: 312.9, pitch: 29.4 },
  section: { img: 'assets/ui/banners/drop_section.jpg', digits: 'assets/ui/banners/drop_section_digits.png', w: 1200, h: 633, cw: 33, ch: 59, centres: [120.7, 244.6, 363.3, 480.9], y: 380.5, pitch: 30.3 },
};

const load = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(src));
    im.src = src;
  });

/**
 * The banner. `drop` — the announcement date and the server's clock as it was when they arrived
 * (`fetchedAt`, this device's clock); `onOpen` — a tap anywhere on it. The timer stops by itself once the
 * banner has left the page.
 */
export function dropBanner(kind: 'menu' | 'section', drop: { announceAt: string; serverNow: string; fetchedAt: number }, onOpen: () => void): HTMLElement {
  const L = DROP_BANNERS[kind];
  const canvas = h('canvas', { width: String(L.w), height: String(L.h), class: 'dropbanner__canvas' }) as HTMLCanvasElement;
  // «on Solana»: the drop is planned in the Solana network (the owner: «everywhere»)
  const sol = h('span', { class: 'dropbanner__sol' }, h('img', { src: asset('assets/ui/logos/solana.png'), alt: '', width: '16', height: '16' }), t('Drop on Solana'));
  const btn = h('button', { type: 'button', class: `dropbanner dropbanner--${kind}`, 'data-testid': `drop-banner-${kind}`, onclick: onOpen }, canvas, sol) as HTMLButtonElement;
  btn.style.aspectRatio = `${L.w} / ${L.h}`;
  const left = () => dropMsLeft(drop.announceAt, drop.serverNow, drop.fetchedAt, Date.now());
  const label = () => {
    const p = dropCountdown(left());
    return t('BLAT DROP: {d} d {h} h {m} min until the announcement of the drop date — open', { d: p.d, h: p.h, m: p.m });
  };
  btn.setAttribute('aria-label', label());
  let pic: HTMLImageElement | null = null;
  let digits: HTMLImageElement | null = null;
  const ctx = canvas.getContext('2d');
  const draw = () => {
    if (!ctx || !pic) return;
    ctx.drawImage(pic, 0, 0, L.w, L.h);
    if (!digits) return;
    const p = dropCountdown(left());
    const groups = [String(p.d), String(p.h).padStart(2, '0'), String(p.m).padStart(2, '0'), String(p.s).padStart(2, '0')];
    groups.forEach((g, i) => {
      // a day count of four figures still fits (the screen takes three at the design's step)
      const pitch = g.length > 3 ? (L.pitch * 3) / g.length : L.pitch;
      const x0 = L.centres[i]! - (pitch * g.length) / 2 + (pitch - L.cw) / 2;
      for (let k = 0; k < g.length; k++) {
        const d = g.charCodeAt(k) - 48;
        ctx.drawImage(digits!, d * L.cw, 0, L.cw, L.ch, Math.round(x0 + k * pitch), Math.round(L.y - L.ch / 2), L.cw, L.ch);
      }
    });
    btn.dataset.left = groups.join(':');
  };
  let seen = false;
  const timer = setInterval(() => {
    if (btn.isConnected) seen = true;
    else if (seen) return clearInterval(timer);
    draw();
    if (Date.now() % 60_000 < 1000) btn.setAttribute('aria-label', label());
  }, 1000);
  void Promise.all([load(asset(L.img)), load(asset(L.digits))])
    .then(([a, b]) => {
      pic = a;
      digits = b;
      draw();
      btn.classList.add('dropbanner--ready');
    })
    .catch(() => btn.classList.add('dropbanner--broken'));
  return btn;
}
