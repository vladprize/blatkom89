/**
 * The Arsenal: the loadout (weapons, equipment, modifications), the weapon / equipment / character
 * shop, the rare-weapon case and diamond packs. Prices and rules are the shared ones; every purchase
 * is decided by the server. In the demo build (no server) the catalog is read-only, but anything can
 * be tried on in practice.
 */
import {
  CASE_PRICE,
  CASE_TABLE,
  CHARACTERS,
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
  REFUSAL_TEXT,
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
import { h, toast, asset, portrait, plural } from '../dom.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { ApiError } from '../../net/api.js';
import { sfx } from '../../game/audio/Sfx.js';
import { haptic } from '../../telegram/tg.js';

export type ArsenalTab = 'loadout' | 'weapons' | 'gear' | 'characters' | 'case' | 'diamonds';

/** What to try on in a practice match: a weapon (optionally with modifications) and/or equipment. */
export interface TryOn {
  weapon?: WeaponId;
  mods?: ModId[];
  gadget?: GadgetId;
}

export interface ArsenalOptions {
  online: OnlineClient | null;
  inTelegram: boolean;
  tab?: ArsenalTab;
  /** Start a practice match with this in hand («примерить»). */
  onTry: (t: TryOn) => void;
  /** Wallet changed (menu strip refresh). */
  onWallet?: () => void;
  /** Show this character in the character screen. */
  onCharacter?: (c: CharacterId) => void;
}

const RARITY_LABEL: Record<Rarity, string> = { rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const SLOT_LABEL = { 1: 'Sidearm', 2: 'Melee', 3: 'Primary', 4: 'Equipment' } as const;
const MOUNT_LABEL: Record<ModMount, string> = { muzzle: 'Muzzle', optic: 'Sight', rail: 'Rail', mag: 'Magazine' };

export const tokenWord = (n: number) => plural(n, 'talon');
export const diamondWord = (n: number) => plural(n, 'diamond');

/** Currency icon (CSS-drawn: a brass token or a blue diamond) — no emoji font needed. */
export function cur(c: 'tokens' | 'diamonds'): HTMLElement {
  return h('i', { class: `cur cur--${c}`, 'aria-label': c === 'tokens' ? 'talons' : 'diamonds' });
}

export function amount(n: number, c: 'tokens' | 'diamonds'): HTMLElement {
  return h('span', { class: 'amt' }, cur(c), String(n));
}

export function priceLabel(p: ShopPrice): HTMLElement {
  if (p.currency === 'tokens') return h('span', { class: 'amt' }, cur('tokens'), String(p.amount), p.level > 1 ? ` · from LV ${p.level}` : '');
  return h('span', { class: 'amt' }, cur('diamonds'), String(p.amount), h('small', null, ` $${(p.amount / DIAMONDS_PER_USD).toFixed(2)}`));
}

/** Payment pages open in the browser (inside Telegram: through the WebApp API). */
function openExternal(url: string) {
  const t = (window as unknown as { Telegram?: { WebApp?: { initData?: string; openLink?: (u: string) => void } } }).Telegram?.WebApp;
  if (t?.initData && t.openLink) t.openLink(url);
  else location.href = url;
}

function weaponImg(w: WeaponId, cls = 'wimg'): HTMLImageElement {
  return h('img', { class: cls, src: asset(`assets/ui/weapons/${w}.png`), alt: '', draggable: 'false' });
}

export function gadgetImg(g: GadgetId, cls = 'wimg'): HTMLImageElement {
  return h('img', { class: cls, src: asset(`assets/ui/gadgets/${g}.png`), alt: '', draggable: 'false' });
}

function modImg(m: ModId, cls = 'micon'): HTMLImageElement {
  return h('img', { class: cls, src: asset(`assets/ui/mods/${m}.png`), alt: '', draggable: 'false' });
}

const secs = (ms: number) => `${(ms / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} s`;

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
  rows.push(['Damage', Math.min(1, shotDamage(d) / 140), `${Math.round(shotDamage(d))}${d.pellets > 1 ? ` (${d.pellets}×${d.damage})` : ''}`, 0]);
  if (d.kind !== 'melee') {
    rows.push(['Rate', Math.min(1, 1000 / d.fireIntervalMs / 16), `${(60000 / d.fireIntervalMs).toFixed(0)}/min`, 0]);
    rows.push(['Range', Math.min(1, d.range / 950), d.range < 300 ? 'short' : d.range < 600 ? 'medium' : 'long', cmp(d.range, base.range)]);
    rows.push(['Accuracy', Math.max(0.05, Math.min(1, 1 - d.spread / 0.16)), `${Math.round(Math.max(0.05, Math.min(1, 1 - d.spread / 0.16)) * 100)}%`, cmp(d.spread, base.spread, false)]);
    rows.push(['Magazine', Math.min(1, d.magazine / 100), String(d.magazine), cmp(d.magazine, base.magazine)]);
    rows.push(['Reload', Math.max(0.05, Math.min(1, 1 - d.reloadMs / 4000)), secs(d.reloadMs), cmp(d.reloadMs, base.reloadMs, false)]);
  } else {
    rows.push(['Rate', Math.min(1, 1000 / d.fireIntervalMs / 3.4), `${(60000 / d.fireIntervalMs).toFixed(0)}/min`, 0]);
    rows.push(['Reach', Math.min(1, d.meleeRange / 44), `${d.meleeRange}`, 0]);
  }
  rows.push(['Mobility', Math.max(0, Math.min(1, (d.moveSpeed - 0.75) / 0.3)), `${Math.round(d.moveSpeed * 100)}%`, cmp(d.moveSpeed, base.moveSpeed)]);
  const falloff = d.kind === 'hitscan' && d.range > 0 ? damageFalloff(d, d.range) : 1;
  const k = hitsToKill(d);
  return h(
    'div',
    { class: 'wstats' },
    ...rows.map(([label, v, t, c]) => h('div', { class: `wstat ${c > 0 ? 'up' : c < 0 ? 'down' : ''}` }, h('span', null, label), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(v * 100)}%` })), h('b', null, t))),
    h('div', { class: 'muted', style: 'font-size:13px' }, `${k === 1 ? 'Eliminates with one hit up close' : `Eliminates in ${k} ${plural(k, 'hit')} up close`}${falloff < 0.99 ? `; at long range damage ×${falloff.toFixed(2)}` : ''}${d.silenced ? ' · leaves no trace on the minimap' : ''}${d.laser ? ' · everyone sees the laser beam' : ''}${d.projectile ? ` · ${d.projectile.radius} px blast that catches you too` : ''}`),
  );
}

/** Short facts about a piece of equipment. */
function gadgetFacts(id: GadgetId): string[] {
  const g = GADGETS[id];
  const out = [`${g.charges} ${plural(g.charges, 'charge')} per life`];
  switch (id) {
    case 'f1':
      out.push(`goes off after ${secs(g.fuseMs)}`, `up to ${g.damage} damage, radius ${g.radius}`);
      break;
    case 'smoke':
      out.push(`smoke after ${secs(g.fuseMs)} for ${secs(g.durationMs)}`, `radius ${g.radius}`);
      break;
    case 'flash':
      out.push(`goes off after ${secs(g.fuseMs)}`, `blinds for up to ${secs(g.durationMs)}, radius ${g.radius}`, 'turn away and it won’t blind you');
      break;
    case 'molotov':
      out.push(`burns for ${secs(g.durationMs)}, radius ${g.radius}`, `${Math.round((g.damage * 1000) / 250)} damage per second`);
      break;
    case 'mine':
      out.push(`arms in ${secs(g.fuseMs)}`, `up to ${g.damage} damage, radius ${g.radius}`);
      break;
    case 'c4':
      out.push('blows on the second press', `up to ${g.damage} damage, radius ${g.radius}`);
      break;
    case 'turret':
      out.push(`fires for ${secs(g.durationMs)}, sees ${g.radius} px`, `${g.damage} damage per shot; it can be destroyed`);
      break;
  }
  if (g.selfFactor > 0 && g.damage > 0) out.push(`hurts you too (${Math.round(g.selfFactor * 100)}%)`);
  return out;
}

export function renderArsenal(o: ArsenalOptions): HTMLElement {
  let tab: ArsenalTab = o.tab ?? 'loadout';
  let inv: Inventory | null = o.online?.inventory ?? null;
  let cfg: ShopConfig | null = null;
  let busy = false;
  const online = o.online;
  const root = h('div', { class: 'col arsenal' });
  const walletEl = h('div', { class: 'wallet' });
  const tabsEl = h('div', { class: 'seg tabs', role: 'tablist' });
  const body = h('div', { class: 'col' });
  root.append(walletEl, tabsEl, body);

  const owned = (w: WeaponId) => (inv ? inv.weapons.includes(w) : FREE_WEAPONS.includes(w));
  const ownedGadget = (g: GadgetId) => (inv ? inv.gadgets.includes(g) : FREE_GADGETS.includes(g));
  const loadout = (): Loadout => inv?.loadout ?? { sidearm: 'pistol', melee: 'montirovka', primary: 'avtomat', gadget: 'f1', mods: {} };
  const fail = (e: unknown) => {
    sfx.play('dry');
    toast(e instanceof ApiError || e instanceof Error ? e.message : 'That didn’t work');
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
  const save = (next: Loadout, ok = 'Saved — applies from your next spawn') => {
    if (!online || !inv) return;
    void act(() => online.setLoadout(next), ok);
  };

  const drawWallet = () => {
    if (!online) {
      walletEl.replaceChildren(h('div', { class: 'muted' }, 'Demo version: the catalogue is for browsing. Talons, diamonds and purchases work in the online version; any weapon or piece of equipment can be tried on in practice.'));
      return;
    }
    walletEl.replaceChildren(
      h('div', { class: 'coin', title: 'Talons — earned in online matches' }, cur('tokens'), h('b', null, inv ? String(inv.tokens) : '…'), h('span', null, 'talons')),
      h('div', { class: 'coin', title: 'Diamonds — bought for money' }, cur('diamonds'), h('b', null, inv ? String(inv.diamonds) : '…'), h('span', null, 'diamonds')),
      h('button', { class: 'btn btn--small', onclick: () => ((tab = 'diamonds'), draw()) }, 'Top up'),
    );
  };

  const drawTabs = () => {
    const tabs: Array<[ArsenalTab, string]> = [
      ['loadout', 'Kit'],
      ['weapons', 'Weapons'],
      ['gear', 'Equipment'],
      ['characters', 'Characters'],
      ['case', 'Case'],
      ['diamonds', 'Diamonds'],
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
        h('span', { class: 'tag' }, `${slot} · ${SLOT_LABEL[slot]}`),
        h(
          'div',
          { class: 'slotpick' },
          ...options.map((w) => h('button', { class: `wbtn ${w === current ? 'on' : ''} ${w === focus ? 'focus' : ''}`, 'aria-pressed': String(w === current), title: WEAPONS[w].name, onclick: () => (w === current ? ((focus = w), draw()) : pick(slot, w)) }, weaponImg(w, 'wimg wimg--s'), h('span', null, WEAPONS[w].name))),
          slot === 3 ? h('button', { class: `wbtn ${current === null ? 'on' : ''}`, 'aria-pressed': String(current === null), onclick: () => pick(3, null) }, h('span', { class: 'none' }, '—'), h('span', null, 'Sidearm only')) : null,
        ),
        options.length < list.length ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((tab = 'weapons'), draw()) }, `${list.length - options.length} more in the shop →`) : null,
      );
    });
    const gadgetOptions = GADGET_IDS.filter(ownedGadget);
    const gadgetCard = h(
      'div',
      { class: 'panel col slotcard' },
      h('span', { class: 'tag' }, `4 · ${SLOT_LABEL[4]}`),
      h(
        'div',
        { class: 'slotpick' },
        ...gadgetOptions.map((g) => h('button', { class: `wbtn ${g === l.gadget ? 'on' : ''}`, 'aria-pressed': String(g === l.gadget), title: GADGETS[g].name, onclick: () => g !== l.gadget && save({ ...l, gadget: g }) }, gadgetImg(g, 'wimg wimg--s'), h('span', null, GADGETS[g].name))),
        h('button', { class: `wbtn ${l.gadget === null ? 'on' : ''}`, 'aria-pressed': String(l.gadget === null), onclick: () => l.gadget !== null && save({ ...l, gadget: null }) }, h('span', { class: 'none' }, '—'), h('span', null, 'No equipment')),
      ),
      gadgetOptions.length < GADGET_IDS.length ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((tab = 'gear'), draw()) }, `${GADGET_IDS.length - gadgetOptions.length} more in the shop →`) : null,
    );
    const fw = focus && owned(focus) ? focus : (l.primary ?? l.sidearm);
    return h('div', { class: 'col' }, h('div', { class: 'slots' }, ...slotCards, gadgetCard), modsPanel(fw, l), statBars(fw, l.mods[fw]));
  };

  /** Modifications of one weapon: buy (tokens), put on, take off, try on. */
  const modsPanel = (fw: WeaponId, l: Loadout): HTMLElement => {
    const fit = modsFor(WEAPONS[fw]);
    const equipped = l.mods[fw] ?? [];
    const head = h('div', { class: 'row', style: 'margin-top:6px;flex-wrap:nowrap' }, weaponImg(fw), h('div', { class: 'col grow', style: 'gap:2px' }, h('div', { class: 'h2' }, WEAPONS[fw].name), h('div', { class: 'muted' }, fit.length ? 'One modification per mount. They are bought with talons for a particular weapon, and each has a plus and a minus. Pick a weapon in the slots above to set it up.' : 'This weapon takes no modifications. Pick another weapon in the slots above.')));
    const setMods = (list: ModId[], ok: string) => save({ ...l, mods: { ...l.mods, [fw]: sanitizeMods(list, fw) } }, ok);
    const rows = fit.map((m) => {
      const def = MODS[m];
      const on = equipped.includes(m);
      const have = inv ? (inv.mods[fw]?.includes(m) ?? false) : false;
      const q = inv ? modQuote(inv, fw, m) : 'not_owned';
      let main: HTMLElement;
      if (on) main = h('button', { class: 'btn btn--small', disabled: !online, onclick: () => setMods(equipped.filter((x) => x !== m), `${def.name} removed`) }, 'Remove');
      else if (have) main = h('button', { class: 'btn btn--small btn--red', disabled: !online, onclick: () => setMods([m, ...equipped.filter((x) => MODS[x].mount !== def.mount)], `${def.name} fitted`) }, 'Fit');
      else
        main = h(
          'button',
          {
            class: `btn btn--small ${typeof q === 'string' ? '' : 'btn--red'}`,
            disabled: !online || (typeof q === 'string' && q !== 'funds'),
            title: typeof q === 'string' ? REFUSAL_TEXT[q] : '',
            onclick: () => {
              if (!online) return;
              if (q === 'funds') return void toast('Not enough talons — you earn them in online matches');
              void act(() => online.buyMod(fw, m), `${def.name} bought and fitted`);
            },
          },
          amount(MOD_PRICES[m], 'tokens'),
        );
      return h(
        'div',
        { class: `modrow ${on ? 'on' : ''}` },
        modImg(m),
        h('div', { class: 'col', style: 'gap:2px' }, h('div', null, h('b', null, def.name), h('span', { class: 'muted' }, ` · ${MOUNT_LABEL[def.mount]}`), on ? h('span', { class: 'badge badge--ok', style: 'margin-left:8px' }, 'Fitted') : null), h('div', { class: 'plus' }, `+ ${def.plus}`), h('div', { class: 'minus' }, `− ${def.minus}`)),
        h('div', { class: 'acts' }, main, h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onTry({ weapon: fw, mods: [m, ...equipped.filter((x) => MODS[x].mount !== def.mount)] }) }, 'Try on')),
      );
    });
    return h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Modifications'), head, ...rows);
  };

  // ── shop helpers ──────────────────────────────────────────────────────
  const itemName = (kind: ShopKind, id: string) => (kind === 'weapon' ? WEAPONS[id as WeaponId].name : kind === 'character' ? CHARACTERS[id as CharacterId].name : GADGETS[id as GadgetId].name);
  const buyButton = (kind: ShopKind, id: WeaponId | CharacterId | GadgetId, price: ShopPrice): HTMLElement => {
    if (!online || !inv) return h('button', { class: 'btn btn--small', disabled: true }, priceLabel(price));
    const r = buyRefusal(inv, kind, id);
    if (r === 'owned') return h('span', { class: 'badge badge--ok' }, 'Owned');
    const label: HTMLElement | string = r === 'level' ? `From level ${price.level}` : priceLabel(price);
    return h(
      'button',
      {
        class: `btn btn--small ${r ? '' : 'btn--red'}`,
        disabled: r === 'level',
        onclick: () => {
          if (r === 'funds') {
            toast(price.currency === 'tokens' ? 'Not enough talons — you earn them in online matches' : 'Not enough diamonds');
            if (price.currency === 'diamonds') ((tab = 'diamonds'), draw());
            return;
          }
          if (kind === 'gadget')
            // new equipment goes straight into slot 4
            return void act(async () => {
              const after = await online.buy('gadget', id);
              await online.setLoadout({ ...after.loadout, gadget: id as GadgetId });
            }, `${itemName(kind, id)} — now in your kit`);
          void act(() => online.buy(kind, id), kind === 'weapon' ? `${itemName(kind, id)} — yours now` : `${itemName(kind, id)} joins the business`);
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
      { class: `panel col wcard ${owned(w) ? 'owned' : ''}` },
      h('span', { class: 'tag' }, `${SLOT_LABEL[d.slot]}${d.tier === 'rare' ? ' · from the case' : ''}`),
      h('div', { class: 'wpic' }, weaponImg(w)),
      h('div', { class: 'h2' }, d.name),
      h('div', { class: 'muted' }, d.blurb),
      statBars(w),
      fit.length ? h('div', { class: 'modfit' }, 'Modifications:', ...fit.map((m) => h('span', { class: 'chip', title: `${MODS[m].name}: ${MODS[m].plus}; ${MODS[m].minus}` }, modImg(m, ''), MODS[m].name))) : null,
      h(
        'div',
        { class: 'row' },
        price ? buyButton('weapon', w, price) : owned(w) ? h('span', { class: 'badge badge--ok' }, 'Owned') : h('span', { class: 'badge' }, d.tier === 'rare' ? 'Case only' : 'Free'),
        h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onTry({ weapon: w }) }, 'Try on'),
        owned(w) && online ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((focus = w), (tab = 'loadout'), draw()) }, 'Set up') : null,
      ),
    );
  };

  const weaponsTab = (): HTMLElement => {
    const group = (title: string, note: string, list: WeaponId[]) =>
      h('div', { class: 'col' }, h('div', { class: 'row' }, h('div', { class: 'h2' }, title), h('span', { class: 'muted' }, note)), h('div', { class: 'cards' }, ...list.map(weaponCard)));
    const tokenNoLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level <= 1);
    const tokenLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level > 1);
    const forDiamonds = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'diamonds');
    return h(
      'div',
      { class: 'col' },
      h('div', { class: 'muted' }, 'Paid weapons aren’t stronger than the free ones — just different, each with its own pluses and minuses. Any of them can be tried on in practice first.'),
      group('Free', 'everyone has these', [...FREE_WEAPONS]),
      group('For talons', 'talons come with every online match', tokenNoLevel),
      group('For talons, by level', 'unlock as you rise through the ranks', tokenLevel),
      group('For diamonds', '$1.99 – $4.99', forDiamonds),
    );
  };

  // ── equipment (slot 4) ────────────────────────────────────────────────
  const gearTab = (): HTMLElement => {
    const l = loadout();
    return h(
      'div',
      { class: 'col' },
      h('div', { class: 'muted' }, 'Equipment is the fourth slot: grenades, mines, a C4 charge and the turret. You carry one kind; the charges are refilled every time you spawn. On a computer it’s the G key, on a phone a button of its own.'),
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
            h('span', { class: 'tag' }, d.use === 'throw' ? 'Throw' : d.use === 'place' ? 'Place' : 'Deploy'),
            h('div', { class: 'wpic' }, gadgetImg(g)),
            h('div', { class: 'h2' }, d.name),
            h('div', { class: 'muted' }, d.blurb),
            h('ul', { class: 'facts' }, ...gadgetFacts(g).map((f) => h('li', null, f))),
            h(
              'div',
              { class: 'row' },
              price ? buyButton('gadget', g, price) : h('span', { class: 'badge badge--ok' }, 'Free'),
              mine && online ? (inSlot ? h('span', { class: 'badge badge--ok' }, 'In your kit') : h('button', { class: 'btn btn--small', onclick: () => save({ ...l, gadget: g }, `${d.name} — now in your kit`) }, 'Take')) : null,
              h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onTry({ gadget: g }) }, 'Try on'),
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
      h('div', { class: 'muted' }, 'All characters have the same stats — they differ in looks and backstory. Half are unlocked with experience and talons, half with diamonds.'),
      h(
        'div',
        { class: 'cards' },
        ...SHOP_CHARACTERS.map((c) => {
          const d = CHARACTERS[c];
          const price = CHARACTER_PRICES[c]!;
          const mine = inv ? inv.characters.includes(c) : false;
          return h(
            'div',
            { class: `panel col ccard ${mine ? 'owned' : ''}` },
            h('span', { class: 'tag' }, d.species),
            h('div', { class: 'row', style: 'flex-wrap:nowrap;margin-top:6px' }, portrait(c), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 'h2' }, d.name), h('div', { class: 'nick' }, `«${d.nickname}»`), h('div', { class: 'muted' }, d.role))),
            h('div', { class: 'quote' }, `«${d.quote}»`),
            h('div', { class: 'lore' }, d.lore),
            h('div', { class: 'row' }, buyButton('character', c, price), o.onCharacter ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onCharacter!(c) }, 'View') : null),
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
        toast('Not enough diamonds');
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
          h('span', { class: 'tag' }, 'Confirmation'),
          h('div', { style: 'margin-top:8px' }, `Open the case for ${CASE_PRICE} ${diamondWord(CASE_PRICE)} ($${(CASE_PRICE / DIAMONDS_PER_USD).toFixed(2)})?`),
          h('div', { class: 'muted' }, 'Inside is a random rare weapon you don’t own yet. The odds are listed below. The purchase is final.'),
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
            ' I am 18 or older',
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
            'Open',
          ),
          h('button', { class: 'btn', onclick: close }, 'Cancel'),
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
            h('span', { class: 'tag' }, 'From the case'),
            h('div', { class: 'h1' }, WEAPONS[shown.weapon].name),
            h('div', { class: 'wpic wpic--big' }, weaponImg(shown.weapon)),
            h('div', { class: 'muted' }, `${RARITY_LABEL[shown.rarity]} · already in your arsenal`),
            h('div', { class: 'row' }, h('button', { class: 'btn btn--small', onclick: () => ((reveal = null), (focus = shown.weapon), (tab = 'loadout'), draw()) }, 'Add to kit'), h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((reveal = null), draw()) }, 'Close')),
          )
        : null,
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'The Defitsit Case'),
        h('div', { class: 'row', style: 'margin-top:6px' }, h('div', { class: 'crate' }), h('div', { class: 'col grow', style: 'gap:4px' }, h('div', { class: 'h2' }, 'Rare weapon · ', amount(CASE_PRICE, 'diamonds')), h('div', { class: 'muted' }, 'One of 10 rare guns. No duplicates: a weapon you already got from the case never drops again, and the odds of the rest are recalculated. Once the collection is complete, the case is no longer sold.'))),
        !enabled
          ? h('div', { class: 'badge badge--off' }, 'Cases are disabled on this server')
          : left === 0
            ? h('div', { class: 'badge badge--ok' }, 'Collection complete!')
            : h('button', { class: 'btn btn--red', disabled: !online, onclick: confirmAndOpen }, online ? h('span', null, 'Open for ', amount(CASE_PRICE, 'diamonds')) : 'Available in the online version'),
        h('div', { class: 'muted', style: 'font-size:13px' }, 'Adults only. Paid cases are banned in some countries — don’t buy them there. The odds below are honest and enforced by the server.'),
      ),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Odds'),
        h(
          'table',
          { class: 'table', style: 'margin-top:6px' },
          h('thead', null, h('tr', null, h('th', null, 'Weapon'), h('th', null, 'Rarity'), h('th', { class: 'num' }, 'Chance'))),
          h(
            'tbody',
            null,
            ...odds.map((e) =>
              h(
                'tr',
                { class: e.odds === 0 ? 'got' : '' },
                h('td', null, h('div', { class: 'row', style: 'flex-wrap:nowrap;gap:8px' }, weaponImg(e.weapon, 'wimg wimg--xs'), WEAPONS[e.weapon].name)),
                h('td', { class: `rar rar--${e.rarity}` }, RARITY_LABEL[e.rarity]),
                h('td', { class: 'num' }, e.odds === 0 && have.has(e.weapon) ? 'owned' : `${e.odds.toFixed(e.odds < 10 ? 1 : 0)}%`),
              ),
            ),
          ),
        ),
        h('div', { class: 'muted', style: 'font-size:13px' }, `Base odds (before anything is collected): ${CASE_TABLE.map((e) => `${WEAPONS[e.weapon].name} ${e.chance}%`).join(', ')}.`),
      ),
      h('div', { class: 'cards' }, ...CASE_TABLE.map((e) => weaponCard(e.weapon))),
    );
  };

  // ── diamonds ──────────────────────────────────────────────────────────
  const diamondsTab = (): HTMLElement => {
    if (!online) return h('div', { class: 'panel' }, 'Buying diamonds works in the online version of the game.');
    if (o.inTelegram) return h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Diamonds'), h('div', { style: 'margin-top:8px' }, 'Buying diamonds inside Telegram is coming soon (via Telegram Stars).'));
    const methods: Array<['card' | 'crypto', string]> = [];
    if (cfg?.card) methods.push(['card', 'By card']);
    if (cfg?.crypto) methods.push(['crypto', 'With crypto']);
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
        h('span', { class: 'tag' }, 'Diamonds'),
        h('div', { style: 'margin-top:8px' }, '100 diamonds = $1. Diamonds buy weapons, characters and cases. Talons are never sold for money — you earn them in matches and spend them on weapons, equipment and modifications.'),
        methods.length === 0
          ? h('div', { class: 'badge', style: 'align-self:flex-start' }, 'Payments are not connected yet — coming soon')
          : h('div', { class: 'muted' }, 'You pay on the payment provider’s secure page. The diamonds are credited automatically once the payment is confirmed.'),
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
            ...(methods.length ? methods.map(([m, label]) => h('button', { class: 'btn btn--small btn--red', onclick: () => buyPack(p.id, m) }, label)) : [h('button', { class: 'btn btn--small', disabled: true }, 'Soon')]),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, 'Purchases belong to your account. To keep them when you change devices, link an email in your profile.'),
    );
  };

  const draw = () => {
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
        inv = i;
        draw();
      })
      .catch((e: Error) => toast(`Arsenal: ${e.message}`));
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
  return p.currency === 'tokens' ? `Unlocks at level ${p.level} for ${p.amount} ${tokenWord(p.amount)}` : `Unlocks for ${p.amount} ${diamondWord(p.amount)} ($${(p.amount / DIAMONDS_PER_USD).toFixed(2)})`;
}

export { diamondWord as diamondsPlural };
