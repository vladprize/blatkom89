/**
 * District-style nickname suggestions: adjective + noun, ≤ 24 chars, in the player's language
 * («Quiet Quartermaster», «Lucky Raccoon» / «Тихий Завхоз», «Фартовый Енот»).
 */
import { getLang } from '../i18n/index.js';

const ADJ_EN = ['Quiet', 'Garage', 'Factory', 'Night', 'Gloomy', 'Seasoned', 'Jolly', 'Courtyard', 'Imported', 'Lucky', 'Cassette', 'District', 'Elusive', 'Shady', 'Sleepy', 'Bald', 'Contraband', 'Comrade'];
const NOUN_EN = ['Quartermaster', 'Watchman', 'Storekeeper', 'Gym Teacher', 'Foreman', 'Cabbie', 'Electrician', 'Fitter', 'Site Boss', 'Cooperator', 'Plumber', 'Projectionist', 'Spiv', 'Postman', 'Janitor', 'Badger', 'Raccoon', 'Ferret', 'Beaver', 'Owl', 'Weasel'];
const ADJ_RU = ['Тихий', 'Гаражный', 'Заводской', 'Ночной', 'Хмурый', 'Бывалый', 'Весёлый', 'Дворовый', 'Импортный', 'Фартовый', 'Кассетный', 'Районный', 'Неуловимый', 'Деловой', 'Сонный', 'Лысый'];
const NOUN_RU = ['Завхоз', 'Вахтёр', 'Кладовщик', 'Физрук', 'Бригадир', 'Таксист', 'Электрик', 'Слесарь', 'Прораб', 'Кооператор', 'Сантехник', 'Киномеханик', 'Фарцовщик', 'Почтальон', 'Дворник', 'Барсук', 'Енот', 'Хорёк', 'Бобр', 'Филин', 'Сыч'];

export function randomNickname(rnd: () => number = Math.random, lang = getLang()): string {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length) % a.length]!;
  return lang === 'ru' ? `${pick(ADJ_RU)} ${pick(NOUN_RU)}` : `${pick(ADJ_EN)} ${pick(NOUN_EN)}`;
}
