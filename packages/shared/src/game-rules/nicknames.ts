/**
 * Aliases. District-style suggestions — adjective + noun, ≤ 24 characters, English or Russian
 * («Quiet Quartermaster», «Lucky Raccoon» / «Тихий Завхоз», «Фартовый Енот») — offered to players in
 * the alias dialog, and the names the server gives the players it adds to fill a lineup
 * (sim/fill.ts): a mix of the same suggestions and the casual names people type themselves, so those
 * players look like everyone else. The practice bots' names (shown with «· bot» offline) are kept
 * apart: no filled player is ever called like one of them.
 */
export type NickLang = 'en' | 'ru';

/** Names of the offline practice bots. */
export const PRACTICE_NAMES: Readonly<Record<NickLang, readonly string[]>> = Object.freeze({
  en: ['Beardy', 'Comrade_312', 'The Cooperator', 'Petrovich', 'Plumber', 'Quartermaster', 'Praporshchik', 'Kolyan', 'Mechanic', 'Shurik', 'Valerka', 'The Docent'],
  ru: ['Бородач', 'Товарищ_312', 'Кооператор', 'Петрович', 'Сантехник', 'Завхоз', 'Прапорщик', 'Колян', 'Механик', 'Шурик', 'Валерка', 'Доцент'],
});

const ADJ_EN = ['Quiet', 'Garage', 'Factory', 'Night', 'Gloomy', 'Seasoned', 'Jolly', 'Courtyard', 'Imported', 'Lucky', 'Cassette', 'District', 'Elusive', 'Shady', 'Sleepy', 'Bald', 'Contraband', 'Comrade'];
const NOUN_EN = ['Quartermaster', 'Watchman', 'Storekeeper', 'Gym Teacher', 'Foreman', 'Cabbie', 'Electrician', 'Fitter', 'Site Boss', 'Cooperator', 'Plumber', 'Projectionist', 'Spiv', 'Postman', 'Janitor', 'Badger', 'Raccoon', 'Ferret', 'Beaver', 'Owl', 'Weasel'];
const ADJ_RU = ['Тихий', 'Гаражный', 'Заводской', 'Ночной', 'Хмурый', 'Бывалый', 'Весёлый', 'Дворовый', 'Импортный', 'Фартовый', 'Кассетный', 'Районный', 'Неуловимый', 'Деловой', 'Сонный', 'Лысый'];
const NOUN_RU = ['Завхоз', 'Вахтёр', 'Кладовщик', 'Физрук', 'Бригадир', 'Таксист', 'Электрик', 'Слесарь', 'Прораб', 'Кооператор', 'Сантехник', 'Киномеханик', 'Фарцовщик', 'Почтальон', 'Дворник', 'Барсук', 'Енот', 'Хорёк', 'Бобр', 'Филин', 'Сыч'];

/** Names people pick for themselves (with the usual years, numbers and underscores). */
const CASUAL_EN = ['Vadik', 'Edik', 'Arkasha', 'Vovan', 'Tolik', 'Lyokha', 'Seryoga', 'Dimon', 'Sanya', 'Max', 'Rustam', 'Zhenya', 'Gena', 'Stas', 'Kostyan', 'Vityok', 'Garik', 'Zhora', 'Slavik', 'Tyoma', 'Mishanya', 'Boris', 'Sanchez', 'Dok', 'Ryzhy', 'Lis', 'Kot', 'Shpala'];
const CASUAL_RU = ['Вадик', 'Эдик', 'Аркаша', 'Вован', 'Толик', 'Лёха', 'Серёга', 'Димон', 'Саня', 'Макс', 'Рустам', 'Женёк', 'Гена', 'Стас', 'Костян', 'Витёк', 'Гарик', 'Жора', 'Славик', 'Тёмыч', 'Мишаня', 'Батя', 'Палыч', 'Михалыч', 'Рыжий', 'Лис', 'Кот', 'Шпала'];
const SUFFIX_EN = ['', '', '', '', '89', '_89', '777', '1988', '_2007', '01', '_x', ' Jr'];
const SUFFIX_RU = ['', '', '', '', '89', '_89', '777', '1988', '_2007', ' с района', ' из 5-го', ' мл.'];

const pickFrom = <T>(rnd: () => number, a: readonly T[]): T => a[Math.floor(rnd() * a.length) % a.length]!;

/** An adjective + noun suggestion in the given language. */
export function randomNickname(rnd: () => number = Math.random, lang: NickLang = 'en'): string {
  return lang === 'ru' ? `${pickFrom(rnd, ADJ_RU)} ${pickFrom(rnd, NOUN_RU)}` : `${pickFrom(rnd, ADJ_EN)} ${pickFrom(rnd, NOUN_EN)}`;
}

/** A name for a player added to fill a lineup: half suggestions, half the casual names people type. */
export function fillNickname(rnd: () => number, lang: NickLang): string {
  if (rnd() < 0.5) return randomNickname(rnd, lang);
  const name = lang === 'ru' ? `${pickFrom(rnd, CASUAL_RU)}${pickFrom(rnd, SUFFIX_RU)}` : `${pickFrom(rnd, CASUAL_EN)}${pickFrom(rnd, SUFFIX_EN)}`;
  return name.trim();
}
