/**
 * $BLAT (V2.0): in-game points in numbers — on hand, paid for levels and invitations (all time and in the
 * period), the biggest balances, and the invitations: an administrator counts or turns down the ones held
 * for a check (more than the daily cap, a flagged account). Part C: the BLAT DROP announcement date and
 * balance snapshots (CSV / JSON). Every decision and export goes to the audit log.
 */
import type { AdminBlatDrop, AdminBlatSnapshot, AdminBlatSummary, AdminMe, AdminReferralRow } from '@blatkom/shared';
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

/** BLAT DROP: the announcement date every player counts down to (admin sets it; audited). */
async function dropCard(host: HTMLElement, me: AdminMe): Promise<void> {
  clear(host);
  host.append(h('h3', {}, 'BLAT DROP — дата объявления'), h('div', { class: 'loading' }, 'Загрузка…'));
  const d = await apiFetch<AdminBlatDrop>('/api/admin/blat/drop');
  host.lastChild?.remove();
  const src = d.source === 'admin' ? `задана в панели${d.updatedBy ? ` (${d.updatedBy}` : ''}${d.updatedAt ? `, ${dateTime(d.updatedAt)})` : d.updatedBy ? ')' : ''}` : d.source === 'env' ? 'из настройки сервера BLAT_DROP_ANNOUNCE_AT' : d.source === 'default' ? 'дата владельца, встроенная в версию (8 февраля 2027)' : '';
  host.append(
    h(
      'p',
      { class: 'note' },
      'Игроки видят во вкладке BLAT DROP эту дату и обратный отсчёт по часам сервера — у всех одинаковый. Это дата объявления, а не обещание: игра не обещает ни токена, ни цены, ни листинга.',
    ),
    h('p', { 'data-testid': 'drop-current' }, h('b', {}, d.announceAt ? `Сейчас: ${dateTime(d.announceAt)}` : 'Сейчас: не задана'), d.announceAt ? ` · ${src}` : `${src ? ` · ${src}` : ''} — игроки видят «Дата объявления ещё не установлена»`),
  );
  if (me.role !== 'admin') return;
  // the date in the admin's own time zone; sent as an exact moment (UTC)
  const local = (iso: string) => {
    const t = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
  };
  // no date yet: six months ahead, at noon, as a suggestion (nothing changes until «Сохранить»)
  const suggest = new Date();
  suggest.setMonth(suggest.getMonth() + 6);
  suggest.setHours(12, 0, 0, 0);
  const input = h('input', { type: 'datetime-local', 'aria-label': 'Дата объявления', 'data-testid': 'drop-input', value: local(d.announceAt ?? suggest.toISOString()) }) as HTMLInputElement;
  const save = h('button', { class: 'btn', type: 'submit', 'data-testid': 'drop-save' }, 'Сохранить') as HTMLButtonElement;
  const send = (announceAt: string | null, what: string) => {
    if (!confirm(what)) return;
    save.disabled = true;
    apiFetch<AdminBlatDrop>('/api/admin/blat/drop', { method: 'POST', body: { announceAt } })
      .then(() => {
        toast('Дата обновлена — игроки увидят её при следующем открытии вкладки', 'ok');
        void dropCard(host, me);
      })
      .catch((e: Error) => toast(e.message))
      .finally(() => (save.disabled = false));
  };
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'местное время';
  const form = h('form', { class: 'action-form' }, input, save, h('span', { class: 'muted-text' }, `время — по часовому поясу этого компьютера (${zone})`));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const at = new Date(input.value);
    if (!input.value || Number.isNaN(at.getTime())) return toast('Укажите дату и время');
    send(at.toISOString(), `Показать игрокам дату объявления BLAT DROP: ${dateTime(at.toISOString())}?`);
  });
  host.append(
    form,
    h(
      'div',
      { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'chip', type: 'button', 'data-testid': 'drop-clear', onclick: () => send(null, 'Убрать дату? Игроки увидят «Дата объявления ещё не установлена».') }, 'Убрать дату'),
    ),
  );
}

/** Balance snapshots: one moment, frozen; CSV / JSON (admin; audited). */
async function snapshotsCard(host: HTMLElement, me: AdminMe): Promise<void> {
  clear(host);
  host.append(h('h3', {}, 'Снимки балансов'), h('div', { class: 'loading' }, 'Загрузка…'));
  const list = await apiFetch<AdminBlatSnapshot[]>('/api/admin/blat/snapshots');
  host.lastChild?.remove();
  host.append(
    h(
      'p',
      { class: 'note' },
      'Снимок замораживает балансы $BLAT всех аккаунтов на один момент (одной транзакцией). Не участвуют: помеченные как подозрительные и аккаунты, чей журнал $BLAT не сходится с балансом. Снимок — только запись: он ничего не создаёт и никуда не переводит. Правила — docs/BLAT.md.',
    ),
  );
  if (me.role === 'admin') {
    const note = h('input', { type: 'text', maxlength: 200, placeholder: 'Комментарий (необязательно)', 'aria-label': 'Комментарий к снимку', class: 'grow' }) as HTMLInputElement;
    const take = h('button', { class: 'btn', type: 'submit', 'data-testid': 'snapshot-take' }, 'Сделать снимок') as HTMLButtonElement;
    const form = h('form', { class: 'action-form' }, note, take);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!confirm('Сделать снимок всех балансов $BLAT прямо сейчас?')) return;
      take.disabled = true;
      apiFetch<AdminBlatSnapshot>('/api/admin/blat/snapshots', { method: 'POST', body: note.value.trim() ? { note: note.value.trim() } : {} })
        .then((s) => {
          toast(`Снимок готов: ${num(s.accounts)} аккаунтов, ${num(s.total)} $BLAT`, 'ok');
          void snapshotsCard(host, me);
        })
        .catch((err: Error) => toast(err.message))
        .finally(() => (take.disabled = false));
    });
    host.append(form);
  }
  if (list.length === 0) {
    host.append(emptyState('Снимков ещё нет'));
    return;
  }
  host.append(
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table', 'data-testid': 'snapshots' },
        h('thead', {}, h('tr', {}, ...['Момент', 'Кто', 'Аккаунтов', 'Участвуют', '$BLAT всего', '$BLAT участвующих', 'Комментарий', ''].map((t) => h('th', {}, t)))),
        h(
          'tbody',
          {},
          ...list.map((s) =>
            h(
              'tr',
              {},
              h('td', {}, dateTime(s.takenAt)),
              h('td', {}, s.takenBy ?? '—'),
              h('td', { class: 'num' }, s.rowsNow === s.accounts ? num(s.accounts) : `${num(s.accounts)} (сейчас ${num(s.rowsNow)})`),
              h('td', { class: 'num' }, num(s.eligible)),
              h('td', { class: 'num' }, num(s.total)),
              h('td', { class: 'num' }, num(s.eligibleTotal)),
              h('td', { class: 'msg' }, s.note ?? '—'),
              h(
                'td',
                {},
                me.role === 'admin'
                  ? h(
                      'div',
                      { class: 'row' },
                      h('a', { class: 'chip', href: `/api/admin/blat/snapshots/${s.id}/export?format=csv`, download: `blat-snapshot-${s.takenAt.slice(0, 10)}.csv` }, 'CSV'),
                      h('a', { class: 'chip', href: `/api/admin/blat/snapshots/${s.id}/export?format=json`, download: `blat-snapshot-${s.takenAt.slice(0, 10)}.json` }, 'JSON'),
                      h(
                        'button',
                        {
                          class: 'chip',
                          type: 'button',
                          onclick: () => {
                            if (!confirm(`Удалить снимок от ${dateTime(s.takenAt)}? Его строки исчезнут.`)) return;
                            apiFetch(`/api/admin/blat/snapshots/${s.id}`, { method: 'DELETE' })
                              .then(() => {
                                toast('Снимок удалён', 'ok');
                                void snapshotsCard(host, me);
                              })
                              .catch((err: Error) => toast(err.message));
                          },
                        },
                        'Удалить',
                      ),
                    )
                  : '',
              ),
            ),
          ),
        ),
      ),
    ),
    h('p', { class: 'note' }, '«Сейчас» — сколько строк осталось: удалённые аккаунты уходят из снимков вместе со своими данными.'),
  );
}

const POOL_NAMES: Record<string, string> = { players: 'Игрокам', founder: 'Основателю', influencers: 'Блогерам', friends: 'Друзьям проекта', reserve: 'Резерв' };

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
      `$BLAT — игровые баллы: их нельзя купить, продать или вывести; из рук в руки переходят только ставками в «$BLAT Турнире». Начисляет только сервер: за уровни (каждый уровень один раз), за приглашения (друг засчитывается после первого полного онлайн-матча) и доли из пулов (основатель, блогеры, друзья проекта, резерв) — по решению администратора. Больше ${REFERRAL_RULES.dailyCap} засчитанных приглашений за сутки у одного игрока или помеченный аккаунт — приглашение ждёт решения здесь.`,
    ),
    // v0.2.17: the supply, capped at 2 000 000 000, by pools
    s.pools?.length
      ? h(
          'section',
          { class: 'card', 'data-testid': 'blat-pools' },
          h('h3', {}, 'Запас $BLAT — 2 000 000 000'),
          h(
            'div',
            { class: 'table-scroll' },
            h(
              'table',
              { class: 'table' },
              h('thead', {}, h('tr', {}, ...['Пул', 'Всего', 'Выдано', 'Осталось'].map((t) => h('th', {}, t)))),
              h('tbody', {}, ...s.pools.map((x) => h('tr', {}, h('td', {}, POOL_NAMES[x.pool] ?? x.pool), h('td', { class: 'num' }, num(x.cap)), h('td', { class: 'num' }, num(x.issued)), h('td', { class: 'num' }, num(x.cap - x.issued))))),
            ),
          ),
          h('p', { class: 'note' }, 'Игрокам — за уровни и приглашения; основателю — кнопкой «Сделать основателем» на карточке игрока; блогерам, друзьям проекта и резерв — формой «$BLAT из пула» там же. Ставки в турнире $BLAT не создают — только переходят.'),
        )
      : h('span'),
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
  const dropHost = h('section', { class: 'card', 'data-testid': 'drop-card' });
  const snapHost = h('section', { class: 'card', 'data-testid': 'snapshots-card' });
  const refHost = h('section', { class: 'card' });
  body.append(dropHost, snapHost, refHost);
  await Promise.all([dropCard(dropHost, me), snapshotsCard(snapHost, me), referralsCard(refHost, me)]);
}
