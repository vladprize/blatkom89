/** Shared period selector (24ч/7д/30д/90д/custom) — state kept for the session. */
import { h } from '../dom.js';

export interface RangeState {
  key: '24h' | '7d' | '30d' | '90d' | 'custom';
  from?: string;
  to?: string;
}

const STORAGE_KEY = 'blk_admin_range';

function load(): RangeState {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as RangeState | null;
    if (v && ['24h', '7d', '30d', '90d', 'custom'].includes(v.key)) return v;
  } catch {
    /* storage unavailable */
  }
  return { key: '7d' };
}

let current: RangeState = load();

export function getRange(): RangeState {
  return current;
}

function save(r: RangeState) {
  current = r;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

const LABELS: Array<[RangeState['key'], string]> = [
  ['24h', '24 часа'],
  ['7d', '7 дней'],
  ['30d', '30 дней'],
  ['90d', '90 дней'],
];

const DAY_MS = 86_400_000;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** UTC day span of a preset, mirroring the server's resolveRange (prefills the custom inputs). */
function presetDays(key: RangeState['key'], now = Date.now()): [string, string] {
  if (key === '24h') return [utcDay(now - DAY_MS), utcDay(now)];
  const n = key === '30d' ? 30 : key === '90d' ? 90 : 7;
  return [utcDay(now - (n - 1) * DAY_MS), utcDay(now)];
}

export function rangePicker(onChange: () => void): HTMLElement {
  const today = utcDay(Date.now());
  const [presetFrom, presetTo] = current.key === 'custom' ? [current.from ?? today, current.to ?? today] : presetDays(current.key);
  const from = h('input', { type: 'date', value: presetFrom, max: today, 'aria-label': 'С' });
  const to = h('input', { type: 'date', value: presetTo, max: today, 'aria-label': 'По' });
  const wrap = h('div', { class: 'range' });
  for (const [key, label] of LABELS) {
    wrap.append(
      h(
        'button',
        {
          class: `chip${current.key === key ? ' active' : ''}`,
          onclick: () => {
            save({ key });
            onChange();
          },
        },
        label,
      ),
    );
  }
  wrap.append(
    h(
      'span',
      { class: `custom${current.key === 'custom' ? ' active' : ''}` },
      'Период:',
      from,
      '—',
      to,
      h(
        'button',
        {
          class: 'chip',
          onclick: () => {
            if (!from.value || !to.value) return;
            save({ key: 'custom', from: from.value, to: to.value });
            onChange();
          },
        },
        'Показать',
      ),
    ),
  );
  return wrap;
}
