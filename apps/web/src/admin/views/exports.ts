/** CSV exports (admin role). Downloads are plain same-origin GET links with the session cookie. */
import type { AdminMe } from '@blatkom/shared';
import { h, clear } from '../dom.js';
import { rangeQuery } from '../api.js';
import { rangePicker, getRange } from './range.js';

export function renderExports(root: HTMLElement, me: AdminMe): void {
  clear(root);
  const q = rangeQuery(getRange());
  const allowed = me.role === 'admin';
  const item = (title: string, desc: string, href: string) =>
    h('div', { class: 'export' }, h('div', {}, h('b', {}, title), h('p', { class: 'note' }, desc)), allowed ? h('a', { class: 'btn', href, download: '' }, 'Скачать CSV') : h('span', { class: 'note' }, 'Нужна роль admin'));
  root.append(
    h('div', { class: 'toolbar' }, h('h2', {}, 'Экспорт'), rangePicker(() => renderExports(root, me))),
    h(
      'section',
      { class: 'card' },
      item('Игроки', 'Все игроки: ID, имя, Telegram ID, регистрация, активность, уровень, XP, матчи, победы, поражения, устранения, время в игре.', '/api/admin/export/players.csv'),
      item('Матчи', 'Матчи, начатые в выбранном периоде.', `/api/admin/export/matches.csv?${q}`),
      item('Сводка по дням', 'Регистрации, DAU, начатые/завершённые матчи и ошибки по дням периода.', `/api/admin/export/daily.csv?${q}`),
      item('Источники', 'Новые аккаунты периода по каналу (партнёр, приглашение игрока, комната, кампания utm, сайт, Telegram, прямой заход) с первым матчем и возвратом; первые визиты по источнику.', `/api/admin/export/sources.csv?${q}`),
      item('Партнёры', 'Партнёрские ссылки: визиты, аккаунты, первый и доигранный матч, возврат, матчи за период. Только измерение — без выплат.', `/api/admin/export/partners.csv?${q}`),
      h('p', { class: 'note' }, 'Каждая выгрузка записывается в журнал аудита. Ячейки, начинающиеся с = + - @, экранируются от формульных инъекций.'),
    ),
  );
}
