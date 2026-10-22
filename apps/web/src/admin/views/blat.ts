/**
 * $BLAT (V2.0): in-game points in numbers — on hand, paid for levels and invitations (all time and in the
 * period), the biggest balances, and the invitations: an administrator counts or turns down the ones held
 * for a check (more than the daily cap, a flagged account). Every decision goes to the audit log.
 */
import type { AdminBlatSummary, AdminMe, AdminReferralRow } from '@blatkom/shared';
import { REFERRAL_RULES } from '@blatkom/shared';
import { h, clear, toast } from '../dom.js';
import { apiFetch, rangeQuery } from '../api.js';
import { dateTime, num } from '../format.js';
import { hBarChart, COLORS, emptyState } from '../charts.js';
import { rangePicker, getRange } from './range.js';

export const REFERRAL_STATUSES: Record<AdminReferralRow['status'], string> = {
  pending: 'ждёт первого матча',
  held: 'на проверке',
  confirmed: 'засчитано',
  rejected: 'отклонено',
};
const SOURCES: Record<'level' | 'referral' | 'grant', string> = { level: 'За уровни', referral: 'За приглашения', grant: 'Начисления админа' };

const tile = (label: string, value: string, hint?: string) =>
  h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), hint ? h('div', { class: 'tile-hint' }, hint) : null);

let filter: AdminReferralRow['status'] | 'all' = 'held';

function decide(r: AdminReferralRow, action: 'confirm' | 'reject', done: () => void) {
  const what =
    action === 'confirm'
      ? `Засчитать приглашение «${r.refereeName}» игроку «${r.referrerName ?? '—'}»? Награда — по текущей ступени его шкалы.`
      : `Отклонить приглашение «${r.refereeName}» (пригласил «${r.referrerName ?? '—'}»)? Награды не будет.`;
  if (!confirm(what)) return;
  const note = (prompt('Комментарий для журнала (необязательно):') ?? '').trim().slice(0, 200);
  apiFetch<{ status: string; reward?: number }>(`/api/admin/referrals/${encodeURIComponent(r.refereeId)}`, { method: 'POST', body: { action, ...(note ? { note } : {}) } })
    .then((x) => {
      toast(x.status === 'confirmed' ? `Засчитано: +${num(x.reward ?? 0)} $BLAT` : 'Отклонено', 'ok');
      done();
    })
    .catch((e: Error) => toast(e.message));
}

async function referralsCard(host: HTMLElement, me: AdminMe): Promise<void> {
  clear(host);
  const chips = h(
    'div',
    { class: 'row' },
    ...(['held', 'pending', 'confirmed', 'rejected', 'all'] as const).map((s) =>
      h(
        'button',
        {
          class: `chip${filter === s ? ' active' : ''}`,
          onclick: () => {
            filter = s;
            void referralsCard(host, me);
          },
        },
        s === 'all' ? 'все' : REFERRAL_STATUSES[s],
      ),
    ),
  );
  host.append(h('h3', {}, 'Приглашения'), chips, h('div', { class: 'loading' }, 'Загрузка…'));
  const rows = await apiFetch<AdminReferralRow[]>(`/api/admin/referrals${filter === 'all' ? '' : `?status=${filter}`}`);
  host.lastChild?.remove();
  if (rows.length === 0) {
    host.append(emptyState());
    return;
  }
  const canAct = me.role === 'admin';
  host.append(
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, ...['Пришёл', 'Кто пригласил', 'Код', 'Когда', 'Статус', '№', 'Награда', 'Комментарий', ''].map((t) => h('th', {}, t)))),
        h(
          'tbody',
          {},
          ...rows.map((r) =>
            h(
              'tr',
              {},
              h('td', {}, h('a', { href: `#/players/${r.refereeId}` }, r.refereeName)),
              h('td', {}, r.referrerId ? h('a', { href: `#/players/${r.referrerId}` }, r.referrerName ?? '—') : 'аккаунт удалён'),
              h('td', { class: 'mono' }, r.code),
              h('td', {}, dateTime(r.attachedAt)),
              h('td', {}, REFERRAL_STATUSES[r.status], r.decidedAt ? h('div', { class: 'muted-text' }, dateTime(r.decidedAt)) : ''),
              h('td', { class: 'num' }, r.ordinal ? String(r.ordinal) : '—'),
              h('td', { class: 'num' }, r.reward ? num(r.reward) : '—'),
              h('td', { class: 'msg' }, r.note ?? '—'),
              h(
                'td',
                {},
                canAct && r.referrerId && (r.status === 'held' || r.status === 'pending')
                  ? h(
                      'div',
                      { class: 'row' },
                      h('button', { class: 'chip', onclick: () => decide(r, 'confirm', () => void referralsCard(host, me)) }, 'Засчитать'),
                      h('button', { class: 'chip', onclick: () => decide(r, 'reject', () => void referralsCard(host, me)) }, 'Отклонить'),
                    )
                  : '',
              ),
            ),
          ),
        ),
      ),
    ),
    h('p', { class: 'note' }, 'Последние 300 приглашений, новые сверху.'),
  );
}

export async function renderBlat(root: HTMLElement, me: AdminMe): Promise<void> {
  clear(root);
  const body = h('div', { class: 'stack' }, h('div', { class: 'loading' }, 'Загрузка…'));
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, '$BLAT'), rangePicker(() => void renderBlat(root, me))), body);
  const s = await apiFetch<AdminBlatSummary>(`/api/admin/blat?${rangeQuery(getRange())}`);
  clear(body);
  const issuedAll = s.issued.level + s.issued.referral + s.issued.grant;
  const issuedRange = s.issuedInRange.level + s.issuedInRange.referral + s.issuedInRange.grant;
  body.append(
    h(
      'p',
      { class: 'note' },
      `$BLAT — игровые баллы: только копятся, их нельзя купить, продать, вывести или передать. Начисляет только сервер: за уровни (каждый уровень один раз) и за приглашения (друг засчитывается после первого полного онлайн-матча). Больше ${REFERRAL_RULES.dailyCap} засчитанных приглашений за сутки у одного игрока или помеченный аккаунт — приглашение ждёт решения здесь.`,
    ),
    h(
      'div',
      { class: 'tiles' },
      tile('На руках', num(s.totalBalance), `у ${num(s.holders)} игроков`),
      tile('Выдано всего', num(issuedAll)),
      tile('Выдано за период', num(issuedRange)),
      tile('Ждут первого матча', num(s.referrals.pending)),
      tile('На проверке', num(s.referrals.held), s.referrals.held > 0 ? 'нужно решение' : undefined),
      tile('Засчитано приглашений', num(s.referrals.confirmed)),
      tile('Отклонено', num(s.referrals.rejected)),
      tile('Помечено аккаунтов', num(s.flagged), 'без наград за приглашения'),
    ),
    h(
      'div',
      { class: 'grid2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Откуда $BLAT'),
        h('h4', { class: 'sub' }, 'За всё время'),
        hBarChart(
          (Object.keys(SOURCES) as Array<keyof typeof SOURCES>).map((k) => ({ label: SOURCES[k], value: s.issued[k] })),
          { ariaLabel: '$BLAT за всё время по источникам', color: COLORS.amber },
        ),
        h('h4', { class: 'sub' }, 'За период'),
        hBarChart(
          (Object.keys(SOURCES) as Array<keyof typeof SOURCES>).map((k) => ({ label: SOURCES[k], value: s.issuedInRange[k] })),
          { ariaLabel: '$BLAT за период по источникам', color: COLORS.amber },
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Самые большие балансы'),
        s.top.length
          ? h(
              'div',
              { class: 'table-scroll' },
              h(
                'table',
                { class: 'table' },
                h('thead', {}, h('tr', {}, ...['Игрок', '$BLAT', ''].map((t) => h('th', {}, t)))),
                h('tbody', {}, ...s.top.map((t) => h('tr', {}, h('td', {}, h('a', { href: `#/players/${t.id}` }, t.name)), h('td', { class: 'num' }, num(t.balance)), h('td', {}, t.flagged ? h('span', { class: 'chip' }, 'помечен') : '')))),
              ),
            )
          : emptyState(),
      ),
    ),
  );
  const refHost = h('section', { class: 'card' });
  body.append(refHost);
  await referralsCard(refHost, me);
}
