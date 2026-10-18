/**
 * «Арсенал»: loadout and upgrades, the weapon and character shop, the rare-weapon case and diamond
 * packs. Prices and rules are the shared ones; every purchase is decided by the server. In the demo
 * build (no server) the catalog is read-only.
 */
import {
  CASE_PRICE,
  CASE_TABLE,
  CHARACTERS,
  CHARACTER_PRICES,
  DIAMONDS_PER_USD,
  FREE_WEAPONS,
  MELEE_WEAPONS,
  PRIMARY_WEAPONS,
  REFUSAL_TEXT,
  SHOP_CHARACTERS,
  SHOP_WEAPONS,
  SIDEARMS,
  UPGRADE_COSTS,
  UPGRADE_EFFECT,
  UPGRADE_MAX_LEVEL,
  WEAPONS,
  WEAPON_PRICES,
  buyRefusal,
  caseOdds,
  damageFalloff,
  upgradeQuote,
  upgradeStatsFor,
} from '@blatkom/shared';
import type { CharacterId, Inventory, Rarity, ShopConfig, ShopPrice, UpgradeStat, WeaponId } from '@blatkom/shared';
import { h, toast, asset, portrait, plural } from '../dom.js';
import type { OnlineClient } from '../../net/OnlineClient.js';
import { ApiError } from '../../net/api.js';
import { sfx } from '../../game/audio/Sfx.js';
import { haptic } from '../../telegram/tg.js';

export type ArsenalTab = 'loadout' | 'weapons' | 'characters' | 'case' | 'diamonds';

export interface ArsenalOptions {
  online: OnlineClient | null;
  inTelegram: boolean;
  tab?: ArsenalTab;
  /** Start a practice match with this weapon in hand («примерить»). */
  onTry: (w: WeaponId) => void;
  /** Wallet changed (menu strip refresh). */
  onWallet?: () => void;
  /** Show this character in the character screen. */
  onCharacter?: (c: CharacterId) => void;
}

const STAT_LABEL: Record<UpgradeStat, string> = { dmg: 'Урон', rate: 'Скорострельность', reload: 'Перезарядка', mag: 'Магазин' };
const RARITY_LABEL: Record<Rarity, string> = { rare: 'Редкое', epic: 'Эпическое', legendary: 'Легендарное' };
const SLOT_LABEL = { 1: 'Пистолет', 2: 'Ближний бой', 3: 'Основное' } as const;

export const tokenWord = (n: number) => plural(n, ['жетон', 'жетона', 'жетонов']);
export const diamondWord = (n: number) => plural(n, ['алмаз', 'алмаза', 'алмазов']);

/** Currency icon (CSS-drawn: a brass token or a blue diamond) — no emoji font needed. */
export function cur(c: 'tokens' | 'diamonds'): HTMLElement {
  return h('i', { class: `cur cur--${c}`, 'aria-label': c === 'tokens' ? 'жетонов' : 'алмазов' });
}

export function amount(n: number, c: 'tokens' | 'diamonds'): HTMLElement {
  return h('span', { class: 'amt' }, cur(c), String(n));
}

export function priceLabel(p: ShopPrice): HTMLElement {
  if (p.currency === 'tokens') return h('span', { class: 'amt' }, cur('tokens'), String(p.amount), p.level > 1 ? ` · с ${p.level} ур.` : '');
  return h('span', { class: 'amt' }, cur('diamonds'), String(p.amount), h('small', null, ` $${(p.amount / DIAMONDS_PER_USD).toFixed(2)}`));
}

/** Payment pages open in the browser (inside Telegram: through the WebApp API). */
function openExternal(url: string) {
  const t = (window as unknown as { Telegram?: { WebApp?: { initData?: string; openLink?: (u: string) => void } } }).Telegram?.WebApp;
  if (t?.initData && t.openLink) t.openLink(url);
  else location.href = url;
}

function weaponImg(w: WeaponId, cls = 'wimg'): HTMLImageElement {
  return h('img', { class: cls, src: asset(`assets/ui/weapons/${w}.png`), alt: '', draggable: 'false' });
}

/** Per-shot damage incl. pellets and splash, at close range. */
function shotDamage(w: WeaponId): number {
  const d = WEAPONS[w];
  return d.kind === 'projectile' ? d.damage + d.projectile!.splash : d.damage * d.pellets;
}

function hitsToKill(w: WeaponId): number {
  return Math.max(1, Math.ceil(100 / shotDamage(w) - 1e-9));
}

function statBars(w: WeaponId): HTMLElement {
  const d = WEAPONS[w];
  const rows: Array<[string, number, string]> = [];
  rows.push(['Урон', Math.min(1, shotDamage(w) / 140), `${Math.round(shotDamage(w))}${d.pellets > 1 ? ` (${d.pellets}×${d.damage})` : ''}`]);
  if (d.kind !== 'melee') {
    rows.push(['Темп', Math.min(1, 1000 / d.fireIntervalMs / 16), `${(60000 / d.fireIntervalMs).toFixed(0)}/мин`]);
    rows.push(['Дальность', Math.min(1, d.range / 950), d.range < 300 ? 'ближняя' : d.range < 600 ? 'средняя' : 'дальняя']);
    rows.push(['Магазин', Math.min(1, d.magazine / 100), String(d.magazine)]);
  } else {
    rows.push(['Темп', Math.min(1, 1000 / d.fireIntervalMs / 3.4), `${(60000 / d.fireIntervalMs).toFixed(0)}/мин`]);
    rows.push(['Досягаемость', Math.min(1, d.meleeRange / 44), `${d.meleeRange}`]);
  }
  rows.push(['Подвижность', Math.max(0, Math.min(1, (d.moveSpeed - 0.75) / 0.3)), `${Math.round(d.moveSpeed * 100)}%`]);
  const falloff = d.kind === 'hitscan' && d.range > 0 ? damageFalloff(d, d.range) : 1;
  return h(
    'div',
    { class: 'wstats' },
    ...rows.map(([k, v, t]) => h('div', { class: 'wstat' }, h('span', null, k), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(v * 100)}%` })), h('b', null, t))),
    h('div', { class: 'muted', style: 'font-size:13px' }, `${hitsToKill(w) === 1 ? 'Устраняет с одного попадания вблизи' : `Устраняет за ${hitsToKill(w)} ${plural(hitsToKill(w), ['попадание', 'попадания', 'попаданий'])} вблизи`}${falloff < 0.99 ? `, на дальней — урон ×${falloff.toFixed(2)}` : ''}${d.silenced ? ' · без следа на мини-карте' : ''}${d.projectile ? ` · взрыв ${d.projectile.radius} px, задевает и вас` : ''}`),
  );
}

export function renderArsenal(o: ArsenalOptions): HTMLElement {
  let tab: ArsenalTab = o.tab ?? 'loadout';
  let inv: Inventory | null = o.online?.inventory ?? null;
  let cfg: ShopConfig | null = null;
  let busy = false;
  const online = o.online;
  const root = h('div', { class: 'col arsenal' });
  const walletEl = h('div', { class: 'wallet' });
  const tabsEl = h('div', { class: 'seg tabs', role: 'tablist' });
  const body = h('div', { class: 'col' });
  root.append(walletEl, tabsEl, body);

  const owned = (w: WeaponId) => (inv ? inv.weapons.includes(w) : FREE_WEAPONS.includes(w));
  const fail = (e: unknown) => {
    sfx.play('dry');
    toast(e instanceof ApiError || e instanceof Error ? e.message : 'Не получилось');
  };
  const act = async (f: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
    busy = true;
    try {
      await f();
      inv = online?.inventory ?? inv;
      if (ok) {
        toast(ok);
        sfx.play('buy');
        haptic('notify-success');
      }
      o.onWallet?.();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
      draw();
    }
  };

  const drawWallet = () => {
    if (!online) {
      walletEl.replaceChildren(h('div', { class: 'muted' }, 'Демо-версия: каталог для просмотра. Жетоны, алмазы и покупки работают в онлайн-версии; любое оружие можно «примерить» в тренировке.'));
      return;
    }
    walletEl.replaceChildren(
      h('div', { class: 'coin', title: 'Жетоны — за матчи онлайн' }, cur('tokens'), h('b', null, inv ? String(inv.tokens) : '…'), h('span', null, 'жетоны')),
      h('div', { class: 'coin', title: 'Алмазы — покупаются за деньги' }, cur('diamonds'), h('b', null, inv ? String(inv.diamonds) : '…'), h('span', null, 'алмазы')),
      h('button', { class: 'btn btn--small', onclick: () => ((tab = 'diamonds'), draw()) }, 'Пополнить'),
    );
  };

  const drawTabs = () => {
    const tabs: Array<[ArsenalTab, string]> = [
      ['loadout', 'Снаряжение'],
      ['weapons', 'Оружие'],
      ['characters', 'Персонажи'],
      ['case', 'Кейс'],
      ['diamonds', 'Алмазы'],
    ];
    tabsEl.replaceChildren(...tabs.map(([id, label]) => h('button', { role: 'tab', 'aria-pressed': String(tab === id), onclick: () => ((tab = id), sfx.play('click'), draw()) }, label)));
  };

  // ── loadout + upgrades ─────────────────────────────────────────────────
  let focus: WeaponId | null = null;
  const loadoutTab = (): HTMLElement => {
    const l = inv?.loadout ?? { sidearm: 'pistol' as WeaponId, melee: 'montirovka' as WeaponId, primary: 'avtomat' as WeaponId | null, mods: {} };
    focus ??= l.primary ?? l.sidearm;
    const slots: Array<[1 | 2 | 3, WeaponId | null, readonly WeaponId[]]> = [
      [1, l.sidearm, SIDEARMS],
      [2, l.melee, MELEE_WEAPONS],
      [3, l.primary, PRIMARY_WEAPONS],
    ];
    const pick = (slot: 1 | 2 | 3, w: WeaponId | null) => {
      if (!online || !inv) return;
      const next = { sidearm: l.sidearm, melee: l.melee, primary: l.primary };
      if (slot === 1 && w) next.sidearm = w;
      if (slot === 2 && w) next.melee = w;
      if (slot === 3) next.primary = w;
      focus = w ?? focus;
      void act(() => online.setLoadout(next.sidearm, next.melee, next.primary), 'Снаряжение сохранено — со следующего появления');
    };
    const slotCards = slots.map(([slot, cur, list]) => {
      const options = list.filter(owned);
      return h(
        'div',
        { class: 'panel col slotcard' },
        h('span', { class: 'tag' }, `${slot} · ${SLOT_LABEL[slot]}`),
        h(
          'div',
          { class: 'slotpick' },
          ...options.map((w) => h('button', { class: `wbtn ${w === cur ? 'on' : ''}`, 'aria-pressed': String(w === cur), title: WEAPONS[w].name, onclick: () => (w === cur ? ((focus = w), draw()) : pick(slot, w)) }, weaponImg(w, 'wimg wimg--s'), h('span', null, WEAPONS[w].name))),
          slot === 3 ? h('button', { class: `wbtn ${cur === null ? 'on' : ''}`, 'aria-pressed': String(cur === null), onclick: () => pick(3, null) }, h('span', { class: 'none' }, '—'), h('span', null, 'Только пистолет')) : null,
        ),
        options.length < list.length ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((tab = 'weapons'), draw()) }, `Ещё ${list.length - options.length} в магазине →`) : null,
      );
    });
    const fw = focus && owned(focus) ? focus : (l.primary ?? l.sidearm);
    const ups = inv?.upgrades[fw] ?? {};
    const upgradePanel = h(
      'div',
      { class: 'panel col' },
      h('span', { class: 'tag' }, 'Улучшения'),
      h('div', { class: 'row', style: 'margin-top:6px' }, weaponImg(fw), h('div', { class: 'col grow', style: 'gap:2px' }, h('div', { class: 'h2' }, WEAPONS[fw].name), h('div', { class: 'muted' }, 'Выберите оружие в слотах выше, чтобы улучшить его. Улучшения действуют только на ваше оружие и только онлайн.'))),
      ...upgradeStatsFor(WEAPONS[fw]).map((stat) => {
        const lv = ups[stat] ?? 0;
        const q = inv ? upgradeQuote(inv, fw, stat) : 'not_owned';
        const effect = UPGRADE_EFFECT[stat][Math.min(UPGRADE_MAX_LEVEL, lv + 1)]!;
        const label: HTMLElement | string = typeof q === 'string' ? (q === 'max_level' ? 'Максимум' : amount(UPGRADE_COSTS[lv + 1] ?? 0, 'tokens')) : h('span', null, `+${Math.round(effect * 100)}% за `, amount(q.cost, 'tokens'));
        return h(
          'div',
          { class: 'uprow' },
          h('div', { class: 'grow' }, h('b', null, STAT_LABEL[stat]), h('div', { class: 'pips' }, ...Array.from({ length: UPGRADE_MAX_LEVEL }, (_, i) => h('i', { class: i < lv ? 'on' : '' }))), h('span', { class: 'muted' }, lv > 0 ? `сейчас +${Math.round(UPGRADE_EFFECT[stat][lv]! * 100)}%` : 'без улучшений')),
          h('button', { class: 'btn btn--small', disabled: !online || typeof q === 'string', title: typeof q === 'string' ? REFUSAL_TEXT[q] : '', onclick: () => void act(() => online!.upgrade(fw, stat), `${STAT_LABEL[stat]}: уровень ${lv + 1}`) }, label),
        );
      }),
    );
    return h('div', { class: 'col' }, h('div', { class: 'slots' }, ...slotCards), upgradePanel, statBars(fw));
  };

  // ── weapons shop ──────────────────────────────────────────────────────
  const buyButton = (kind: 'weapon' | 'character', id: WeaponId | CharacterId, price: ShopPrice): HTMLElement => {
    if (!online || !inv) return h('button', { class: 'btn btn--small', disabled: true }, priceLabel(price));
    const r = buyRefusal(inv, kind, id);
    if (r === 'owned') return h('span', { class: 'badge badge--ok' }, 'Есть');
    const label: HTMLElement | string = r === 'level' ? `С ${price.level} уровня` : priceLabel(price);
    return h(
      'button',
      {
        class: `btn btn--small ${r ? '' : 'btn--red'}`,
        disabled: r === 'level',
        onclick: () => {
          if (r === 'funds') {
            toast(price.currency === 'tokens' ? 'Не хватает жетонов — они даются за матчи онлайн' : 'Не хватает алмазов');
            if (price.currency === 'diamonds') ((tab = 'diamonds'), draw());
            return;
          }
          void act(() => online.buy(kind, id), kind === 'weapon' ? `${WEAPONS[id as WeaponId].name} — ваш` : `${CHARACTERS[id as CharacterId].name} в деле`);
        },
      },
      label,
    );
  };

  const weaponCard = (w: WeaponId): HTMLElement => {
    const d = WEAPONS[w];
    const price = WEAPON_PRICES[w];
    return h(
      'div',
      { class: `panel col wcard ${owned(w) ? 'owned' : ''}` },
      h('span', { class: 'tag' }, `${SLOT_LABEL[d.slot]}${d.tier === 'rare' ? ' · из кейса' : ''}`),
      h('div', { class: 'wpic' }, weaponImg(w)),
      h('div', { class: 'h2' }, d.name),
      h('div', { class: 'muted' }, d.blurb),
      statBars(w),
      h(
        'div',
        { class: 'row' },
        price ? buyButton('weapon', w, price) : owned(w) ? h('span', { class: 'badge badge--ok' }, 'Есть') : h('span', { class: 'badge' }, d.tier === 'rare' ? 'Только из кейса' : 'Бесплатно'),
        h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onTry(w) }, 'Примерить'),
      ),
    );
  };

  const weaponsTab = (): HTMLElement => {
    const group = (title: string, note: string, list: WeaponId[]) =>
      h('div', { class: 'col' }, h('div', { class: 'row' }, h('div', { class: 'h2' }, title), h('span', { class: 'muted' }, note)), h('div', { class: 'cards' }, ...list.map(weaponCard)));
    const tokenNoLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level <= 1);
    const tokenLevel = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'tokens' && WEAPON_PRICES[w]!.level > 1);
    const forDiamonds = SHOP_WEAPONS.filter((w) => WEAPON_PRICES[w]!.currency === 'diamonds');
    return h(
      'div',
      { class: 'col' },
      h('div', { class: 'muted' }, 'Платное оружие — не сильнее бесплатного, а другое: каждое со своими плюсами и минусами. Любое можно сначала примерить в тренировке.'),
      group('За жетоны', 'жетоны дают за каждый матч онлайн', tokenNoLevel),
      group('За жетоны с уровня', 'открываются по мере роста', tokenLevel),
      group('За алмазы', '$1.99 – $4.99', forDiamonds),
      group('Бесплатное', 'есть у всех', [...FREE_WEAPONS]),
    );
  };

  // ── characters ────────────────────────────────────────────────────────
  const charactersTab = (): HTMLElement =>
    h(
      'div',
      { class: 'col' },
      h('div', { class: 'muted' }, 'Все персонажи равны по характеристикам — различаются внешностью и историей. Половина открывается опытом и жетонами, половина — за алмазы.'),
      h(
        'div',
        { class: 'cards' },
        ...SHOP_CHARACTERS.map((c) => {
          const d = CHARACTERS[c];
          const price = CHARACTER_PRICES[c]!;
          const mine = inv ? inv.characters.includes(c) : false;
          return h(
            'div',
            { class: `panel col ccard ${mine ? 'owned' : ''}` },
            h('span', { class: 'tag' }, d.species),
            h('div', { class: 'row', style: 'flex-wrap:nowrap;margin-top:6px' }, portrait(c), h('div', { class: 'col', style: 'gap:2px' }, h('div', { class: 'h2' }, d.name), h('div', { class: 'nick' }, `«${d.nickname}»`), h('div', { class: 'muted' }, d.role))),
            h('div', { class: 'quote' }, `«${d.quote}»`),
            h('div', { class: 'lore' }, d.lore),
            h('div', { class: 'row' }, buyButton('character', c, price), o.onCharacter ? h('button', { class: 'btn btn--small btn--ghost', onclick: () => o.onCharacter!(c) }, 'Посмотреть') : null),
          );
        }),
      ),
    );

  // ── case ──────────────────────────────────────────────────────────────
  let reveal: { weapon: WeaponId; rarity: Rarity } | null = null;
  const caseTab = (): HTMLElement => {
    const have = new Set(inv?.weapons ?? []);
    const odds = caseOdds(have);
    const left = odds.filter((e) => e.odds > 0).length;
    const enabled = cfg?.casesEnabled !== false;
    const confirmAndOpen = () => {
      if (!online || !inv) return;
      if (inv.diamonds < CASE_PRICE) {
        toast('Не хватает алмазов');
        tab = 'diamonds';
        draw();
        return;
      }
      const ov = h('div', { class: 'overlay overlay--top' });
      const close = () => ov.remove();
      ov.append(
        h(
          'div',
          { class: 'panel modal col' },
          h('span', { class: 'tag' }, 'Подтверждение'),
          h('div', { style: 'margin-top:8px' }, `Открыть кейс за ${CASE_PRICE} ${diamondWord(CASE_PRICE)} ($${(CASE_PRICE / DIAMONDS_PER_USD).toFixed(2)})?`),
          h('div', { class: 'muted' }, 'Внутри — случайное редкое оружие, которого у вас ещё нет. Шансы указаны в списке. Покупка необратима.'),
          h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              onchange: (e: Event) => {
                const btn = ov.querySelector<HTMLButtonElement>('[data-open]');
                if (btn) btn.disabled = !(e.target as HTMLInputElement).checked;
              },
            }),
            ' Мне есть 18 лет',
          ),
          h(
            'button',
            {
              class: 'btn btn--red',
              'data-open': '1',
              disabled: true,
              onclick: () => {
                close();
                void act(async () => {
                  const r = await online.openCase();
                  reveal = { weapon: r.weapon, rarity: r.rarity };
                  sfx.play(r.rarity === 'legendary' ? 'supply' : 'pickup');
                });
              },
            },
            'Открыть',
          ),
          h('button', { class: 'btn', onclick: close }, 'Отмена'),
        ),
      );
      root.append(ov);
    };
    const shown = reveal;
    return h(
      'div',
      { class: 'col' },
      shown
        ? h(
            'div',
            { class: `panel col reveal reveal--${shown.rarity}` },
            h('span', { class: 'tag' }, 'Из кейса'),
            h('div', { class: 'h1' }, WEAPONS[shown.weapon].name),
            h('div', { class: 'wpic wpic--big' }, weaponImg(shown.weapon)),
            h('div', { class: 'muted' }, `${RARITY_LABEL[shown.rarity]} · уже в вашем арсенале`),
            h('div', { class: 'row' }, h('button', { class: 'btn btn--small', onclick: () => ((reveal = null), (focus = shown.weapon), (tab = 'loadout'), draw()) }, 'Взять в снаряжение'), h('button', { class: 'btn btn--small btn--ghost', onclick: () => ((reveal = null), draw()) }, 'Закрыть')),
          )
        : null,
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Кейс «Дефицит»'),
        h('div', { class: 'row', style: 'margin-top:6px' }, h('div', { class: 'crate' }), h('div', { class: 'col grow', style: 'gap:4px' }, h('div', { class: 'h2' }, 'Редкое оружие · ', amount(CASE_PRICE, 'diamonds')), h('div', { class: 'muted' }, 'Одно из 10 редких стволов. Повторов не бывает: уже полученное оружие из кейса не выпадает, шансы остальных пересчитываются. Когда коллекция собрана, кейс больше не продаётся.'))),
        !enabled
          ? h('div', { class: 'badge badge--off' }, 'Кейсы на этом сервере отключены')
          : left === 0
            ? h('div', { class: 'badge badge--ok' }, 'Коллекция собрана!')
            : h('button', { class: 'btn btn--red', disabled: !online, onclick: confirmAndOpen }, online ? h('span', null, 'Открыть за ', amount(CASE_PRICE, 'diamonds')) : 'Доступно в онлайн-версии'),
        h('div', { class: 'muted', style: 'font-size:13px' }, 'Только для совершеннолетних. В некоторых странах платные кейсы запрещены — там их не стоит покупать. Шансы ниже — честные и проверяются сервером.'),
      ),
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Шансы'),
        h(
          'table',
          { class: 'table', style: 'margin-top:6px' },
          h('thead', null, h('tr', null, h('th', null, 'Оружие'), h('th', null, 'Редкость'), h('th', { class: 'num' }, 'Шанс'))),
          h(
            'tbody',
            null,
            ...odds.map((e) =>
              h(
                'tr',
                { class: e.odds === 0 ? 'got' : '' },
                h('td', null, h('div', { class: 'row', style: 'flex-wrap:nowrap;gap:8px' }, weaponImg(e.weapon, 'wimg wimg--xs'), WEAPONS[e.weapon].name)),
                h('td', { class: `rar rar--${e.rarity}` }, RARITY_LABEL[e.rarity]),
                h('td', { class: 'num' }, e.odds === 0 && have.has(e.weapon) ? 'есть' : `${e.odds.toFixed(e.odds < 10 ? 1 : 0)}%`),
              ),
            ),
          ),
        ),
        h('div', { class: 'muted', style: 'font-size:13px' }, `Базовые шансы (без полученного): ${CASE_TABLE.map((e) => `${WEAPONS[e.weapon].name} ${e.chance}%`).join(', ')}.`),
      ),
      h('div', { class: 'cards' }, ...CASE_TABLE.map((e) => weaponCard(e.weapon))),
    );
  };

  // ── diamonds ──────────────────────────────────────────────────────────
  const diamondsTab = (): HTMLElement => {
    if (!online) return h('div', { class: 'panel' }, 'Покупка алмазов работает в онлайн-версии игры.');
    if (o.inTelegram) return h('div', { class: 'panel col' }, h('span', { class: 'tag' }, 'Алмазы'), h('div', { style: 'margin-top:8px' }, 'Покупка алмазов внутри Telegram скоро появится (через Telegram Stars).'));
    const methods: Array<['card' | 'crypto', string]> = [];
    if (cfg?.card) methods.push(['card', 'Картой']);
    if (cfg?.crypto) methods.push(['crypto', 'Криптой']);
    const buyPack = (packId: string, method: 'card' | 'crypto') =>
      void act(async () => {
        const r = await online.api.checkout(packId, method);
        try {
          sessionStorage.setItem('blatkom89.pending-payment', r.paymentId);
        } catch {
          /* private mode: the ?pid= return parameter still works */
        }
        openExternal(r.url);
      });
    return h(
      'div',
      { class: 'col' },
      h(
        'div',
        { class: 'panel col' },
        h('span', { class: 'tag' }, 'Алмазы'),
        h('div', { style: 'margin-top:8px' }, '100 алмазов = $1. Алмазы тратятся на оружие, персонажей и кейсы. Жетоны за деньги не продаются — их зарабатывают в матчах.'),
        methods.length === 0
          ? h('div', { class: 'badge', style: 'align-self:flex-start' }, 'Оплата пока не подключена — скоро')
          : h('div', { class: 'muted' }, 'Оплата на защищённой странице платёжной системы. Алмазы зачисляются автоматически после подтверждения платежа.'),
      ),
      h(
        'div',
        { class: 'packs' },
        ...(cfg?.packs ?? []).map((p) =>
          h(
            'div',
            { class: 'panel col pack' },
            h('div', { class: 'h1' }, amount(p.diamonds, 'diamonds')),
            h('div', { class: 'h2' }, `$${(p.usdCents / 100).toFixed(2)}`),
            ...(methods.length ? methods.map(([m, label]) => h('button', { class: 'btn btn--small btn--red', onclick: () => buyPack(p.id, m) }, label)) : [h('button', { class: 'btn btn--small', disabled: true }, 'Скоро')]),
          ),
        ),
      ),
      h('div', { class: 'muted', style: 'font-size:13px' }, 'Покупки привязаны к аккаунту. Чтобы не потерять их при смене устройства, привяжите почту в профиле.'),
    );
  };

  const draw = () => {
    drawWallet();
    drawTabs();
    const content = tab === 'loadout' ? loadoutTab() : tab === 'weapons' ? weaponsTab() : tab === 'characters' ? charactersTab() : tab === 'case' ? caseTab() : diamondsTab();
    body.replaceChildren(content);
  };

  draw();
  if (online) {
    void online
      .loadInventory()
      .then((i) => {
        inv = i;
        draw();
      })
      .catch((e: Error) => toast(`Арсенал: ${e.message}`));
    void online.api
      .shopConfig()
      .then((c) => {
        cfg = c;
        draw();
      })
      .catch(() => {});
  }
  return root;
}

/** Name + price line of a locked character (character screen). */
export function characterPriceNote(c: CharacterId, inv: Inventory | null): string | null {
  const p = CHARACTER_PRICES[c];
  if (!p) return null;
  if (inv?.characters.includes(c)) return null;
  return p.currency === 'tokens' ? `Открывается с ${p.level} уровня за ${p.amount} ${tokenWord(p.amount)}` : `Открывается за ${p.amount} ${diamondWord(p.amount)} ($${(p.amount / DIAMONDS_PER_USD).toFixed(2)})`;
}

export { diamondWord as diamondsPlural };
