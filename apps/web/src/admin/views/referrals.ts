/**
 * Invitations (V2.0; v0.2.18: they pay talons — the $BLAT page is gone with the whole crypto theme): how
 * many came, counted, wait for a check; the talons paid (all time and in the period); an administrator
 * counts or turns down the invitations held for a check (more than the daily cap, a flagged account).
 * Every decision goes to the audit log.
 */
import type { AdminMe, AdminReferralRow, AdminReferralSummary } from '@blatkom/shared';
import { REFERRAL_RULES, REFERRAL_TALONS } from '@blatkom/shared';
import { h, clear, toast } from '../dom.js';
import { apiFetch, rangeQuery } from '../api.js';
import { dateTime, num } from '../format.js';
import { emptyState } from '../charts.js';
import { rangePicker, getRange } from './range.js';

export const REFERRAL_STATUSES: Record<AdminReferralRow['status'], string> = {
  pending: 'ждёт первого матча',
  held: 'на проверке',
  confirmed: 'засчитано',
  rejected: 'отклонено',
};

const tile = (label: string, value: string, hint?: string) =>
  h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), hint ? h('div', { class: 'tile-hint' }, hint) : null);

let filter: AdminReferralRow['status'] | 'all' = 'held';

function decide(r: AdminReferralRow, action: 'confirm' | 'reject', done: () => void) {
  const what =
    action === 'confirm'
      ? `Засчитать приглашение «${r.refereeName}» игроку «${r.referrerName ?? '—'}»? Он получит ${REFERRAL_TALONS} талонов.`
      : `Отклонить приглашение «${r.refereeName}» (пригласил «${r.referrerName ?? '—'}»)? Награды не будет.`;
  if (!confirm(what)) return;
  const note = (prompt('Комментарий для журнала (необязательно):') ?? '').trim().slice(0, 200);
  apiFetch<{ status: string; reward?: number }>(`/api/admin/referrals/${encodeURIComponent(r.refereeId)}`, { method: 'POST', body: { action, ...(note ? { note } : {}) } })
    .then((x) => {
      toast(x.status === 'confirmed' ? `Засчитано: +${num(x.reward ?? 0)} талонов` : 'Отклонено', 'ok');
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

export async function renderReferrals(root: HTMLElement, me: AdminMe): Promise<void> {
  clear(root);
  const body = h('div', { class: 'stack' }, h('div', { class: 'loading' }, 'Загрузка…'));
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Приглашения'), rangePicker(() => void renderReferrals(root, me))), body);
  const s = await apiFetch<AdminReferralSummary>(`/api/admin/referrals/summary?${rangeQuery(getRange())}`);
  clear(body);
  body.append(
    h(
      'p',
      { class: 'note' },
      `Друг засчитывается после первого полного онлайн-матча (не короче ${REFERRAL_RULES.minMatchSec} секунд, с нанесённым уроном); пригласивший получает ${REFERRAL_TALONS} талонов. Больше ${REFERRAL_RULES.dailyCap} засчитанных приглашений за сутки у одного игрока или помеченный аккаунт — приглашение ждёт решения здесь. Пометить аккаунт можно на карточке игрока.`,
    ),
    h(
      'div',
      { class: 'tiles' },
      tile('Пришло за период', num(s.attachedInRange)),
      tile('Ждут первого матча', num(s.referrals.pending)),
      tile('На проверке', num(s.referrals.held), s.referrals.held > 0 ? 'нужно решение' : undefined),
      tile('Засчитано', num(s.referrals.confirmed)),
      tile('Отклонено', num(s.referrals.rejected)),
      tile('Талонов за приглашения', num(s.talons), `за период: ${num(s.talonsInRange)}`),
      tile('Помечено аккаунтов', num(s.flagged), 'приглашения ждут проверки'),
    ),
  );
  const refHost = h('section', { class: 'card', 'data-testid': 'referrals-card' });
  body.append(refHost);
  await referralsCard(refHost, me);
}
