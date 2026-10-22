/** Clubs (v0.3): every club with its people and rating; an admin can remove a player club (audited). */
import type { AdminClubRow, AdminMe } from '@blatkom/shared';
import { h, clear, toast } from '../dom.js';
import { apiFetch } from '../api.js';
import { dateTime, num } from '../format.js';

export async function renderClubs(root: HTMLElement, me: AdminMe): Promise<void> {
  clear(root);
  const host = h('section', { class: 'card' }, h('div', { class: 'loading' }, 'Загрузка…'));
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Клубы')), host);
  const rows = await apiFetch<AdminClubRow[]>('/api/admin/clubs');
  clear(host);
  const own = rows.filter((r) => !r.house);
  host.append(
    h(
      'p',
      { class: 'note' },
      `Всего клубов: ${num(rows.length)}, из них созданы игроками: ${num(own.length)}. Клубы игры (отмечены «игры») держат таблицу живой: их люди и рейтинг вычисляются сервером, игрокам они ничем не отличаются. Клуб игрока можно удалить — например, за оскорбительное название или флаг; его участники получат уведомление, что клуб распущен.`,
    ),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, ...['№', 'Тег', 'Название', 'Девиз', 'Рейтинг', 'Людей', 'Игроков', 'Глава', 'Заявки', 'Набор', 'Создан', ''].map((t) => h('th', {}, t)))),
        h(
          'tbody',
          {},
          ...rows.map((r) =>
            h(
              'tr',
              {},
              h('td', { class: 'num' }, String(r.rank)),
              h('td', { class: 'strong' }, `[${r.tag}]`),
              h('td', {}, r.name, r.house ? h('span', { class: 'chip', style: 'margin-left:6px' }, 'игры') : ''),
              h('td', { class: 'msg' }, r.motto || '—'),
              h('td', { class: 'num' }, num(r.rating)),
              h('td', { class: 'num' }, num(r.members)),
              h('td', { class: 'num' }, num(r.realMembers)),
              h('td', {}, r.headName ?? (r.house ? '—' : 'нет')),
              h('td', { class: 'num' }, num(r.requests)),
              h('td', {}, r.recruiting ? 'открыт' : 'закрыт'),
              h('td', {}, dateTime(r.createdAt)),
              h(
                'td',
                {},
                !r.house && me.role === 'admin'
                  ? h(
                      'button',
                      {
                        class: 'chip',
                        onclick: () => {
                          if (!confirm(`Удалить клуб «${r.name}» [${r.tag}]? Его участники (${r.realMembers}) окажутся без клуба. Действие записывается в аудит.`)) return;
                          apiFetch('/api/admin/clubs/' + r.id, { method: 'DELETE' })
                            .then(() => {
                              toast('Клуб удалён', 'ok');
                              void renderClubs(root, me);
                            })
                            .catch((e: Error) => toast(e.message));
                        },
                      },
                      'Удалить',
                    )
                  : '',
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
