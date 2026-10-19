/** Russian number/date/duration formatting for the dashboard. */
const nf = new Intl.NumberFormat('ru-RU');
const pf = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const dayf = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

export const NO_DATA = 'нет данных';

export function num(v: number | null | undefined): string {
  return v === null || v === undefined ? NO_DATA : nf.format(v);
}

export function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? NO_DATA : pf.format(v);
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return NO_DATA;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин ${s % 60} с`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

export function playtime(sec: number): string {
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

export function dateTime(iso: string | null | undefined): string {
  return iso ? `${df.format(new Date(iso))} UTC` : '—';
}

export function shortDay(day: string): string {
  return dayf.format(new Date(`${day}T00:00:00Z`));
}

export const MODE_NAMES: Record<string, string> = {
  ffa: 'Каждый сам за себя',
  teams: 'Красные против синих',
  ctf: 'Захват флага',
  bases: 'Захват баз',
};

export const MAP_NAMES: Record<string, string> = {
  factory: 'Заводская проходная',
  garages: 'Гаражный кооператив',
  yard: 'Советский двор',
  stroyka: 'Стройка',
  dk: 'Дом культуры',
  gastronom: 'Гастроном',
  hospital: 'Больница №3',
};
export const CHARACTER_NAMES: Record<string, string> = {
  petya: 'Петя «Комендант»',
  valuta: 'Валюта «Фарцовщик»',
  uchastkovy: 'Участковый «Всех знает»',
  mihalych: 'Михалыч «Дембель»',
  vorona: 'Карлыч «Информатор»',
  zmeya: 'Сонька «Искусительница»',
  varan: 'Толян «Технарь»',
  popugay: 'Гоша «Связной»',
  piranya: 'Витёк «Безумец»',
  akula: 'Жора «Бизнесмен»',
  oryol: 'Гарик «Пендос»',
  leopard: 'Лёва «Наёмник»',
  slon: 'Батя «Крыша»',
  lobster: 'Славик «Барыга»',
};
/** The game itself is in English; the dashboard names things the way the owner's sheets do. */
export const WEAPON_NAMES: Record<string, string> = {
  pistol: 'Макаров (ПМ)',
  montirovka: 'Монтировка',
  obrez: 'Обрез',
  avtomat: 'АК-47',
  tt: 'ТТ',
  p92: 'P92',
  deagle: 'Дигл',
  nozh: 'Нож',
  bita: 'Бита',
  topor: 'Топор',
  uzi: 'Узи',
  ppsh: 'ППШ-41',
  mp5: 'MP5',
  s12: 'С-12К',
  ksyuha: 'АКС-74У',
  m4: 'M4A1',
  g36: 'G36',
  svd: 'СВД',
  awm: 'AWM',
  m24: 'M24',
  rpg: 'РПГ-7',
  m249: 'M249',
  mauser: 'Маузер комиссара',
  kuvalda: 'Кувалда «Ударник»',
  zolotoy: 'Золотой Калаш',
  tommy: 'Томми-ган «Чикаго»',
  tulka: 'Тулка с гравировкой',
  ognemet: 'Огнемёт «Пламя-84»',
  arbalet: 'Арбалет участкового',
  gvozdomet: 'Гвоздомёт «Стройка»',
  muha: 'РПГ «Муха»',
  granatomet: 'Гранатомёт ГМ-94',
};
export const GADGET_NAMES: Record<string, string> = { f1: 'Граната Ф-1', smoke: 'Дымовая граната', flash: 'Светошумовая', molotov: 'Коктейль Молотова', mine: 'Мина', c4: 'C4', turret: 'Турель' };
export const MOD_NAMES: Record<string, string> = { silencer: 'Глушитель', reddot: 'Коллиматор', scope: 'Оптика', laser: 'Лазер', grip: 'Рукоять', extmag: 'Увеличенный магазин' };
export const ITEM_KINDS: Record<string, string> = { weapon: 'Оружие', character: 'Персонаж', gadget: 'Снаряжение' };
export const ITEM_SOURCES: Record<string, string> = { tokens: 'за талоны', diamonds: 'за алмазы', case: 'из кейса', grant: 'выдано' };
export const LEDGER_REASONS: Record<string, string> = {
  match: 'За матчи',
  purchase: 'Покупки',
  mod: 'Модификации',
  case: 'Кейсы',
  topup: 'Пополнения',
  grant: 'Начисления админа',
  refund: 'Возвраты',
};
export const PAYMENT_STATUSES: Record<string, string> = { created: 'ожидает', paid: 'оплачен', failed: 'ошибка', expired: 'истёк', refunded: 'возврат' };
export const PAYMENT_PROVIDERS: Record<string, string> = { stripe: 'Карта (Stripe)', nowpayments: 'Крипта (NOWPayments)', telegram: 'Telegram Stars' };
export const SIGN_IN_METHODS: Record<string, string> = { telegram: 'Telegram', guest: 'браузер (гость)', email: 'почта', dev: 'разработка' };
export const RARITIES: Record<string, string> = { rare: 'Редкое', epic: 'Эпическое', legendary: 'Легендарное' };

export function itemName(kind: string, id: string): string {
  return (kind === 'weapon' ? WEAPON_NAMES[id] : kind === 'character' ? CHARACTER_NAMES[id] : kind === 'gadget' ? GADGET_NAMES[id] : undefined) ?? id;
}

/** Cents in a payment currency → «4,99 $». Unknown codes fall back to a plain number. */
export function money(cents: number | null | undefined, currency = 'usd'): string {
  if (cents === null || cents === undefined) return NO_DATA;
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
export const PLATFORM_NAMES: Record<string, string> = {
  telegram_ios: 'Telegram iOS',
  telegram_android: 'Telegram Android',
  telegram_desktop: 'Telegram Desktop',
  telegram_web: 'Telegram Web',
  telegram_other: 'Telegram (другое)',
  browser_mobile: 'Браузер (моб.)',
  browser_desktop: 'Браузер (ПК)',
  unknown: 'Неизвестно',
};
export const ACHIEVEMENT_NAMES: Record<string, string> = {
  first_match: 'Первое дело',
  first_win: 'Авторитет',
  ten_matches: 'Свой человек',
  win_streak: 'Держит район',
  multi_kill: 'Разборка',
  played_with_friends: 'Свои люди',
};
export const ACHIEVEMENT_DESCRIPTIONS: Record<string, string> = {
  first_match: 'Доиграть первый матч.',
  first_win: 'Победить в матче.',
  ten_matches: 'Доиграть 10 матчей.',
  win_streak: 'Победить 3 матча подряд.',
  multi_kill: '5 устранений за один матч.',
  played_with_friends: 'Сыграть матч с друзьями по приглашению.',
};
