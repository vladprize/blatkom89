/**
 * v0.2.24 (the owner: «карточки в полный рост — на главное меню, в ожидание подбора матча, в профиль друзей»):
 * fighter cards that fill a box the CSS lays out — the menu's hero, the matchmaking wait, the lobby's line of
 * fighters, a friend's profile. The box's size picks the card's (tall, never wider or taller than the box); the
 * card is drawn again when the box changes size or other data comes. A box sized by its content would never
 * settle, so the CSS gives every slot a size of its own (a width and an aspect ratio, or a flexible height).
 */
import { h } from './dom.js';
import { FighterCard } from './fighterCard.js';
import type { FighterCardData } from './fighterCard.js';
import { t } from '../i18n/index.js';
import { CHARACTERS, DEFAULT_LOADOUT, FINISHES, GRADE_RANK, skinId, skinPerks } from '@blatkom/shared';
import type { CharacterId, FinishId, Inventory, Loadout, RosterEntry, WeaponId } from '@blatkom/shared';

export const RATIO = 1.42;

/** A stable key of what a card shows (a new card only when it changes or the size does). */
function keyOf(d: FighterCardData): string {
  return [d.name, d.character, d.level ?? '', d.weapon, d.finish ?? '', d.kills ?? '', d.label ?? ''].join('|');
}

interface SlotOptions {
  className?: string;
  /** The full-height picture even when the card is small. */
  full?: boolean;
  /** A thumbnail: no alias, counter or level on it. */
  mini?: boolean;
  /** Tapping the card (it becomes a button). */
  onOpen?: (d: FighterCardData) => void;
  testid?: string;
}

/** One card filling its box. */
export class CardSlot {
  readonly el: HTMLElement;
  private card: FighterCard | null = null;
  private data: FighterCardData;
  private width = 0;
  private key = '';
  private readonly ro: ResizeObserver | null = null;

  constructor(
    data: FighterCardData,
    private readonly o: SlotOptions = {},
  ) {
    this.data = data;
    this.el = h(o.onOpen ? 'button' : 'div', {
      class: `cardslot ${o.className ?? ''}`,
      ...(o.onOpen ? { type: 'button', 'aria-label': t('Show the fighter card'), onclick: () => o.onOpen?.(this.data) } : {}),
      ...(o.testid ? { 'data-testid': o.testid } : {}),
    });
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(this.el);
    }
    requestAnimationFrame(() => this.fit());
  }

  /** Other data (the same canvas when only what it shows changed). */
  set(d: FighterCardData): void {
    this.data = d;
    const k = keyOf(d);
    if (k === this.key) return;
    this.key = k;
    if (this.card) this.card.set(d);
    else this.fit();
  }

  private fit(): void {
    const r = this.el.getBoundingClientRect();
    const cs = getComputedStyle(this.el);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const w = Math.floor(Math.min(r.width - padX, (r.height - padY) / RATIO));
    if (!(w >= 40)) return;
    if (this.card && Math.abs(w - this.width) < 3 && this.card.el.isConnected) return;
    this.width = w;
    this.key = keyOf(this.data);
    this.card?.destroy();
    this.card = new FighterCard(this.data, { width: w, ratio: RATIO, ...(this.o.full ? { full: true } : {}), ...(this.o.mini ? { mini: true } : {}) });
    this.el.replaceChildren(this.card.el);
  }
}

interface RowItem {
  id: string;
  data: FighterCardData;
}

export interface RowLayout {
  rows: number;
  cols: number;
  /** The width of each card. */
  w: number;
  /** One line wider than the box, scrolled sideways (a phone's strip of ten). */
  scroll: boolean;
}

/**
 * How `n` cards share a `width`×`height` box: in one row or two, whichever gives the bigger cards (at most `max`
 * px wide); when even that leaves them narrower than `minWidth` and the box is too narrow (not too low), one line
 * as tall as the box that scrolls sideways.
 */
export function cardRowLayout(n: number, width: number, height: number, o: { gap?: number; max?: number; minWidth?: number } = {}): RowLayout {
  const gap = o.gap ?? 8;
  const max = o.max ?? 220;
  const minWidth = o.minWidth ?? 56;
  let best: RowLayout = { rows: 1, cols: Math.max(1, n), w: 0, scroll: false };
  for (const rows of n > 1 ? [1, 2] : [1]) {
    const cols = Math.ceil(n / rows);
    const byWidth = (width - gap * (cols - 1)) / cols;
    const byHeight = (height - gap * (rows - 1)) / rows / RATIO;
    const w = Math.floor(Math.min(max, byWidth, byHeight));
    if (w > best.w) best = { rows, cols, w, scroll: false };
  }
  // a strip: as tall as the box (less room for a scrollbar where one takes room) — only when it gives bigger cards
  const strip = Math.max(40, Math.floor(Math.min(max, (height - 10) / RATIO)));
  if (best.w >= minWidth || best.w >= strip) return best;
  return { rows: 1, cols: Math.max(1, n), w: strip, scroll: true };
}

/**
 * A line of cards sharing a box: as big as the box allows (at most `max` px wide), in one row or two (the lobby:
 * up to ten fighters), or a strip scrolled sideways when the box is too low for two rows (phones).
 */
export class CardRow {
  readonly el: HTMLElement;
  private items: RowItem[] = [];
  private readonly cards = new Map<string, { card: FighterCard; key: string; wrap: HTMLElement }>();
  private width = 0;
  private dirty = true;
  private readonly ro: ResizeObserver | null = null;

  constructor(
    private readonly o: {
      className?: string;
      max?: number;
      minWidth?: number;
      full?: boolean;
      /**
       * The box around the row (its parent) takes what space is left: too little for a card, and the box steps
       * aside (`cardpanel--off`: no frame, nothing shown) until there is room again.
       */
      collapse?: boolean;
      onOpen?: (d: FighterCardData) => void;
      testid?: string;
    } = {},
  ) {
    this.el = h('div', { class: `cardrow ${o.className ?? ''}`, ...(o.testid ? { 'data-testid': o.testid } : {}) });
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(this.el);
    }
  }

  set(items: RowItem[]): void {
    this.items = items;
    this.dirty = true;
    this.layout();
    requestAnimationFrame(() => this.layout());
  }

  private layout(): void {
    const n = this.items.length;
    const r = this.el.getBoundingClientRect();
    const cs = getComputedStyle(this.el);
    const innerW = r.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const innerH = r.height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const panel = this.o.collapse ? this.el.parentElement : null;
    if (panel && this.el.isConnected) {
      // hysteresis: off below a card's height, on again only with clearly more room (no flicker at the edge)
      const off = panel.classList.contains('cardpanel--off');
      if (!off && innerH < 60) panel.classList.add('cardpanel--off');
      else if (off && panel.getBoundingClientRect().height >= 104) panel.classList.remove('cardpanel--off');
      if (panel.classList.contains('cardpanel--off')) return;
    }
    if (!n || innerW < 40 || innerH < 40) {
      if (!n) {
        for (const c of this.cards.values()) c.card.destroy();
        this.cards.clear();
        this.el.replaceChildren();
        this.dirty = false;
      }
      return;
    }
    const L = cardRowLayout(n, innerW, innerH, {
      ...(this.o.max ? { max: this.o.max } : {}),
      ...(this.o.minWidth ? { minWidth: this.o.minWidth } : {}),
    });
    const w = L.w;
    const resized = Math.abs(w - this.width) >= 3;
    this.el.classList.toggle('cardrow--scroll', L.scroll);
    if (!this.dirty && !resized) return;
    this.dirty = false;
    this.width = w;
    this.el.style.setProperty('--card-cols', String(L.cols));
    const keep = new Set(this.items.map((i) => i.id));
    for (const [id, c] of this.cards) {
      if (!keep.has(id) || resized) {
        c.card.destroy();
        this.cards.delete(id);
      }
    }
    const els = this.items.map((it) => {
      const k = keyOf(it.data);
      let c = this.cards.get(it.id);
      if (c && c.key !== k) {
        c.card.set(it.data);
        c.key = k;
      }
      if (!c) {
        const card = new FighterCard(it.data, { width: w, ratio: RATIO, ...(this.o.full ? { full: true } : {}) });
        const wrap = this.o.onOpen
          ? h('button', { class: 'cardrow__item', type: 'button', 'data-id': it.id, 'aria-label': t('Show the fighter card'), onclick: () => this.o.onOpen?.(this.items.find((i) => i.id === it.id)?.data ?? it.data) }, card.el)
          : h('div', { class: 'cardrow__item', 'data-id': it.id }, card.el);
        c = { card, key: k, wrap };
        this.cards.set(it.id, c);
      }
      return c.wrap;
    });
    this.el.replaceChildren(...els);
  }
}

/** The weapon a player shows off on their card: the one in their best skin, or the automatic. */
export function showOffWeapon(skins: Partial<Record<WeaponId, FinishId>> | undefined, fallback: WeaponId = 'avtomat'): { weapon: WeaponId; finish: FinishId | null } {
  let best: { weapon: WeaponId; finish: FinishId } | null = null;
  for (const [w, f] of Object.entries(skins ?? {}) as [WeaponId, FinishId][]) {
    if (!f || !FINISHES[f]) continue;
    if (!best || GRADE_RANK[FINISHES[f].rarity] > GRADE_RANK[FINISHES[best.finish].rarity]) best = { weapon: w, finish: f };
  }
  return best ?? { weapon: fallback, finish: skins?.[fallback] ?? null };
}

/** A lobby player's card (the skin they show off, their counter as it stood). */
export function rosterCard(p: RosterEntry): FighterCardData {
  const { weapon, finish } = showOffWeapon(p.skins);
  return { name: p.name, character: p.character, level: p.level, weapon, finish, kills: finish && skinPerks(finish)?.counter ? (p.skinKills?.[weapon] ?? 0) : null };
}

/** The player's own card: their character, the main weapon of their kit in its skin, the counter. */
export function ownCard(o: { name: string; character: CharacterId; level: number | null; inventory: Inventory | null | undefined }): FighterCardData {
  const l: Loadout = o.inventory?.loadout ?? { ...DEFAULT_LOADOUT, mods: {}, skins: {} };
  const weapon: WeaponId = l.primary ?? l.sidearm;
  const finish = (l.skins?.[weapon] ?? null) as FinishId | null;
  const kills = finish && skinPerks(finish)?.counter ? (o.inventory?.skinKills?.[skinId(weapon, finish)] ?? 0) : null;
  return { name: o.name, character: CHARACTERS[o.character] ? o.character : 'petya', level: o.level, weapon, finish, kills };
}
