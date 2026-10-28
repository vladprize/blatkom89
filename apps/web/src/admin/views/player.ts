/** Player detail: profile, progression, wallet and purchases, sessions, achievements, match history, errors. */
import { STORY_CAMPAIGNS, STORY_OPENED_BEST_MS, campaignMissions } from '@blatkom/shared';
import type { AdminFounderResult, AdminMe, AdminPlayerDetail, AdminResetLink, AdminStoryOpenResponse, StoryCampaign } from '@blatkom/shared';
import { h, clear, toast } from '../dom.js';
import { RU_ACHIEVEMENTS } from '../../i18n/ru-content.js';
import { apiFetch } from '../api.js';
import { num, dateTime, playtime, duration, money, itemName, ACHIEVEMENT_NAMES, ACHIEVEMENT_DESCRIPTIONS, MAP_NAMES, CHARACTER_NAMES, PLATFORM_NAMES, ITEM_KINDS, ITEM_SOURCES, LEDGER_REASONS, MOD_NAMES, PAYMENT_PROVIDERS, PAYMENT_STATUSES, SIGN_IN_METHODS, WEAPON_NAMES } from '../format.js';

const CURRENCY_NAMES: Record<string, string> = { tokens: 'талоны', diamonds: 'алмазы', blat: '$BLAT' };

/** V2.0 part F: the account's first touch as one line. */
const ORIGIN: Record<string, string> = { partner: 'партнёрская ссылка', referral: 'ссылка игрока', invite: 'приглашение в комнату', utm: 'кампания', referrer: 'другой сайт', telegram: 'Telegram', direct: 'прямой заход' };
function originText(d: AdminPlayerDetail): string {
  const o = d.origin;
  if (!o?.channel) return 'неизвестно (аккаунт старше V2.0)';
  return [ORIGIN[o.channel] ?? o.channel, o.partner ?? o.detail].filter(Boolean).join(': ');
}
const REF_STATUS: Record<string, string> = { pending: 'ждёт первого матча', held: 'на проверке', confirmed: 'засчитано', rejected: 'отклонено' };

/** V2.0: $BLAT, the referral code, who invited the player and whom they invited; the admin's flag. */
function blatCard(d: AdminPlayerDetail, me: AdminMe | null | undefined, onChanged: () => void): HTMLElement | null {
  const b = d.blat;
  if (!b) return null;
  const p = d.player;
  const flagBtn =
    me?.role === 'admin'
      ? h(
          'button',
          {
            class: 'chip',
            type: 'button',
            onclick: () => {
              let flag: string | null = null;
              if (b.flag) {
                if (!confirm(`Снять пометку с «${p.displayName}»? Его следующие приглашения снова будут засчитываться сами.`)) return;
              } else {
                flag = (prompt(`Пометить «${p.displayName}» как подозрительный аккаунт? Приглашения с его участием будут ждать решения, баланс не попадёт в выгрузки. Причина:`) ?? '').trim().slice(0, 200);
                if (!flag) return;
              }
              apiFetch(`/api/admin/players/${encodeURIComponent(p.id)}/blat-flag`, { method: 'POST', body: { flag } })
                .then(() => {
                  toast(flag ? 'Аккаунт помечен' : 'Пометка снята', 'ok');
                  onChanged();
                })
                .catch((e: Error) => toast(e.message));
            },
          },
          b.flag ? 'Снять пометку' : 'Пометить как подозрительный',
        )
      : null;
  return h(
    'section',
    { class: 'card' },
    h('h3', {}, '$BLAT и приглашения'),
    h(
      'div',
      { class: 'tiles small' },
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Баланс'), h('div', { class: 'tile-value' }, num(b.balance))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Заработано всего'), h('div', { class: 'tile-value' }, num(b.earned))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Засчитано приглашений'), h('div', { class: 'tile-value' }, num(b.referrals.confirmed))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Ждут / на проверке'), h('div', { class: 'tile-value' }, `${num(b.referrals.pending)} / ${num(b.referrals.held)}`)),
    ),
    h('div', { style: 'height:12px' }),
    h(
      'dl',
      { class: 'kv' },
      h('dt', {}, 'Код приглашения'),
      h('dd', { class: 'mono' }, b.refCode ?? 'ещё не создан'),
      h('dt', {}, 'Пригласил'),
      h('dd', {}, ...(b.referredBy ? [b.referredBy.id ? h('a', { href: `#/players/${b.referredBy.id}` }, b.referredBy.name ?? '—') : 'аккаунт удалён', ` · ${REF_STATUS[b.referredBy.status] ?? b.referredBy.status}`] : ['пришёл сам'])),
      h('dt', {}, 'Отклонено приглашений'),
      h('dd', {}, num(b.referrals.rejected)),
      h('dt', {}, 'Пометка'),
      h('dd', {}, b.flag ? `подозрительный: ${b.flag}` : 'нет'),
    ),
    flagBtn,
  );
}

const CAMPAIGN_NAMES: Record<StoryCampaign, string> = { petya: '«Мой двор»', uchastkovy: '«Протокол»' };

/**
 * v0.2.16: the player's story, and for an admin «open it up to a mission» — to check the story's later
 * chapters without playing it all through (the missions before are marked done, nothing paid).
 */
function storyCard(d: AdminPlayerDetail, me: AdminMe | null | undefined, onChanged: () => void): HTMLElement | null {
  if (!d.story) return null;
  const byId = new Map(d.story.map((x) => [x.id, x]));
  const rows = STORY_CAMPAIGNS.map((c) => {
    const ms = campaignMissions(c);
    const got = ms.filter((m) => byId.has(m.id));
    const opened = got.filter((m) => byId.get(m.id)!.bestMs === STORY_OPENED_BEST_MS).length;
    const next = ms.find((m) => !byId.has(m.id));
    return [CAMPAIGN_NAMES[c], `${num(got.length)} из ${num(ms.length)}`, opened ? num(opened) : '—', next ? `миссия ${next.n} (глава ${next.chapter})` : 'все написанные пройдены'];
  });
  let form: HTMLElement | null = null;
  if (me?.role === 'admin') {
    const select = h(
      'select',
      { 'aria-label': 'До какой миссии открыть', 'data-testid': 'story-open-mission' },
      ...STORY_CAMPAIGNS.flatMap((c) =>
        campaignMissions(c)
          .filter((m) => m.n > 1)
          .map((m) => h('option', { value: m.id }, `${CAMPAIGN_NAMES[c]} — миссия ${m.n} (глава ${m.chapter})`)),
      ),
    ) as HTMLSelectElement;
    const btn = h('button', { class: 'btn', type: 'submit', 'data-testid': 'story-open' }, 'Открыть до неё') as HTMLButtonElement;
    form = h('form', { class: 'action-form' }, select, btn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const label = select.selectedOptions[0]?.textContent ?? select.value;
      if (!confirm(`Открыть игроку «${d.player.displayName}» сюжет до миссии: ${label}? Миссии этой кампании до неё будут отмечены пройденными — без талонов, опыта и наград.`)) return;
      btn.disabled = true;
      apiFetch<AdminStoryOpenResponse>(`/api/admin/players/${encodeURIComponent(d.player.id)}/story-open`, { method: 'POST', body: { mission: select.value } })
        .then((r) => {
          toast(r.opened.length ? `Готово: отмечено пройденными ${num(r.opened.length)}` : 'Эти миссии уже были пройдены — ничего не изменилось', 'ok');
          onChanged();
        })
        .catch((err: Error) => toast(err.message))
        .finally(() => (btn.disabled = false));
    });
  }
  return h(
    'section',
    { class: 'card', 'data-testid': 'story-admin' },
    h('h3', {}, 'Сюжет'),
    table(['Кампания', 'Пройдено', 'Открыто админом', 'Следующая'], rows, [1, 2], ''),
    form
      ? h('p', { class: 'note' }, 'Чтобы проверить поздние главы, не проходя всё заново: выберите миссию — миссии кампании до неё отметятся пройденными (без талонов, опыта и наград за главу; награда за главу придёт, когда игрок сам пройдёт её последнюю миссию). Действие пишется в журнал аудита.')
      : null,
    form,
  );
}

function table(head: string[], rows: Array<Array<string | HTMLElement>>, numeric: number[], empty: string): HTMLElement {
  if (rows.length === 0) return h('div', { class: 'chart-empty' }, empty);
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'table' },
      h('thead', {}, h('tr', {}, ...head.map((t) => h('th', {}, t)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c, i) => h('td', numeric.includes(i) ? { class: 'num' } : {}, c))))),
    ),
  );
}

/** Admin-only actions: audited balance adjustment and a one-time password-reset link. */
function actions(d: AdminPlayerDetail, onChanged: () => void): HTMLElement {
  const p = d.player;
  const currency = h('select', { 'aria-label': 'Валюта' }, h('option', { value: 'tokens' }, 'Талоны'), h('option', { value: 'diamonds' }, 'Алмазы')) as HTMLSelectElement;
  const amount = h('input', { type: 'number', step: 1, min: -1000000, max: 1000000, placeholder: 'Сколько (минус — списать)', 'aria-label': 'Сумма', class: 'grow' }) as HTMLInputElement;
  const note = h('input', { type: 'text', maxlength: 120, placeholder: 'Причина — попадёт в журнал', 'aria-label': 'Причина', class: 'grow' }) as HTMLInputElement;
  const grantBtn = h('button', { class: 'btn', type: 'submit' }, 'Провести') as HTMLButtonElement;
  const form = h('form', { class: 'action-form' }, currency, amount, note, grantBtn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Number(amount.value);
    if (!Number.isInteger(n) || n === 0) return toast('Сумма — целое число, не ноль');
    if (note.value.trim().length < 3) return toast('Укажите причину (от 3 символов)');
    const what = `${n > 0 ? 'Начислить' : 'Списать'} ${num(Math.abs(n))} (${CURRENCY_NAMES[currency.value]}) игроку «${p.displayName}»?`;
    if (!confirm(what)) return;
    grantBtn.disabled = true;
    apiFetch<{ balance: number }>(`/api/admin/players/${encodeURIComponent(p.id)}/grant`, { method: 'POST', body: { currency: currency.value, amount: n, note: note.value.trim() } })
      .then((r) => {
        toast(`Готово: теперь ${num(r.balance)} (${CURRENCY_NAMES[currency.value]})`, 'ok');
        onChanged();
      })
      .catch((err: Error) => toast(err.message))
      .finally(() => (grantBtn.disabled = false));
  });
  const linkOut = h('div', { class: 'reset-out' });
  const resetBtn = h('button', { class: 'chip', type: 'button', disabled: !d.account.emailMasked }, 'Ссылка для сброса пароля') as HTMLButtonElement;
  resetBtn.addEventListener('click', () => {
    if (!confirm(`Создать одноразовую ссылку для смены пароля игрока «${p.displayName}»? Передайте её только владельцу аккаунта.`)) return;
    resetBtn.disabled = true;
    apiFetch<AdminResetLink>(`/api/admin/players/${encodeURIComponent(p.id)}/reset-link`, { method: 'POST' })
      .then((r) => {
        const input = h('input', { class: 'mono grow', readonly: true, value: r.link, 'aria-label': 'Ссылка для сброса пароля' }) as HTMLInputElement;
        const copy = h('button', { class: 'chip', type: 'button' }, 'Скопировать');
        copy.addEventListener('click', () => {
          input.select();
          void navigator.clipboard?.writeText(r.link).then(() => toast('Ссылка скопирована', 'ok'));
        });
        clear(linkOut);
        linkOut.append(h('div', { class: 'row' }, input, copy), h('p', { class: 'note' }, `Одноразовая, действует до ${dateTime(r.expiresAt)}. Создание ссылки записано в журнал аудита.`));
      })
      .catch((err: Error) => toast(err.message))
      .finally(() => (resetBtn.disabled = !d.account.emailMasked));
  });
  // v0.2.17: $BLAT out of a pool (influencers, friends of the project, the reserve)
  const pool = h('select', { 'aria-label': 'Пул', 'data-testid': 'alloc-pool' }, h('option', { value: 'influencers' }, 'Блогеры'), h('option', { value: 'friends' }, 'Друзья проекта'), h('option', { value: 'reserve' }, 'Резерв')) as HTMLSelectElement;
  const allocAmount = h('input', { type: 'number', step: 1, min: 1, max: 100000000, placeholder: 'Сколько $BLAT', 'aria-label': 'Сколько $BLAT', class: 'grow', 'data-testid': 'alloc-amount' }) as HTMLInputElement;
  const allocNote = h('input', { type: 'text', maxlength: 120, placeholder: 'За что — попадёт в журнал', 'aria-label': 'За что', class: 'grow', 'data-testid': 'alloc-note' }) as HTMLInputElement;
  const allocBtn = h('button', { class: 'btn', type: 'submit', 'data-testid': 'alloc-go' }, 'Выдать $BLAT') as HTMLButtonElement;
  const alloc = h('form', { class: 'action-form' }, pool, allocAmount, allocNote, allocBtn);
  alloc.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Number(allocAmount.value);
    if (!Number.isInteger(n) || n <= 0) return toast('Сумма — целое число больше нуля');
    if (allocNote.value.trim().length < 3) return toast('Укажите, за что (от 3 символов)');
    if (!confirm(`Выдать ${num(n)} $BLAT из пула «${pool.selectedOptions[0]?.textContent}» игроку «${p.displayName}»?`)) return;
    allocBtn.disabled = true;
    apiFetch<{ balance: number }>(`/api/admin/players/${encodeURIComponent(p.id)}/blat-allocation`, { method: 'POST', body: { pool: pool.value, amount: n, note: allocNote.value.trim() } })
      .then((r) => {
        toast(`Готово: у игрока ${num(r.balance)} $BLAT`, 'ok');
        onChanged();
      })
      .catch((err: Error) => toast(err.message))
      .finally(() => (allocBtn.disabled = false));
  });
  // v0.2.17: the founder's account
  const founderBtn = h('button', { class: 'btn btn--gold', type: 'button', 'data-testid': 'make-founder' }, d.founder ? 'Основатель ✓ — повторить' : 'Сделать основателем') as HTMLButtonElement;
  founderBtn.addEventListener('click', () => {
    const mail = d.account.emailMasked ? `, почта ${d.account.emailMasked}` : ', почта не привязана';
    if (!confirm(`Сделать «${p.displayName}»${mail} аккаунтом основателя?\n\nЗолотая плашка «Создатель», скрытый вход в админку из игры, 87 уровень, все персонажи, оружие, снаряжение, скины и модификации, $BLAT до 320 000 000 из пула основателя.\n\nОснователь в игре один, и пул основателя выдаётся один раз — проверьте, что это ваш аккаунт.`)) return;
    founderBtn.disabled = true;
    apiFetch<AdminFounderResult>(`/api/admin/players/${encodeURIComponent(p.id)}/founder`, { method: 'POST' })
      .then((r) => {
        toast(`Готово: ${r.level} уровень, ${num(r.blat)} $BLAT, добавлено предметов: ${num(r.items)}`, 'ok');
        onChanged();
      })
      .catch((err: Error) => toast(err.message))
      .finally(() => (founderBtn.disabled = false));
  });
  return h(
    'section',
    { class: 'card' },
    h('h3', {}, 'Действия администратора'),
    h('p', { class: 'note' }, 'Начисление или списание талонов и алмазов (компенсации, исправления). Баланс не может уйти в минус; каждая операция пишется в журнал аудита и в историю игрока.'),
    form,
    h('div', { style: 'height:12px' }),
    h('p', { class: 'note' }, '$BLAT из пула: блогерам — 300 000 000, друзьям проекта — 100 000 000, резерв — 20 000 000 (весь запас — 2 000 000 000). Пул не выдаст больше, чем в нём осталось; запись — в журнале.'),
    alloc,
    h('div', { style: 'height:12px' }),
    h('p', { class: 'note' }, 'Аккаунт основателя: золотая плашка «Создатель» рядом с ником, скрытый вход в админку из игры, 87 уровень, всё снаряжение и $BLAT до 320 000 000 (пул основателя).'),
    founderBtn,
    h('div', { style: 'height:12px' }),
    resetBtn,
    d.account.emailMasked ? null : h('p', { class: 'note' }, 'У игрока нет привязанной почты — сбросить пароль нечем.'),
    linkOut,
  );
}

export async function renderPlayer(root: HTMLElement, id: string, me?: AdminMe | null): Promise<void> {
  clear(root);
  root.append(h('div', { class: 'loading' }, 'Загрузка…'));
  const d = await apiFetch<AdminPlayerDetail>(`/api/admin/players/${encodeURIComponent(id)}`);
  clear(root);
  const p = d.player;
  const kd = p.deaths ? (p.kills / p.deaths).toFixed(2) : p.kills ? '∞' : '—';
  const xpPct = p.xpForNextLevel ? Math.round((p.xpIntoLevel / p.xpForNextLevel) * 100) : 100;
  root.append(
    h('div', { class: 'toolbar' }, h('a', { href: '#/players', class: 'chip' }, '← Все игроки'), h('h2', {}, p.displayName), d.founder ? h('span', { class: 'founder-tag', 'data-testid': 'admin-founder-tag' }, 'СОЗДАТЕЛЬ') : null),
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
            ['Способы входа', d.account.signInMethods.map((m) => SIGN_IN_METHODS[m] ?? m).join(', ') || '—'],
            ['Почта', d.account.emailMasked ? `${d.account.emailMasked} · с ${dateTime(d.account.emailLinkedAt)}` : 'не привязана'],
            ['Версия клиента', d.sessions.lastClientVersion ?? '—'],
            ['Откуда пришёл', originText(d)],
            ...(d.origin?.mergedInto ? ([['Объединён', `пустой профиль первого запуска, отдал Telegram аккаунту ${d.origin.mergedInto} · ${dateTime(d.origin.mergedAt)}`]] as Array<[string, string]>) : []),
            ...(d.origin?.mergedFrom ? ([['Объединённые профили', `${num(d.origin.mergedFrom)} пустых профиля Telegram отдали ему свой Telegram ID`]] as Array<[string, string]>) : []),
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
            ['Помощь', num(p.assists)],
            ['Смерти', num(p.deaths)],
            ['K/D', kd],
            ['Серия побед', `${num(p.currentWinStreak)} (лучшая ${num(p.bestWinStreak)})`],
            ['Время в игре', playtime(p.playtimeSec)],
          ] as Array<[string, string]>).map(([k, v]) => h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, k), h('div', { class: 'tile-value' }, v))),
        ),
      ),
    ),
    h(
      'div',
      { class: 'grid2' },
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Кошелёк и покупки'),
        h(
          'div',
          { class: 'tiles small' },
          h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Талоны'), h('div', { class: 'tile-value' }, num(d.wallet.tokens))),
          h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Алмазы'), h('div', { class: 'tile-value' }, num(d.wallet.diamonds))),
          h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Предметов'), h('div', { class: 'tile-value' }, num(d.items.length))),
          h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Модификаций'), h('div', { class: 'tile-value' }, num(d.mods.length))),
        ),
        h('div', { style: 'height:12px' }),
        table(
          ['Предмет', 'Тип', 'Как получен', 'Когда'],
          [
            ...d.items.map((i) => [itemName(i.kind, i.id), ITEM_KINDS[i.kind] ?? i.kind, ITEM_SOURCES[i.source] ?? i.source, dateTime(i.acquiredAt)]),
            ...d.mods.map((m) => [`${MOD_NAMES[m.mod] ?? m.mod} → ${WEAPON_NAMES[m.weapon] ?? m.weapon}`, 'Модификация', 'за талоны', dateTime(m.acquiredAt)]),
          ],
          [],
          'Только бесплатное снаряжение',
        ),
      ),
      me?.role === 'admin' ? actions(d, () => void renderPlayer(root, id, me)) : h('section', { class: 'card' }, h('h3', {}, 'Действия администратора'), h('p', { class: 'note' }, 'Начисления и ссылки для сброса пароля доступны роли admin.')),
    ),
    ...[blatCard(d, me, () => void renderPlayer(root, id, me)), storyCard(d, me, () => void renderPlayer(root, id, me))].filter((x): x is HTMLElement => x !== null),
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Движение талонов, алмазов и $BLAT'),
      table(
        ['Время', 'Валюта', 'Изменение', 'Баланс', 'Причина', 'Ссылка / комментарий', 'Админ'],
        d.ledger.map((l) => [dateTime(l.at), CURRENCY_NAMES[l.currency] ?? l.currency, `${l.delta > 0 ? '+' : ''}${num(l.delta)}`, num(l.balanceAfter), LEDGER_REASONS[l.reason] ?? l.reason, l.ref ?? '—', l.admin ?? '—']),
        [2, 3],
        'Операций не было',
      ),
      h('p', { class: 'note' }, 'Последние 50 операций, новые сверху.'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Платежи'),
      table(
        ['Создан', 'Оплачен', 'Способ', 'Набор', 'Алмазы', 'Сумма', 'Статус'],
        d.payments.map((x) => [dateTime(x.createdAt), x.paidAt ? dateTime(x.paidAt) : '—', PAYMENT_PROVIDERS[x.provider] ?? x.provider, x.packId, num(x.diamonds), money(x.amountCents, x.currency), PAYMENT_STATUSES[x.status] ?? x.status]),
        [4, 5],
        'Платежей не было',
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Достижения'),
      h('ul', { class: 'achievements' }, ...d.achievements.map((a) => h('li', { class: a.unlockedAt ? 'got' : '' }, h('b', {}, ACHIEVEMENT_NAMES[a.id] ?? RU_ACHIEVEMENTS[a.id]?.title ?? a.title, h('span', { class: 'muted-text' }, ` · в игре «${a.title}»`)), h('span', {}, ACHIEVEMENT_DESCRIPTIONS[a.id] ?? RU_ACHIEVEMENTS[a.id]?.description ?? a.description), h('em', {}, a.unlockedAt ? dateTime(a.unlockedAt) : 'не получено')))),
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
              h('thead', {}, h('tr', {}, ...['Дата', 'Карта', 'Персонаж', 'Место', 'Игроков', 'Устр.', 'Пом.', 'Смерти', 'XP', 'Длит.'].map((t) => h('th', {}, t)))),
              h('tbody', {}, ...d.matches.map((m) => h('tr', {}, h('td', {}, dateTime(m.endedAt)), h('td', {}, MAP_NAMES[m.mapId] ?? m.mapId), h('td', {}, CHARACTER_NAMES[m.character] ?? m.character), h('td', { class: 'num' }, m.won ? '1 🏆' : String(m.place)), h('td', { class: 'num' }, String(m.players)), h('td', { class: 'num' }, String(m.kills)), h('td', { class: 'num' }, String(m.assists)), h('td', { class: 'num' }, String(m.deaths)), h('td', { class: 'num' }, `+${m.xpGained}`), h('td', {}, duration(m.durationMs))))),
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
