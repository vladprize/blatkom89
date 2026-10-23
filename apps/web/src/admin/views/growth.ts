/**
 * V2.0 part F — «Источники»: where players come from (the first touch of new accounts and of first
 * visits), invitations and their conversion, partner links for authors and streamers (measured only —
 * nothing is paid), the level distribution, the Kon and $BLAT issued.
 */
import type { AdminGrowth, AdminMe, AdminPartnerRow, AdminSourceRow } from '@blatkom/shared';
import { h, clear, toast } from '../dom.js';
import { apiFetch, rangeQuery } from '../api.js';
import { num, pct, dateTime } from '../format.js';
import { hBarChart, barChart, COLORS, emptyState } from '../charts.js';
import { rangePicker, getRange } from './range.js';

const CHANNEL: Record<AdminSourceRow['channel'], string> = {
  partner: 'Партнёрская ссылка',
  referral: 'Приглашение игрока ($BLAT)',
  invite: 'Приглашение в комнату',
  utm: 'Кампания (utm)',
  referrer: 'Другой сайт',
  telegram: 'Telegram',
  direct: 'Прямой заход',
  unknown: 'Неизвестно (до V2.0)',
};
const VISIT_KIND: Record<string, string> = { partner: 'партнёр', utm: 'utm', referrer: 'сайт', direct: 'прямой заход' };
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function tile(label: string, value: string, hint?: string): HTMLElement {
  return h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), hint ? h('div', { class: 'tile-hint' }, hint) : null);
}

/** A table whose columns from `numFrom` on are numbers (right-aligned, headers too). */
function table(head: string[], rows: Array<Array<string | number | Node>>, numFrom: number, testid?: string): HTMLElement {
  if (!rows.length) return emptyState('за период — ничего');
  const cls = (i: number) => (i >= numFrom ? 'num' : '');
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'table', 'data-testid': testid },
      h('thead', {}, h('tr', {}, ...head.map((t, i) => h('th', { class: cls(i) }, t)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c, i) => h('td', { class: cls(i) }, c))))),
    ),
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Скопировано', 'ok');
  } catch {
    toast('Не удалось скопировать — выделите ссылку вручную');
  }
}

function partnersCard(rows: AdminPartnerRow[], me: AdminMe, refresh: () => void): HTMLElement {
  const isAdmin = me.role === 'admin';
  const list = rows.length
    ? h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table', 'data-testid': 'partners-table' },
          h('thead', {}, h('tr', {}, ...['Партнёр', 'Ссылки', 'Визиты', 'Аккаунты', '1-й матч', 'Доиграли', 'Вернулись', 'Матчи', ''].map((t, i) => h('th', { class: i >= 2 && i <= 7 ? 'num' : '' }, t)))),
          h(
            'tbody',
            {},
            ...rows.map((p) =>
              h(
                'tr',
                { 'data-code': p.code, class: p.active ? '' : 'muted' },
                h('td', {}, h('b', {}, p.name), h('div', { class: 'note' }, `${p.code}${p.active ? '' : ' · выключена'}${p.note ? ` · ${p.note}` : ''}`)),
                h(
                  'td',
                  {},
                  h('div', {}, h('code', { 'data-testid': 'partner-web' }, p.webUrl), ' ', h('button', { class: 'btn small', type: 'button', onclick: () => void copy(p.webUrl) }, 'Копировать')),
                  p.telegramUrl ? h('div', {}, h('code', {}, p.telegramUrl), ' ', h('button', { class: 'btn small', type: 'button', onclick: () => void copy(p.telegramUrl!) }, 'Копировать')) : null,
                ),
                h('td', { class: 'num' }, num(p.visitors)),
                h('td', { class: 'num', 'data-testid': 'partner-accounts' }, num(p.accounts)),
                h('td', { class: 'num' }, num(p.firstMatch)),
                h('td', { class: 'num' }, num(p.completed)),
                h('td', { class: 'num' }, num(p.returned)),
                h('td', { class: 'num' }, num(p.matches)),
                h(
                  'td',
                  {},
                  isAdmin
                    ? h(
                        'button',
                        {
                          class: 'btn small',
                          type: 'button',
                          onclick: async () => {
                            try {
                              await apiFetch(`/api/admin/partners/${p.id}`, { method: 'POST', body: { active: !p.active } });
                              toast(p.active ? 'Ссылка выключена: новые визиты по ней не считаются' : 'Ссылка снова работает', 'ok');
                              refresh();
                            } catch (e) {
                              toast((e as Error).message);
                            }
                          },
                        },
                        p.active ? 'Выключить' : 'Включить',
                      )
                    : null,
                ),
              ),
            ),
          ),
        ),
      )
    : emptyState('партнёрских ссылок пока нет');
  let form: HTMLElement | null = null;
  if (isAdmin) {
    const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Имя автора или канала', 'aria-label': 'Имя партнёра', 'data-testid': 'partner-name', required: true }) as HTMLInputElement;
    const code = h('input', { type: 'text', maxlength: 24, placeholder: 'код (необязательно): a–z, 0–9, _', 'aria-label': 'Код партнёра', 'data-testid': 'partner-code', pattern: '[a-z0-9_]{3,24}' }) as HTMLInputElement;
    const note = h('input', { type: 'text', maxlength: 300, placeholder: 'Заметка (необязательно)', 'aria-label': 'Заметка', class: 'grow' }) as HTMLInputElement;
    const add = h('button', { class: 'btn', type: 'submit', 'data-testid': 'partner-add' }, 'Создать ссылку') as HTMLButtonElement;
    form = h('form', { class: 'action-form' }, name, code, note, add);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!name.value.trim()) return toast('Укажите имя партнёра');
      add.disabled = true;
      try {
        const made = await apiFetch<{ id: string; code: string }>('/api/admin/partners', { method: 'POST', body: { name: name.value.trim(), ...(code.value.trim() ? { code: code.value.trim().toLowerCase() } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}) } });
        toast(`Ссылка создана: ${made.code}`, 'ok');
        refresh();
      } catch (err) {
        toast((err as Error).message);
      } finally {
        add.disabled = false;
      }
    });
  }
  return h(
    'section',
    { class: 'card', 'data-testid': 'partners' },
    h('h3', {}, 'Партнёрские ссылки (авторы, стримеры)'),
    form,
    list,
    h(
      'p',
      { class: 'note' },
      'Ссылка на сайт — ?p=<код>, в Telegram — бот со start=p_<код>. Считается первый визит браузера и новые аккаунты, пришедшие по ссылке; «доиграли» — хотя бы один полный онлайн-матч, «вернулись» — активность в другой день после регистрации, «матчи» — полные матчи этих игроков за период. Только измерение: выплат, начислений и обещаний партнёрам нет — условия программы утверждаются отдельно.',
    ),
  );
}

export async function renderGrowth(root: HTMLElement, me: AdminMe): Promise<void> {
  clear(root);
  const body = h('div', { class: 'stack' }, h('div', { class: 'loading' }, 'Загрузка…'));
  const refresh = () => void renderGrowth(root, me);
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Источники'), rangePicker(refresh)), body);
  const q = rangeQuery(getRange());
  const [g, partners] = await Promise.all([apiFetch<AdminGrowth>(`/api/admin/growth?${q}`), apiFetch<AdminPartnerRow[]>(`/api/admin/partners?${q}`)]);
  clear(body);
  const inv = g.invites;
  body.append(
    h('p', { class: 'note' }, `Период: ${g.range.firstDay} — ${g.range.lastDay} (UTC). Обновлено ${dateTime(g.generatedAt)}. Пустые профили, объединённые с аккаунтом игрока при привязке Telegram, не считаются.`),
    h(
      'div',
      { class: 'tiles', 'data-testid': 'growth-tiles' },
      tile('Регистрации', num(g.players.registered)),
      tile('Уникальные игроки', num(g.players.unique), 'сыграли онлайн-матч в периоде'),
      tile('Начали первый матч', num(g.players.firstMatch), 'первый онлайн-матч — в периоде'),
      tile('Матчи завершены', num(g.players.completedMatches)),
      tile('Приглашения в комнату', num(inv.roomInvites), `открыли ${num(inv.opened)}`),
      tile('Сыграли по приглашению', num(inv.played), `конверсия ${pct(inv.conversion)} · новых ${num(inv.newPlayers)}`),
      tile('Пришли по ссылке игрока', num(inv.referralAttached), `засчитано ${num(inv.referralConfirmed)} (${pct(inv.referralConversion)})`),
      tile('$BLAT начислено', num(g.blat.issued), `уровни ${num(g.blat.fromLevels)} · приглашения ${num(g.blat.fromReferrals)}`),
    ),
  );
  body.append(
    h(
      'section',
      { class: 'card', 'data-testid': 'sources' },
      h('h3', {}, 'Новые аккаунты по источнику (первое касание)'),
      table(
        ['Канал', 'Подробно', 'Аккаунты', '1-й матч', 'Доиграли', 'Вернулись', 'Конверсия в матч'],
        g.sources.map((x) => [CHANNEL[x.channel] ?? x.channel, x.detail ?? '—', num(x.accounts), num(x.firstMatch), num(x.completed), num(x.returned), pct(ratio(x.completed, x.accounts))]),
        2,
        'sources-table',
      ),
      h('p', { class: 'note' }, 'Канал запоминается один раз — при создании аккаунта, по приоритету: партнёрская ссылка → ссылка игрока → приглашение в комнату → кампания (utm_source / utm_medium / utm_campaign) → другой сайт (только домен) → Telegram → прямой заход.'),
    ),
    h(
      'div',
      { class: 'grid2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Первые визиты по источнику'),
        table(
          ['Источник', 'Вид', 'Посетители', 'С аккаунтом', 'Конверсия'],
          g.visits.map((x) => [x.key || 'прямой заход / Telegram', VISIT_KIND[x.kind] ?? x.kind, num(x.visitors), num(x.registered), pct(ratio(x.registered, x.visitors))]),
          2,
          'visits-table',
        ),
        h('p', { class: 'note' }, 'Посетитель — случайный ID браузера; хранится то, с чем пришёл первый визит.'),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Приглашения'),
        table(
          ['Шаг', 'Значение'],
          [
            ['Создано приглашений в комнату', num(inv.roomInvites)],
            ['Открыли ссылку', num(inv.opened)],
            ['Зашли в лобби по приглашению (люди)', num(inv.joinedLobby)],
            ['Доиграли матч по приглашению (люди)', num(inv.played)],
            ['— из них новые аккаунты периода', num(inv.newPlayers)],
            ['Конверсия: доиграли ÷ приглашения', pct(inv.conversion)],
            ['Новые аккаунты по ссылке игрока', num(inv.referralAttached)],
            ['— засчитаны (полный матч)', num(inv.referralConfirmed)],
            ['Конверсия ссылки игрока', pct(inv.referralConversion)],
          ],
          1,
          'invites-table',
        ),
      ),
    ),
    partnersCard(partners, me, refresh),
    h(
      'div',
      { class: 'grid2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Уровни игроков (сейчас)'),
        barChart(
          g.levels.buckets.map((b) => b.bucket),
          g.levels.buckets.map((b) => b.players),
          { ariaLabel: 'Игроки по уровням', color: COLORS.amber },
        ),
        h('p', { class: 'note' }, `Средний уровень: ${g.levels.average ?? '—'}, максимальный: ${num(g.levels.max)}.`),
        g.levels.reached.length
          ? h('div', {}, h('h4', {}, 'Достигнуто в периоде'), hBarChart(g.levels.reached.slice(0, 20).map((x) => ({ label: `уровень ${x.level}`, value: x.players })), { ariaLabel: 'Уровни, достигнутые в периоде', color: COLORS.green }))
          : null,
        h('p', { class: 'note' }, '«Достигнуто» — по начислениям $BLAT за уровни: один раз на игрока и уровень (в день выхода $BLAT туда попали и уровни, взятые раньше).'),
      ),
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Блатной кон'),
        table(
          ['Формат', 'Матчи'],
          g.kon.byFormat.map((x) => [x.format.replace('x', '×'), num(x.matches)]),
          1,
          'kon-table',
        ),
        h('p', { class: 'note' }, `Всего матчей в кон: ${num(g.kon.matches)}, игроков: ${num(g.kon.players)}.`),
      ),
    ),
  );
}
