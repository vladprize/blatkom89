/** Admin audit log (admin role). */
import { h, clear } from '../dom.js';
import { apiFetch } from '../api.js';
import { dateTime } from '../format.js';

interface AuditRow {
  id: number;
  at: string;
  action: string;
  target: string | null;
  ip: string | null;
  username: string | null;
  details: unknown;
}

const ACTIONS: Record<string, string> = {
  login: 'Вход',
  logout: 'Выход',
  login_failed: 'Неудачный вход',
  admin_bootstrap: 'Создан первый админ',
  admin_created: 'Создан администратор',
  admin_created_cli: 'Создан администратор (CLI)',
  export_players: 'Экспорт игроков',
  export_matches: 'Экспорт матчей',
  export_daily: 'Экспорт сводки',
  player_viewed: 'Просмотр карточки игрока',
};

export async function renderAudit(root: HTMLElement): Promise<void> {
  clear(root);
  const host = h('section', { class: 'card' }, h('div', { class: 'loading' }, 'Загрузка…'));
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Журнал аудита')), host);
  const rows = await apiFetch<AuditRow[]>('/api/admin/audit');
  clear(host);
  host.append(
    rows.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'table' },
            h('thead', {}, h('tr', {}, ...['Время', 'Администратор', 'Действие', 'Объект', 'IP', 'Детали'].map((t) => h('th', {}, t)))),
            h('tbody', {}, ...rows.map((r) => h('tr', {}, h('td', {}, dateTime(r.at)), h('td', {}, r.username ?? '—'), h('td', {}, ACTIONS[r.action] ?? r.action), h('td', {}, r.action === 'player_viewed' && r.target && /^[0-9a-f-]{36}$/.test(r.target) ? h('a', { href: `#/players/${r.target}` }, r.target) : (r.target ?? '—')), h('td', { class: 'mono' }, r.ip ?? '—'), h('td', { class: 'mono msg' }, r.details && Object.keys(r.details as object).length ? JSON.stringify(r.details) : '—')))),
          ),
        )
      : h('div', { class: 'chart-empty' }, 'Записей нет'),
  );
}
