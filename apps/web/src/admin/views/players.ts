/** Players table: search, sortable columns, pagination. */
import type { AdminPlayersPage } from '@blatkom/shared';
import { h, clear } from '../dom.js';
import { apiFetch } from '../api.js';
import { num, dateTime, playtime } from '../format.js';

interface State {
  q: string;
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}
const state: State = { q: '', sort: 'created', dir: 'desc', page: 1, pageSize: 25 };

const COLUMNS: Array<{ key: string | null; label: string }> = [
  { key: null, label: 'ID' },
  { key: 'name', label: 'Имя' },
  { key: null, label: 'Telegram ID' },
  { key: 'created', label: 'Регистрация' },
  { key: 'last_seen', label: 'Активность' },
  { key: 'level', label: 'Ур.' },
  { key: 'xp', label: 'XP' },
  { key: 'matches', label: 'Матчи' },
  { key: 'wins', label: 'Победы' },
  { key: 'losses', label: 'Пораж.' },
  { key: 'kills', label: 'Устранения' },
  { key: 'assists', label: 'Помощь' },
  { key: 'playtime', label: 'Время в игре' },
];

export async function renderPlayers(root: HTMLElement): Promise<void> {
  clear(root);
  const search = h('input', { type: 'search', placeholder: 'Имя, Telegram ID или внутренний ID', value: state.q, class: 'search', 'aria-label': 'Поиск игроков' });
  const tableHost = h('div', { class: 'card' }, h('div', { class: 'loading' }, 'Загрузка…'));
  const load = async () => {
    const p = new URLSearchParams({ q: state.q, sort: state.sort, dir: state.dir, page: String(state.page), pageSize: String(state.pageSize) });
    const data = await apiFetch<AdminPlayersPage>(`/api/admin/players?${p}`);
    clear(tableHost);
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    const head = h(
      'tr',
      {},
      ...COLUMNS.map((c) =>
        h(
          'th',
          {
            class: c.key ? 'sortable' : '',
            onclick: c.key
              ? () => {
                  if (state.sort === c.key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                  else {
                    state.sort = c.key!;
                    state.dir = c.key === 'name' ? 'asc' : 'desc';
                  }
                  state.page = 1;
                  void load();
                }
              : undefined,
          },
          c.label,
          c.key === data.sort ? (data.dir === 'asc' ? ' ▲' : ' ▼') : '',
        ),
      ),
    );
    const rows = data.rows.map((r) =>
      h(
        'tr',
        { class: 'clickable', onclick: () => (location.hash = `#/players/${r.id}`) },
        h('td', { class: 'mono', title: r.id }, r.id.slice(0, 8)),
        h('td', {}, r.displayName),
        h('td', { class: 'mono' }, r.telegramId ?? '—'),
        h('td', {}, dateTime(r.createdAt)),
        h('td', {}, dateTime(r.lastSeenAt)),
        h('td', { class: 'num' }, num(r.level)),
        h('td', { class: 'num' }, num(r.xp)),
        h('td', { class: 'num' }, num(r.matches)),
        h('td', { class: 'num' }, num(r.wins)),
        h('td', { class: 'num' }, num(r.losses)),
        h('td', { class: 'num' }, num(r.kills)),
        h('td', { class: 'num' }, num(r.assists)),
        h('td', { class: 'num' }, playtime(r.playtimeSec)),
      ),
    );
    tableHost.append(
      data.total === 0 ? h('div', { class: 'chart-empty' }, state.q ? 'Никого не нашли' : 'Игроков пока нет') : h('div', { class: 'table-scroll' }, h('table', { class: 'table' }, h('thead', {}, head), h('tbody', {}, ...rows))),
      h(
        'div',
        { class: 'pager' },
        h('button', { class: 'chip', disabled: state.page <= 1, onclick: () => { state.page--; void load(); } }, '← Назад'),
        h('span', {}, `Стр. ${data.page} из ${pages} · всего ${num(data.total)}`),
        h('button', { class: 'chip', disabled: state.page >= pages, onclick: () => { state.page++; void load(); } }, 'Вперёд →'),
      ),
    );
  };
  let timer: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.q = search.value.trim();
      state.page = 1;
      void load();
    }, 300);
  });
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Игроки'), search), tableHost);
  await load();
}
