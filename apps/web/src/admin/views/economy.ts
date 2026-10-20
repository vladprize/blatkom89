/** Economy: talons and diamonds in and out, real-money revenue, purchases, modifications and cases. */
import type { AdminCurrencyFlow, AdminEconomy } from '@blatkom/shared';
import { h, clear } from '../dom.js';
import { apiFetch, rangeQuery } from '../api.js';
import { num, pct, money, shortDay, dateTime, itemName, CASE_KINDS, ITEM_KINDS, ITEM_SOURCES, LEDGER_REASONS, MOD_NAMES, PAYMENT_PROVIDERS, RARITIES } from '../format.js';
import { lineChart, barChart, hBarChart, COLORS, emptyState } from '../charts.js';
import { rangePicker, getRange } from './range.js';

const tile = (label: string, value: string, hint?: string) =>
  h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), hint ? h('div', { class: 'tile-hint' }, hint) : null);

const card = (title: string, ...children: Array<HTMLElement | null>) => h('section', { class: 'card' }, h('h3', {}, title), ...children);

const reasons = (o: Record<string, number>) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: LEDGER_REASONS[k] ?? k, value: v }));

function flowCard(title: string, f: AdminCurrencyFlow, color: string): HTMLElement {
  return card(
    title,
    h('div', { class: 'tiles small' }, tile('Выдано', num(f.issuedTotal)), tile('Потрачено', num(f.spentTotal)), tile('На руках сейчас', num(f.circulating), `у ${num(f.holders)} игроков`)),
    h('h4', { class: 'sub' }, 'Откуда пришли'),
    hBarChart(reasons(f.issued), { ariaLabel: `${title}: начисления по причинам`, color }),
    h('h4', { class: 'sub' }, 'Куда ушли'),
    hBarChart(reasons(f.spent), { ariaLabel: `${title}: списания по причинам`, color: COLORS.violet }),
  );
}

function table(head: string[], rows: Array<Array<string | HTMLElement>>, numeric: number[] = []): HTMLElement {
  if (rows.length === 0) return emptyState();
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

export async function renderEconomy(root: HTMLElement): Promise<void> {
  clear(root);
  const body = h('div', { class: 'stack' }, h('div', { class: 'loading' }, 'Загрузка…'));
  root.append(h('div', { class: 'toolbar' }, h('h2', {}, 'Экономика'), rangePicker(() => void renderEconomy(root))), body);
  const e = await apiFetch<AdminEconomy>(`/api/admin/economy?${rangeQuery(getRange())}`);
  clear(body);
  const rev = e.revenue;
  const main = rev.byCurrency[0];
  const net = main ? main.grossCents - main.refundedCents : null;
  body.append(
    h('p', { class: 'note' }, `Период: ${e.range.firstDay} — ${e.range.lastDay} (UTC). Обновлено ${dateTime(e.generatedAt)}. Талоны зарабатываются в матчах, алмазы покупаются за деньги.`),
    h(
      'div',
      { class: 'tiles' },
      tile('Выручка', main ? money(net, main.currency) : money(0), main && main.refundedCents > 0 ? `${money(main.grossCents, main.currency)} минус возвраты ${money(main.refundedCents, main.currency)}` : 'после возвратов'),
      tile('Платежи', num(rev.payments)),
      tile('Платящие', num(rev.payers)),
      tile('Средний чек (ARPPU)', main && rev.payers > 0 ? money(Math.round((net ?? 0) / rev.payers), main.currency) : '—', 'выручка ÷ платящие'),
      tile('Ждут оплаты', num(rev.pending), 'открытые оплаты периода'),
      tile('Не прошли', num(rev.failed), 'ошибка или истёк срок'),
      tile('Покупки в Арсенале', num(e.purchases.total), 'оружие, персонажи, снаряжение'),
      tile('Модификации', num(e.mods.total)),
      tile('Кейсы', num(e.cases.total), `${num(e.cases.diamondsSpent)} алмазов`),
    ),
  );
  if (rev.byCurrency.length > 1) body.append(h('p', { class: 'note' }, `Платежи в нескольких валютах: ${rev.byCurrency.map((c) => `${money(c.grossCents - c.refundedCents, c.currency)}`).join(' · ')}.`));
  const days = e.daily.map((d) => shortDay(d.day));
  body.append(
    h(
      'div',
      { class: 'grid2' },
      card(
        'Талоны по дням',
        lineChart(
          days,
          [
            { name: 'Выдано', color: COLORS.amber, values: e.daily.map((d) => d.tokensIssued) },
            { name: 'Потрачено', color: COLORS.violet, values: e.daily.map((d) => d.tokensSpent) },
          ],
          { ariaLabel: 'Талоны по дням' },
        ),
      ),
      card(
        'Алмазы по дням',
        lineChart(
          days,
          [
            { name: 'Выдано', color: COLORS.blue, values: e.daily.map((d) => d.diamondsIssued) },
            { name: 'Потрачено', color: COLORS.violet, values: e.daily.map((d) => d.diamondsSpent) },
          ],
          { ariaLabel: 'Алмазы по дням' },
        ),
      ),
      card(
        'Выручка по дням',
        barChart(
          days,
          e.daily.map((d) => d.revenueCents / 100),
          { ariaLabel: 'Выручка по дням', color: COLORS.green, yFormat: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2)) },
        ),
        h('p', { class: 'note' }, `В ${main ? main.currency.toUpperCase() : 'USD'}, по дате оплаты, без вычета возвратов.`),
      ),
      card(
        'Способы оплаты и наборы',
        table(
          ['Способ', 'Платежей', 'Сумма'],
          rev.byProvider.map((p) => [PAYMENT_PROVIDERS[p.provider] ?? p.provider, num(p.payments), money(p.grossCents, main?.currency)]),
          [1, 2],
        ),
        h('h4', { class: 'sub' }, 'Наборы алмазов'),
        hBarChart(rev.byPack.map((p) => ({ label: `${p.packId.replace(/^d/, '')} 💎`, value: p.payments })), { ariaLabel: 'Покупки по наборам', color: COLORS.blue }),
      ),
      flowCard('Талоны', e.tokens, COLORS.amber),
      flowCard('Алмазы', e.diamonds, COLORS.blue),
      card('Самое покупаемое', hBarChart(e.purchases.top.map((t) => ({ label: itemName(t.kind, t.id), value: t.count })), { ariaLabel: 'Топ покупок', color: COLORS.red }), h('p', { class: 'note' }, 'Только покупки за талоны и алмазы; выпавшее из кейсов и выданное — в таблице ниже.')),
      card(
        'Покупки по типам',
        table(
          ['Тип', 'Как получено', 'Штук'],
          e.purchases.byKind.map((k) => [ITEM_KINDS[k.kind] ?? k.kind, ITEM_SOURCES[k.source] ?? k.source, num(k.count)]),
          [2],
        ),
      ),
      card('Модификации', hBarChart(e.mods.top.map((m) => ({ label: MOD_NAMES[m.id] ?? m.id, value: m.count })), { ariaLabel: 'Покупки модификаций', color: COLORS.green })),
      card(
        'Кейсы',
        e.cases.total
          ? hBarChart(e.cases.byRarity.map((c) => ({ label: RARITIES[c.rarity] ?? c.rarity, value: c.count })), { ariaLabel: 'Кейсы по редкости', color: COLORS.violet })
          : emptyState('кейсы не открывали'),
        e.cases.byKind?.length ? table(['Кейс', 'Открыто', 'Алмазов'], e.cases.byKind.map((k) => [CASE_KINDS[k.kind] ?? k.kind, num(k.count), num(k.diamondsSpent)]), [1, 2]) : null,
        h('p', { class: 'note' }, `Доля кейсов в тратах алмазов: ${pct(e.diamonds.spentTotal > 0 ? e.cases.diamondsSpent / e.diamonds.spentTotal : null)}.`),
      ),
    ),
  );
}
