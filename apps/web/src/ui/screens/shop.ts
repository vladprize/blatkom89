/**
 * The Arsenal: the dressing room (the character's art with the item being tried on, the same character
 * as it looks in a match, the weapon's skins — worn, tried on or bought right there), the loadout (four
 * equal slot columns: what you own, then what the shop has for that slot; weapons, equipment,
 * modifications), the weapon / equipment / character shop as compact grids (v0.2.18: everything on one
 * screen, an item's card in a sheet), the cases (rare weapons for talons, skins for BLATS) and the BLATS
 * packs. Prices and rules are the shared ones; every purchase is decided by the server. In the demo build
 * (no server) the catalog is read-only, but anything can be tried on — in the dressing room and in practice.
 *
 * v0.2.18: grades everywhere (regular / rare / epic / legendary — grey / red / purple / gold) and BLATS,
 * the premium currency («diamonds» in the code; the red coin, 1 BLATS = 1 cent).
 *
 * Phones (≤ 560 px wide) get their own layout of the same state and actions: the wallet on top, then
 * two halves — «Экипировка» (only what the player has: the dressing room with the in-game view and the
 * four slots, each changed from a sheet of the player's own items) and «Магазин» (weapons, equipment,
 * characters, cases, BLATS as compact grids) — every tab on one screen, details in bottom sheets.
 */
import {
  CASE_PRICE,
  CASE_TABLE,
  CHARACTER_PRICES,
  CHARACTER_GRADE_PRICES,
  FREE_GADGETS,
  FREE_WEAPONS,
  GADGETS,
  GADGET_IDS,
  GADGET_PRICES,
  MELEE_WEAPONS,
  MODS,
  MOD_PRICES,
  PRIMARY_WEAPONS,
  REAL_MONEY,
  SHOP_CHARACTERS,
  SHOP_WEAPONS,
  SIDEARMS,
  WEAPONS,
  WEAPON_PRICES,
  applyMods,
  buyRefusal,
  caseOdds,
  damageFalloff,
  modQuote,
  modsFor,
  sanitizeMods,
  CASE_CHARACTERS,
  CASE_FINISHES,
  CHARACTER_CASE_PRICE,
  FINISH_IDS,
  FINISHES,
  SKINNABLE_WEAPONS,
  SKIN_CASE_PRICE,
  SKIN_RARITIES,
  CHARACTERS,
  GRADES,
  blatsToUsd,
  characterCaseOdds,
  byGrade,
  isFreeFinish,
  isLiveFinish,
  ownsSkin as ownsSkinIn,
  parseSkin,
  skinId,
  skinBuyRefusal,
  skinCaseOdds,
  skinPrice,
  skinPerks,
  BUNDLES,
  bundleOf,
  bundleRefusal,
} from '@blatkom/shared';
import type { Bundle, CharacterId, FinishId, GadgetId, Grade, Inventory, Loadout, ModId, ModMount, Rarity, ShopConfig, ShopKind, ShopPrice, SkinRarity, WeaponDef, WeaponId } from '@blatkom/shared';
import type * as Phaser from 'phaser';
import { h, toast, asset, portrait } from '../dom.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { apiErrorText } from '../../net/errors.js';
import { sfx } from '../../game/audio/Sfx.js';
import { haptic, openInvoice } from '../../telegram/tg.js';
import { t, plural, count, num, getLang } from '../../i18n/index.js';
import { charText, finishName, gadgetBlurb, gadgetName, modText, rarityLabel, refusalText, weaponBlurb, weaponName } from '../../i18n/content.js';
import { Doll } from '../doll.js';
import { FighterCard } from '../fighterCard.js';
import type { FighterCardData } from '../fighterCard.js';
import { openCardViewer } from '../cardViewer.js';
import { openSheet } from '../sheet.js';
import type { Sheet } from '../sheet.js';
import { animateLiveIcon, skinIconReady, skinIconUrl } from '../../game/render/skins.js';
import { blatsCoin, fmtNum } from '../coin.js';
import { blatsBanner, blatsSale, coinPile, packHint } from '../blats.js';
import { promoForm } from '../promo.js';

export type ArsenalTab = 'loadout' | 'weapons' | 'gear' | 'characters' | 'case' | 'diamonds';
type ShopTab = Exclude<ArsenalTab, 'loadout'>;

/** Phones get their own Arsenal: the wallet and the kit/shop switch on top, every tab on one screen. */
/** Phones (and, v0.2.20, phones held sideways): the Arsenal's phone layout (laid out in width when sideways). */
const PHONE_QUERY = '(max-width: 560px), (max-height: 500px) and (orientation: landscape)';

/** What to try on: a weapon (optionally with modifications) and/or equipment. */
export interface TryOn {
  weapon?: WeaponId;
  mods?: ModId[];
  gadget?: GadgetId;
  /** The weapon's finish (a skin); null: the plain paint; left out: what the weapon wears. */
  finish?: FinishId | null;
}

export interface ArsenalOptions {
  online: OnlineClient | null;
  inTelegram: boolean;
  tab?: ArsenalTab;
  /** The character in the dressing room (the one the player picked). */
  character: CharacterId;
  /** Phaser's loaded textures: the dressing room draws the in-game sprites from them. */
  textures: Phaser.Textures.TextureManager | null;
  /** Start a practice match with this in hand («опробовать в тире»); `tab`: the Arsenal's tab to come back to. */
  onTry: (t: TryOn, tab: ArsenalTab) => void;
  /** Wallet changed (menu tile refresh). */
  onWallet?: () => void;
  /** Show this character in the character screen. */
  onCharacter?: (c: CharacterId) => void;
  /** v0.2.18: play a practice match as this character, then come back to the Arsenal's `tab`. */
  onTryCharacter?: (c: CharacterId, tab: ArsenalTab) => void;
  /** v0.2.23: put this on in the dressing room at once (a skin seen after a match: «Try on»). */
  initialTry?: TryOn;
  /** v0.2.23: the alias and level on the fighter card. */
  /** The player's alias and level for the fighter card (read when drawn: a rename shows at once). */
  /** v0.2.23: a set was bought — the app makes its character the player's (and redraws the Arsenal). */
  onSetBought?: (c: CharacterId) => void;
  playerName?: () => string | null;
  playerLevel?: () => number | null;
}

const slotLabel = (slot: 1 | 2 | 3 | 4) => (slot === 1 ? t('Sidearm') : slot === 2 ? t('Melee') : slot === 3 ? t('Primary') : t('Equipment'));
const mountLabel = (m: ModMount) => (m === 'muzzle' ? t('Muzzle') : m === 'optic' ? t('Sight') : m === 'rail' ? t('Rail') : t('Magazine'));

export const tokenWord = (n: number) => plural(n, 'talon');
/** v0.2.18: BLATS — the premium currency's name doesn't change with the number («199 BLATS» / «199 БЛАТ»). */
export const blatsWord = () => t('BLATS');

/** Currency icon: a brass token (CSS-drawn) or the red BLATS coin (pixel art). */
export function cur(c: 'tokens' | 'diamonds'): HTMLElement {
  if (c === 'diamonds') {
    const coin = blatsCoin(16, t('BLATS'));
    coin.classList.add('cur', 'cur--diamonds');
    return coin;
  }
  return h('i', { class: `cur cur--${c}`, 'aria-label': t('talons') });
}

export function amount(n: number, c: 'tokens' | 'diamonds'): HTMLElement {
  return h('span', { class: 'amt' }, cur(c), String(n));
}

const usd = (blats: number) => blatsToUsd(blats);

export function priceLabel(p: ShopPrice): HTMLElement {
  if (p.currency === 'tokens') return h('span', { class: 'amt' }, cur('tokens'), String(p.amount), p.level > 1 ? ` · ${t('from LV {n}', { n: p.level })}` : '');
  return h('span', { class: 'amt' }, cur('diamonds'), String(p.amount), h('small', null, ` ${usd(p.amount)}`));
}

/** v0.2.19: the cases' chest (the owner: «раздел CASES нужно сделать более заметным»). */
function caseIcon(size = 16): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'caseico');
  for (const [d, fill] of [
    ['M3 10h18v10H3z', '#7a4a1c'],
    ['M4 5.5C4 4.1 5.1 3 6.5 3h11C18.9 3 20 4.1 20 5.5V10H4z', '#a8642a'],
    ['M3 10h18v2H3zM10.5 3h3v17h-3z', '#f2b632'],
    ['M10 9h4v5h-4z', '#fff0b0'],
  ] as const) {
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d);
    el.setAttribute('fill', fill);
    svg.append(el);
  }
  return svg;
}

/** v0.2.18: a grade's coloured label («Rare» in red, …). */
export function gradeTag(g: Grade, cls = ''): HTMLElement {
  return h('span', { class: `grade grade--${g} ${cls}`.trim(), 'data-grade': g }, rarityLabel(g));
}

/** Payment pages open in the browser (inside Telegram: through the WebApp API). */
function openExternal(url: string) {
  const w = (window as unknown as { Telegram?: { WebApp?: { initData?: string; openLink?: (u: string) => void } } }).Telegram?.WebApp;
  if (w?.initData && w.openLink) w.openLink(url);
  else location.href = url;
}

type IconSize = 'big' | 'small';
/** Shop icons share fixed boxes (see tools/art/build-weapons.ts ICON_BOX): big 168×56, small 84×28. */
const BOX: Record<'weapon' | 'gadget' | 'mod', Record<IconSize, [number, number]>> = {
  weapon: { big: [168, 56], small: [84, 28] },
  gadget: { big: [168, 56], small: [84, 28] },
  mod: { big: [72, 36], small: [36, 18] },
};

function icon(kind: 'weapon' | 'gadget' | 'mod', id: string, size: IconSize, cls: string): HTMLImageElement {
  const [w, hh] = BOX[kind][size];
  const dir = kind === 'weapon' ? 'weapons' : kind === 'gadget' ? 'gadgets' : 'mods';
  return h('img', { class: cls, src: asset(`assets/ui/${dir}/${id}${size === 'small' ? '_s' : ''}.png`), width: w, height: hh, alt: '', draggable: 'false' });
}

export function weaponImg(w: WeaponId, size: IconSize = 'big', finish: FinishId | null = null): HTMLImageElement {
  const img = icon('weapon', w, size, `wimg wimg--${size}`);
  if (finish) {
    // the painted icon replaces the plain one as soon as it is ready (at once when it was painted before);
    // a live finish then loops (v0.2.19)
    img.dataset.paint = finish;
    const now = skinIconReady(w, finish, size === 'small');
    if (now) img.src = now;
    else
      void skinIconUrl(w, finish, size === 'small')
        .then((url) => {
          if (img.dataset.paint === finish) img.src = url;
        })
        .catch(() => {});
    animateLiveIcon(img, w, finish, size === 'small');
  }
  return img;
}

export function gadgetImg(g: GadgetId, size: IconSize = 'big'): HTMLImageElement {
  return icon('gadget', g, size, `wimg wimg--${size}`);
}

function modImg(m: ModId, size: IconSize = 'big'): HTMLImageElement {
  return icon('mod', m, size, size === 'big' ? 'micon' : 'micon micon--s');
}

/** The character's art from the owner's sheet (tools/extract-heroes.py), 3:4. */
export function heroImg(c: CharacterId, cls = 'hero'): HTMLImageElement {
  return h('img', { class: cls, src: asset(`assets/heroes/${c}.jpg`), width: 360, height: 480, alt: charText(c).name, draggable: 'false' });
}

const secs = (ms: number) => t('{n} s', { n: num(ms / 1000) });

/** Per-shot damage incl. pellets and splash, at close range. */
function shotDamage(d: WeaponDef): number {
  return d.kind === 'projectile' ? d.damage + d.projectile!.splash : d.damage * d.pellets;
}

function hitsToKill(d: WeaponDef): number {
  return Math.max(1, Math.ceil(100 / shotDamage(d) - 1e-9));
}

/** Stat bars of a weapon (with `mods` applied: what the player actually gets). */
function statBars(w: WeaponId, mods?: readonly ModId[]): HTMLElement {
  const base = WEAPONS[w];
  const d = applyMods(base, mods);
  const rows: Array<[string, number, string, number]> = [];
  // the last column compares with the unmodified weapon: +1 better, -1 worse
  const cmp = (a: number, b: number, higherIsBetter = true) => (Math.abs(a - b) < 1e-6 ? 0 : (a > b) === higherIsBetter ? 1 : -1);
  rows.push([t('Damage'), Math.min(1, shotDamage(d) / 140), `${Math.round(shotDamage(d))}${d.pellets > 1 ? ` (${d.pellets}×${d.damage})` : ''}`, 0]);
  if (d.kind !== 'melee') {
    rows.push([t('Rate'), Math.min(1, 1000 / d.fireIntervalMs / 16), t('{n}/min', { n: (60000 / d.fireIntervalMs).toFixed(0) }), 0]);
    rows.push([t('Range'), Math.min(1, d.range / 950), d.range < 300 ? t('short') : d.range < 600 ? t('medium') : t('long'), cmp(d.range, base.range)]);
    rows.push([t('Accuracy'), Math.max(0.05, Math.min(1, 1 - d.spread / 0.16)), `${Math.round(Math.max(0.05, Math.min(1, 1 - d.spread / 0.16)) * 100)}%`, cmp(d.spread, base.spread, false)]);
    rows.push([t('Magazine'), Math.min(1, d.magazine / 100), String(d.magazine), cmp(d.magazine, base.magazine)]);
    rows.push([t('Reload'), Math.max(0.05, Math.min(1, 1 - d.reloadMs / 4000)), secs(d.reloadMs), cmp(d.reloadMs, base.reloadMs, false)]);
  } else {
    rows.push([t('Rate'), Math.min(1, 1000 / d.fireIntervalMs / 3.4), t('{n}/min', { n: (60000 / d.fireIntervalMs).toFixed(0) }), 0]);
    rows.push([t('Reach'), Math.min(1, d.meleeRange / 44), `${d.meleeRange}`, 0]);
  }
  rows.push([t('Mobility'), Math.max(0, Math.min(1, (d.moveSpeed - 0.75) / 0.3)), `${Math.round(d.moveSpeed * 100)}%`, cmp(d.moveSpeed, base.moveSpeed)]);
  const falloff = d.kind === 'hitscan' && d.range > 0 ? damageFalloff(d, d.range) : 1;
  const k = hitsToKill(d);
  const notes = [k === 1 ? t('Eliminates with one hit up close') : t('Eliminates in {hits} up close', { hits: count(k, 'hit') })];
  if (falloff < 0.99) notes.push(t('at long range damage ×{k}', { k: falloff.toFixed(2) }));
  if (d.silenced) notes.push(t('leaves no trace on the minimap'));
  if (d.laser) notes.push(t('everyone sees the laser beam'));
  if (d.projectile) notes.push(t('{r} px blast that catches you too', { r: d.projectile.radius }));
  return h(
    'div',
    { class: 'wstats' },
    ...rows.map(([label, v, txt, c]) => h('div', { class: `wstat ${c > 0 ? 'up' : c < 0 ? 'down' : ''}` }, h('span', null, label), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(v * 100)}%` })), h('b', null, txt))),
    h('div', { class: 'muted', style: 'font-size:13px' }, notes.join('; ')),
  );
}

/** Short facts about a piece of equipment. */
function gadgetFacts(id: GadgetId): string[] {
  const g = GADGETS[id];
  const out = [t('{charges} per life', { charges: count(g.charges, 'charge') })];
  switch (id) {
    case 'f1':
      out.push(t('goes off after {s}', { s: secs(g.fuseMs) }), t('up to {d} damage, radius {r}', { d: g.damage, r: g.radius }));
      break;
    case 'smoke':
      out.push(t('smoke after {a} for {b}', { a: secs(g.fuseMs), b: secs(g.durationMs) }), t('radius {r}', { r: g.radius }));
      break;
    case 'flash':
      out.push(t('goes off after {s}', { s: secs(g.fuseMs) }), t('blinds for up to {s}, radius {r}', { s: secs(g.durationMs), r: g.radius }), t('turn away and it won’t blind you'));
      break;
    case 'molotov':
      out.push(t('burns for {s}, radius {r}', { s: secs(g.durationMs), r: g.radius }), t('{d} damage per second', { d: Math.round((g.damage * 1000) / 250) }));
      break;
    case 'mine':
      out.push(t('arms in {s}', { s: secs(g.fuseMs) }), t('up to {d} damage, radius {r}', { d: g.damage, r: g.radius }));
      break;
    case 'c4':
      out.push(t('blows on the second press'), t('up to {d} damage, radius {r}', { d: g.damage, r: g.radius }));
      break;
    case 'turret':
      out.push(t('fires for {s}, sees {r} px', { s: secs(g.durationMs), r: g.radius }), t('{d} damage per shot; it can be destroyed', { d: g.damage }));
      break;
  }
  if (g.selfFactor > 0 && g.damage > 0) out.push(t('hurts you too ({n}%)', { n: Math.round(g.selfFactor * 100) }));
  return out;
}

export function renderArsenal(o: ArsenalOptions): HTMLElement {
  // the BLATS tab exists while BLATS are on sale (REAL_MONEY, v0.2.18)
  let tab: ArsenalTab = o.tab === 'diamonds' && !REAL_MONEY ? 'loadout' : (o.tab ?? 'loadout');
  let inv: Inventory | null = o.online?.inventory ?? null;
  let cfg: ShopConfig | null = null;
  let busy = false;
  const online = o.online;
  const root = h('div', { class: 'col arsenal' });
  const roomEl = h('div', { class: 'panel dressing', 'data-testid': 'dressing-room' });
  const walletEl = h('div', { class: 'wallet' });
  const tabsEl = h('div', { class: 'seg tabs', role: 'tablist' });
  // v0.2.17: the tab's list scrolls inside its own column — the Arsenal is one screen (the owner)
  const body = h('div', { class: 'col arsenal__body', 'data-testid': 'arsenal-body' });
  const sideEl = h('div', { class: 'col arsenal__side' });
  // phones: «Экипировка | Магазин» and the shop's departments instead of the six tabs
  const modeEl = h('div', { class: 'seg arsmodes', role: 'tablist' });
  const chipsEl = h('div', { class: 'seg arschips', role: 'tablist' });
  const phoneQuery = typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null;
  let phone = !!phoneQuery?.matches;
  const layout = () => {
    root.classList.toggle('arsenal--phone', phone);
    if (phone) root.replaceChildren(walletEl, modeEl, chipsEl, body);
    else {
      // wide screens: the dressing room on the left, the wallet, the tabs and the tab's list on the right
      sideEl.replaceChildren(walletEl, tabsEl, body);
      root.replaceChildren(roomEl, sideEl);
    }
  };
  layout();

  const owned = (w: WeaponId) => (inv ? inv.weapons.includes(w) : FREE_WEAPONS.includes(w));
  const ownedGadget = (g: GadgetId) => (inv ? inv.gadgets.includes(g) : FREE_GADGETS.includes(g));
  /** The demo on a phone: the slots can be changed locally (nothing is saved without a server). */
  let demoKit: Loadout | null = null;
  const loadout = (): Loadout => inv?.loadout ?? (phone ? demoKit : null) ?? { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', gadget: 'f1', mods: {}, skins: {} };
  /** The finish a weapon wears (equipped skin). */
  const worn = (w: WeaponId): FinishId | null => loadout().skins?.[w] ?? null;
  // v0.2.18: the free finishes are everyone's
  const ownsSkin = (w: WeaponId, f: FinishId) => (inv ? ownsSkinIn(inv.skins, w, f) : isFreeFinish(f));
  const fail = (e: unknown) => {
    sfx.play('dry');
    toast(apiErrorText(e));
  };
  const act = async (f: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
    busy = true;
    try {
      await f();
      inv = online?.inventory ?? inv;
      if (ok) {
        toast(ok);
        sfx.play('buy');
        haptic('notify-success');
      }
      o.onWallet?.();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
      draw();
    }
  };
  const save = (next: Loadout, ok = t('Saved — applies from your next spawn')) => {
    if (!online || !inv) {
      // the demo on a phone keeps the change on the screen (nothing to save it to)
      if (phone) {
        demoKit = next;
        draw();
      }
      return;
    }
    void act(() => online.setLoadout(next), ok);
  };

  // ── dressing room: the character's art, the item tried on, the in-game look ─────────────
  const startWeapon = (): WeaponId => loadout().primary ?? loadout().sidearm;
  let trying: TryOn = o.initialTry ? { ...o.initialTry } : { weapon: startWeapon(), mods: [...(loadout().mods[startWeapon()] ?? [])] };
  const doll = new Doll(o.textures, o.character, trying.weapon ?? 'pistol', 216);
  // the art and the item image stay the same elements between redraws (no flicker)
  const heroEl = heroImg(o.character, 'dressing__hero');
  // v0.2.23: the poster is the player's fighter card — the character, the weapon in hand painted big in its
  // skin, the grade's frame and light, the alias and level; the corner button opens it big (to share)
  let posterCard: FighterCard | null = null;
  const uiRoot = () => document.getElementById('ui') ?? document.body;
  const cardData = (w: WeaponId, finish: FinishId | null): FighterCardData => ({
    name: o.playerName?.() || charText(o.character).name,
    character: o.character,
    level: o.playerLevel?.() ?? null,
    weapon: w,
    finish,
    kills: finish && skinPerks(finish)?.counter ? (inv?.skinKills?.[skinId(w, finish)] ?? 0) : null,
  });
  const openCard = (w: WeaponId, finish: FinishId | null) => openCardViewer(uiRoot(), cardData(w, finish), { inTelegram: o.inTelegram });
  const itemEls = new Map<string, HTMLImageElement>();
  const itemEl = (key: string, make: () => HTMLImageElement) => {
    let el = itemEls.get(key);
    if (!el) {
      el = make();
      el.classList.add('dressing__item');
      itemEls.set(key, el);
    }
    return el;
  };
  const drawRoom = () => {
    const c = o.character;
    const ct = charText(c);
    // the weapon in hand: the tried-on one, or the loadout's when equipment is being tried on
    const w: WeaponId = trying.weapon ?? startWeapon();
    const mods = trying.weapon ? (trying.mods ?? []) : (loadout().mods[w] ?? []);
    const finish = trying.weapon && trying.finish !== undefined ? trying.finish : worn(w);
    doll.set(c, w, applyMods(WEAPONS[w], mods).laser === true, finish);
    doll.wake();
    const g = trying.gadget;
    const itemImg = g ? itemEl(`g:${g}`, () => gadgetImg(g)) : itemEl(`w:${w}:${finish ?? ''}`, () => weaponImg(w, 'big', finish));
    const name = g ? gadgetName(g) : weaponName(w);
    const tagText = g ? slotLabel(4) : slotLabel(WEAPONS[w].slot as 1 | 2 | 3);
    const isOwned = g ? ownedGadget(g) : owned(w);
    const price = g ? GADGET_PRICES[g] : WEAPON_PRICES[w];
    const status = isOwned
      ? h('span', { class: 'badge badge--ok' }, t('Yours'))
      : price
        ? h('span', { class: 'badge' }, priceLabel(price))
        : h('span', { class: 'badge' }, WEAPONS[w].tier === 'rare' ? t('Case only') : t('Free'));
    // not yours yet: buy it right here (or go to the case for a rare one)
    const getIt = isOwned
      ? null
      : price
        ? h('div', { class: 'dressing__buy' }, buyButton(g ? 'gadget' : 'weapon', g ?? w, price, true))
        : !g && WEAPONS[w].tier === 'rare'
          ? h('div', { class: 'dressing__buy' }, h('button', { class: 'btn btn--small btn--red', onclick: () => toTab('case') }, t('To the case')))
          : null;
    roomEl.replaceChildren(
      h('span', { class: 'tag' }, t('Dressing room')),
      h(
        'div',
        { class: 'dressing__grid dressing__grid--two' },
        h(
          'div',
          { class: `dressing__poster${g ? '' : ' dressing__poster--card'}`, role: 'button', tabindex: '0', title: t('Change character'), onclick: () => o.onCharacter?.(c), onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && o.onCharacter?.(c) },
          ...(g
            ? [heroEl, itemImg, h('div', { class: 'dressing__plate' }, h('b', null, ct.name), h('span', null, `«${ct.nickname}»`))]
            : [
                (() => {
                  // the level badge would sit under the corner button: the poster leaves it to the big card
                  const data = { ...cardData(w, finish), level: null };
                  if (posterCard) posterCard.set(data);
                  else posterCard = new FighterCard(data, { shape: 'tall', width: 340, ratio: 4 / 3, className: 'dressing__card' });
                  return posterCard.el;
                })(),
                h('button', { class: 'dressing__share', type: 'button', 'data-testid': 'card-open', title: t('Fighter card'), 'aria-label': t('Fighter card'), onclick: (e: Event) => (e.stopPropagation(), openCard(w, finish)) }, '⤢'),
              ]),
        ),
        h(
          'div',
          { class: 'dressing__info col' },
          h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'chiplabel' }, tagText), status),
          h('div', { class: 'h2 dressing__name', 'data-testid': 'dressing-name' }, name),
          h('div', { class: 'muted dressing__blurb' }, g ? gadgetBlurb(g) : weaponBlurb(w)),
          getIt,
          !g && mods.length ? h('div', { class: 'modfit' }, t('With:'), ...mods.map((m) => h('span', { class: 'chip' }, modImg(m, 'small'), modText(m).name))) : null,
          // v0.2.20 (the owner: the empty space by the portrait): what the thing in hand does
          h('div', { class: 'dressing__stats' }, g ? h('ul', { class: 'gfacts' }, ...gadgetFacts(g).map((f) => h('li', null, f))) : statBars(w, mods)),
          !g ? skinBuyRow(w, finish) : null,
          !g ? skinRow(w, finish) : null,
          h(
            'div',
            { class: 'dressing__game' },
            h('div', { class: 'dressing__doll' }, doll.el, h('span', { class: 'dressing__label' }, t('In the game'))),
            h(
              'div',
              { class: 'col', style: 'gap:8px' },
              h('button', { class: 'btn btn--small', 'data-testid': 'doll-fire', onclick: () => doll.fire() }, WEAPONS[w].kind === 'melee' ? t('Swing!') : t('Fire!')),
              h('button', { class: 'btn btn--small btn--red', onclick: () => o.onTry(trying, tab) }, t('Test in practice')),
              h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onCharacter?.(c) }, t('Change character')),
            ),
          ),
        ),
      ),
    );
  };

  /**
   * The finishes offered for a weapon: the owner's line on sale; the welcome gift's two when the player
   * has them; a retired finish of the first line only to whoever keeps it (or wears it).
   */
  const finishesFor = (w: WeaponId): FinishId[] =>
    FINISH_IDS.filter((f) => {
      const fin = FINISHES[f];
      if (!fin.gift && !fin.retired) return true;
      if (worn(w) === f) return true;
      return fin.gift ? ownsSkin(w, f) : !!inv?.skins.includes(skinId(w, f));
    });
  const skinTitle = (w: WeaponId, f: FinishId): string => {
    const fin = FINISHES[f];
    if (!ownsSkin(w, f)) return t('Try it on — then buy it for BLATS');
    if (fin.gift) return t('A welcome gift for the early players — tap to wear it');
    if (fin.retired) return t('From the first line — yours to keep; tap to wear it');
    return isFreeFinish(f) ? t('Free — tap to wear it') : t('Yours — tap to wear it');
  };
  /**
   * The weapon's skins: the plain paint and every finish, each with its grade's colour — the player's own
   * are worn with a tap (the server keeps the choice); the others are tried on here and bought right away
   * for BLATS (v0.2.18), or come from the skin case.
   */
  /** A skin bought for BLATS and put on its weapon at once. */
  const buySkin = (w: WeaponId, f: FinishId) => {
    if (!online || !inv) return;
    const why = skinBuyRefusal(inv, w, f);
    if (why === 'funds') {
      toast(t('Not enough BLATS'));
      return toTab('diamonds');
    }
    if (why) return void toast(refusalText(why));
    void act(() => online.buySkin(w, f), t('Skin on: {name}', { name: `${weaponName(w)} · ${finishName(f)}` }));
  };
  const skinRow = (w: WeaponId, current: FinishId | null, where: 'room' | 'sheet' = 'room'): HTMLElement => {
    const pick = (f: FinishId | null) => {
      trying = { ...trying, weapon: w, finish: f };
      const wearable = !!online && !!inv && (f === null || ownsSkin(w, f));
      if (wearable && worn(w) !== f) {
        const skins = { ...(loadout().skins ?? {}) };
        if (f) skins[w] = f;
        else delete skins[w];
        save({ ...loadout(), skins }, f ? t('Skin on: {name}', { name: `${weaponName(w)} · ${finishName(f)}` }) : t('Standard paint'));
        return;
      }
      sfx.play('click');
      refreshPreview();
    };
    // v0.2.19 (the owner: «меню со скинами — более красочное и масштабное по картинкам»): every skin is a card
    // with the weapon painted in it, big, its grade's colour and ribbon, its name and whether it's yours or its
    // price — a strip in the dressing room, a grid in the skins' sheet (the «Skins» button)
    const card = (f: FinishId | null) => {
      const g = f ? FINISHES[f].rarity : null;
      const mine = f === null || ownsSkin(w, f);
      const cost = f && !mine ? skinPrice(f) : null;
      return h(
        'button',
        {
          class: `skinchip skincard ${g ? `skinchip--${g} skincard--${g}` : 'skincard--std'}${f && mine ? ' skinchip--mine' : ''}${f && FINISHES[f].gift ? ' skinchip--gift' : ''}${f && isLiveFinish(f) ? ' skincard--live' : ''}`,
          'aria-pressed': String(current === f),
          'data-finish': f ?? '',
          title: f ? `${rarityLabel(FINISHES[f].rarity)} · ${skinTitle(w, f)}` : t('Standard paint'),
          onclick: () => pick(f),
        },
        g ? gradeTag(g, 'skincard__grade') : h('span', { class: 'grade grade--std skincard__grade' }, t('Standard')),
        h('span', { class: 'skincard__pic' }, weaponImg(w, 'big', f)),
        h('span', { class: 'skincard__name' }, f ? finishName(f) : t('Standard'), f && FINISHES[f].gift ? ' 🎁' : ''),
        h('span', { class: 'skincard__state' }, mine ? `✓ ${current === f ? t('Worn') : t('Owned')}` : cost ? priceLabel(cost) : ''),
        f && isLiveFinish(f) ? h('span', { class: 'skincard__live', title: t('A live skin: it shimmers in the game') }, t('Live')) : null,
      );
    };
    const list = byGrade(finishesFor(w));
    return h(
      'div',
      { class: `skinpick skinpick--cards skinpick--${where}`, 'data-testid': 'skin-pick' },
      h(
        'div',
        { class: 'skinpick__head' },
        h('span', { class: 'chiplabel' }, t('Skins')),
        h('span', { class: 'skinpick__count' }, t('Yours: {n} of {total}', { n: list.filter((f) => ownsSkin(w, f)).length, total: list.length })),
        where === 'room' ? h('button', { class: 'btn btn--small skinsbtn', 'data-testid': 'skins-all', onclick: () => openSkins(w) }, h('i', { 'aria-hidden': 'true' }, '✦'), t('All skins')) : null,
      ),
      h('div', { class: 'skingrid' }, card(null), ...list.map((f) => card(f))),
      where === 'sheet' ? skinBuyRow(w, current) : null,
    );
  };
  /**
   * The price of a skin tried on and not owned. v0.2.23: in the dressing room it sits in the column beside the
   * poster (next to the weapon's numbers), not under the skins — the skins' row no longer grows past the poster
   * and slides over the fighter card.
   */
  const skinBuyRow = (w: WeaponId, current: FinishId | null): HTMLElement | null => {
    const price = current ? skinPrice(current) : null;
    return current && !ownsSkin(w, current) && price
        ? h(
            'div',
            { class: 'skinpick__buy', 'data-testid': 'skin-buy-row' },
            gradeTag(FINISHES[current].rarity),
            online
              ? h('button', { class: 'btn btn--small btn--red', 'data-testid': 'skin-buy', onclick: () => buySkin(w, current) }, h('span', { class: 'amt buyfor' }, h('span', null, t('Buy for')), priceLabel(price)))
              : h('span', { class: 'muted' }, t('Skins are sold in the online version.')),
            online ? h('button', { class: 'linkish', onclick: () => toTab('case', true) }, t('or try the skin case')) : null,
            // v0.2.22 (the owner: «покупает его на одно конкретное оружие»): said where the price is
            h('small', { class: 'muted skinpick__one', 'data-testid': 'skin-one-weapon' }, t('A skin is bought for one weapon: {weapon}', { weapon: weaponName(w) })),
          )
        : null;
  };

  /** «Примерить»: put it on in the dressing room and bring the dressing room into view. */
  const tryOn = (next: TryOn) => {
    trying = next;
    sfx.play('pickup', { volume: 0.5 });
    haptic('select');
    if (phone) {
      // phones: the kit's dressing room shows it (the sheet it came from closes)
      toTab('loadout');
      const card = body.querySelector('.kitcard');
      card?.classList.add('dressing--flash');
      return;
    }
    drawRoom();
    roomEl.classList.remove('dressing--flash');
    void roomEl.offsetWidth;
    roomEl.classList.add('dressing--flash');
    roomEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const tryBtn = (next: TryOn) => h('button', { class: 'btn btn--small btn--ghost', 'data-try': next.gadget ?? next.weapon ?? '', onclick: () => tryOn(next) }, t('Try on'));

  const drawWallet = () => {
    if (!online) {
      walletEl.replaceChildren(
        h(
          'div',
          { class: 'muted' },
          phone
            ? t('Demo: browse and try on — talons and unlocks work in the online version.')
            : REAL_MONEY
              ? t('Demo version: the catalogue is for browsing. Talons, BLATS and purchases work in the online version; anything can be tried on in the dressing room and in practice.')
              : t('Demo version: the catalogue is for browsing. Talons and unlocks work in the online version; anything can be tried on in the dressing room and in practice.'),
        ),
      );
      return;
    }
    const coins: HTMLElement[] = [h('div', { class: 'coin', title: t('Talons — earned in online matches') }, cur('tokens'), h('b', null, inv ? String(inv.tokens) : '…'), h('span', null, t('talons')))];
    if (REAL_MONEY)
      coins.push(
        h('div', { class: 'coin coin--blats', title: t('BLATS — bought for money and given for every new level') }, cur('diamonds'), h('b', { 'data-testid': 'wallet-blats' }, inv ? String(inv.diamonds) : '…'), h('span', null, t('BLATS'))),
        h('button', { class: 'btn btn--small btn--red', 'data-testid': 'wallet-topup', onclick: () => toTab('diamonds') }, t('Top up')),
      );
    else coins.push(h('span', { class: 'muted wallet__note' }, t('Talons are earned in online matches')));
    walletEl.replaceChildren(...coins);
  };

  const drawTabs = () => {
    const tabs: Array<[ArsenalTab, string]> = [
      ['loadout', t('Kit')],
      ['weapons', t('Weapons')],
      ['gear', t('Equipment')],
      ['characters', t('Characters')],
      ['case', t('Cases')],
      ...(REAL_MONEY ? [['diamonds', t('Buy BLATS')] as [ArsenalTab, string]] : []),
    ];
    // v0.2.18 (the owner): the BLATS section stands out — the red coin and «Buy BLATS»
    tabsEl.replaceChildren(
      ...tabs.map(([id, label]) =>
        h(
          'button',
          { role: 'tab', 'aria-pressed': String(tab === id), ...(id === 'diamonds' ? { class: 'tab--blats', 'data-testid': 'tab-blats' } : id === 'case' ? { class: 'tab--case', 'data-testid': 'tab-case' } : {}), onclick: () => ((tab = id), sfx.play('click'), draw()) },
          ...(id === 'diamonds' ? [blatsCoin(16, ''), ' '] : id === 'case' ? [caseIcon(16)] : []),
          label,
        ),
      ),
    );
  };

  // ── loadout: four equal slot columns + modifications of the focused weapon ─────────
  // Every column has the same number of rows: what the player owns (and «none» where a slot may stay
  // empty), then what the shop has for that slot — cheapest first, talons before diamonds — so the
  // columns line up and there are no gaps. A shop tile puts the item on in the dressing room, where it
  // can be bought.
  let focus: WeaponId | null = null;
  const byPrice = (a: ShopPrice | undefined, b: ShopPrice | undefined) =>
    (a?.currency === b?.currency ? 0 : a?.currency === 'tokens' ? -1 : 1) || (a?.level ?? 0) - (b?.level ?? 0) || (a?.amount ?? 0) - (b?.amount ?? 0);
  const shopTile = (kind: 'weapon' | 'gadget', id: WeaponId | GadgetId, price: ShopPrice) => {
    const lockedByLevel = !!inv && inv.level < price.level;
    return h(
      'button',
      { class: 'wbtn wbtn--shop', 'data-shop': id, title: t('Try on — and buy it in the dressing room'), onclick: () => tryOn(kind === 'weapon' ? { weapon: id as WeaponId } : { gadget: id as GadgetId }) },
      kind === 'weapon' ? weaponImg(id as WeaponId, 'small') : gadgetImg(id as GadgetId, 'small'),
      h('span', null, kind === 'weapon' ? weaponName(id as WeaponId) : gadgetName(id as GadgetId)),
      h('span', { class: `wbtn__price ${price.currency}` }, cur(price.currency), String(price.amount), lockedByLevel ? h('small', null, ` · ${t('LV {n}', { n: price.level })}`) : null),
    );
  };
  const loadoutTab = (): HTMLElement => {
    const l = loadout();
    focus ??= l.primary ?? l.sidearm;
    const pick = (slot: 1 | 2 | 3, w: WeaponId | null) => {
      focus = w ?? focus;
      if (w) trying = { weapon: w, mods: [...(l.mods[w] ?? [])] };
      const next: Loadout = { ...l };
      if (slot === 1 && w) next.sidearm = w;
      if (slot === 2 && w) next.melee = w;
      if (slot === 3) next.primary = w;
      if (!online || !inv) return draw();
      save(next);
    };
    interface Column {
      slot: 1 | 2 | 3 | 4;
      mine: HTMLElement[];
      shop: HTMLElement[];
      more: number;
      toTab: ArsenalTab;
    }
    const weaponColumn = (slot: 1 | 2 | 3, current: WeaponId | null, list: readonly WeaponId[]): Column => {
      const options = list.filter(owned);
      const mine = options.map((w) =>
        h('button', { class: `wbtn ${w === current ? 'on' : ''} ${w === focus ? 'focus' : ''}`, 'aria-pressed': String(w === current), title: weaponName(w), onclick: () => (w === current ? ((focus = w), (trying = { weapon: w, mods: [...(l.mods[w] ?? [])] }), draw()) : pick(slot, w)) }, weaponImg(w, 'small'), h('span', null, weaponName(w))),
      );
      if (slot === 3) mine.push(h('button', { class: `wbtn ${current === null ? 'on' : ''}`, 'aria-pressed': String(current === null), onclick: () => pick(3, null) }, h('span', { class: 'none' }, '—'), h('span', null, t('Sidearm only'))));
      const forSale = list.filter((w) => !owned(w) && WEAPON_PRICES[w]).sort((a, b) => byPrice(WEAPON_PRICES[a], WEAPON_PRICES[b]));
      return { slot, mine, shop: forSale.map((w) => shopTile('weapon', w, WEAPON_PRICES[w]!)), more: list.filter((w) => !owned(w)).length, toTab: 'weapons' };
    };
    const gadgetOptions = GADGET_IDS.filter(ownedGadget);
    const gadgetColumn: Column = {
      slot: 4,
      mine: [
        ...gadgetOptions.map((g) => h('button', { class: `wbtn ${g === l.gadget ? 'on' : ''}`, 'aria-pressed': String(g === l.gadget), title: gadgetName(g), onclick: () => g !== l.gadget && save({ ...l, gadget: g }) }, gadgetImg(g, 'small'), h('span', null, gadgetName(g)))),
        h('button', { class: `wbtn ${l.gadget === null ? 'on' : ''}`, 'aria-pressed': String(l.gadget === null), onclick: () => l.gadget !== null && save({ ...l, gadget: null }) }, h('span', { class: 'none' }, '—'), h('span', null, t('No equipment'))),
      ],
      shop: GADGET_IDS.filter((g) => !ownedGadget(g) && GADGET_PRICES[g])
        .sort((a, b) => byPrice(GADGET_PRICES[a], GADGET_PRICES[b]))
        .map((g) => shopTile('gadget', g, GADGET_PRICES[g]!)),
      more: GADGET_IDS.length - gadgetOptions.length,
      toTab: 'gear',
    };
    const columns: Column[] = [weaponColumn(1, l.sidearm, SIDEARMS), weaponColumn(2, l.melee, MELEE_WEAPONS), weaponColumn(3, l.primary, PRIMARY_WEAPONS), gadgetColumn];
    // the same number of rows everywhere: at least three, as many as the fullest column owns (≤ 6)
    const rows = Math.min(6, Math.max(3, ...columns.map((c) => c.mine.length)));
    const slotCards = columns.map((c) => {
      const shown = c.shop.slice(0, Math.max(0, rows - c.mine.length));
      const left = c.more - shown.length;
      return h(
        'div',
        { class: 'panel col slotcard', 'data-slot': String(c.slot) },
        h('span', { class: 'tag' }, `${c.slot} · ${slotLabel(c.slot)}`),
        h('div', { class: 'slotpick', style: `--rows:${Math.max(rows, c.mine.length)}` }, ...c.mine, ...shown),
        h('button', { class: 'btn btn--small btn--ghost slotcard__more', onclick: () => ((tab = c.toTab), draw()) }, left > 0 ? t('{n} more in the shop →', { n: left }) : t('To the shop →')),
      );
    });
    const fw = focus && owned(focus) ? focus : (l.primary ?? l.sidearm);
    return h('div', { class: 'col' }, h('div', { class: 'slots' }, ...slotCards), modsPanel(fw, l), statBars(fw, l.mods[fw]));
  };

  /** Modifications of one weapon: buy (talons), put on, take off, try on. */
  const modsPanel = (fw: WeaponId, l: Loadout): HTMLElement => {
    const fit = modsFor(WEAPONS[fw]);
    const equipped = l.mods[fw] ?? [];
    const head = h(
      'div',
      { class: 'row modhead', style: 'margin-top:6px;flex-wrap:nowrap' },
      weaponImg(fw),
      h('div', { class: 'col grow', style: 'gap:2px' }, h('div', { class: 'h2' }, weaponName(fw)), h('div', { class: 'muted' }, fit.length ? t('One modification per mount. They are bought with talons for a particular weapon, and each has a plus and a minus. Pick a weapon in the slots above to set it up.') : t('This weapon takes no modifications. Pick another weapon in the slots above.'))),
    );
    const setMods = (list: ModId[], ok: string) => save({ ...l, mods: { ...l.mods, [fw]: sanitizeMods(list, fw) } }, ok);
    const rows = fit.map((m) => {
      const def = MODS[m];
      const mt = modText(m);
      const on = equipped.includes(m);
      const have = inv ? (inv.mods[fw]?.includes(m) ?? false) : false;
      const q = inv ? modQuote(inv, fw, m) : 'not_owned';
      let main: HTMLElement;
      if (on) main = h('button', { class: 'btn btn--small', disabled: !online, onclick: () => setMods(equipped.filter((x) => x !== m), t('{name} removed', { name: mt.name })) }, t('Remove'));
      else if (have) main = h('button', { class: 'btn btn--small btn--red', disabled: !online, onclick: () => setMods([m, ...equipped.filter((x) => MODS[x].mount !== def.mount)], t('{name} fitted', { name: mt.name })) }, t('Fit'));
      else
        main = h(
          'button',
          {
            class: `btn btn--small ${typeof q === 'string' ? '' : 'btn--red'}`,
            disabled: !online || (typeof q === 'string' && q !== 'funds'),
            title: typeof q === 'string' ? refusalText(q) : '',
            onclick: () => {
              if (!online) return;
              if (q === 'funds') return void toast(t('Not enough talons — you earn them in online matches'));
              void act(() => online.buyMod(fw, m), t('{name} bought and fitted', { name: mt.name }));
            },
          },
          amount(MOD_PRICES[m], 'tokens'),
        );
      return h(
        'div',
        { class: `modrow ${on ? 'on' : ''}` },
        modImg(m),
        h('div', { class: 'col', style: 'gap:2px' }, h('div', null, h('b', null, mt.name), h('span', { class: 'muted' }, ` · ${mountLabel(def.mount)}`), on ? h('span', { class: 'badge badge--ok', style: 'margin-left:8px' }, t('Fitted')) : null), h('div', { class: 'plus' }, `+ ${mt.plus}`), h('div', { class: 'minus' }, `− ${mt.minus}`)),
        h('div', { class: 'acts' }, main, tryBtn({ weapon: fw, mods: [m, ...equipped.filter((x) => MODS[x].mount !== def.mount)] })),
      );
    });
    return h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Modifications')), head, ...rows);
  };

  // ── shop helpers ──────────────────────────────────────────────────────
  const itemName = (kind: ShopKind, id: string) => (kind === 'weapon' ? weaponName(id as WeaponId) : kind === 'character' ? charText(id as CharacterId).name : gadgetName(id as GadgetId));
  const buyButton = (kind: ShopKind, id: WeaponId | CharacterId | GadgetId, price: ShopPrice, verb = false): HTMLElement => {
    const priced = (): HTMLElement => (verb ? h('span', { class: 'amt buyfor' }, h('span', null, t('Buy for')), priceLabel(price)) : priceLabel(price));
    if (!online || !inv) return h('button', { class: 'btn btn--small', disabled: true }, priced());
    const r = buyRefusal(inv, kind, id);
    if (r === 'owned') return h('span', { class: 'badge badge--ok' }, t('Owned'));
    const label: HTMLElement | string = r === 'level' ? t('From level {n}', { n: price.level }) : priced();
    return h(
      'button',
      {
        class: `btn btn--small ${r ? '' : 'btn--red'}`,
        disabled: r === 'level',
        onclick: () => {
          if (r === 'funds') {
            toast(price.currency === 'tokens' ? t('Not enough talons — you earn them in online matches') : t('Not enough BLATS'));
            if (price.currency === 'diamonds') toTab('diamonds');
            return;
          }
          if (kind === 'gadget')
            // new equipment goes straight into slot 4
            return void act(async () => {
              const after = await online.buy('gadget', id);
              await online.setLoadout({ ...after.loadout, gadget: id as GadgetId });
            }, t('{name} — now in your kit', { name: itemName(kind, id) }));
          void act(() => online.buy(kind, id), kind === 'weapon' ? t('{name} — yours now', { name: itemName(kind, id) }) : t('{name} joins the business', { name: itemName(kind, id) }));
        },
      },
      label,
    );
  };

  /**
   * v0.2.18 (the owner: «ячейки с оружием меньше, чтобы вмещались в один экран»): the shop's tabs on wide
   * screens are compact grids too — an item's card (the in-game look, the numbers, buy / take / test) opens
   * in a sheet, as on phones.
   */
  const shopGroup = (title: string, note: string, cells: HTMLElement[], testid?: string): HTMLElement | null =>
    cells.length
      ? h(
          'div',
          { class: 'col shopgroup' },
          h('div', { class: 'shopgroup__head' }, h('b', { class: 'shopgroup__title' }, title), h('span', { class: 'muted' }, note)),
          h('div', { class: 'shopgrid shopgrid--wide', ...(testid ? { 'data-testid': testid } : {}) }, ...cells),
        )
      : null;
  const weaponsTab = (): HTMLElement => {
    const tokenNoLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level <= 1);
    const tokenLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level > 1).sort((a, b) => shopOrder(WEAPON_PRICES[a], WEAPON_PRICES[b]));
    return h(
      'div',
      { class: 'col shoptab shoptab--wide', 'data-testid': 'shop-weapons' },
      h('div', { class: 'muted arsnote' }, t('Shop weapons aren’t stronger than the free ones — just different, each with its own pluses and minuses. Tap one for its numbers, try it in practice.')),
      shopGroup(t('Free'), t('everyone has these'), FREE_WEAPONS.map((w) => cell('weapon', w))),
      shopGroup(t('For talons'), t('talons come with every online match'), tokenNoLevel.map((w) => cell('weapon', w))),
      shopGroup(t('For talons, by level'), t('unlock as you rise through the ranks'), tokenLevel.map((w) => cell('weapon', w))),
      h('button', { class: 'btn btn--small btn--ghost shopgroup__more', onclick: () => go('case') }, t('Rare weapons come from the case →')),
    );
  };

  // ── equipment (slot 4) ────────────────────────────────────────────────
  const gearTab = (): HTMLElement =>
    h(
      'div',
      { class: 'col shoptab shoptab--wide', 'data-testid': 'shop-gear' },
      h('div', { class: 'muted arsnote' }, t('Equipment is the fourth slot: grenades, mines, a C4 charge and the turret. You carry one kind; the charges are refilled every time you spawn. On a computer it’s the G key, on a phone a button of its own.')),
      shopGroup(t('Equipment'), t('one kind at a time'), [...GADGET_IDS].sort((a, b) => shopOrder(GADGET_PRICES[a], GADGET_PRICES[b])).map((g) => cell('gadget', g))),
    );

  // ── characters ────────────────────────────────────────────────────────
  /** v0.2.18: a character's cell — the portrait, the name, the grade, the price (or «Yours»). */
  const charCell = (c: CharacterId): HTMLElement => {
    const price = CHARACTER_PRICES[c];
    const mine = inv ? inv.characters.includes(c) : !price;
    return h(
      'button',
      { class: `cell cell--char cell--grade-${CHARACTERS[c].grade} ${mine ? 'cell--mine' : ''}`, 'data-char': c, onclick: () => openChar(c) },
      portrait(c, true),
      h('span', { class: 'cell__name' }, charText(c).name),
      gradeTag(CHARACTERS[c].grade, 'cell__grade'),
      mine ? h('span', { class: 'cell__own' }, `✓ ${t('Yours')}`) : price ? priceTag(price) : h('span', { class: 'cell__own' }, t('Free')),
    );
  };
  /** Characters for sale in one grid: the talon ones, then BLATS from the legendary down. */
  const shopCharacters = (): CharacterId[] => {
    const rank = (c: CharacterId) => (CHARACTER_PRICES[c]!.currency === 'tokens' ? -1 : 3 - GRADES.indexOf(CHARACTERS[c].grade));
    return [...SHOP_CHARACTERS].sort((a, b) => rank(a) - rank(b));
  };
  // ── v0.2.23: sets — a character with their legendary skin on the automatic, cheaper together ──
  const bundlePrice = (b: Bundle): ShopPrice => ({ currency: 'diamonds', amount: b.price, level: 1 });
  /** «Buy the set» (or why not): one confirmation, then both items at once. */
  const bundleButton = (b: Bundle, compact = false): HTMLElement => {
    if (!online || !inv) return h('button', { class: 'btn btn--small', disabled: true }, priceLabel(bundlePrice(b)));
    const r = bundleRefusal(inv, b.character);
    if (r === 'owned') return h('span', { class: 'badge badge--ok' }, t('Owned'));
    return h(
      'button',
      {
        class: 'btn btn--small btn--red',
        'data-testid': 'bundle-buy',
        onclick: () => {
          if (r === 'funds') {
            toast(t('Not enough BLATS'));
            toTab('diamonds');
            return;
          }
          confirmBundle(b);
        },
      },
      compact ? priceLabel(bundlePrice(b)) : h('span', { class: 'amt buyfor' }, h('span', null, t('Buy for')), priceLabel(bundlePrice(b))),
    );
  };
  const confirmBundle = (b: Bundle) => {
    const ov = h('div', { class: 'overlay overlay--top' });
    const close = () => ov.remove();
    const what = `${charText(b.character).name} + «${finishName(b.finish)}»`;
    ov.append(
      h(
        'div',
        { class: 'panel modal col', 'data-testid': 'bundle-confirm' },
        h('span', { class: 'tag' }, t('Confirmation')),
        h('div', { style: 'margin-top:8px' }, t('Buy the set «{what}» for {n} BLATS ({usd})?', { what, n: b.price, usd: usd(b.price) })),
        h('div', { class: 'muted' }, t('{n} BLATS apart. The skin goes on the «Druzhba» automatic at once.', { n: b.separate })),
        h(
          'div',
          { class: 'row', style: 'gap:8px;margin-top:10px' },
          h(
            'button',
            {
              class: 'btn btn--red grow',
              'data-testid': 'bundle-confirm-buy',
              onclick: () => {
                close();
                closeSheet();
                void act(() => online!.buyBundle(b.character), t('{name} joins the business — with the «{skin}» skin', { name: charText(b.character).name, skin: finishName(b.finish) })).then(() => {
                  if (inv?.characters.includes(b.character)) o.onSetBought?.(b.character);
                });
              },
            },
            t('Buy'),
          ),
          h('button', { class: 'btn grow', onclick: close }, t('Cancel')),
        ),
      ),
    );
    ov.addEventListener('click', (e) => {
      if (e.target === ov) close();
    });
    (document.getElementById('ui') ?? document.body).append(ov);
  };
  /** A set's cell: the fighter card (the character with the skin on), what is in it, the price, buy. */
  const bundleCell = (b: Bundle, width: number, compact: boolean): HTMLElement => {
    const card = new FighterCard({ name: charText(b.character).name, character: b.character, level: null, weapon: b.weapon, finish: b.finish, label: t('Set'), labelColor: '#b8862a' }, { shape: 'tall', width });
    return h(
      'div',
      { class: 'bundle', 'data-testid': 'bundle', 'data-character': b.character },
      h('button', { class: 'bundle__card', 'aria-label': charText(b.character).name, onclick: () => openChar(b.character) }, card.el),
      h('div', { class: 'bundle__what' }, h('b', null, charText(b.character).name), h('span', null, ` + «${finishName(b.finish)}»`)),
      h('div', { class: 'bundle__price muted' }, t('apart'), ' ', h('s', null, fmtNum(b.separate))),
      bundleButton(b, compact),
    );
  };
  /** The sets the player can still buy (a set half owned is bought item by item). */
  const bundlesGroup = (width: number, compact = false): HTMLElement | null => {
    const list = BUNDLES.filter((b) => !inv || bundleRefusal(inv, b.character) !== 'owned');
    if (!list.length) return null;
    return h(
      'div',
      { class: 'col shopgroup bundles' },
      h('div', { class: 'shopgroup__head' }, h('b', { class: 'shopgroup__title' }, t('Sets')), h('span', { class: 'muted' }, t('a character with their legendary skin — cheaper than apart'))),
      h('div', { class: 'bundles__row', 'data-testid': 'bundles' }, ...list.map((b) => bundleCell(b, width, compact))),
    );
  };

  /** «Regular 199 · Rare 399 · Epic 799 · Legendary 1 099» — the grades' prices in one line. */
  const gradePrices = (): HTMLElement =>
    h('div', { class: 'gradeprices' }, ...GRADES.map((g) => h('span', { class: 'gradeprices__item' }, gradeTag(g), priceLabel({ currency: 'diamonds', amount: CHARACTER_GRADE_PRICES[g], level: 1 }))));
  const charactersTab = (): HTMLElement =>
    h(
      'div',
      { class: 'col shoptab shoptab--wide', 'data-testid': 'shop-characters' },
      h('div', { class: 'muted arsnote' }, t('All characters have the same stats — they differ in looks and backstory. Two are free, three are unlocked with experience and talons, the rest are sold for BLATS by grade.')),
      gradePrices(),
      bundlesGroup(132),
      h('div', { class: 'shopgrid shopgrid--wide shopgrid--chars' }, ...shopCharacters().map(charCell)),
    );

  // ── cases: rare weapons and weapon skins ──────────────────────────────
  type Reveal = { kind: 'weapon'; weapon: WeaponId; rarity: Rarity } | { kind: 'skin'; weapon: WeaponId; finish: FinishId; rarity: SkinRarity; equipped: boolean } | { kind: 'character'; character: CharacterId; grade: Grade };
  let reveal: Reveal | null = null;
  const caseFunds = (p: ShopPrice) => (inv ? (p.currency === 'tokens' ? inv.tokens : inv.diamonds) : 0);
  /**
   * The confirmation before a case. Paid with BLATS (real money) it needs the adult checkbox; paid with
   * talons (there is no money in it) a plain «open?» is enough.
   */
  const confirmCase = (price: ShopPrice, inside: string, open: () => Promise<void>) => {
    if (!online || !inv) return;
    if (inv.level < price.level) return void toast(t('From level {n}', { n: price.level }));
    if (caseFunds(price) < price.amount) {
      if (price.currency === 'tokens') return void toast(t('Not enough talons — you earn them in online matches'));
      toast(t('Not enough BLATS'));
      toTab('diamonds');
      return;
    }
    const paid = price.currency === 'diamonds';
    const ov = h('div', { class: 'overlay overlay--top' });
    const close = () => ov.remove();
    ov.append(
      h(
        'div',
        { class: 'panel modal col' },
        h('span', { class: 'tag' }, t('Confirmation')),
        h(
          'div',
          { style: 'margin-top:8px' },
          paid ? t('Open the case for {n} BLATS ({usd})?', { n: price.amount, usd: usd(price.amount) }) : t('Open the case for {n} {talons}?', { n: price.amount, talons: tokenWord(price.amount) }),
        ),
        h('div', { class: 'muted' }, inside),
        paid
          ? h(
              'label',
              { class: 'check' },
              h('input', {
                type: 'checkbox',
                'data-testid': 'case-adult',
                onchange: (e: Event) => {
                  const btn = ov.querySelector<HTMLButtonElement>('[data-open]');
                  if (btn) btn.disabled = !(e.target as HTMLInputElement).checked;
                },
              }),
              ` ${t('I am 18 or older')}`,
            )
          : null,
        h(
          'button',
          {
            class: 'btn btn--red',
            'data-open': '1',
            'data-testid': 'case-confirm',
            disabled: paid,
            onclick: () => {
              close();
              void act(open);
            },
          },
          t('Open'),
        ),
        h('button', { class: 'btn', onclick: close }, t('Cancel')),
      ),
    );
    root.append(ov);
  };
  const openWeaponCase = () =>
    confirmCase(CASE_PRICE, t('Inside is a random rare weapon you don’t own yet. The odds are listed below. The purchase is final.'), async () => {
      const r = await online!.openCase();
      reveal = { kind: 'weapon', weapon: r.weapon, rarity: r.rarity };
      sfx.play(r.rarity === 'legendary' ? 'supply' : 'pickup');
    });
  const openSkinCase = () =>
    confirmCase(SKIN_CASE_PRICE, t('Inside is a random weapon skin you don’t own yet. The odds are listed below. The purchase is final.'), async () => {
      const r = await online!.openSkinCase();
      reveal = { kind: 'skin', weapon: r.weapon, finish: r.finish, rarity: r.rarity, equipped: r.equipped };
      trying = { weapon: r.weapon, finish: r.finish, mods: [...(loadout().mods[r.weapon] ?? [])] };
      sfx.play(r.rarity === 'legendary' || r.rarity === 'epic' ? 'supply' : 'pickup');
    });
  // v0.2.18 part 2: the character case
  const openCharacterCase = () =>
    confirmCase(CHARACTER_CASE_PRICE, t('Inside is a random character sold for BLATS that you don’t have yet. The odds are listed below. The purchase is final.'), async () => {
      const r = await online!.openCharacterCase();
      reveal = { kind: 'character', character: r.character, grade: r.grade };
      sfx.play(r.grade === 'legendary' || r.grade === 'epic' ? 'supply' : 'pickup');
    });
  const charsOwnedFromCase = () => CASE_CHARACTERS.filter((c) => inv?.characters.includes(c)).length;
  const openBtn = (price: ShopPrice, onOpen: () => void, testid: string) =>
    h('button', { class: 'btn btn--red', 'data-testid': testid, disabled: !online, onclick: onOpen }, online ? h('span', null, `${t('Open for')} `, amount(price.amount, price.currency)) : t('Available in the online version'));
  const caseNote = () =>
    REAL_MONEY && (CASE_PRICE.currency === 'diamonds' || SKIN_CASE_PRICE.currency === 'diamonds' || CHARACTER_CASE_PRICE.currency === 'diamonds')
      ? t('The skin case and the crew case are for BLATS: adults only, and paid cases are banned in some countries — don’t buy them there. The weapon case is for talons. The odds are honest and enforced by the server.')
      : t('Cases are opened with talons you earn in matches — there is no money in them. The odds are honest and enforced by the server.');
  /** The weapon case's odds table (wide screens: under the cases; phones: in a sheet). */
  const caseOddsPanel = (): HTMLElement => {
    const have = new Set(inv?.weapons ?? []);
    return h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, t('Odds')),
      h(
        'table',
        { class: 'table', style: 'margin-top:6px' },
        h('thead', null, h('tr', null, h('th', null, t('Weapon')), h('th', null, t('Grade')), h('th', { class: 'num' }, t('Chance')))),
        h(
          'tbody',
          null,
          ...caseOdds(have).map((e) =>
            h(
              'tr',
              { class: e.odds === 0 ? 'got' : '' },
              h('td', null, h('div', { class: 'row', style: 'flex-wrap:nowrap;gap:8px' }, weaponImg(e.weapon, 'small'), weaponName(e.weapon))),
              h('td', { class: `rar rar--${e.rarity}` }, rarityLabel(e.rarity)),
              h('td', { class: 'num' }, e.odds === 0 && have.has(e.weapon) ? t('owned') : `${e.odds.toFixed(e.odds < 10 ? 1 : 0)}%`),
            ),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, t('Base odds (before anything is collected): {list}.', { list: CASE_TABLE.map((e) => `${weaponName(e.weapon)} ${e.chance}%`).join(', ') })),
    );
  };
  const skinOddsPanel = (): HTMLElement => {
    const skinOdds = skinCaseOdds(new Set(inv?.skins ?? []));
    return h(
      'div',
      { class: 'panel col', 'data-testid': 'skin-odds' },
      h('span', { class: 'tag' }, t('Skin odds')),
      h(
        'table',
        { class: 'table', style: 'margin-top:6px' },
        h('thead', null, h('tr', null, h('th', null, t('Grade')), h('th', null, t('Finishes')), h('th', { class: 'num' }, t('Chance')))),
        h(
          'tbody',
          null,
          ...SKIN_RARITIES.map((r) =>
            h(
              'tr',
              { class: skinOdds[r] === 0 ? 'got' : '' },
              h('td', { class: `rar rar--${r}` }, rarityLabel(r)),
              h('td', null, h('div', { class: 'finishes' }, ...CASE_FINISHES.filter((f) => FINISHES[f].rarity === r).map((f) => h('span', { class: 'finish' }, h('i', { class: `swatch swatch--${f}`, 'aria-hidden': 'true' }), finishName(f))))),
              h('td', { class: 'num' }, `${skinOdds[r].toFixed(skinOdds[r] < 10 ? 1 : 0)}%`),
            ),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, t('First the grade is drawn, then any skin of that grade you don’t have yet, all equally likely. Every weapon can wear every finish; the two free finishes never drop.')),
    );
  };
  /** The character case's odds: each grade's chance and its characters (the ones already yours greyed out). */
  const charOddsPanel = (): HTMLElement => {
    const owned = new Set(inv?.characters ?? []);
    const odds = characterCaseOdds(owned);
    return h(
      'div',
      { class: 'panel col', 'data-testid': 'char-odds' },
      h('span', { class: 'tag' }, t('Character odds')),
      h(
        'table',
        { class: 'table', style: 'margin-top:6px' },
        h('thead', null, h('tr', null, h('th', null, t('Grade')), h('th', null, t('Characters')), h('th', { class: 'num' }, t('Chance')))),
        h(
          'tbody',
          null,
          ...GRADES.map((g) =>
            h(
              'tr',
              { class: odds[g] === 0 ? 'got' : '' },
              h('td', { class: `rar rar--${g}` }, rarityLabel(g)),
              h('td', null, h('div', { class: 'finishes' }, ...CASE_CHARACTERS.filter((c) => CHARACTERS[c].grade === g).map((c) => h('span', { class: `finish ${owned.has(c) ? 'finish--got' : ''}` }, portrait(c, true), charText(c).name)))),
              h('td', { class: 'num' }, `${odds[g].toFixed(odds[g] < 10 ? 1 : 0)}%`),
            ),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, t('First the grade is drawn, then any character of that grade you don’t have yet, all equally likely. The two free characters and the three for talons never drop.')),
    );
  };
  const revealPanel = (r: Reveal): HTMLElement => {
    const close = h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((reveal = null), closeSheet(), draw()) }, t('Close'));
    if (r.kind === 'character') {
      const c = charText(r.character);
      return h(
        'div',
        { class: `panel col reveal reveal--${r.grade}`, 'data-testid': 'char-reveal' },
        h('span', { class: 'tag' }, t('From the character case')),
        h('div', { class: 'h1' }, c.name, ' ', h('span', { class: 'nick' }, `«${c.nickname}»`)),
        h('div', { class: 'reveal__hero' }, heroImg(r.character, 'reveal__img')),
        h('div', { class: 'muted' }, `${rarityLabel(r.grade)} · ${t('joined your crew')}`),
        h(
          'div',
          { class: 'row' },
          o.onTryCharacter
            ? h(
                'button',
                {
                  class: 'btn btn--small btn--red',
                  onclick: () => {
                    reveal = null;
                    closeSheet();
                    o.onTryCharacter!(r.character, tab);
                  },
                },
                t('Try in practice'),
              )
            : null,
          close,
        ),
      );
    }
    if (r.kind === 'weapon')
      return h(
        'div',
        { class: `panel col reveal reveal--${r.rarity}` },
        h('span', { class: 'tag' }, t('From the case')),
        h('div', { class: 'h1' }, weaponName(r.weapon)),
        h('div', { class: 'wpic wpic--big' }, weaponImg(r.weapon)),
        h('div', { class: 'muted' }, `${rarityLabel(r.rarity)} · ${t('already in your arsenal')}`),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn btn--small',
              onclick: () => {
                reveal = null;
                if (!phone) return void ((focus = r.weapon), (tab = 'loadout'), draw());
                // phones: straight into its slot, shown in the kit
                closeSheet();
                tab = 'loadout';
                takeItem('weapon', r.weapon);
                draw();
              },
            },
            t('Add to kit'),
          ),
          tryBtn({ weapon: r.weapon }),
          close,
        ),
      );
    const wearing = worn(r.weapon) === r.finish;
    return h(
      'div',
      { class: `panel col reveal reveal--${r.rarity}`, 'data-testid': 'skin-reveal' },
      h('span', { class: 'tag' }, t('From the skin case')),
      h('div', { class: 'h1' }, `${weaponName(r.weapon)} · ${finishName(r.finish)}`),
      h('div', { class: 'wpic wpic--big' }, weaponImg(r.weapon, 'big', r.finish)),
      h('div', { class: 'muted' }, `${rarityLabel(r.rarity)} · ${wearing ? t('already on the weapon') : t('in your collection')}`),
      h(
        'div',
        { class: 'row' },
        wearing
          ? null
          : h(
              'button',
              {
                class: 'btn btn--small btn--red',
                onclick: () => {
                  const skins = { ...(loadout().skins ?? {}), [r.weapon]: r.finish };
                  save({ ...loadout(), skins }, t('Skin on: {name}', { name: `${weaponName(r.weapon)} · ${finishName(r.finish)}` }));
                },
              },
              t('Wear it'),
            ),
        tryBtn({ weapon: r.weapon, finish: r.finish }),
        close,
      ),
    );
  };
  const openOdds = (title: string, panel: () => HTMLElement) =>
    openPhoneSheet(title, 'odds-sheet', () => {
      const p = panel();
      p.classList.add('panel--insheet');
      return p;
    });
  const caseTab = (): HTMLElement => {
    const have = new Set(inv?.weapons ?? []);
    const left = caseOdds(have).filter((e) => e.odds > 0).length;
    const enabled = cfg?.casesEnabled !== false;
    const skinsHave = caseSkinsOwned(inv?.skins ?? []);
    const skinTotal = caseSkinTotal();
    const skinsLeft = skinTotal - skinsHave.size;
    return h(
      'div',
      { class: 'col' },
      reveal ? revealPanel(reveal) : null,
      h(
        'div',
        { class: 'cases' },
        h(
          'div',
          { class: 'panel col' },
          h('span', { class: 'tag' }, t('The Defitsit Case')),
          h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' }, h('div', { class: 'crate' }), h('div', { class: 'col grow', style: 'gap:4px' }, h('div', { class: 'h2' }, `${t('Rare weapon')} · `, amount(CASE_PRICE.amount, CASE_PRICE.currency)), h('div', { class: 'muted' }, t('One of 10 rare guns. No duplicates: a weapon you already got from the case never drops again, and the odds of the rest are recalculated. Once the collection is complete, the case is no longer sold.')))),
          !enabled ? h('div', { class: 'badge badge--off' }, t('Cases are disabled on this server')) : left === 0 ? h('div', { class: 'badge badge--ok' }, t('Collection complete!')) : openBtn(CASE_PRICE, openWeaponCase, 'open-weapon-case'),
        ),
        h(
          'div',
          { class: 'panel col', 'data-testid': 'skin-case' },
          h('span', { class: 'tag' }, t('The Skin Case')),
          h(
            'div',
            { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' },
            h('div', { class: 'crate crate--skins' }),
            h(
              'div',
              { class: 'col grow', style: 'gap:4px' },
              h('div', { class: 'h2' }, `${t('Weapon skin')} · `, amount(SKIN_CASE_PRICE.amount, SKIN_CASE_PRICE.currency)),
              h('div', { class: 'muted' }, t('One of {n} skins: {f} finishes for each of {w} weapons. Skins change only the look, never the numbers. No duplicates: a skin you have never drops again.', { n: skinTotal, f: CASE_FINISHES.length, w: SKINNABLE_WEAPONS.length })),
              online ? h('div', { class: 'muted', 'data-testid': 'skins-owned' }, t('Your skins: {n} of {total}', { n: skinsHave.size, total: skinTotal })) : null,
            ),
          ),
          !enabled ? h('div', { class: 'badge badge--off' }, t('Cases are disabled on this server')) : skinsLeft === 0 ? h('div', { class: 'badge badge--ok' }, t('Collection complete!')) : openBtn(SKIN_CASE_PRICE, openSkinCase, 'open-skin-case'),
        ),
        h(
          'div',
          { class: 'panel col', 'data-testid': 'char-case' },
          h('span', { class: 'tag' }, t('The Crew Case')),
          h(
            'div',
            { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' },
            h('div', { class: 'crate crate--chars' }),
            h(
              'div',
              { class: 'col grow', style: 'gap:4px' },
              h('div', { class: 'h2' }, `${t('Character')} · `, amount(CHARACTER_CASE_PRICE.amount, CHARACTER_CASE_PRICE.currency)),
              h('div', { class: 'muted' }, t('One of the {n} characters sold for BLATS. Everyone has the same stats. No duplicates: a character you have never drops again.', { n: CASE_CHARACTERS.length })),
              online ? h('div', { class: 'muted', 'data-testid': 'chars-owned' }, t('Your characters: {n} of {total}', { n: charsOwnedFromCase(), total: CASE_CHARACTERS.length })) : null,
            ),
          ),
          !enabled ? h('div', { class: 'badge badge--off' }, t('Cases are disabled on this server')) : charsOwnedFromCase() >= CASE_CHARACTERS.length ? h('div', { class: 'badge badge--ok' }, t('Collection complete!')) : openBtn(CHARACTER_CASE_PRICE, openCharacterCase, 'open-char-case'),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, caseNote()),
      // v0.2.18: one screen — the odds open in a sheet
      h(
        'div',
        { class: 'row', style: 'gap:8px' },
        h('button', { class: 'btn btn--small', 'data-testid': 'case-odds-open', onclick: () => openOdds(t('Odds'), caseOddsPanel) }, t('Weapon case odds')),
        h('button', { class: 'btn btn--small', 'data-testid': 'skin-odds-open', onclick: () => openOdds(t('Skin odds'), skinOddsPanel) }, t('Skin case odds')),
        h('button', { class: 'btn btn--small', 'data-testid': 'char-odds-open', onclick: () => openOdds(t('Character odds'), charOddsPanel) }, t('Character case odds')),
      ),
      shopGroup(t('From the weapon case'), t('tap one for its numbers'), CASE_TABLE.map((e) => cell('weapon', e.weapon))),
    );
  };

  // ── BLATS (real money, v0.2.18) ───────────────────────────────────────
  // Xsolla offers cards and local methods on its own page; Stripe takes cards
  const payMethods = (): Array<['card', string]> => (cfg?.card ? [['card', cfg.provider === 'xsolla' ? t('Pay') : t('By card')]] : []);
  /** v0.2.18 part 3: inside Telegram each pack's price in Stars (null: not on sale there yet). */
  const starsPrices = (): Record<string, number> | null => (o.inTelegram ? (cfg?.stars ?? null) : null);
  /** Waits for the server to hear of the payment from Telegram (a few seconds), then shows the BLATS. */
  const waitCredited = async (paymentId: string) => {
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, i < 4 ? 800 : 1500));
      const st = await online!.api.paymentStatus(paymentId).catch(() => null);
      if (st?.status === 'paid') {
        inv = (await online!.loadInventory().catch(() => null)) ?? inv;
        sfx.play('buy');
        haptic('notify-success');
        toast(t('{n} credited', { n: `${fmtNum(st.diamonds)} ${t('BLATS')}` }));
        return;
      }
      if (st?.status === 'failed' || st?.status === 'expired') return void toast(t('The payment did not go through'));
    }
    toast(t('The payment is still being processed — the BLATS will arrive automatically'));
  };
  const buyStars = (packId: string) =>
    void act(async () => {
      const r = await online!.api.starsInvoice(packId);
      const status = await openInvoice(r.invoiceUrl);
      if (status === 'paid' || status === 'pending') await waitCredited(r.paymentId);
      else if (status === 'failed') toast(t('The payment did not go through'));
      else if (status === 'unsupported') toast(t('Update Telegram to pay with Stars'));
    });
  /** «⭐ 75» — the Stars button of a pack inside Telegram. */
  const starsButton = (packId: string, stars: number) =>
    h('button', { class: 'btn btn--small btn--red', 'data-testid': `stars-${packId}`, onclick: () => buyStars(packId) }, `⭐ ${fmtNum(stars)}`);
  /** The terms of purchase (Telegram asks a seller to show them before the payment). */
  const termsLink = () => h('a', { class: 'termslink', href: asset(getLang() === 'ru' ? 'terms-ru.html' : 'terms.html'), target: '_blank', rel: 'noopener', 'data-testid': 'terms-link' }, t('Terms of purchase'));
  const buyPack = (packId: string, method: 'card') =>
    void act(async () => {
      const r = await online!.api.checkout(packId, method);
      try {
        sessionStorage.setItem('blatkom89.pending-payment', r.paymentId);
      } catch {
        /* private mode: the ?pid= return parameter still works */
      }
      openExternal(r.url);
    });
  const blatsIntro = () =>
    t('1 BLATS = 1 cent. BLATS buy characters, weapon skins and the skin case; every new level gives 10 BLATS. Talons are never sold for money — you earn them in matches.');
  /** A pack: the coins (more for a bigger pack), BLATS, the price, what it is enough for, how to pay. */
  const packCard = (p: { id: string; diamonds: number; usdCents: number }, i: number, methods: Array<['card', string]>): HTMLElement => {
    const hint = packHint(p.diamonds);
    const stars = starsPrices()?.[p.id];
    return h(
      'div',
      { class: 'panel col pack', 'data-pack': p.id },
      h('div', { class: 'pack__coins' }, coinPile(i + 1, 26)),
      h('div', { class: 'pack__amt' }, fmtNum(p.diamonds), ' ', h('small', null, t('BLATS'))),
      h('div', { class: 'pack__usd' }, stars ? `⭐ ${fmtNum(stars)}` : usd(p.usdCents)),
      hint ? h('div', { class: 'pack__hint', 'data-testid': 'pack-hint' }, h('span', null, t('Enough for:')), ' ', hint) : null,
      ...(stars ? [starsButton(p.id, stars)] : methods.length ? methods.map(([m, label]) => h('button', { class: 'btn btn--small btn--red', onclick: () => buyPack(p.id, m) }, label)) : [h('button', { class: 'btn btn--small', disabled: true }, t('Soon'))]),
    );
  };
  /** v0.2.20: the promo code field (BLATNOY…); the wallet follows the new balance. */
  const promoPaid = (): HTMLElement =>
    promoForm(online!, (balance) => {
      if (inv) inv = { ...inv, diamonds: balance };
      draw();
    });
  const diamondsTab = (): HTMLElement => {
    if (!online) return h('div', { class: 'panel' }, t('Buying BLATS works in the online version of the game.'));
    // inside Telegram the packs are sold for Telegram Stars (Telegram's rule for digital goods)
    const methods = o.inTelegram ? [] : payMethods();
    const stars = starsPrices();
    const head = blatsBanner({
      kind: 'section',
      sale: blatsSale(cfg, o.inTelegram),
      line: blatsIntro(),
      note: o.inTelegram
        ? stars
          ? t('Paid with Telegram Stars in Telegram’s own window. The BLATS are credited as soon as the payment goes through.')
          : t('Buying BLATS inside Telegram is coming soon (via Telegram Stars).')
        : methods.length === 0
          ? t('Payments are being connected — coming soon')
          : t('You pay on the payment provider’s secure page. The BLATS are credited automatically once the payment is confirmed.'),
      right: h('span', { class: 'blatsban__bal' }, h('small', null, t('on your account')), h('b', null, blatsCoin(24, ''), h('span', { 'data-testid': 'blats-balance' }, inv ? String(inv.diamonds) : '…'))),
    });
    // nothing can be bought yet: the banner's note says so
    if ((o.inTelegram && !stars) || (!o.inTelegram && methods.length === 0)) head.querySelector('.blatsban__from')?.setAttribute('data-testid', 'pay-soon');
    return h(
      'div',
      { class: 'col blatsshop', 'data-testid': 'blats-tab' },
      head,
      h('div', { class: 'packs' }, ...(cfg?.packs ?? []).map((p, i) => packCard(p, i, methods))),
      promoPaid(),
      h('div', { class: 'muted', style: 'font-size:13px' }, t('Purchases belong to your account. To keep them when you change devices, link an email in your profile.'), ' ', stars || methods.length ? termsLink() : null),
    );
  };

  // ── phones (≤ 560 px wide) ─────────────────────────────────────────────
  // The owner's mobile pass: the wallet on top, then «Экипировка» (only what the player has — the
  // dressing room with the in-game view and the four slots, each changed from a sheet of the player's
  // own items) and «Магазин» (weapons, equipment, characters and cases as compact grids). Every tab
  // fits one screen; details open in bottom sheets.
  let lastShop: ShopTab = tab === 'loadout' ? 'weapons' : tab;
  let shopSlot: 1 | 2 | 3 = 3;
  let pdoll: Doll | null = null;
  const phoneDoll = (): Doll => (pdoll ??= new Doll(o.textures, o.character, startWeapon(), 128));
  interface PhoneSheet {
    s: Sheet;
    body: () => HTMLElement;
    actions: (() => HTMLElement | null) | null;
  }
  let psheet: PhoneSheet | null = null;
  const openPhoneSheet = (title: string, testid: string, body: () => HTMLElement, actions: (() => HTMLElement | null) | null = null, onClose?: () => void) => {
    const s = openSheet(document.getElementById('ui') ?? document.body, {
      title,
      testid,
      cls: 'sheet--ars',
      body: body(),
      actions: actions?.() ?? null,
      onClose: () => {
        if (psheet?.s === s) psheet = null;
        onClose?.();
      },
    });
    psheet = { s, body, actions };
  };
  const closeSheet = () => psheet?.s.close();
  /** Redraws an open sheet after the state changed (a purchase, a new loadout). */
  const refreshSheet = () => {
    if (!psheet) return;
    psheet.s.setBody(psheet.body());
    if (psheet.actions) psheet.s.setActions(psheet.actions());
  };
  /** Switches the tab (phones: closes an open sheet; wide screens may bring the tab into view). */
  function toTab(next: ArsenalTab, scroll = false) {
    if (next === 'diamonds' && !REAL_MONEY) next = 'loadout';
    closeSheet();
    const changed = tab !== next;
    tab = next;
    if (next !== 'loadout') lastShop = next;
    draw();
    // a new tab's list starts from its top
    if (changed) body.scrollTop = 0;
    if (scroll && !phone) body.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /** The skin picker's preview: the dressing room on wide screens, the kit (and its sheet) on phones. */
  function refreshPreview() {
    if (phone) draw();
    else {
      drawRoom();
      refreshSheet();
    }
  }
  const go = (next: ArsenalTab) => {
    sfx.play('click');
    toTab(next);
  };
  // the shop's departments (v0.2.19: the cases have their own button next to «Loadout» and «Shop»)
  const shopTabs = (): Array<[ShopTab, string]> => [
    ['weapons', t('Weapons')],
    ['gear', t('Equipment')],
    ['characters', t('Characters')],
    ...(REAL_MONEY ? [['diamonds', t('BLATS')] as [ShopTab, string]] : []),
  ];
  const drawPhoneTabs = () => {
    const kit = tab === 'loadout';
    // v0.2.19: the cases one tap away from anywhere in the Arsenal (the owner: «более заметным»)
    modeEl.replaceChildren(
      h('button', { role: 'tab', 'aria-pressed': String(kit), 'data-tab': 'loadout', 'data-testid': 'ars-kit', onclick: () => !kit && go('loadout') }, t('Loadout')),
      h('button', { role: 'tab', 'aria-pressed': String(!kit && tab !== 'case'), 'data-tab': 'shop', 'data-testid': 'ars-shop', onclick: () => (kit || tab === 'case') && go(lastShop === 'case' ? 'weapons' : lastShop) }, t('Shop')),
      h('button', { role: 'tab', class: 'tab--case', 'aria-pressed': String(tab === 'case'), 'data-tab': 'case', 'data-testid': 'ars-case', title: t('Cases'), onclick: () => tab !== 'case' && go('case') }, caseIcon(18), h('span', null, t('Cases'))),
    );
    chipsEl.hidden = kit || tab === 'case';
    chipsEl.classList.toggle('arschips--5', shopTabs().length > 4);
    chipsEl.replaceChildren(
      ...shopTabs().map(([id, label]) =>
        h('button', { role: 'tab', 'aria-pressed': String(tab === id), 'data-tab': id, ...(id === 'diamonds' ? { class: 'tab--blats' } : {}), onclick: () => tab !== id && go(id) }, ...(id === 'diamonds' ? [blatsCoin(16, ''), ' '] : []), label),
      ),
    );
  };
  const slotWeapon = (l: Loadout, slot: 1 | 2 | 3): WeaponId | null => (slot === 1 ? l.sidearm : slot === 2 ? l.melee : l.primary);
  const withSlot = (l: Loadout, slot: 1 | 2 | 3, w: WeaponId | null): Loadout => (slot === 1 ? (w ? { ...l, sidearm: w } : l) : slot === 2 ? (w ? { ...l, melee: w } : l) : { ...l, primary: w });
  const inKit = (kind: 'weapon' | 'gadget', id: WeaponId | GadgetId) => {
    const l = loadout();
    return kind === 'weapon' ? l.sidearm === id || l.melee === id || l.primary === id : l.gadget === id;
  };
  /** Puts an owned weapon into its slot (or equipment into slot 4) and shows it in the kit. */
  function takeItem(kind: 'weapon' | 'gadget', id: WeaponId | GadgetId) {
    const l = loadout();
    if (kind === 'gadget') {
      trying = { gadget: id as GadgetId };
      return save({ ...l, gadget: id as GadgetId }, t('{name} — now in your kit', { name: gadgetName(id as GadgetId) }));
    }
    const w = id as WeaponId;
    trying = { weapon: w, mods: [...(l.mods[w] ?? [])] };
    focus = w;
    save(withSlot(l, WEAPONS[w].slot as 1 | 2 | 3, w), t('{name} — now in your kit', { name: weaponName(w) }));
  }
  const dollBox = (d: Doll, w: WeaponId) =>
    h('div', { class: 'kitcard__doll' }, d.el, h('span', { class: 'dressing__label' }, t('In the game')), h('button', { class: 'kitcard__fire', 'data-testid': 'doll-fire', onclick: () => d.fire() }, WEAPONS[w].kind === 'melee' ? t('Swing!') : t('Fire!')));
  // v0.2.23: the phone's dressing room shows the fighter card first (the character with the weapon in its skin);
  // the label switches to the in-game view and back; a tap on the card opens it big (to share)
  let kitView: 'card' | 'doll' = 'card';
  let kitCard: FighterCard | null = null;
  const viewBox = (d: Doll, w: WeaponId, finish: FinishId | null): HTMLElement => {
    const showCard = kitView === 'card';
    const toggle = h(
      'button',
      { class: 'dressing__label kitcard__view', type: 'button', 'data-testid': 'kit-view', 'aria-label': showCard ? t('Show it in the game') : t('Show the fighter card'), onclick: () => ((kitView = showCard ? 'doll' : 'card'), sfx.play('click'), draw()) },
      showCard ? t('Fighter') : t('In the game'),
      h('i', { 'aria-hidden': 'true' }, ' ⇄'),
    );
    if (!showCard) return h('div', { class: 'kitcard__doll', 'data-view': 'doll' }, d.el, toggle, h('button', { class: 'kitcard__fire', 'data-testid': 'doll-fire', onclick: () => d.fire() }, WEAPONS[w].kind === 'melee' ? t('Swing!') : t('Fire!')));
    const data = { ...cardData(w, finish), level: null };
    if (kitCard) kitCard.set(data);
    else kitCard = new FighterCard(data, { shape: 'tall', width: 128, ratio: 1, className: 'kitcard__card' });
    return h('div', { class: 'kitcard__doll kitcard__doll--card', 'data-view': 'card' }, h('button', { class: 'kitcard__cardbtn', type: 'button', 'data-testid': 'card-open', 'aria-label': t('Fighter card'), onclick: () => openCard(w, finish) }, kitCard.el), toggle);
  };

  // ── «Экипировка»: the dressing room and the four slots ────────────────────
  const kitPhone = (): HTMLElement => {
    const l = loadout();
    const c = o.character;
    const ct = charText(c);
    const g = trying.gadget ?? null;
    const w: WeaponId = trying.weapon ?? startWeapon();
    const def = WEAPONS[w];
    const mods = trying.weapon ? (trying.mods ?? []) : (l.mods[w] ?? []);
    const finish = trying.weapon && trying.finish !== undefined ? trying.finish : worn(w);
    const d = phoneDoll();
    d.set(c, w, applyMods(def, mods).laser === true, finish);
    d.wake();
    const fit = modsFor(def);
    const card = h(
      'div',
      { class: 'panel kitcard', 'data-testid': 'kit-card' },
      h('span', { class: 'tag' }, t('Dressing room')),
      g ? dollBox(d, w) : viewBox(d, w, finish),
      h(
        'div',
        { class: 'kitcard__info' },
        h('button', { class: 'kitcard__who', title: t('Change character'), 'data-testid': 'kit-character', onclick: () => o.onCharacter?.(c) }, portrait(c, true), h('span', { class: 'kitcard__whotxt' }, h('b', null, ct.name), h('small', null, `«${ct.nickname}»`)), h('i', { 'aria-hidden': 'true' }, '›')),
        h('div', { class: 'kitcard__name', 'data-testid': 'dressing-name' }, g ? gadgetName(g) : weaponName(w)),
        g
          ? h('div', { class: 'kitcard__meta' }, `${slotLabel(4)} · ${gadgetFacts(g)[0]}`)
          : h('div', { class: 'kitcard__meta' }, `${slotLabel(def.slot as 1 | 2 | 3)} · ${t('Skin')}: ${finish ? finishName(finish) : t('Standard')}`),
        !g && fit.length ? h('div', { class: 'kitcard__meta' }, `${t('Modifications')}: ${mods.length ? mods.map((m) => modText(m).name).join(', ') : '—'}`) : null,
        h('button', { class: 'btn btn--small btn--red kitcard__try', onclick: () => o.onTry(trying, tab) }, t('Test in practice')),
      ),
      g
        ? null
        : h(
            'div',
            { class: 'kitcard__acts' },
            h(
              'button',
              { class: 'btn btn--small btn--skins', 'data-testid': 'kit-skins', onclick: () => openSkins(w) },
              h('i', { 'aria-hidden': 'true' }, '✦'),
              h('span', null, t('Skins')),
              h('small', { class: 'btn--skins__n' }, `${byGrade(finishesFor(w)).filter((f) => ownsSkin(w, f)).length}/${finishesFor(w).length}`),
            ),
            h('button', { class: 'btn btn--small', 'data-testid': 'kit-mods', onclick: () => openMods(w) }, fit.length ? t('Modifications') : t('Stats')),
          ),
    );
    const slots = h('div', { class: 'panel kitslots', 'data-testid': 'kit-slots' }, h('span', { class: 'tag' }, t('Kit')), ...([1, 2, 3, 4] as const).map((s) => slotRow(s, l)));
    // v0.2.22 (the owner): the skins' banner in the room the phone leaves under the kit — in the page's language,
    // a tap opens the skins of the weapon in the dressing room (the primary when the equipment is shown). It
    // takes only the room that is left: shrinks with it, gone when there is too little (CSS); not in the demo
    const skinsFor: WeaponId = g ? (l.primary ?? l.sidearm) : w;
    const promo = online
      ? h(
          'div',
          { class: 'kitpromo' },
          h(
            'button',
            { class: 'kitpromo__btn', type: 'button', 'data-testid': 'skins-banner', 'aria-label': t('Make your weapon unique — skins'), onclick: () => (sfx.play('click'), openSkins(skinsFor)) },
            h('img', { class: 'kitpromo__img', src: asset(`assets/ui/skins_banner_${getLang() === 'ru' ? 'ru' : 'en'}.jpg`), alt: t('Make your weapon unique — skins'), width: '1290', height: '430', loading: 'lazy', draggable: 'false' }),
          ),
        )
      : null;
    return h('div', { class: 'kit' }, card, slots, promo);
  };
  const slotRow = (slot: 1 | 2 | 3 | 4, l: Loadout): HTMLElement => {
    const cur = slot === 4 ? l.gadget : slotWeapon(l, slot);
    const on = cur !== null && (slot === 4 ? trying.gadget === cur : !trying.gadget && trying.weapon === cur);
    const pic = cur === null ? h('span', { class: 'none' }, '—') : slot === 4 ? gadgetImg(cur as GadgetId, 'small') : weaponImg(cur as WeaponId, 'small', worn(cur as WeaponId));
    const name = cur === null ? (slot === 3 ? t('Sidearm only') : t('No equipment')) : slot === 4 ? gadgetName(cur as GadgetId) : weaponName(cur as WeaponId);
    const show = () => {
      if (cur === null) return openSlot(slot);
      trying = slot === 4 ? { gadget: cur as GadgetId } : { weapon: cur as WeaponId, mods: [...(l.mods[cur as WeaponId] ?? [])] };
      if (slot !== 4) focus = cur as WeaponId;
      sfx.play('click');
      draw();
    };
    return h(
      'div',
      { class: `kitslot ${on ? 'on' : ''}`, 'data-slot': String(slot) },
      h('button', { class: 'kitslot__main', 'aria-pressed': String(on), onclick: show }, h('span', { class: 'kitslot__pic' }, pic), h('span', { class: 'kitslot__txt' }, h('b', null, name), h('small', null, `${slot} · ${slotLabel(slot)}`))),
      h('button', { class: 'btn btn--small kitslot__change', 'data-testid': `slot-change-${slot}`, onclick: () => openSlot(slot) }, t('Change')),
    );
  };
  /** A slot's sheet: the player's own items for it; the shop is one button away. */
  const openSlot = (slot: 1 | 2 | 3 | 4) => openPhoneSheet(`${slot} · ${slotLabel(slot)}`, 'slot-sheet', () => slotPicker(slot));
  const slotPicker = (slot: 1 | 2 | 3 | 4): HTMLElement => {
    const l = loadout();
    const option = (pic: HTMLElement, name: string, on: boolean, pick: () => void, id: string) =>
      h('button', { class: `wbtn slotopt ${on ? 'on' : ''}`, 'aria-pressed': String(on), 'data-opt': id, onclick: pick }, pic, h('span', null, name));
    const none = () => h('span', { class: 'none' }, '—');
    let opts: HTMLElement[];
    let more: number;
    if (slot === 4) {
      opts = [...GADGET_IDS.filter(ownedGadget), null].map((g) =>
        option(
          g ? gadgetImg(g, 'small') : none(),
          g ? gadgetName(g) : t('No equipment'),
          g === l.gadget,
          () => {
            trying = g ? { gadget: g } : { weapon: startWeapon(), mods: [...(l.mods[startWeapon()] ?? [])] };
            closeSheet();
            if (g === l.gadget) return draw();
            save({ ...l, gadget: g }, g ? t('{name} — now in your kit', { name: gadgetName(g) }) : undefined);
          },
          g ?? 'none',
        ),
      );
      more = GADGET_IDS.filter((g) => !ownedGadget(g)).length;
    } else {
      const list = slot === 1 ? SIDEARMS : slot === 2 ? MELEE_WEAPONS : PRIMARY_WEAPONS;
      const cur = slotWeapon(l, slot);
      opts = [...list.filter(owned), ...(slot === 3 ? [null] : [])].map((w) =>
        option(
          w ? weaponImg(w, 'small', worn(w)) : none(),
          w ? weaponName(w) : t('Sidearm only'),
          w === cur,
          () => {
            const shown = w ?? l.sidearm;
            trying = { weapon: shown, mods: [...(l.mods[shown] ?? [])] };
            focus = shown;
            closeSheet();
            if (w === cur) return draw();
            save(withSlot(l, slot, w));
          },
          w ?? 'none',
        ),
      );
      more = list.filter((w) => !owned(w) && WEAPONS[w].tier !== 'rare').length;
    }
    return h(
      'div',
      { class: 'col slotsheet' },
      h('div', { class: 'slotsheet__list' }, ...opts),
      more > 0
        ? h(
            'button',
            {
              class: 'btn btn--small btn--ghost',
              'data-testid': 'slot-shop',
              onclick: () => {
                if (slot !== 4) shopSlot = slot;
                go(slot === 4 ? 'gear' : 'weapons');
              },
            },
            t('{n} more in the shop →', { n: more }),
          )
        : null,
    );
  };
  const openSkins = (w: WeaponId) =>
    openPhoneSheet(
      `${t('Skins')} · ${weaponName(w)}`,
      'skin-sheet',
      () => {
        const finish = trying.weapon === w && trying.finish !== undefined ? trying.finish : worn(w);
        return h(
          'div',
          { class: 'col skinsheet' },
          h('div', { class: `wpic skinsheet__pic${finish ? ` skinsheet__pic--${FINISHES[finish].rarity}` : ''}` }, weaponImg(w, 'big', finish), finish ? h('span', { class: 'skinsheet__name' }, gradeTag(FINISHES[finish].rarity), finishName(finish)) : null),
          skinRow(w, finish, 'sheet'),
        );
      },
      null,
      () => {
        // a skin that isn't the player's was only tried on: the kit shows what the weapon really wears
        if (trying.weapon === w && trying.finish && !ownsSkin(w, trying.finish)) {
          trying = { weapon: w, mods: [...(trying.mods ?? [])] };
          draw();
        }
      },
    );
  const openMods = (w: WeaponId) =>
    openPhoneSheet(modsFor(WEAPONS[w]).length ? `${t('Modifications')} · ${weaponName(w)}` : weaponName(w), 'mods-sheet', () => {
      const l = loadout();
      const panel = modsFor(WEAPONS[w]).length ? modsPanel(w, l) : null;
      panel?.classList.add('panel--insheet');
      return h('div', { class: 'col modsheet' }, panel, statBars(w, l.mods[w]));
    });

  // ── «Магазин»: compact grids, an item's card in a sheet ───────────────────
  const tierRank = (p: ShopPrice | undefined) => (p ? (p.currency === 'tokens' ? 1 : 2) : 0);
  const shopOrder = (a: ShopPrice | undefined, b: ShopPrice | undefined) => tierRank(a) - tierRank(b) || (a?.level ?? 0) - (b?.level ?? 0) || (a?.amount ?? 0) - (b?.amount ?? 0);
  const priceTag = (price: ShopPrice) => {
    const lockedByLevel = !!inv && inv.level < price.level;
    return h('span', { class: `wbtn__price ${price.currency}` }, cur(price.currency), String(price.amount), lockedByLevel ? h('small', null, ` · ${t('LV {n}', { n: price.level })}`) : null);
  };
  const cell = (kind: 'weapon' | 'gadget', id: WeaponId | GadgetId): HTMLElement => {
    const price = kind === 'weapon' ? WEAPON_PRICES[id as WeaponId] : GADGET_PRICES[id as GadgetId];
    const mine = kind === 'weapon' ? owned(id as WeaponId) : ownedGadget(id as GadgetId);
    const note = mine ? h('span', { class: 'cell__own' }, inKit(kind, id) ? `✓ ${t('In your kit')}` : `✓ ${t('Yours')}`) : price ? priceTag(price) : h('span', { class: 'cell__own' }, t('Free'));
    const grade = kind === 'weapon' ? CASE_TABLE.find((e) => e.weapon === id)?.rarity : undefined;
    return h(
      'button',
      { class: `cell ${mine ? 'cell--mine' : ''} ${grade ? `cell--grade-${grade}` : ''}`, 'data-item': id, onclick: () => openItem(kind, id) },
      kind === 'weapon' ? weaponImg(id as WeaponId, 'small', mine ? worn(id as WeaponId) : null) : gadgetImg(id as GadgetId, 'small'),
      h('span', { class: 'cell__name' }, kind === 'weapon' ? weaponName(id as WeaponId) : gadgetName(id as GadgetId)),
      note,
    );
  };
  const weaponsPhone = (): HTMLElement => {
    const lists: Array<[1 | 2 | 3, string, readonly WeaponId[]]> = [
      [1, t('Sidearms'), SIDEARMS],
      [2, t('Melee'), MELEE_WEAPONS],
      [3, t('Primary'), PRIMARY_WEAPONS],
    ];
    // the case-only weapons live in «Cases»
    const forSale = (list: readonly WeaponId[]) => list.filter((w) => WEAPONS[w].tier !== 'rare').sort((a, b) => shopOrder(WEAPON_PRICES[a], WEAPON_PRICES[b]));
    const shown = forSale(lists.find(([s]) => s === shopSlot)![2]);
    return h(
      'div',
      { class: 'shoptab' },
      h(
        'div',
        { class: 'seg arsseg', role: 'tablist' },
        ...lists.map(([s, label, list]) =>
          h(
            'button',
            {
              role: 'tab',
              'aria-pressed': String(s === shopSlot),
              'data-slot': String(s),
              onclick: () => {
                if (s === shopSlot) return;
                shopSlot = s;
                sfx.play('click');
                draw();
              },
            },
            label,
            h('small', null, String(forSale(list).length)),
          ),
        ),
      ),
      h('div', { class: 'shopgrid', 'data-testid': 'shop-weapons' }, ...shown.map((w) => cell('weapon', w))),
      h('div', { class: 'muted arsnote' }, t('Shop weapons are no stronger than the free ones — just different.')),
    );
  };
  const gearPhone = (): HTMLElement =>
    h(
      'div',
      { class: 'shoptab' },
      h('div', { class: 'shopgrid', 'data-testid': 'shop-gear' }, ...[...GADGET_IDS].sort((a, b) => shopOrder(GADGET_PRICES[a], GADGET_PRICES[b])).map((g) => cell('gadget', g))),
      h('div', { class: 'muted arsnote' }, t('The fourth slot: one kind at a time, the charges refill at every spawn.')),
    );
  const charsPhone = (): HTMLElement =>
    h(
      'div',
      { class: 'shoptab' },
      gradePrices(),
      bundlesGroup(124, true),
      h('div', { class: 'charshop', 'data-testid': 'shop-characters' }, ...shopCharacters().map(charCell)),
      h('div', { class: 'muted arsnote' }, t('Everyone has the same stats — only the looks and the story differ.')),
    );
  const casePhone = (): HTMLElement => {
    const enabled = cfg?.casesEnabled !== false;
    const left = caseOdds(new Set(inv?.weapons ?? [])).filter((e) => e.odds > 0).length;
    const skinTotal = caseSkinTotal();
    const skinsOwned = caseSkinsOwned(inv?.skins ?? []).size;
    const state = (done: boolean, open: HTMLElement) => (!enabled ? h('span', { class: 'badge badge--off' }, t('Cases are disabled on this server')) : done ? h('span', { class: 'badge badge--ok' }, t('Collection complete!')) : open);
    const card = (o2: { testid: string; tag: string; crate: string; title: string; price: ShopPrice; text: string; extra: HTMLElement | null; done: boolean; open: () => void; openId: string; odds: () => HTMLElement; oddsTitle: string; oddsId: string }) =>
      h(
        'div',
        { class: 'panel casecard', 'data-testid': o2.testid },
        h('span', { class: 'tag' }, o2.tag),
        h('div', { class: 'casecard__row' }, h('div', { class: `crate ${o2.crate}` }), h('div', { class: 'col casecard__txt' }, h('b', null, `${o2.title} · `, amount(o2.price.amount, o2.price.currency)), h('span', { class: 'muted' }, o2.text), o2.extra)),
        h(
          'div',
          { class: 'casecard__acts' },
          state(o2.done, openBtn(o2.price, o2.open, o2.openId)),
          h(
            'button',
            {
              class: 'btn btn--small',
              'data-testid': o2.oddsId,
              onclick: () =>
                openPhoneSheet(o2.oddsTitle, 'odds-sheet', () => {
                  const p = o2.odds();
                  p.classList.add('panel--insheet');
                  return p;
                }),
            },
            t('Odds'),
          ),
        ),
      );
    return h(
      'div',
      { class: 'col arscases' },
      card({
        testid: 'weapon-case',
        tag: t('The Defitsit Case'),
        crate: '',
        title: t('Rare weapon'),
        price: CASE_PRICE,
        text: t('One of 10 rare guns. No repeats: the odds of the rest are recalculated.'),
        extra: null,
        done: left === 0,
        open: openWeaponCase,
        openId: 'open-weapon-case',
        odds: caseOddsPanel,
        oddsTitle: t('Odds'),
        oddsId: 'case-odds-open',
      }),
      card({
        testid: 'skin-case',
        tag: t('The Skin Case'),
        crate: 'crate--skins',
        title: t('Weapon skin'),
        price: SKIN_CASE_PRICE,
        text: t('Only the look changes, never the numbers. No repeats.'),
        extra: online ? h('span', { class: 'muted', 'data-testid': 'skins-owned' }, t('Your skins: {n} of {total}', { n: skinsOwned, total: skinTotal })) : null,
        done: skinsOwned >= skinTotal,
        open: openSkinCase,
        openId: 'open-skin-case',
        odds: skinOddsPanel,
        oddsTitle: t('Skin odds'),
        oddsId: 'skin-odds-open',
      }),
      card({
        testid: 'char-case',
        tag: t('The Crew Case'),
        crate: 'crate--chars',
        title: t('Character'),
        price: CHARACTER_CASE_PRICE,
        text: t('A character for BLATS you don’t have. Same stats for all. No repeats.'),
        extra: online ? h('span', { class: 'muted', 'data-testid': 'chars-owned' }, t('Your characters: {n} of {total}', { n: charsOwnedFromCase(), total: CASE_CHARACTERS.length })) : null,
        done: charsOwnedFromCase() >= CASE_CHARACTERS.length,
        open: openCharacterCase,
        openId: 'open-char-case',
        odds: charOddsPanel,
        oddsTitle: t('Character odds'),
        oddsId: 'char-odds-open',
      }),
      h('div', { class: 'muted arsnote' }, caseNote()),
    );
  };
  const diamondsPhone = (): HTMLElement => {
    if (!online) return h('div', { class: 'panel' }, t('Buying BLATS works in the online version of the game.'));
    const methods = o.inTelegram ? [] : payMethods();
    const stars = starsPrices();
    return h(
      'div',
      { class: 'col arsdiamonds', 'data-testid': 'blats-tab' },
      h('div', { class: 'muted arsnote' }, blatsIntro()),
      o.inTelegram
        ? stars
          ? h('span', { class: 'muted arsnote', 'data-testid': 'pay-stars' }, t('Paid with Telegram Stars in Telegram’s own window.'), ' ', termsLink())
          : h('span', { class: 'badge', style: 'align-self:flex-start', 'data-testid': 'pay-soon' }, t('Buying BLATS inside Telegram is coming soon (via Telegram Stars).'))
        : methods.length === 0
          ? h('span', { class: 'badge', style: 'align-self:flex-start', 'data-testid': 'pay-soon' }, t('Payments are being connected — coming soon'))
          : null,
      h(
        'div',
        { class: 'packrows' },
        ...(cfg?.packs ?? []).map((p) => {
          const hint = packHint(p.diamonds);
          return h(
            'div',
            { class: 'packrow', 'data-pack': p.id },
            h('b', { class: 'packrow__amt' }, amount(p.diamonds, 'diamonds')),
            h('span', { class: 'packrow__mid' }, h('span', { class: 'packrow__usd' }, stars?.[p.id] ? `⭐ ${fmtNum(stars[p.id]!)}` : usd(p.usdCents)), hint ? h('small', { class: 'packrow__hint' }, hint) : null),
            ...(stars?.[p.id] ? [starsButton(p.id, stars[p.id]!)] : methods.length ? methods.map(([m, label]) => h('button', { class: 'btn btn--small btn--red', onclick: () => buyPack(p.id, m) }, label)) : [h('button', { class: 'btn btn--small', disabled: true }, t('Soon'))]),
          );
        }),
      ),
      promoPaid(),
      h('div', { class: 'muted arsnote' }, t('Purchases belong to your account. To keep them when you change devices, link an email in your profile.'), ' ', !o.inTelegram && methods.length ? termsLink() : null),
    );
  };
  /** An item's card: the in-game view (weapons), what it does, and buy / take / test. */
  const openItem = (kind: 'weapon' | 'gadget', id: WeaponId | GadgetId) =>
    openPhoneSheet(kind === 'weapon' ? weaponName(id as WeaponId) : gadgetName(id as GadgetId), 'item-sheet', () => (kind === 'weapon' ? weaponSheet(id as WeaponId) : gadgetSheet(id as GadgetId)), () => itemActions(kind, id));
  const statusBadge = (mine: boolean, price: ShopPrice | undefined, rare: boolean) =>
    mine ? h('span', { class: 'badge badge--ok' }, t('Yours')) : price ? h('span', { class: 'badge' }, priceLabel(price)) : h('span', { class: 'badge' }, rare ? t('Case only') : t('Free'));
  /** A case weapon's grade label (the rare-weapon case: rare / epic / legendary). */
  const caseGrade = (w: WeaponId): HTMLElement | null => {
    const e = CASE_TABLE.find((x) => x.weapon === w);
    return e ? gradeTag(e.rarity) : null;
  };
  const weaponSheet = (w: WeaponId): HTMLElement => {
    const def = WEAPONS[w];
    const mine = owned(w);
    const d = phoneDoll();
    d.set(o.character, w, def.laser === true, mine ? worn(w) : null);
    d.wake();
    const fit = modsFor(def);
    return h(
      'div',
      { class: 'col itemsheet' },
      h(
        'div',
        { class: 'itemsheet__top' },
        dollBox(d, w),
        h('div', { class: 'col itemsheet__txt' }, h('div', { class: 'row itemsheet__tags' }, h('span', { class: 'chiplabel' }, slotLabel(def.slot as 1 | 2 | 3)), caseGrade(w), statusBadge(mine, WEAPON_PRICES[w], def.tier === 'rare')), h('div', { class: 'muted itemsheet__blurb' }, weaponBlurb(w))),
      ),
      statBars(w),
      fit.length ? h('div', { class: 'modfit' }, t('Modifications:'), ...fit.map((m) => h('span', { class: 'chip', title: `${modText(m).name}: ${modText(m).plus}; ${modText(m).minus}` }, modImg(m, 'small'), modText(m).name))) : null,
    );
  };
  const gadgetSheet = (g: GadgetId): HTMLElement => {
    const def = GADGETS[g];
    return h(
      'div',
      { class: 'col itemsheet' },
      h('div', { class: 'row itemsheet__tags' }, h('span', { class: 'chiplabel' }, def.use === 'throw' ? t('Throw') : def.use === 'place' ? t('Place') : t('Deploy')), statusBadge(ownedGadget(g), GADGET_PRICES[g], false)),
      h('div', { class: 'wpic' }, gadgetImg(g)),
      h('div', { class: 'muted itemsheet__blurb' }, gadgetBlurb(g)),
      h('ul', { class: 'facts' }, ...gadgetFacts(g).map((f) => h('li', null, f))),
    );
  };
  const itemActions = (kind: 'weapon' | 'gadget', id: WeaponId | GadgetId): HTMLElement => {
    const price = kind === 'weapon' ? WEAPON_PRICES[id as WeaponId] : GADGET_PRICES[id as GadgetId];
    const mine = kind === 'weapon' ? owned(id as WeaponId) : ownedGadget(id as GadgetId);
    const acts: HTMLElement[] = [];
    if (!mine && price) acts.push(buyButton(kind, id, price, true));
    else if (!mine && kind === 'weapon' && WEAPONS[id as WeaponId].tier === 'rare') acts.push(h('button', { class: 'btn btn--small btn--red', onclick: () => go('case') }, t('To the case')));
    else if (mine && inKit(kind, id)) acts.push(h('span', { class: 'badge badge--ok' }, t('In your kit')));
    else if (mine)
      acts.push(
        h(
          'button',
          {
            class: 'btn btn--small btn--red',
            'data-testid': 'item-take',
            onclick: () => {
              // into the kit — and the kit comes into view
              closeSheet();
              tab = 'loadout';
              takeItem(kind, id);
              draw();
            },
          },
          t('Take'),
        ),
      );
    acts.push(
      h(
        'button',
        {
          class: 'btn btn--small',
          onclick: () => {
            closeSheet();
            o.onTry(kind === 'weapon' ? { weapon: id as WeaponId } : { gadget: id as GadgetId }, tab);
          },
        },
        t('Test in practice'),
      ),
    );
    return h('div', { class: 'itemacts' }, ...acts);
  };
  /** A character's card: the art, who they are, and buy / the personal file. */
  const openChar = (c: CharacterId) =>
    openPhoneSheet(
      charText(c).name,
      'char-sheet',
      () => {
        const d = charText(c);
        const mine = inv ? inv.characters.includes(c) : false;
        return h(
          'div',
          { class: 'charsheet' },
          heroImg(c, 'charsheet__hero'),
          h('div', { class: 'col charsheet__txt' }, h('div', { class: 'nick' }, `«${d.nickname}»`), h('div', { class: 'muted' }, `${d.species} · ${d.role}`), h('div', { class: 'row charsheet__tags' }, gradeTag(CHARACTERS[c].grade), statusBadge(mine, CHARACTER_PRICES[c], false)), h('div', { class: 'quote' }, `«${d.quote}»`)),
          h('div', { class: 'lore charsheet__lore' }, d.lore),
        );
      },
      () => {
        const price = CHARACTER_PRICES[c];
        const mine = !price || (inv ? inv.characters.includes(c) : false);
        return h(
          'div',
          { class: 'itemacts' },
          price ? buyButton('character', c, price, true) : null,
          // v0.2.23: the set — with their legendary skin, cheaper than the two apart
          (() => {
            const b = bundleOf(c);
            if (!b || (inv && bundleRefusal(inv, c) === 'owned')) return null;
            return h('div', { class: 'bundleoffer', 'data-testid': 'char-sheet-bundle' }, h('span', { class: 'muted' }, t('With the «{skin}» skin', { skin: finishName(b.finish) })), bundleButton(b));
          })(),
          // v0.2.18 (the owner): try a locked character in practice — and come back here, not to the menu
          !mine && o.onTryCharacter
            ? h(
                'button',
                {
                  class: 'btn btn--small',
                  'data-testid': 'char-sheet-try',
                  onclick: () => {
                    closeSheet();
                    o.onTryCharacter!(c, tab);
                  },
                },
                t('Try in practice'),
              )
            : null,
          o.onCharacter
            ? h(
                'button',
                {
                  class: 'btn btn--small',
                  onclick: () => {
                    closeSheet();
                    o.onCharacter!(c);
                  },
                },
                t('Dossier'),
              )
            : null,
        );
      },
    );
  const drawPhone = () => {
    drawWallet();
    drawPhoneTabs();
    body.replaceChildren(tab === 'loadout' ? kitPhone() : tab === 'weapons' ? weaponsPhone() : tab === 'gear' ? gearPhone() : tab === 'characters' ? charsPhone() : tab === 'case' ? casePhone() : diamondsPhone());
    if (reveal && !psheet)
      openPhoneSheet(reveal.kind === 'weapon' ? t('From the case') : reveal.kind === 'character' ? t('From the character case') : t('From the skin case'), 'reveal-sheet', () => {
        if (!reveal) return h('div');
        const p = revealPanel(reveal);
        p.classList.add('panel--insheet');
        return p;
      }, null, () => {
        reveal = null;
      });
    else refreshSheet();
  };
  const onMedia = () => {
    if (!root.isConnected) return phoneQuery?.removeEventListener?.('change', onMedia);
    if (phone === !!phoneQuery?.matches) return;
    phone = !!phoneQuery?.matches;
    closeSheet();
    layout();
    draw();
  };
  phoneQuery?.addEventListener?.('change', onMedia);

  const draw = () => {
    if (phone) return drawPhone();
    drawRoom();
    drawWallet();
    drawTabs();
    const content = tab === 'loadout' ? loadoutTab() : tab === 'weapons' ? weaponsTab() : tab === 'gear' ? gearTab() : tab === 'characters' ? charactersTab() : tab === 'case' ? caseTab() : diamondsTab();
    body.replaceChildren(content);
    // a sheet open over the Arsenal (the skins' dialog) shows the new state too
    refreshSheet();
  };

  draw();
  if (online) {
    void online
      .loadInventory()
      .then((i) => {
        const first = !inv;
        inv = i;
        if (first) trying = o.initialTry ? { ...o.initialTry, mods: [...(loadout().mods[o.initialTry.weapon ?? startWeapon()] ?? [])] } : { weapon: startWeapon(), mods: [...(loadout().mods[startWeapon()] ?? [])] };
        draw();
      })
      .catch((e: unknown) => toast(`${t('Arsenal')}: ${apiErrorText(e)}`));
    void online.api
      .shopConfig()
      .then((c) => {
        cfg = c;
        draw();
      })
      .catch(() => {});
  }
  return root;
}

/** Name + price line of a locked character (character screen). */
export function characterPriceNote(c: CharacterId, inv: Inventory | null): string | null {
  const p = CHARACTER_PRICES[c];
  if (!p) return null;
  if (inv?.characters.includes(c)) return null;
  return p.currency === 'tokens'
    ? t('Unlocks at level {lvl} for {n} {talons}', { lvl: p.level, n: p.amount, talons: tokenWord(p.amount) })
    : t('For {n} BLATS ({usd})', { n: p.amount, usd: usd(p.amount) });
}

/** Skins the skin case can give: every weapon in every finish on sale (never a free, gifted or retired one). */
function caseSkinTotal(): number {
  return SKINNABLE_WEAPONS.length * CASE_FINISHES.length;
}

/** The player's skins the case could have given (the gift and the retired ones don't count). */
function caseSkinsOwned(skins: readonly string[]): Set<string> {
  return new Set(skins.filter((id) => { const p = parseSkin(id); return !!p && CASE_FINISHES.includes(p.finish); }));
}
