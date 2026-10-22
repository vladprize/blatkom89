/**
 * Map picker: square tiles — the top-down picture of the map (tools/map-thumbs.mjs) centred above a
 * caption band that is the same on every tile; all captions share one font size that fits the
 * longest name (ui/fit.ts), so no name leaves its tile.
 */
import { MAP_ORDER } from '@blatkom/shared';
import type { MapId } from '@blatkom/shared';
import { h, asset } from './dom.js';
import { autoFit } from './fit.js';
import { mapBlurb, mapName } from '../i18n/content.js';
import { t } from '../i18n/index.js';
import { openSheet } from './sheet.js';

export function mapThumb(id: MapId): HTMLImageElement {
  // no lazy loading: iOS Safari never loads lazy pictures inside a sheet (a fixed overlay) — the
  // ten small JPEGs are cheap to load at once
  return h('img', { class: 'maptile__img', src: asset(`assets/maps/${id}.jpg`), alt: '', draggable: 'false', width: 320, height: 220 });
}

/**
 * A grid of map tiles. `onPick` is omitted for a read-only grid (lobby guests see the host's map).
 * The blurb of the selected map is shown under the grid.
 */
export function mapPicker(o: { selected: MapId; onPick?: (m: MapId) => void; maps?: readonly MapId[]; showBlurb?: boolean }): HTMLElement {
  let selected = o.selected;
  const blurb = h('div', { class: 'muted maps__blurb' });
  const tiles = (o.maps ?? MAP_ORDER).map((id) =>
    h(
      'button',
      {
        class: 'maptile',
        role: 'radio',
        'data-map': id,
        title: mapBlurb(id),
        onclick: () => {
          if (!o.onPick || id === selected) return;
          selected = id;
          mark();
          o.onPick(id);
        },
      },
      h('span', { class: 'maptile__pic' }, mapThumb(id)),
      h('span', { class: 'maptile__name' }, h('span', { class: 'maptile__text' }, mapName(id))),
    ),
  );
  const mark = () => {
    for (const tile of tiles) {
      const on = tile.dataset.map === selected;
      tile.setAttribute('aria-checked', String(on));
      tile.setAttribute('aria-pressed', String(on));
      tile.disabled = !o.onPick && !on;
    }
    blurb.textContent = `${mapName(selected)}: ${mapBlurb(selected)}`;
  };
  mark();
  const grid = h('div', { class: 'maps', role: 'radiogroup' }, ...tiles);
  autoFit(grid, () => tiles.map((t) => t.querySelector<HTMLElement>('.maptile__name')!), { max: 15, min: 9, lines: 2 });
  return h('div', { class: 'col', style: 'gap:8px' }, grid, o.showBlurb === false ? null : blurb);
}

/**
 * The map choice that fits a phone screen: on wide screens the full tile grid (mapPicker); on phones
 * one line — the picture, the name and «Change» — that opens the grid in a sheet. Both are in the DOM
 * and CSS shows the right one (≤ 560 px: `.mapfield__line`).
 */
export function mapField(o: { selected: MapId; onPick?: (m: MapId) => void; showBlurb?: boolean; variant?: 'auto' | 'line' }): HTMLElement {
  let selected = o.selected;
  const wrap = h('div', { class: `mapfield ${o.variant === 'line' ? 'mapfield--line' : ''}` });
  const grid = h('div', { class: 'mapfield__grid' });
  const line = h('div', { class: 'mapfield__line', 'data-testid': 'map-line' });
  const pick = o.onPick
    ? (m: MapId) => {
        selected = m;
        draw();
        o.onPick!(m);
      }
    : undefined;
  const draw = () => {
    if (o.variant !== 'line') grid.replaceChildren(mapPicker({ selected, ...(pick ? { onPick: pick } : {}), ...(o.showBlurb === false ? { showBlurb: false } : {}) }));
    const thumb = mapThumb(selected);
    line.replaceChildren(h('span', { class: 'mapfield__pic' }, thumb), h('span', { class: 'mapfield__txt' }, h('b', null, mapName(selected)), h('small', { class: 'muted' }, mapBlurb(selected))));
    const btn = pick
        ? h(
            'button',
            {
              class: 'btn btn--small mapfield__btn',
              'data-testid': 'map-change',
              onclick: () => {
                const sheet = openSheet(document.getElementById('ui')!, {
                  title: t('Map'),
                  testid: 'map-sheet',
                  body: mapPicker({
                    selected,
                    onPick: (m) => {
                      sheet.close();
                      pick(m);
                    },
                  }),
                });
              },
            },
            t('Change'),
          )
        : null;
    if (btn) line.append(btn);
  };
  draw();
  wrap.append(grid, line);
  return wrap;
}
