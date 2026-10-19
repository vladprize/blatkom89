/** Overview: KPI tiles + charts for the selected period + live rooms. */
import type { AdminCharts, AdminOverview } from '@blatkom/shared';
import { h, clear } from '../dom.js';
import { apiFetch, rangeQuery } from '../api.js';
import { num, pct, duration, shortDay, MAP_NAMES, MODE_NAMES, CHARACTER_NAMES, PLATFORM_NAMES, dateTime } from '../format.js';
import { lineChart, barChart, hBarChart, COLORS } from '../charts.js';
import { rangePicker, getRange } from './range.js';

interface RoomInfo {
  id: string;
  mapId: string;
  /** The server's (English) map name, shown only for maps this panel doesn't know yet. */
  mapName: string;
  mode?: string;
  phase: string;
  players: number;
  maxPlayers: number;
  isPrivate: boolean;
  createdAt: string;
}

const PHASES: Record<string, string> = { waiting: 'Лобби', ready: 'Готовность', countdown: 'Отсчёт', active: 'Матч', finished: 'Итоги', closed: 'Закрыта' };

function tile(label: string, value: string, hint?: string): HTMLElement {
  return h('div', { class: `tile${value === 'нет данных' ? ' muted' : ''}` }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), hint ? h('div', { class: 'tile-hint' }, hint) : null);
}

function card(title: string, body: HTMLElement, note?: string): HTMLElement {
  return h('section', { class: 'card' }, h('h3', {}, title), body, note ? h('p', { class: 'note' }, note) : null);
}

export async function renderOverview(root: HTMLElement): Promise<void> {
  clear(root);
  const body = h('div', { class: 'stack' }, h('div', { class: 'loading' }, 'Загрузка…'));
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Обзор'), rangePicker(() => void renderOverview(root))), body);
  const q = rangeQuery(getRange());
  const [o, c, rooms] = await Promise.all([
    apiFetch<AdminOverview>(`/api/admin/overview?${q}`),
    apiFetch<AdminCharts>(`/api/admin/charts?${q}`),
    apiFetch<RoomInfo[]>('/api/admin/rooms'),
  ]);
  clear(body);
  body.append(
    h('p', { class: 'note' }, `Период: ${o.range.firstDay} — ${o.range.lastDay} (UTC). Обновлено ${dateTime(o.generatedAt)}.`),
    h(
      'div',
      { class: 'tiles' },
      tile('Всего игроков', num(o.totalPlayers)),
      tile('Новые игроки', num(o.newPlayers)),
      tile('DAU', num(o.dau), `за ${o.range.lastDay}`),
      tile('WAU', num(o.wau), '7 дней до конца периода'),
      tile('MAU', num(o.mau), '30 дней до конца периода'),
      tile('Матчи начаты', num(o.matchesStarted)),
      tile('Матчи завершены', num(o.matchesCompleted)),
      tile('Активные комнаты', num(o.activeRooms), 'сейчас'),
      tile('Ср. длительность матча', duration(o.avgMatchDurationMs)),
      tile('Ср. длительность сессии', duration(o.avgSessionDurationMs), 'по событию session_ended'),
      tile('Конверсия в 1-й матч', pct(o.firstMatchConversion), 'новые игроки периода'),
      tile('Удержание D1', pct(o.d1Retention), `когорта: ${num(o.d1CohortSize)}`),
      tile('Удержание D7', pct(o.d7Retention), `когорта: ${num(o.d7CohortSize)}`),
      tile('Тех. ошибки', num(o.errorCount)),
    ),
  );
  const days = c.registrations.map((r) => shortDay(r.day));
  body.append(
    h(
      'div',
      { class: 'grid2' },
      card('Регистрации по дням', barChart(days, c.registrations.map((r) => r.count), { ariaLabel: 'Регистрации по дням', color: COLORS.red })),
      card('Активные игроки (DAU) по дням', lineChart(days, [{ name: 'DAU', color: COLORS.blue, values: c.dau.map((d) => d.count) }], { ariaLabel: 'DAU по дням' })),
      card(
        'Матчи: начаты и завершены',
        lineChart(
          c.matches.map((m) => shortDay(m.day)),
          [
            { name: 'Начаты', color: COLORS.amber, values: c.matches.map((m) => m.started) },
            { name: 'Завершены', color: COLORS.green, values: c.matches.map((m) => m.completed) },
          ],
          { ariaLabel: 'Матчи по дням' },
        ),
      ),
      card(
        'Удержание по когортам регистрации',
        lineChart(
          c.retention.map((r) => shortDay(r.day)),
          [
            { name: 'D1', color: COLORS.red, values: c.retention.map((r) => r.d1) },
            { name: 'D7', color: COLORS.blue, values: c.retention.map((r) => r.d7) },
          ],
          { percent: true, ariaLabel: 'Удержание D1 и D7' },
        ),
        'Пустые точки — когорта ещё не созрела или пуста.',
      ),
      card('Длительность сессий', barChart(c.sessionDuration.map((b) => b.bucket), c.sessionDuration.map((b) => b.count), { ariaLabel: 'Распределение длительности сессий', color: COLORS.violet })),
      card('Длительность матчей', barChart(c.matchDuration.map((b) => b.bucket), c.matchDuration.map((b) => b.count), { ariaLabel: 'Распределение длительности матчей', color: COLORS.amber })),
      card('Популярность карт', hBarChart(c.maps.map((m) => ({ label: MAP_NAMES[m.key] ?? m.key, value: m.count })), { ariaLabel: 'Матчи по картам', color: COLORS.red })),
      card('Режимы', hBarChart((c.modes ?? []).map((m) => ({ label: MODE_NAMES[m.key] ?? m.key, value: m.count })), { ariaLabel: 'Матчи по режимам', color: COLORS.amber })),
      card('Популярность персонажей', hBarChart(c.characters.map((m) => ({ label: CHARACTER_NAMES[m.key] ?? m.key, value: m.count })), { ariaLabel: 'Участия по персонажам', color: COLORS.green })),
      card('Платформы', hBarChart(c.platforms.map((m) => ({ label: PLATFORM_NAMES[m.key] ?? m.key, value: m.count })), { ariaLabel: 'Игроки по платформам', color: COLORS.blue }), 'По данным клиента при входе (без криптографической проверки).'),
    ),
  );
  const roomsTable = rooms.length
    ? h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, ...['Комната', 'Карта', 'Режим', 'Фаза', 'Игроки', 'Тип', 'Создана'].map((t) => h('th', {}, t)))),
        h(
          'tbody',
          {},
          ...rooms.map((r) => h('tr', {}, h('td', { class: 'mono' }, r.id), h('td', {}, MAP_NAMES[r.mapId] ?? r.mapName), h('td', {}, r.mode ? (MODE_NAMES[r.mode] ?? r.mode) : '—'), h('td', {}, PHASES[r.phase] ?? r.phase), h('td', {}, `${r.players}/${r.maxPlayers}`), h('td', {}, r.isPrivate ? 'приватная' : 'публичная'), h('td', {}, dateTime(r.createdAt)))),
        ),
      )
    : h('div', { class: 'chart-empty' }, 'Сейчас нет активных комнат');
  body.append(card('Активные комнаты', roomsTable));
}
