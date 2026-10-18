/** Player detail: profile, progression, sessions, achievements, match history, errors. */
import type { AdminPlayerDetail } from '@blatkom/shared';
import { h, clear } from '../dom.js';
import { apiFetch } from '../api.js';
import { num, dateTime, playtime, duration, MAP_NAMES, CHARACTER_NAMES, PLATFORM_NAMES } from '../format.js';

export async function renderPlayer(root: HTMLElement, id: string): Promise<void> {
  clear(root);
  root.append(h('div', { class: 'loading' }, 'Загрузка…'));
  const d = await apiFetch<AdminPlayerDetail>(`/api/admin/players/${encodeURIComponent(id)}`);
  clear(root);
  const p = d.player;
  const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills ? '∞' : '—';
  const xpPct = p.xpForNextLevel ? Math.round((p.xpIntoLevel / p.xpForNextLevel) * 100) : 100;
  root.append(
    h('div', { class: 'toolbar' }, h('a', { href: '#/players', class: 'chip' }, '← Все игроки'), h('h2', {}, p.displayName)),
    h(
      'div',
      { class: 'grid2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Профиль'),
        h(
          'dl',
          { class: 'kv' },
          ...([
            ['Внутренний ID', p.id],
            ['Telegram ID', p.telegramId ?? '—'],
            ['Регистрация', dateTime(p.createdAt)],
            ['Последняя активность', dateTime(p.lastSeenAt)],
            ['Язык', p.languageCode ?? '—'],
            ['Платформа', p.platform ? (PLATFORM_NAMES[p.platform] ?? p.platform) : '—'],
            ['Любимый персонаж', p.preferredCharacter ? CHARACTER_NAMES[p.preferredCharacter] ?? p.preferredCharacter : '—'],
            ['Сессии', `${num(d.sessions.total)} (активных: ${num(d.sessions.active)})`],
            ['Версия клиента', d.sessions.lastClientVersion ?? '—'],
          ] as Array<[string, string]>).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Прогресс'),
        h('div', { class: 'level' }, h('span', { class: 'level-badge' }, `Ур. ${p.level}`), h('div', { class: 'bar' }, h('i', { style: `width:${xpPct}%` })), h('span', { class: 'muted-text' }, `${num(p.xpIntoLevel)} / ${num(p.xpForNextLevel)} XP`)),
        h(
          'div',
          { class: 'tiles small' },
          ...([
            ['XP', num(p.xp)],
            ['Матчи', num(p.matches)],
            ['Доиграно', num(p.matchesCompleted)],
            ['Победы', num(p.wins)],
            ['Поражения', num(p.losses)],
            ['Устранения', num(p.kills)],
            ['Смерти', num(p.deaths)],
            ['K/D', kd],
            ['Серия побед', `${num(p.currentWinStreak)} (лучшая ${num(p.bestWinStreak)})`],
            ['Время в игре', playtime(p.playtimeSec)],
          ] as Array<[string, string]>).map(([k, v]) => h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, k), h('div', { class: 'tile-value' }, v))),
        ),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Достижения'),
      h('ul', { class: 'achievements' }, ...d.achievements.map((a) => h('li', { class: a.unlockedAt ? 'got' : '' }, h('b', {}, a.title), h('span', {}, a.description), h('em', {}, a.unlockedAt ? dateTime(a.unlockedAt) : 'не получено')))),
    ),
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'История матчей'),
      d.matches.length
        ? h(
            'div',
            { class: 'table-scroll' },
            h(
              'table',
              { class: 'table' },
              h('thead', {}, h('tr', {}, ...['Дата', 'Карта', 'Персонаж', 'Место', 'Игроков', 'Устр.', 'Смерти', 'XP', 'Длит.'].map((t) => h('th', {}, t)))),
              h('tbody', {}, ...d.matches.map((m) => h('tr', {}, h('td', {}, dateTime(m.endedAt)), h('td', {}, MAP_NAMES[m.mapId] ?? m.mapId), h('td', {}, CHARACTER_NAMES[m.character] ?? m.character), h('td', { class: 'num' }, m.won ? '1 🏆' : String(m.place)), h('td', { class: 'num' }, String(m.players)), h('td', { class: 'num' }, String(m.kills)), h('td', { class: 'num' }, String(m.deaths)), h('td', { class: 'num' }, `+${m.xpGained}`), h('td', {}, duration(m.durationMs))))),
            ),
          )
        : h('div', { class: 'chart-empty' }, 'Завершённых матчей нет'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Технические ошибки игрока'),
      d.errors.length
        ? h(
            'div',
            { class: 'table-scroll' },
            h(
              'table',
              { class: 'table' },
              h('thead', {}, h('tr', {}, ...['Время', 'Источник', 'Компонент', 'Категория', 'Сообщение', 'Клиент', 'Сервер', 'Сессия'].map((t) => h('th', {}, t)))),
              h('tbody', {}, ...d.errors.map((e) => h('tr', {}, h('td', {}, dateTime(e.occurredAt)), h('td', {}, e.source), h('td', {}, e.component), h('td', {}, e.category), h('td', { class: 'msg' }, e.message), h('td', {}, e.clientVersion ?? '—'), h('td', {}, e.serverVersion ?? '—'), h('td', { class: 'mono' }, e.sessionId ? e.sessionId.slice(0, 8) : '—')))),
            ),
          )
        : h('div', { class: 'chart-empty' }, 'Ошибок не зафиксировано'),
    ),
  );
}
