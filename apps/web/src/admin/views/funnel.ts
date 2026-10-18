/** Funnel: visitors and new players → played a match → came back on another day (+ paid, email). */
import type { AdminFunnel, AdminFunnelCohort } from '@blatkom/shared';
import { h, clear } from '../dom.js';
import { apiFetch, rangeQuery } from '../api.js';
import { num, pct, shortDay } from '../format.js';
import { lineChart, COLORS, emptyState } from '../charts.js';
import { rangePicker, getRange } from './range.js';

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Nested steps as bars relative to the first one, with conversion from the start and from the previous step. */
function steps(rows: Array<[string, number]>): HTMLElement {
  const first = rows[0]?.[1] ?? 0;
  if (first === 0) return emptyState('за период никого');
  return h(
    'div',
    { class: 'funnel' },
    ...rows.map(([label, value], i) => {
      const prev = i > 0 ? rows[i - 1]![1] : value;
      const w = Math.max(first > 0 ? (value / first) * 100 : 0, value > 0 ? 1 : 0);
      return h(
        'div',
        { class: 'funnel-row' },
        h('div', { class: 'funnel-label' }, label),
        h('div', { class: 'funnel-bar', title: `${label}: ${value}` }, h('i', { style: `width:${w.toFixed(1)}%` })),
        h('div', { class: 'funnel-num' }, num(value), h('small', {}, i === 0 ? pct(1) : `${pct(ratio(value, first))} · шаг ${pct(ratio(value, prev))}`)),
      );
    }),
  );
}

function side(c: AdminFunnelCohort): HTMLElement {
  return h(
    'div',
    { class: 'tiles small' },
    h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Привязали почту'), h('div', { class: 'tile-value' }, num(c.emailLinked)), h('div', { class: 'tile-hint' }, `${pct(ratio(c.emailLinked, c.registered))} от аккаунтов`)),
    h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Платили'), h('div', { class: 'tile-value' }, num(c.paid)), h('div', { class: 'tile-hint' }, `${pct(ratio(c.paid, c.registered))} от аккаунтов`)),
  );
}

export async function renderFunnel(root: HTMLElement): Promise<void> {
  clear(root);
  const body = h('div', { class: 'stack' }, h('div', { class: 'loading' }, 'Загрузка…'));
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Воронка'), rangePicker(() => void renderFunnel(root))), body);
  const f = await apiFetch<AdminFunnel>(`/api/admin/funnel?${rangeQuery(getRange())}`);
  clear(body);
  const v = f.visitors;
  const p = f.players;
  body.append(
    h('p', { class: 'note' }, `Период: ${f.range.firstDay} — ${f.range.lastDay} (UTC). Шаги вложены: «сыграли» — из получивших аккаунт, «вернулись» — из сыгравших (активность в любой следующий день после регистрации).`),
    h(
      'div',
      { class: 'grid2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Посетители сайта и мини-приложения'),
        steps([
          ['Открыли игру', v.entered],
          ['Получили аккаунт', v.registered],
          ['Сыграли матч', v.played],
          ['Вернулись в другой день', v.returned],
        ]),
        side(v),
        h('p', { class: 'note' }, 'Посетитель — анонимный случайный ID браузера, впервые увиденный в периоде. Аккаунт создаётся сам при первом запуске, так что разрыв на втором шаге — это те, у кого игра не загрузилась или вход не прошёл. Старые клиенты в Telegram не передают ID посетителя.'),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Новые игроки (любой способ входа)'),
        steps([
          ['Зарегистрировались', p.registered],
          ['Сыграли матч', p.played],
          ['Вернулись в другой день', p.returned],
        ]),
        side(p),
        h('p', { class: 'note' }, 'Все аккаунты, созданные в периоде: Telegram, браузер, почта.'),
      ),
    ),
  );
  const refTable = f.referrers.length
    ? h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table' },
          h('thead', {}, h('tr', {}, ...['Источник', 'Посетители', 'С аккаунтом', 'Конверсия'].map((t) => h('th', {}, t)))),
          h(
            'tbody',
            {},
            ...f.referrers.map((r) =>
              h('tr', {}, h('td', {}, r.key || 'прямой заход / Telegram'), h('td', { class: 'num' }, num(r.visitors)), h('td', { class: 'num' }, num(r.registered)), h('td', { class: 'num' }, pct(ratio(r.registered, r.visitors)))),
            ),
          ),
        ),
      )
    : emptyState();
  const days = f.daily.map((d) => shortDay(d.day));
  body.append(
    h(
      'div',
      { class: 'grid2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Посетители и регистрации по дням'),
        lineChart(
          days,
          [
            { name: 'Уникальные посетители', color: COLORS.blue, values: f.daily.map((d) => d.uniqueVisitors) },
            { name: 'Новые посетители', color: COLORS.amber, values: f.daily.map((d) => d.newVisitors) },
            { name: 'Регистрации', color: COLORS.red, values: f.daily.map((d) => d.registrations) },
          ],
          { ariaLabel: 'Посетители и регистрации по дням' },
        ),
      ),
      h('section', { class: 'card' }, h('h3', {}, 'Откуда приходят'), refTable, h('p', { class: 'note' }, 'Хранится только домен сайта, с которого перешли (без полного адреса).')),
    ),
  );
}
