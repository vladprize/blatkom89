/**
 * v0.2.24 — the Season Pass on screen (packages/shared/src/game-rules/pass.ts): its weeks as a track (the
 * opened ones with what they gave, the ready ones lit, the next ones with their dates), and the sheet that
 * shows what the weeks just opened gave — each a fighter card with the new character holding the new skin.
 */
import { CHARACTERS, FINISHES, GRADE_COLORS } from '@blatkom/shared';
import type { CharacterId, PassDrop, PassState } from '@blatkom/shared';
import { h } from './dom.js';
import { FighterCard } from './fighterCard.js';
import { openSheet } from './sheet.js';
import { getLang, t } from '../i18n/index.js';
import { charText, finishName, rarityLabel, weaponName } from '../i18n/content.js';

/** «15 дек» / «15 Dec». */
export function passDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' }).format(d).replace('.', '');
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** The pass's weeks in a row: what each gave, or that it is ready, or when it opens. */
export function passWeeksTrack(s: PassState): HTMLElement {
  return h(
    'div',
    { class: 'passweeks', 'data-testid': 'pass-weeks', style: `--weeks:${Math.max(1, s.weeks.length)}` },
    ...s.weeks.map((w) => {
      const d = w.drop;
      const state = d ? 'open' : w.due && s.owned ? 'ready' : 'later';
      return h(
        'div',
        { class: `passweek passweek--${state}`, 'data-week': String(w.week), 'data-state': state },
        h('b', null, t('Week {n}', { n: w.week })),
        d
          ? h(
              'span',
              { class: 'passweek__got' },
              d.character ? h('i', { style: `color:${GRADE_COLORS[d.character.grade]}` }, charText(d.character.character).name) : null,
              d.skin ? h('i', { style: `color:${GRADE_COLORS[d.skin.rarity]}` }, finishName(d.skin.finish)) : null,
              d.blats ? h('i', null, `+${d.blats} BLATS`) : null,
            )
          : h('span', { class: 'passweek__when' }, state === 'ready' ? t('ready') : t('from {date}', { date: passDate(w.opensAt) })),
      );
    }),
  );
}

/** What a week gave, in words under its card. */
function dropLines(d: PassDrop): HTMLElement {
  return h(
    'div',
    { class: 'passdrop__lines' },
    d.character
      ? h('div', null, h('b', { style: `color:${GRADE_COLORS[d.character.grade]}` }, charText(d.character.character).name), ` · ${rarityLabel(d.character.grade)} · ${t('joined your crew')}`)
      : null,
    d.skin ? h('div', null, `${weaponName(d.skin.weapon)} · `, h('b', { style: `color:${GRADE_COLORS[d.skin.rarity]}` }, `«${finishName(d.skin.finish)}»`), ` · ${rarityLabel(d.skin.rarity)}`) : null,
    d.blats ? h('div', { class: 'muted' }, t('+{n} BLATS instead — there was nothing left to give', { n: d.blats })) : null,
  );
}

/**
 * The weeks just opened, each a fighter card: the new character (or the player's own, when the week gave BLATS
 * instead) holding the new skin on its weapon.
 */
export function openPassReveal(root: HTMLElement, drops: readonly PassDrop[], o: { name: string; character: CharacterId; level: number | null; onClose?: () => void }): void {
  if (!drops.length) return;
  const narrow = typeof window !== 'undefined' && window.innerWidth < 560;
  const width = drops.length > 2 || narrow ? (narrow ? 132 : 164) : 210;
  const cards: FighterCard[] = [];
  const body = h(
    'div',
    { class: 'passreveal', 'data-testid': 'pass-reveal' },
    ...drops.map((d) => {
      const card = new FighterCard(
        {
          name: o.name,
          character: d.character?.character ?? (CHARACTERS[o.character] ? o.character : 'petya'),
          level: o.level,
          weapon: d.skin?.weapon ?? 'avtomat',
          finish: d.skin?.finish && FINISHES[d.skin.finish] ? d.skin.finish : null,
          kills: null,
          label: t('Week {n}', { n: d.week }),
          labelColor: '#a8761e',
        },
        { width, ratio: 1.42, full: true },
      );
      cards.push(card);
      return h('div', { class: 'passdrop', 'data-week': String(d.week) }, card.el, dropLines(d));
    }),
  );
  openSheet(root, {
    title: t('From the Season Pass'),
    testid: 'pass-reveal-sheet',
    cls: 'sheet--pass',
    body,
    onClose: () => {
      for (const c of cards) c.destroy();
      o.onClose?.();
    },
  });
}
