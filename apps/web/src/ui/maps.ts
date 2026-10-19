/** Map picker: square top-down thumbnails (tools/map-thumbs.mjs) with the name in the bottom band. */
import { MAP_ORDER } from '@blatkom/shared';
import type { MapId } from '@blatkom/shared';
import { h, asset } from './dom.js';
import { mapBlurb, mapName } from '../i18n/content.js';

export function mapThumb(id: MapId): HTMLImageElement {
  return h('img', { class: 'maptile__img', src: asset(`assets/maps/${id}.jpg`), alt: '', draggable: 'false', width: 320, height: 320, loading: 'lazy' });
}

/**
 * A grid of map tiles. `onPick` is omitted for a read-only grid (lobby guests see the host's map).
 * The blurb of the selected map is shown under the grid.
 */
export function mapPicker(o: { selected: MapId; onPick?: (m: MapId) => void; maps?: readonly MapId[]; showBlurb?: boolean }): HTMLElement {
  let selected = o.selected;
  const grid = h('div', { class: 'maps', role: 'radiogroup' });
  const blurb = h('div', { class: 'muted maps__blurb' });
  const draw = () => {
    grid.replaceChildren(
      ...(o.maps ?? MAP_ORDER).map((id) =>
        h(
          'button',
          {
            class: 'maptile',
            role: 'radio',
            'aria-checked': String(id === selected),
            'aria-pressed': String(id === selected),
            'data-map': id,
            title: mapBlurb(id),
            disabled: !o.onPick && id !== selected,
            onclick: () => {
              if (!o.onPick || id === selected) return;
              selected = id;
              draw();
              o.onPick(id);
            },
          },
          mapThumb(id),
          h('span', { class: 'maptile__name' }, mapName(id)),
        ),
      ),
    );
    blurb.textContent = `${mapName(selected)}: ${mapBlurb(selected)}`;
  };
  draw();
  return h('div', { class: 'col', style: 'gap:8px' }, grid, o.showBlurb === false ? null : blurb);
}
