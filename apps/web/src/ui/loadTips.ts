/**
 * v0.2.25 (the owner: «во время экрана загрузки — гайд по управлению, нативно, и умную подсказку по игре»): the
 * controls for this device (keys and the mouse on a computer, the sticks and buttons on a touch screen) as a
 * strip of keycaps, and one tip that fits the match about to start — its mode, the gun in hand, the device —
 * never the same one twice in a row.
 */
import { WEAPONS } from '@blatkom/shared';
import type { GameMode, WeaponId } from '@blatkom/shared';
import { h } from './dom.js';
import { t } from '../i18n/index.js';
import { isTouchDevice } from '../game/input/TouchState.js';

const LAST_KEY = 'blatkom89.tip.last';

/** The controls of this device as a strip of keycaps with their meaning. */
export function controlsGuide(touch = isTouchDevice()): HTMLElement {
  const key = (caps: string[], what: string, cls = '') =>
    h('span', { class: `cguide__item ${cls}` }, h('span', { class: 'cguide__caps' }, ...caps.map((c) => h('kbd', { class: 'cguide__key' }, c))), h('span', { class: 'cguide__what' }, what));
  const items = touch
    ? [
        key(['◎'], t('Move (past the ring: run)'), 'cguide__item--stick'),
        key(['◎'], t('Aim'), 'cguide__item--stick'),
        key(['●'], t('Fire'), 'cguide__item--fire'),
        key(['⟳'], t('Reload')),
        key(['⇄'], t('Weapon')),
        key(['✋'], t('Pick up')),
      ]
    : [
        key(['W', 'A', 'S', 'D'], t('Move')),
        key(['Shift'], t('Sprint')),
        key(['🖱'], t('Aim')),
        key([t('LMB')], t('Fire'), 'cguide__item--fire'),
        key(['R'], t('Reload')),
        key(['Q', '1–3'], t('Weapon')),
        key(['G'], t('Equipment')),
        key(['E'], t('Pick up')),
        key(['C'], t('Quiet step')),
        key(['Tab'], t('Score')),
      ];
  return h('div', { class: `cguide ${touch ? 'cguide--touch' : 'cguide--keys'}`, 'data-testid': 'controls-guide' }, ...items);
}

interface TipContext {
  mode: GameMode;
  /** The gun in the slot-3 (or the sidearm when there is none). */
  weapon: WeaponId | null;
  touch: boolean;
}

/** The tips that fit (by mode, the gun, the device) — each with a key so a repeat can be avoided. */
function tipsFor(c: TipContext): Array<[string, string]> {
  const mode: Array<[string, string]> =
    c.mode === 'ctf'
      ? [
          ['ctf1', t('Capture the flag: whoever carries it is seen by everyone — cover the carrier, don’t race them.')],
          ['ctf2', t('Your flag on the floor goes home by itself after a while — or at once if you touch it.')],
        ]
      : c.mode === 'bases'
        ? [
            ['bases1', t('Bases: every base you hold brings a point a second — three of you on one base is two bases given away.')],
            ['bases2', t('A base with both teams inside stands still — clear it before you sit on it.')],
          ]
        : c.mode === 'teams'
          ? [['teams1', t('Red against blue: two guns on one target end a fight before it starts — keep near your own.')]]
          : [['ffa1', t('Everyone for himself: an elimination is worth two points, an assist one — finishing someone else’s fight pays too.')]];
  const weapon: Array<[string, string]> = [];
  const w = c.weapon ? WEAPONS[c.weapon] : null;
  if (w) {
    if (w.kind === 'melee') weapon.push(['melee', t('A blade is quiet and deadly up close — come round corners, never down a long corridor.')]);
    else if (w.projectile) weapon.push(['boom', t('The blast catches you too — fire it at a wall, not at your own feet.')]);
    else if (w.pellets > 1) weapon.push(['shotgun', t('A shotgun settles it point-blank — close in behind cover, don’t trade shots across the yard.')]);
    else if (w.range >= 800 && w.fireIntervalMs >= 600) weapon.push(['sniper', t('A rifle with a scope: keep your distance and a wall between you and them — up close it loses.')]);
    else if (w.fireIntervalMs <= 95) weapon.push(['spray', t('A fast gun empties fast: short bursts, and reload behind a wall, not in the open.')]);
    else weapon.push(['rifle', t('Long shots lose damage — get a little closer or wait for a clean shot.')]);
  }
  const general: Array<[string, string]> = [
    ['spawn', t('Right after a respawn you can’t be hurt for a moment — use it to reach cover.')],
    ['silencer', t('Shots without a silencer show you on everyone’s minimap.')],
    ['reload', t('Reload before you turn the corner, not after.')],
    c.touch ? ['sprintT', t('Pull the left stick past its ring to sprint; the blue bar under your health is your breath.')] : ['sprintK', t('Shift sprints while the blue bar lasts — let it refill before a fight.')],
    c.touch ? ['pickT', t('A gun on the floor: the ✋ button picks it up.')] : ['pickK', t('A gun on the floor: E picks it up.')],
    ['grenade', t('A grenade round the corner beats a grenade in the face.')],
  ];
  // the mode first in team modes, the gun next, then the rest
  return [...mode, ...mode.filter(() => c.mode !== 'ffa'), ...weapon, ...weapon, ...general];
}

/** One tip for this match (another one than last time). */
export function smartTip(c: TipContext): string {
  const pool = tipsFor(c);
  let last = '';
  try {
    last = localStorage.getItem(LAST_KEY) ?? '';
  } catch {
    /* no storage */
  }
  const fresh = pool.filter(([k]) => k !== last);
  const [key, text] = fresh[Math.floor(Math.random() * fresh.length)] ?? pool[0]!;
  try {
    localStorage.setItem(LAST_KEY, key);
  } catch {
    /* no storage */
  }
  return text;
}

/** The tip as a line: «Совет» and the text. */
export function tipLine(text: string): HTMLElement {
  return h('div', { class: 'loadtip', 'data-testid': 'load-tip' }, h('b', { class: 'loadtip__tag' }, t('Tip')), h('span', null, text));
}
