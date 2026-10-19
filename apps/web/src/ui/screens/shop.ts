/**
 * The Arsenal: the dressing room (the character's art with the item being tried on and the same
 * character as it looks in a match), the loadout (weapons, equipment, modifications), the weapon /
 * equipment / character shop, the rare-weapon case and diamond packs. Prices and rules are the
 * shared ones; every purchase is decided by the server. In the demo build (no server) the catalog is
 * read-only, but anything can be tried on — in the dressing room and in practice.
 */
import {
  CASE_PRICE,
  CASE_TABLE,
  CHARACTER_PRICES,
  DIAMONDS_PER_USD,
  FREE_GADGETS,
  FREE_WEAPONS,
  GADGETS,
  GADGET_IDS,
  GADGET_PRICES,
  MELEE_WEAPONS,
  MODS,
  MOD_PRICES,
  PRIMARY_WEAPONS,
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
} from '@blatkom/shared';
import type { CharacterId, GadgetId, Inventory, Loadout, ModId, ModMount, Rarity, ShopConfig, ShopKind, ShopPrice, WeaponDef, WeaponId } from '@blatkom/shared';
import type * as Phaser from 'phaser';
import { h, toast, asset, portrait } from '../dom.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { apiErrorText } from '../../net/errors.js';
import { sfx } from '../../game/audio/Sfx.js';
import { haptic } from '../../telegram/tg.js';
import { t, plural, count, num } from '../../i18n/index.js';
import { charText, gadgetBlurb, gadgetName, modText, rarityLabel, refusalText, weaponBlurb, weaponName } from '../../i18n/content.js';
import { Doll } from '../doll.js';

export type ArsenalTab = 'loadout' | 'weapons' | 'gear' | 'characters' | 'case' | 'diamonds';

/** What to try on: a weapon (optionally with modifications) and/or equipment. */
export interface TryOn {
  weapon?: WeaponId;
  mods?: ModId[];
  gadget?: GadgetId;
}

export interface ArsenalOptions {
  online: OnlineClient | null;
  inTelegram: boolean;
  tab?: ArsenalTab;
  /** The character in the dressing room (the one the player picked). */
  character: CharacterId;
  /** Phaser's loaded textures: the dressing room draws the in-game sprites from them. */
  textures: Phaser.Textures.TextureManager | null;
  /** Start a practice match with this in hand («опробовать в тире»). */
  onTry: (t: TryOn) => void;
  /** Wallet changed (menu tile refresh). */
  onWallet?: () => void;
  /** Show this character in the character screen. */
  onCharacter?: (c: CharacterId) => void;
}

const slotLabel = (slot: 1 | 2 | 3 | 4) => (slot === 1 ? t('Sidearm') : slot === 2 ? t('Melee') : slot === 3 ? t('Primary') : t('Equipment'));
const mountLabel = (m: ModMount) => (m === 'muzzle' ? t('Muzzle') : m === 'optic' ? t('Sight') : m === 'rail' ? t('Rail') : t('Magazine'));

export const tokenWord = (n: number) => plural(n, 'talon');
export const diamondWord = (n: number) => plural(n, 'diamond');

/** Currency icon (CSS-drawn: a brass token or a blue diamond) — no emoji font needed. */
export function cur(c: 'tokens' | 'diamonds'): HTMLElement {
  return h('i', { class: `cur cur--${c}`, 'aria-label': c === 'tokens' ? t('talons') : t('diamonds') });
}

export function amount(n: number, c: 'tokens' | 'diamonds'): HTMLElement {
  return h('span', { class: 'amt' }, cur(c), String(n));
}

const usd = (diamonds: number) => `$${(diamonds / DIAMONDS_PER_USD).toFixed(2)}`;

export function priceLabel(p: ShopPrice): HTMLElement {
  if (p.currency === 'tokens') return h('span', { class: 'amt' }, cur('tokens'), String(p.amount), p.level > 1 ? ` · ${t('from LV {n}', { n: p.level })}` : '');
  return h('span', { class: 'amt' }, cur('diamonds'), String(p.amount), h('small', null, ` ${usd(p.amount)}`));
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

export function weaponImg(w: WeaponId, size: IconSize = 'big'): HTMLImageElement {
  return icon('weapon', w, size, `wimg wimg--${size}`);
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
  let tab: ArsenalTab = o.tab ?? 'loadout';
  let inv: Inventory | null = o.online?.inventory ?? null;
  let cfg: ShopConfig | null = null;
  let busy = false;
  const online = o.online;
  const root = h('div', { class: 'col arsenal' });
  const roomEl = h('div', { class: 'panel dressing', 'data-testid': 'dressing-room' });
  const walletEl = h('div', { class: 'wallet' });
  const tabsEl = h('div', { class: 'seg tabs', role: 'tablist' });
  const body = h('div', { class: 'col' });
  root.append(roomEl, walletEl, tabsEl, body);

  const owned = (w: WeaponId) => (inv ? inv.weapons.includes(w) : FREE_WEAPONS.includes(w));
  const ownedGadget = (g: GadgetId) => (inv ? inv.gadgets.includes(g) : FREE_GADGETS.includes(g));
  const loadout = (): Loadout => inv?.loadout ?? { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', gadget: 'f1', mods: {} };
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
    if (!online || !inv) return;
    void act(() => online.setLoadout(next), ok);
  };

  // ── dressing room: the character's art, the item tried on, the in-game look ─────────────
  const startWeapon = (): WeaponId => loadout().primary ?? loadout().sidearm;
  let trying: TryOn = { weapon: startWeapon(), mods: [...(loadout().mods[startWeapon()] ?? [])] };
  const doll = new Doll(o.textures, o.character, trying.weapon ?? 'pistol', 216);
  // the art and the item image stay the same elements between redraws (no flicker)
  const heroEl = heroImg(o.character, 'dressing__hero');
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
    doll.set(c, w, applyMods(WEAPONS[w], mods).laser === true);
    const g = trying.gadget;
    const itemImg = g ? itemEl(`g:${g}`, () => gadgetImg(g)) : itemEl(`w:${w}`, () => weaponImg(w));
    const name = g ? gadgetName(g) : weaponName(w);
    const tagText = g ? slotLabel(4) : slotLabel(WEAPONS[w].slot as 1 | 2 | 3);
    const isOwned = g ? ownedGadget(g) : owned(w);
    const price = g ? GADGET_PRICES[g] : WEAPON_PRICES[w];
    const status = isOwned
      ? h('span', { class: 'badge badge--ok' }, t('Yours'))
      : price
        ? h('span', { class: 'badge' }, priceLabel(price))
        : h('span', { class: 'badge' }, WEAPONS[w].tier === 'rare' ? t('Case only') : t('Free'));
    roomEl.replaceChildren(
      h('span', { class: 'tag' }, t('Dressing room')),
      h(
        'div',
        { class: 'dressing__grid' },
        h(
          'div',
          { class: 'dressing__poster', role: 'button', tabindex: '0', title: t('Change character'), onclick: () => o.onCharacter?.(c), onkeydown: (e: Event) => (e as KeyboardEvent).key === 'Enter' && o.onCharacter?.(c) },
          heroEl,
          itemImg,
          h('div', { class: 'dressing__plate' }, h('b', null, ct.name), h('span', null, `«${ct.nickname}»`)),
        ),
        h(
          'div',
          { class: 'dressing__info col' },
          h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'chiplabel' }, tagText), status),
          h('div', { class: 'h2 dressing__name', 'data-testid': 'dressing-name' }, name),
          h('div', { class: 'muted' }, g ? gadgetBlurb(g) : weaponBlurb(w)),
          !g && mods.length ? h('div', { class: 'modfit' }, t('With:'), ...mods.map((m) => h('span', { class: 'chip' }, modImg(m, 'small'), modText(m).name))) : null,
          h(
            'div',
            { class: 'dressing__game' },
            h('div', { class: 'dressing__doll' }, doll.el, h('span', { class: 'dressing__label' }, t('In the game'))),
            h(
              'div',
              { class: 'col', style: 'gap:8px' },
              h('button', { class: 'btn btn--small', 'data-testid': 'doll-fire', onclick: () => doll.fire() }, WEAPONS[w].kind === 'melee' ? t('Swing!') : t('Fire!')),
              h('button', { class: 'btn btn--small btn--red', onclick: () => o.onTry(trying) }, t('Test in practice')),
              h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onCharacter?.(c) }, t('Change character')),
            ),
          ),
        ),
      ),
    );
  };
  /** «Примерить»: put it on in the dressing room and bring the dressing room into view. */
  const tryOn = (next: TryOn) => {
    trying = next;
    drawRoom();
    sfx.play('pickup', { volume: 0.5 });
    haptic('select');
    roomEl.classList.remove('dressing--flash');
    void roomEl.offsetWidth;
    roomEl.classList.add('dressing--flash');
    roomEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const tryBtn = (next: TryOn) => h('button', { class: 'btn btn--small btn--ghost', 'data-try': next.gadget ?? next.weapon ?? '', onclick: () => tryOn(next) }, t('Try on'));

  const drawWallet = () => {
    if (!online) {
      walletEl.replaceChildren(h('div', { class: 'muted' }, t('Demo version: the catalogue is for browsing. Talons, diamonds and purchases work in the online version; anything can be tried on in the dressing room and in practice.')));
      return;
    }
    walletEl.replaceChildren(
      h('div', { class: 'coin', title: t('Talons — earned in online matches') }, cur('tokens'), h('b', null, inv ? String(inv.tokens) : '…'), h('span', null, t('talons'))),
      h('div', { class: 'coin', title: t('Diamonds — bought for money') }, cur('diamonds'), h('b', null, inv ? String(inv.diamonds) : '…'), h('span', null, t('diamonds'))),
      h('button', { class: 'btn btn--small', onclick: () => ((tab = 'diamonds'), draw()) }, t('Top up')),
    );
  };

  const drawTabs = () => {
    const tabs: Array<[ArsenalTab, string]> = [
      ['loadout', t('Kit')],
      ['weapons', t('Weapons')],
      ['gear', t('Equipment')],
      ['characters', t('Characters')],
      ['case', t('Case')],
      ['diamonds', t('Diamonds')],
    ];
    tabsEl.replaceChildren(...tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-pressed': String(tab === id), onclick: () => ((tab = id), sfx.play('click'), draw()) }, label)));
  };

  // ── loadout: four slots + modifications of the focused weapon ─────────
  let focus: WeaponId | null = null;
  const loadoutTab = (): HTMLElement => {
    const l = loadout();
    focus ??= l.primary ?? l.sidearm;
    const slots: Array<[1 | 2 | 3, WeaponId | null, readonly WeaponId[]]> = [
      [1, l.sidearm, SIDEARMS],
      [2, l.melee, MELEE_WEAPONS],
      [3, l.primary, PRIMARY_WEAPONS],
    ];
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
    const slotCards = slots.map(([slot, current, list]) => {
      const options = list.filter(owned);
      return h(
        'div',
        { class: 'panel col slotcard' },
        h('span', { class: 'tag' }, `${slot} · ${slotLabel(slot)}`),
        h(
          'div',
          { class: 'slotpick' },
          ...options.map((w) => h('button', { class: `wbtn ${w === current ? 'on' : ''} ${w === focus ? 'focus' : ''}`, 'aria-pressed': String(w === current), title: weaponName(w), onclick: () => (w === current ? ((focus = w), (trying = { weapon: w, mods: [...(l.mods[w] ?? [])] }), draw()) : pick(slot, w)) }, weaponImg(w, 'small'), h('span', null, weaponName(w)))),
          slot === 3 ? h('button', { class: `wbtn ${current === null ? 'on' : ''}`, 'aria-pressed': String(current === null), onclick: () => pick(3, null) }, h('span', { class: 'none' }, '—'), h('span', null, t('Sidearm only'))) : null,
        ),
        options.length < list.length ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((tab = 'weapons'), draw()) }, t('{n} more in the shop →', { n: list.length - options.length })) : null,
      );
    });
    const gadgetOptions = GADGET_IDS.filter(ownedGadget);
    const gadgetCard = h(
      'div',
      { class: 'panel col slotcard' },
      h('span', { class: 'tag' }, `4 · ${slotLabel(4)}`),
      h(
        'div',
        { class: 'slotpick' },
        ...gadgetOptions.map((g) => h('button', { class: `wbtn ${g === l.gadget ? 'on' : ''}`, 'aria-pressed': String(g === l.gadget), title: gadgetName(g), onclick: () => g !== l.gadget && save({ ...l, gadget: g }) }, gadgetImg(g, 'small'), h('span', null, gadgetName(g)))),
        h('button', { class: `wbtn ${l.gadget === null ? 'on' : ''}`, 'aria-pressed': String(l.gadget === null), onclick: () => l.gadget !== null && save({ ...l, gadget: null }) }, h('span', { class: 'none' }, '—'), h('span', null, t('No equipment'))),
      ),
      gadgetOptions.length < GADGET_IDS.length ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((tab = 'gear'), draw()) }, t('{n} more in the shop →', { n: GADGET_IDS.length - gadgetOptions.length })) : null,
    );
    const fw = focus && owned(focus) ? focus : (l.primary ?? l.sidearm);
    return h('div', { class: 'col' }, h('div', { class: 'slots' }, ...slotCards, gadgetCard), modsPanel(fw, l), statBars(fw, l.mods[fw]));
  };

  /** Modifications of one weapon: buy (talons), put on, take off, try on. */
  const modsPanel = (fw: WeaponId, l: Loadout): HTMLElement => {
    const fit = modsFor(WEAPONS[fw]);
    const equipped = l.mods[fw] ?? [];
    const head = h(
      'div',
      { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' },
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
  const buyButton = (kind: ShopKind, id: WeaponId | CharacterId | GadgetId, price: ShopPrice): HTMLElement => {
    if (!online || !inv) return h('button', { class: 'btn btn--small', disabled: true }, priceLabel(price));
    const r = buyRefusal(inv, kind, id);
    if (r === 'owned') return h('span', { class: 'badge badge--ok' }, t('Owned'));
    const label: HTMLElement | string = r === 'level' ? t('From level {n}', { n: price.level }) : priceLabel(price);
    return h(
      'button',
      {
        class: `btn btn--small ${r ? '' : 'btn--red'}`,
        disabled: r === 'level',
        onclick: () => {
          if (r === 'funds') {
            toast(price.currency === 'tokens' ? t('Not enough talons — you earn them in online matches') : t('Not enough diamonds'));
            if (price.currency === 'diamonds') ((tab = 'diamonds'), draw());
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

  const weaponCard = (w: WeaponId): HTMLElement => {
    const d = WEAPONS[w];
    const price = WEAPON_PRICES[w];
    const fit = modsFor(d);
    return h(
      'div',
      { class: `panel col wcard ${owned(w) ? 'owned' : ''}`, 'data-weapon': w },
      h('span', { class: 'tag' }, `${slotLabel(d.slot as 1 | 2 | 3)}${d.tier === 'rare' ? ` · ${t('from the case')}` : ''}`),
      h('div', { class: 'wpic' }, weaponImg(w)),
      h('div', { class: 'h2' }, weaponName(w)),
      h('div', { class: 'muted' }, weaponBlurb(w)),
      statBars(w),
      fit.length ? h('div', { class: 'modfit' }, t('Modifications:'), ...fit.map((m) => h('span', { class: 'chip', title: `${modText(m).name}: ${modText(m).plus}; ${modText(m).minus}` }, modImg(m, 'small'), modText(m).name))) : null,
      h(
        'div',
        { class: 'row' },
        price ? buyButton('weapon', w, price) : owned(w) ? h('span', { class: 'badge badge--ok' }, t('Owned')) : h('span', { class: 'badge' }, d.tier === 'rare' ? t('Case only') : t('Free')),
        tryBtn({ weapon: w }),
        owned(w) && online ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((focus = w), (tab = 'loadout'), draw()) }, t('Set up')) : null,
      ),
    );
  };

  const weaponsTab = (): HTMLElement => {
    const group = (title: string, note: string, list: readonly WeaponId[]) =>
      h('div', { class: 'col' }, h('div', { class: 'row' }, h('div', { class: 'h2' }, title), h('span', { class: 'muted' }, note)), h('div', { class: 'cards' }, ...list.map(weaponCard)));
    const tokenNoLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level <= 1);
    const tokenLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level > 1);
    const forDiamonds = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'diamonds');
    return h(
      'div',
      { class: 'col' },
      h('div', { class: 'muted' }, t('Paid weapons aren’t stronger than the free ones — just different, each with its own pluses and minuses. Try any of them on in the dressing room or test it in practice.')),
      group(t('Free'), t('everyone has these'), FREE_WEAPONS),
      group(t('For talons'), t('talons come with every online match'), tokenNoLevel),
      group(t('For talons, by level'), t('unlock as you rise through the ranks'), tokenLevel),
      group(t('For diamonds'), '$1.99 – $4.99', forDiamonds),
    );
  };

  // ── equipment (slot 4) ────────────────────────────────────────────────
  const gearTab = (): HTMLElement => {
    const l = loadout();
    return h(
      'div',
      { class: 'col' },
      h('div', { class: 'muted' }, t('Equipment is the fourth slot: grenades, mines, a C4 charge and the turret. You carry one kind; the charges are refilled every time you spawn. On a computer it’s the G key, on a phone a button of its own.')),
      h(
        'div',
        { class: 'cards' },
        ...GADGET_IDS.map((g) => {
          const d = GADGETS[g];
          const price = GADGET_PRICES[g];
          const mine = ownedGadget(g);
          const inSlot = l.gadget === g;
          return h(
            'div',
            { class: `panel col wcard ${mine ? 'owned' : ''}` },
            h('span', { class: 'tag' }, d.use === 'throw' ? t('Throw') : d.use === 'place' ? t('Place') : t('Deploy')),
            h('div', { class: 'wpic' }, gadgetImg(g)),
            h('div', { class: 'h2' }, gadgetName(g)),
            h('div', { class: 'muted' }, gadgetBlurb(g)),
            h('ul', { class: 'facts' }, ...gadgetFacts(g).map((f) => h('li', null, f))),
            h(
              'div',
              { class: 'row' },
              price ? buyButton('gadget', g, price) : h('span', { class: 'badge badge--ok' }, t('Free')),
              mine && online ? (inSlot ? h('span', { class: 'badge badge--ok' }, t('In your kit')) : h('button', { class: 'btn btn--small', onclick: () => save({ ...l, gadget: g }, t('{name} — now in your kit', { name: gadgetName(g) })) }, t('Take'))) : null,
              tryBtn({ gadget: g }),
            ),
          );
        }),
      ),
    );
  };

  // ── characters ────────────────────────────────────────────────────────
  const charactersTab = (): HTMLElement =>
    h(
      'div',
      { class: 'col' },
      h('div', { class: 'muted' }, t('All characters have the same stats — they differ in looks and backstory. Half are unlocked with experience and talons, half with diamonds.')),
      h(
        'div',
        { class: 'cards' },
        ...SHOP_CHARACTERS.map((c) => {
          const d = charText(c);
          const price = CHARACTER_PRICES[c]!;
          const mine = inv ? inv.characters.includes(c) : false;
          return h(
            'div',
            { class: `panel col ccard ${mine ? 'owned' : ''}` },
            h('span', { class: 'tag' }, d.species),
            h('div', { class: 'ccard__top' }, heroImg(c, 'ccard__hero'), h('div', { class: 'col', style: 'gap:2px;min-width:0' }, portrait(c, true), h('div', { class: 'h2' }, d.name), h('div', { class: 'nick' }, `«${d.nickname}»`), h('div', { class: 'muted' }, d.role))),
            h('div', { class: 'quote' }, `«${d.quote}»`),
            h('div', { class: 'lore' }, d.lore),
            h('div', { class: 'row' }, buyButton('character', c, price), o.onCharacter ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onCharacter!(c) }, t('View')) : null),
          );
        }),
      ),
    );

  // ── case ──────────────────────────────────────────────────────────────
  let reveal: { weapon: WeaponId; rarity: Rarity } | null = null;
  const caseTab = (): HTMLElement => {
    const have = new Set(inv?.weapons ?? []);
    const odds = caseOdds(have);
    const left = odds.filter((e) => e.odds > 0).length;
    const enabled = cfg?.casesEnabled !== false;
    const confirmAndOpen = () => {
      if (!online || !inv) return;
      if (inv.diamonds < CASE_PRICE) {
        toast(t('Not enough diamonds'));
        tab = 'diamonds';
        draw();
        return;
      }
      const ov = h('div', { class: 'overlay overlay--top' });
      const close = () => ov.remove();
      ov.append(
        h(
          'div',
          { class: 'panel modal col' },
          h('span', { class: 'tag' }, t('Confirmation')),
          h('div', { style: 'margin-top:8px' }, t('Open the case for {n} {diamonds} ({usd})?', { n: CASE_PRICE, diamonds: diamondWord(CASE_PRICE), usd: usd(CASE_PRICE) })),
          h('div', { class: 'muted' }, t('Inside is a random rare weapon you don’t own yet. The odds are listed below. The purchase is final.')),
          h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              onchange: (e: Event) => {
                const btn = ov.querySelector<HTMLButtonElement>('[data-open]');
                if (btn) btn.disabled = !(e.target as HTMLInputElement).checked;
              },
            }),
            ` ${t('I am 18 or older')}`,
          ),
          h(
            'button',
            {
              class: 'btn btn--red',
              'data-open': '1',
              disabled: true,
              onclick: () => {
                close();
                void act(async () => {
                  const r = await online.openCase();
                  reveal = { weapon: r.weapon, rarity: r.rarity };
                  sfx.play(r.rarity === 'legendary' ? 'supply' : 'pickup');
                });
              },
            },
            t('Open'),
          ),
          h('button', { class: 'btn', onclick: close }, t('Cancel')),
        ),
      );
      root.append(ov);
    };
    const shown = reveal;
    return h(
      'div',
      { class: 'col' },
      shown
        ? h(
            'div',
            { class: `panel col reveal reveal--${shown.rarity}` },
            h('span', { class: 'tag' }, t('From the case')),
            h('div', { class: 'h1' }, weaponName(shown.weapon)),
            h('div', { class: 'wpic wpic--big' }, weaponImg(shown.weapon)),
            h('div', { class: 'muted' }, `${rarityLabel(shown.rarity)} · ${t('already in your arsenal')}`),
            h('div', { class: 'row' }, h('button', { class: 'btn btn--small', onclick: () => ((reveal = null), (focus = shown.weapon), (tab = 'loadout'), draw()) }, t('Add to kit')), tryBtn({ weapon: shown.weapon }), h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((reveal = null), draw()) }, t('Close'))),
          )
        : null,
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('The Defitsit Case')),
        h('div', { class: 'row', style: 'margin-top:6px' }, h('div', { class: 'crate' }), h('div', { class: 'col grow', style: 'gap:4px' }, h('div', { class: 'h2' }, `${t('Rare weapon')} · `, amount(CASE_PRICE, 'diamonds')), h('div', { class: 'muted' }, t('One of 10 rare guns. No duplicates: a weapon you already got from the case never drops again, and the odds of the rest are recalculated. Once the collection is complete, the case is no longer sold.')))),
        !enabled
          ? h('div', { class: 'badge badge--off' }, t('Cases are disabled on this server'))
          : left === 0
            ? h('div', { class: 'badge badge--ok' }, t('Collection complete!'))
            : h('button', { class: 'btn btn--red', disabled: !online, onclick: confirmAndOpen }, online ? h('span', null, `${t('Open for')} `, amount(CASE_PRICE, 'diamonds')) : t('Available in the online version')),
        h('div', { class: 'muted', style: 'font-size:13px' }, t('Adults only. Paid cases are banned in some countries — don’t buy them there. The odds below are honest and enforced by the server.')),
      ),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Odds')),
        h(
          'table',
          { class: 'table', style: 'margin-top:6px' },
          h('thead', null, h('tr', null, h('th', null, t('Weapon')), h('th', null, t('Rarity')), h('th', { class: 'num' }, t('Chance')))),
          h(
            'tbody',
            null,
            ...odds.map((e) =>
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
      ),
      h('div', { class: 'cards' }, ...CASE_TABLE.map((e) => weaponCard(e.weapon))),
    );
  };

  // ── diamonds ──────────────────────────────────────────────────────────
  const diamondsTab = (): HTMLElement => {
    if (!online) return h('div', { class: 'panel' }, t('Buying diamonds works in the online version of the game.'));
    if (o.inTelegram) return h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Diamonds')), h('div', { style: 'margin-top:8px' }, t('Buying diamonds inside Telegram is coming soon (via Telegram Stars).')));
    const methods: Array<['card' | 'crypto', string]> = [];
    if (cfg?.card) methods.push(['card', t('By card')]);
    if (cfg?.crypto) methods.push(['crypto', t('With crypto')]);
    const buyPack = (packId: string, method: 'card' | 'crypto') =>
      void act(async () => {
        const r = await online.api.checkout(packId, method);
        try {
          sessionStorage.setItem('blatkom89.pending-payment', r.paymentId);
        } catch {
          /* private mode: the ?pid= return parameter still works */
        }
        openExternal(r.url);
      });
    return h(
      'div',
      { class: 'col' },
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, t('Diamonds')),
        h('div', { style: 'margin-top:8px' }, t('100 diamonds = $1. Diamonds buy weapons, characters and cases. Talons are never sold for money — you earn them in matches and spend them on weapons, equipment and modifications.')),
        methods.length === 0
          ? h('div', { class: 'badge', style: 'align-self:flex-start' }, t('Payments are not connected yet — coming soon'))
          : h('div', { class: 'muted' }, t('You pay on the payment provider’s secure page. The diamonds are credited automatically once the payment is confirmed.')),
      ),
      h(
        'div',
        { class: 'packs' },
        ...(cfg?.packs ?? []).map((p) =>
          h(
            'div',
            { class: 'panel col pack' },
            h('div', { class: 'h1' }, amount(p.diamonds, 'diamonds')),
            h('div', { class: 'h2' }, `$${(p.usdCents / 100).toFixed(2)}`),
            ...(methods.length ? methods.map(([m, label]) => h('button', { class: 'btn btn--small btn--red', onclick: () => buyPack(p.id, m) }, label)) : [h('button', { class: 'btn btn--small', disabled: true }, t('Soon'))]),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, t('Purchases belong to your account. To keep them when you change devices, link an email in your profile.')),
    );
  };

  const draw = () => {
    drawRoom();
    drawWallet();
    drawTabs();
    const content = tab === 'loadout' ? loadoutTab() : tab === 'weapons' ? weaponsTab() : tab === 'gear' ? gearTab() : tab === 'characters' ? charactersTab() : tab === 'case' ? caseTab() : diamondsTab();
    body.replaceChildren(content);
  };

  draw();
  if (online) {
    void online
      .loadInventory()
      .then((i) => {
        const first = !inv;
        inv = i;
        if (first) trying = { weapon: startWeapon(), mods: [...(loadout().mods[startWeapon()] ?? [])] };
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
    : t('Unlocks for {n} {diamonds} ({usd})', { n: p.amount, diamonds: diamondWord(p.amount), usd: usd(p.amount) });
}

export { diamondWord as diamondsPlural };
