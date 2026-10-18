/** Technical errors grouped by fingerprint with recurrence counts. */
import type { AdminErrorGroup } from '@blatkom/shared';
import { h, clear } from '../dom.js';
import { apiFetch, rangeQuery } from '../api.js';
import { dateTime, num } from '../format.js';
import { rangePicker, getRange } from './range.js';

export async function renderErrors(root: HTMLElement): Promise<void> {
  clear(root);
  const host = h('section', { class: 'card' }, h('div', { class: 'loading' }, 'Загрузка…'));
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Технические ошибки'), rangePicker(() => void renderErrors(root))), host);
  const groups = await apiFetch<AdminErrorGroup[]>(`/api/admin/errors?${rangeQuery(getRange())}`);
  clear(host);
  if (groups.length === 0) {
    host.append(h('div', { class: 'chart-empty' }, 'За период ошибок нет'));
    return;
  }
  host.append(
    h('p', { class: 'note' }, `Групп: ${num(groups.length)}, событий: ${num(groups.reduce((a, g) => a + g.count, 0))}. Сообщения очищены от токенов, e-mail и длинных идентификаторов.`),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, ...['Кол-во', 'Последняя', 'Первая', 'Источник', 'Компонент / категория', 'Сообщение', 'Версии клиента', 'Версии сервера', 'Сессии'].map((t) => h('th', {}, t)))),
        h(
          'tbody',
          {},
          ...groups.map((g) =>
            h(
              'tr',
              {},
              h('td', { class: 'num strong' }, num(g.count)),
              h('td', {}, dateTime(g.lastSeen)),
              h('td', {}, dateTime(g.firstSeen)),
              h('td', {}, g.source === 'client' ? 'клиент' : 'сервер'),
              h('td', {}, `${g.component} / ${g.category}`),
              h('td', { class: 'msg', title: g.fingerprint }, g.message),
              h('td', {}, g.clientVersions.join(', ') || '—'),
              h('td', {}, g.serverVersions.join(', ') || '—'),
              h('td', { class: 'mono' }, g.sessionIds.map((s) => s.slice(0, 8)).join(' ') || '—'),
            ),
          ),
        ),
      ),
    ),
  );
}
