/**
 * The Arsenal: the dressing room (the character's art with the item being tried on, the same
 * character as it looks in a match, and on the right the case banner and the diamond top-up), the
 * loadout (four equal slot columns: what you own, then what the shop has for that slot; weapons,
 * equipment, modifications), the weapon / equipment / character shop, the rare-weapon case, the
 * weapon-skin case (v0.23; skins are tried on and worn in the dressing room) and diamond packs. Prices and rules are the shared ones; every purchase is decided by the server. In
 * the demo build (no server) the catalog is read-only, but anything can be tried on — in the dressing
 * room and in practice.
 *
 * Phones (≤ 560 px wide) get their own layout of the same state and actions: the wallet on top, then
 * two halves — «Экипировка» (only what the player has: the dressing room with the in-game view and the
 * four slots, each changed from a sheet of the player's own items) and «Магазин» (weapons, equipment,
 * characters, cases, diamonds as compact grids) — every tab on one screen, details in bottom sheets.
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
  FINISH_IDS,
  FINISHES,
  SKIN_CASE_PRICE,
  SKIN_RARITIES,
  allSkins,
  skinCaseOdds,
  skinId,
} from '@blatkom/shared';
import type { CharacterId, FinishId, GadgetId, Inventory, Loadout, ModId, ModMount, Rarity, ShopConfig, ShopKind, ShopPrice, SkinRarity, WeaponDef, WeaponId } from '@blatkom/shared';
import type * as Phaser from 'phaser';
import { h, toast, asset, portrait } from '../dom.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { apiErrorText } from '../../net/errors.js';
import { sfx } from '../../game/audio/Sfx.js';
import { haptic } from '../../telegram/tg.js';
import { t, plural, count, num, getLang } from '../../i18n/index.js';
import { charText, finishName, gadgetBlurb, gadgetName, modText, rarityLabel, refusalText, weaponBlurb, weaponName } from '../../i18n/content.js';
import { Doll } from '../doll.js';
import { openSheet } from '../sheet.js';
import type { Sheet } from '../sheet.js';
import { skinIconUrl } from '../../game/render/skins.js';

export type ArsenalTab = 'loadout' | 'weapons' | 'gear' | 'characters' | 'case' | 'diamonds';
type ShopTab = Exclude<ArsenalTab, 'loadout'>;

/** Phones get their own Arsenal: the wallet and the kit/shop switch on top, every tab on one screen. */
const PHONE_QUERY = '(max-width: 560px)';

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

export function weaponImg(w: WeaponId, size: IconSize = 'big', finish: FinishId | null = null): HTMLImageElement {
  const img = icon('weapon', w, size, `wimg wimg--${size}`);
  if (finish) {
    // the painted icon replaces the plain one as soon as it is ready
    img.dataset.finish = finish;
    void skinIconUrl(w, finish, size === 'small')
      .then((url) => {
        if (img.dataset.finish === finish) img.src = url;
      })
      .catch(() => {});
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
  // v0.24: nothing is sold for money — no diamonds tab
  let tab: ArsenalTab = o.tab === 'diamonds' && !REAL_MONEY ? 'loadout' : (o.tab ?? 'loadout');
  let inv: Inventory | null = o.online?.inventory ?? null;
  let cfg: ShopConfig | null = null;
  let busy = false;
  const online = o.online;
  const root = h('div', { class: 'col arsenal' });
  const roomEl = h('div', { class: 'panel dressing', 'data-testid': 'dressing-room' });
  const walletEl = h('div', { class: 'wallet' });
  const tabsEl = h('div', { class: 'seg tabs', role: 'tablist' });
  const body = h('div', { class: 'col' });
  // phones: «Экипировка | Магазин» and the shop's departments instead of the six tabs
  const modeEl = h('div', { class: 'seg arsmodes', role: 'tablist' });
  const chipsEl = h('div', { class: 'seg arschips', role: 'tablist' });
  const phoneQuery = typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null;
  let phone = !!phoneQuery?.matches;
  const layout = () => {
    root.classList.toggle('arsenal--phone', phone);
    if (phone) root.replaceChildren(walletEl, modeEl, chipsEl, body);
    else root.replaceChildren(roomEl, walletEl, tabsEl, body);
  };
  layout();

  const owned = (w: WeaponId) => (inv ? inv.weapons.includes(w) : FREE_WEAPONS.includes(w));
  const ownedGadget = (g: GadgetId) => (inv ? inv.gadgets.includes(g) : FREE_GADGETS.includes(g));
  /** The demo on a phone: the slots can be changed locally (nothing is saved without a server). */
  let demoKit: Loadout | null = null;
  const loadout = (): Loadout => inv?.loadout ?? (phone ? demoKit : null) ?? { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', gadget: 'f1', mods: {}, skins: {} };
  /** The finish a weapon wears (equipped skin). */
  const worn = (w: WeaponId): FinishId | null => loadout().skins?.[w] ?? null;
  const ownsSkin = (w: WeaponId, f: FinishId) => !!inv?.skins.includes(skinId(w, f));
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
        { class: `dressing__grid ${REAL_MONEY ? '' : 'dressing__grid--two'}` },
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
          getIt,
          !g && mods.length ? h('div', { class: 'modfit' }, t('With:'), ...mods.map((m) => h('span', { class: 'chip' }, modImg(m, 'small'), modText(m).name))) : null,
          !g ? skinRow(w, finish) : null,
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
        REAL_MONEY ? promoColumn() : null,
      ),
    );
  };

  /**
   * The weapon's skins: the plain paint and every finish — the player's own are worn with a tap (the
   * server keeps the choice), the others are tried on here and come from the skin case.
   */
  const skinRow = (w: WeaponId, current: FinishId | null): HTMLElement => {
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
    const mine = FINISH_IDS.filter((f) => ownsSkin(w, f)).length;
    return h(
      'div',
      { class: 'skinpick', 'data-testid': 'skin-pick' },
      h('span', { class: 'chiplabel' }, t('Skin')),
      h('button', { class: 'skinchip', 'aria-pressed': String(current === null), 'data-finish': '', onclick: () => pick(null) }, t('Standard')),
      ...FINISH_IDS.map((f) =>
        h(
          'button',
          {
            class: `skinchip skinchip--${FINISHES[f].rarity}${ownsSkin(w, f) ? ' skinchip--mine' : ''}`,
            'aria-pressed': String(current === f),
            'data-finish': f,
            title: ownsSkin(w, f) ? t('Yours — tap to wear it') : t('Try it on — it comes from the skin case'),
            onclick: () => pick(f),
          },
          h('i', { class: `swatch swatch--${f}`, 'aria-hidden': 'true' }),
          finishName(f),
          ownsSkin(w, f) ? ' ✓' : '',
        ),
      ),
      current && !ownsSkin(w, current)
        ? h(
            'div',
            { class: 'muted skinpick__note' },
            online ? t('Not yours yet — this skin comes from the skin case.') : t('Skins come from the skin case in the online version.'),
            ' ',
            online ? h('button', { class: 'linkish', onclick: () => toTab('case', true) }, t('To the case')) : null,
          )
        : mine === 0 && online
          ? h('div', { class: 'muted skinpick__note' }, t('You have no skins for this weapon yet.'))
          : null,
    );
  };

  /** Right of the dressing room: the case banner (in the player's language) and the diamond top-up. */
  const promoColumn = (): HTMLElement => {
    const lang = getLang() === 'ru' ? 'ru' : 'en';
    const banner = h(
      'button',
      { class: 'promo-case', 'data-testid': 'promo-case', 'aria-label': t('Rare weapon case — {n} {diamonds}', { n: CASE_PRICE.amount, diamonds: diamondWord(CASE_PRICE.amount) }), onclick: () => (sfx.play('click'), toTab('case', true)) },
      h('img', { src: asset(`assets/ui/banners/case-weapons-${lang}.jpg`), width: 1200, height: 675, alt: '', draggable: 'false', 'data-lang': lang }),
    );
    const balance = inv ? inv.diamonds : null;
    const topup = h(
      'div',
      { class: 'promo-topup', 'data-testid': 'promo-topup' },
      h('div', { class: 'promo-topup__gems', 'aria-hidden': 'true' }, cur('diamonds'), cur('diamonds'), cur('diamonds')),
      h(
        'div',
        { class: 'col promo-topup__text' },
        h('b', null, t('Diamonds')),
        h('span', { class: 'muted' }, online ? (balance === null ? '…' : t('On your account: {n}', { n: balance })) : t('Online version only')),
        h('span', { class: 'muted promo-topup__rate' }, t('100 diamonds = $1 · characters, weapons, cases')),
      ),
      h('button', { class: 'btn btn--red promo-topup__btn', 'data-testid': 'promo-topup-btn', onclick: () => ((tab = 'diamonds'), sfx.play('click'), draw(), body.scrollIntoView({ behavior: 'smooth', block: 'start' })) }, t('Top up')),
    );
    return h('div', { class: 'dressing__promo' }, banner, topup);
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
              ? t('Demo version: the catalogue is for browsing. Talons, diamonds and purchases work in the online version; anything can be tried on in the dressing room and in practice.')
              : t('Demo version: the catalogue is for browsing. Talons and unlocks work in the online version; anything can be tried on in the dressing room and in practice.'),
        ),
      );
      return;
    }
    const coins: HTMLElement[] = [h('div', { class: 'coin', title: t('Talons — earned in online matches') }, cur('tokens'), h('b', null, inv ? String(inv.tokens) : '…'), h('span', null, t('talons')))];
    if (REAL_MONEY)
      coins.push(
        h('div', { class: 'coin', title: t('Diamonds — bought for money') }, cur('diamonds'), h('b', null, inv ? String(inv.diamonds) : '…'), h('span', null, t('diamonds'))),
        h('button', { class: 'btn btn--small', 'data-testid': 'wallet-topup', onclick: () => toTab('diamonds') }, t('Top up')),
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
      ['case', t('Case')],
      ...(REAL_MONEY ? [['diamonds', t('Diamonds')] as [ArsenalTab, string]] : []),
    ];
    tabsEl.replaceChildren(...tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-pressed': String(tab === id), onclick: () => ((tab = id), sfx.play('click'), draw()) }, label)));
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
            toast(price.currency === 'tokens' ? t('Not enough talons — you earn them in online matches') : t('Not enough diamonds'));
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
      list.length ? h('div', { class: 'col' }, h('div', { class: 'row' }, h('div', { class: 'h2' }, title), h('span', { class: 'muted' }, note)), h('div', { class: 'cards' }, ...list.map(weaponCard))) : null;
    const tokenNoLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level <= 1);
    const tokenLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level > 1);
    const forDiamonds = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'diamonds');
    return h(
      'div',
      { class: 'col' },
      h(
        'div',
        { class: 'muted' },
        REAL_MONEY
          ? t('Paid weapons aren’t stronger than the free ones — just different, each with its own pluses and minuses. Try any of them on in the dressing room or test it in practice.')
          : t('Shop weapons aren’t stronger than the free ones — just different, each with its own pluses and minuses. Try any of them on in the dressing room or test it in practice.'),
      ),
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
      h('div', { class: 'muted' }, REAL_MONEY ? t('All characters have the same stats — they differ in looks and backstory. Half are unlocked with experience and talons, half with diamonds.') : t('All characters have the same stats — they differ in looks and backstory. Every one is unlocked with experience and talons.')),
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

  // ── cases: rare weapons and weapon skins ──────────────────────────────
  type Reveal = { kind: 'weapon'; weapon: WeaponId; rarity: Rarity } | { kind: 'skin'; weapon: WeaponId; finish: FinishId; rarity: SkinRarity; equipped: boolean };
  let reveal: Reveal | null = null;
  const caseFunds = (p: ShopPrice) => (inv ? (p.currency === 'tokens' ? inv.tokens : inv.diamonds) : 0);
  /**
   * The confirmation before a case. Paid with diamonds (real money) it needs the adult checkbox; paid
   * with talons (v0.24: there is no money in it) a plain «open?» is enough.
   */
  const confirmCase = (price: ShopPrice, inside: string, open: () => Promise<void>) => {
    if (!online || !inv) return;
    if (inv.level < price.level) return void toast(t('From level {n}', { n: price.level }));
    if (caseFunds(price) < price.amount) {
      if (price.currency === 'tokens') return void toast(t('Not enough talons — you earn them in online matches'));
      toast(t('Not enough diamonds'));
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
          paid ? t('Open the case for {n} {diamonds} ({usd})?', { n: price.amount, diamonds: diamondWord(price.amount), usd: usd(price.amount) }) : t('Open the case for {n} {talons}?', { n: price.amount, talons: tokenWord(price.amount) }),
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
  const openBtn = (price: ShopPrice, onOpen: () => void, testid: string) =>
    h('button', { class: 'btn btn--red', 'data-testid': testid, disabled: !online, onclick: onOpen }, online ? h('span', null, `${t('Open for')} `, amount(price.amount, price.currency)) : t('Available in the online version'));
  const caseNote = () =>
    REAL_MONEY && (CASE_PRICE.currency === 'diamonds' || SKIN_CASE_PRICE.currency === 'diamonds')
      ? t('Adults only. Paid cases are banned in some countries — don’t buy them there. The odds below are honest and enforced by the server.')
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
        h('thead', null, h('tr', null, h('th', null, t('Weapon')), h('th', null, t('Rarity')), h('th', { class: 'num' }, t('Chance')))),
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
        h('thead', null, h('tr', null, h('th', null, t('Rarity')), h('th', null, t('Finishes')), h('th', { class: 'num' }, t('Chance')))),
        h(
          'tbody',
          null,
          ...SKIN_RARITIES.map((r) =>
            h(
              'tr',
              { class: skinOdds[r] === 0 ? 'got' : '' },
              h('td', { class: `rar rar--${r}` }, rarityLabel(r)),
              h('td', null, h('div', { class: 'finishes' }, ...FINISH_IDS.filter((f) => FINISHES[f].rarity === r).map((f) => h('span', { class: 'finish' }, h('i', { class: `swatch swatch--${f}`, 'aria-hidden': 'true' }), finishName(f))))),
              h('td', { class: 'num' }, `${skinOdds[r].toFixed(skinOdds[r] < 10 ? 1 : 0)}%`),
            ),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, t('First the rarity is drawn, then any skin of that rarity you don’t have yet, all equally likely. Every weapon can wear every finish.')),
    );
  };
  const revealPanel = (r: Reveal): HTMLElement => {
    const close = h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((reveal = null), closeSheet(), draw()) }, t('Close'));
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
  const caseTab = (): HTMLElement => {
    const have = new Set(inv?.weapons ?? []);
    const left = caseOdds(have).filter((e) => e.odds > 0).length;
    const enabled = cfg?.casesEnabled !== false;
    const skinsHave = new Set(inv?.skins ?? []);
    const skinTotal = allSkins().length;
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
              h('div', { class: 'muted' }, t('One of {n} skins: {f} finishes for each of {w} weapons. Skins change only the look, never the numbers. No duplicates: a skin you have never drops again.', { n: skinTotal, f: FINISH_IDS.length, w: skinTotal / FINISH_IDS.length })),
              online ? h('div', { class: 'muted', 'data-testid': 'skins-owned' }, t('Your skins: {n} of {total}', { n: skinsHave.size, total: skinTotal })) : null,
            ),
          ),
          !enabled ? h('div', { class: 'badge badge--off' }, t('Cases are disabled on this server')) : skinsLeft === 0 ? h('div', { class: 'badge badge--ok' }, t('Collection complete!')) : openBtn(SKIN_CASE_PRICE, openSkinCase, 'open-skin-case'),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, caseNote()),
      caseOddsPanel(),
      skinOddsPanel(),
      h('div', { class: 'cards' }, ...CASE_TABLE.map((e) => weaponCard(e.weapon))),
    );
  };

  // ── diamonds (real money: off since v0.24) ─────────────────────────────
  const payMethods = (): Array<['card' | 'crypto', string]> => {
    const methods: Array<['card' | 'crypto', string]> = [];
    if (cfg?.card) methods.push(['card', t('By card')]);
    if (cfg?.crypto) methods.push(['crypto', t('With crypto')]);
    return methods;
  };
  const buyPack = (packId: string, method: 'card' | 'crypto') =>
    void act(async () => {
      const r = await online!.api.checkout(packId, method);
      try {
        sessionStorage.setItem('blatkom89.pending-payment', r.paymentId);
      } catch {
        /* private mode: the ?pid= return parameter still works */
      }
      openExternal(r.url);
    });
  const diamondsTab = (): HTMLElement => {
    if (!online) return h('div', { class: 'panel' }, t('Buying diamonds works in the online version of the game.'));
    if (o.inTelegram) return h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Diamonds')), h('div', { style: 'margin-top:8px' }, t('Buying diamonds inside Telegram is coming soon (via Telegram Stars).')));
    const methods = payMethods();
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
    tab = next;
    if (next !== 'loadout') lastShop = next;
    draw();
    if (scroll && !phone) body.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /** The skin picker's preview: the dressing room on wide screens, the kit (and its sheet) on phones. */
  function refreshPreview() {
    if (phone) draw();
    else drawRoom();
  }
  const go = (next: ArsenalTab) => {
    sfx.play('click');
    toTab(next);
  };
  const shopTabs = (): Array<[ShopTab, string]> => [
    ['weapons', t('Weapons')],
    ['gear', t('Equipment')],
    ['characters', t('Characters')],
    ['case', t('Cases')],
    ...(REAL_MONEY ? [['diamonds', t('Diamonds')] as [ShopTab, string]] : []),
  ];
  const drawPhoneTabs = () => {
    const kit = tab === 'loadout';
    modeEl.replaceChildren(
      h('button', { role: 'tab', 'aria-pressed': String(kit), 'data-tab': 'loadout', 'data-testid': 'ars-kit', onclick: () => !kit && go('loadout') }, t('Loadout')),
      h('button', { role: 'tab', 'aria-pressed': String(!kit), 'data-tab': 'shop', 'data-testid': 'ars-shop', onclick: () => kit && go(lastShop) }, t('Shop')),
    );
    chipsEl.hidden = kit;
    chipsEl.classList.toggle('arschips--5', shopTabs().length > 4);
    chipsEl.replaceChildren(...shopTabs().map(([id, label]) => h('button', { role: 'tab', 'aria-pressed': String(tab === id), 'data-tab': id, onclick: () => tab !== id && go(id) }, label)));
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
      dollBox(d, w),
      h(
        'div',
        { class: 'kitcard__info' },
        h('button', { class: 'kitcard__who', title: t('Change character'), 'data-testid': 'kit-character', onclick: () => o.onCharacter?.(c) }, portrait(c, true), h('span', { class: 'kitcard__whotxt' }, h('b', null, ct.name), h('small', null, `«${ct.nickname}»`)), h('i', { 'aria-hidden': 'true' }, '›')),
        h('div', { class: 'kitcard__name', 'data-testid': 'dressing-name' }, g ? gadgetName(g) : weaponName(w)),
        g
          ? h('div', { class: 'kitcard__meta' }, `${slotLabel(4)} · ${gadgetFacts(g)[0]}`)
          : h('div', { class: 'kitcard__meta' }, `${slotLabel(def.slot as 1 | 2 | 3)} · ${t('Skin')}: ${finish ? finishName(finish) : t('Standard')}`),
        !g && fit.length ? h('div', { class: 'kitcard__meta' }, `${t('Modifications')}: ${mods.length ? mods.map((m) => modText(m).name).join(', ') : '—'}`) : null,
        h('button', { class: 'btn btn--small btn--red kitcard__try', onclick: () => o.onTry(trying) }, t('Test in practice')),
      ),
      g
        ? null
        : h(
            'div',
            { class: 'kitcard__acts' },
            h('button', { class: 'btn btn--small', 'data-testid': 'kit-skins', onclick: () => openSkins(w) }, t('Skins')),
            h('button', { class: 'btn btn--small', 'data-testid': 'kit-mods', onclick: () => openMods(w) }, fit.length ? t('Modifications') : t('Stats')),
          ),
    );
    const slots = h('div', { class: 'panel kitslots', 'data-testid': 'kit-slots' }, h('span', { class: 'tag' }, t('Kit')), ...([1, 2, 3, 4] as const).map((s) => slotRow(s, l)));
    return h('div', { class: 'kit' }, card, slots);
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
        return h('div', { class: 'col skinsheet' }, h('div', { class: 'wpic skinsheet__pic' }, weaponImg(w, 'big', finish)), skinRow(w, finish));
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
    return h(
      'button',
      { class: `cell ${mine ? 'cell--mine' : ''}`, 'data-item': id, onclick: () => openItem(kind, id) },
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
      h(
        'div',
        { class: 'charshop', 'data-testid': 'shop-characters' },
        ...SHOP_CHARACTERS.map((c) => {
          const price = CHARACTER_PRICES[c]!;
          const mine = inv ? inv.characters.includes(c) : false;
          return h('button', { class: `cell cell--char ${mine ? 'cell--mine' : ''}`, 'data-char': c, onclick: () => openChar(c) }, portrait(c, true), h('span', { class: 'cell__name' }, charText(c).name), mine ? h('span', { class: 'cell__own' }, `✓ ${t('Yours')}`) : priceTag(price));
        }),
      ),
      h('div', { class: 'muted arsnote' }, t('Everyone has the same stats — only the looks and the story differ.')),
    );
  const casePhone = (): HTMLElement => {
    const enabled = cfg?.casesEnabled !== false;
    const left = caseOdds(new Set(inv?.weapons ?? [])).filter((e) => e.odds > 0).length;
    const skinTotal = allSkins().length;
    const skinsOwned = inv?.skins.length ?? 0;
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
      h('div', { class: 'muted arsnote' }, caseNote()),
    );
  };
  const diamondsPhone = (): HTMLElement => {
    if (!online) return h('div', { class: 'panel' }, t('Buying diamonds works in the online version of the game.'));
    if (o.inTelegram) return h('div', { class: 'panel col' }, h('span', { class: 'tag' }, t('Diamonds')), h('div', { style: 'margin-top:8px' }, t('Buying diamonds inside Telegram is coming soon (via Telegram Stars).')));
    const methods = payMethods();
    return h(
      'div',
      { class: 'col arsdiamonds' },
      h('div', { class: 'muted arsnote' }, t('100 diamonds = $1. Diamonds buy weapons, characters and cases. Talons are never sold for money — you earn them in matches and spend them on weapons, equipment and modifications.')),
      methods.length === 0 ? h('span', { class: 'badge', style: 'align-self:flex-start' }, t('Payments are not connected yet — coming soon')) : null,
      h(
        'div',
        { class: 'packrows' },
        ...(cfg?.packs ?? []).map((p) =>
          h(
            'div',
            { class: 'packrow' },
            h('b', { class: 'packrow__amt' }, amount(p.diamonds, 'diamonds')),
            h('span', { class: 'packrow__usd' }, `$${(p.usdCents / 100).toFixed(2)}`),
            ...(methods.length ? methods.map(([m, label]) => h('button', { class: 'btn btn--small btn--red', onclick: () => buyPack(p.id, m) }, label)) : [h('button', { class: 'btn btn--small', disabled: true }, t('Soon'))]),
          ),
        ),
      ),
      h('div', { class: 'muted arsnote' }, t('Purchases belong to your account. To keep them when you change devices, link an email in your profile.')),
    );
  };
  /** An item's card: the in-game view (weapons), what it does, and buy / take / test. */
  const openItem = (kind: 'weapon' | 'gadget', id: WeaponId | GadgetId) =>
    openPhoneSheet(kind === 'weapon' ? weaponName(id as WeaponId) : gadgetName(id as GadgetId), 'item-sheet', () => (kind === 'weapon' ? weaponSheet(id as WeaponId) : gadgetSheet(id as GadgetId)), () => itemActions(kind, id));
  const statusBadge = (mine: boolean, price: ShopPrice | undefined, rare: boolean) =>
    mine ? h('span', { class: 'badge badge--ok' }, t('Yours')) : price ? h('span', { class: 'badge' }, priceLabel(price)) : h('span', { class: 'badge' }, rare ? t('Case only') : t('Free'));
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
        h('div', { class: 'col itemsheet__txt' }, h('div', { class: 'row itemsheet__tags' }, h('span', { class: 'chiplabel' }, slotLabel(def.slot as 1 | 2 | 3)), statusBadge(mine, WEAPON_PRICES[w], def.tier === 'rare')), h('div', { class: 'muted itemsheet__blurb' }, weaponBlurb(w))),
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
            o.onTry(kind === 'weapon' ? { weapon: id as WeaponId } : { gadget: id as GadgetId });
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
          h('div', { class: 'col charsheet__txt' }, h('div', { class: 'nick' }, `«${d.nickname}»`), h('div', { class: 'muted' }, `${d.species} · ${d.role}`), statusBadge(mine, CHARACTER_PRICES[c], false), h('div', { class: 'quote' }, `«${d.quote}»`)),
          h('div', { class: 'lore charsheet__lore' }, d.lore),
        );
      },
      () => {
        const price = CHARACTER_PRICES[c];
        return h(
          'div',
          { class: 'itemacts' },
          price ? buyButton('character', c, price, true) : null,
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
      openPhoneSheet(reveal.kind === 'weapon' ? t('From the case') : t('From the skin case'), 'reveal-sheet', () => {
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
