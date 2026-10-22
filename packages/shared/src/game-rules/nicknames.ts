/**
 * Aliases. District-style suggestions — adjective + noun, ≤ 24 characters («Quiet Quartermaster»,
 * «Lucky Raccoon») — offered to players in the alias dialog, and the names the server gives the players
 * it adds to fill a lineup (sim/fill.ts): a mix of the same suggestions and the casual names people type
 * themselves, so those players look like everyone else. Since v0.3 every alias is written in Latin
 * letters (game-rules/aliases.ts, `LATIN_NAME_RE`): Russian-speaking players get the same English
 * suggestions, and their casual names are the ones they would type in Latin («Dimon», «Garik_89»).
 * The practice bots' names (shown with «· bot» offline) are kept apart: no filled player is ever called
 * like one of them.
 */
export type NickLang = 'en' | 'ru';

/** Names of the offline practice bots. */
export const PRACTICE_NAMES: Readonly<Record<NickLang, readonly string[]>> = Object.freeze({
  en: ['Beardy', 'Comrade_312', 'The Cooperator', 'Petrovich', 'Plumber', 'Quartermaster', 'Praporshchik', 'Kolyan', 'Mechanic', 'Shurik', 'Valerka', 'The Docent'],
  ru: ['Borodach', 'Tovarishch_312', 'Kooperator', 'Petrovich', 'Santekhnik', 'Zavkhoz', 'Praporshchik', 'Kolyan', 'Mekhanik', 'Shurik', 'Valerka', 'Dotsent'],
});

const ADJ_EN = ['Quiet', 'Garage', 'Factory', 'Night', 'Gloomy', 'Seasoned', 'Jolly', 'Courtyard', 'Imported', 'Lucky', 'Cassette', 'District', 'Elusive', 'Shady', 'Sleepy', 'Bald', 'Contraband', 'Comrade'];
const NOUN_EN = ['Quartermaster', 'Watchman', 'Storekeeper', 'Gym Teacher', 'Foreman', 'Cabbie', 'Electrician', 'Fitter', 'Site Boss', 'Cooperator', 'Plumber', 'Projectionist', 'Spiv', 'Postman', 'Janitor', 'Badger', 'Raccoon', 'Ferret', 'Beaver', 'Owl', 'Weasel'];

/** Names people pick for themselves (with the usual years, numbers and underscores). */
const CASUAL_EN = ['Vadik', 'Edik', 'Arkasha', 'Vovan', 'Tolik', 'Lyokha', 'Seryoga', 'Dimon', 'Sanya', 'Max', 'Rustam', 'Zhenya', 'Gena', 'Stas', 'Kostyan', 'Vityok', 'Garik', 'Zhora', 'Slavik', 'Tyoma', 'Mishanya', 'Boris', 'Sanchez', 'Dok', 'Ryzhy', 'Lis', 'Kot', 'Shpala'];
/** What Russian-speaking players type in Latin letters. */
const CASUAL_RU = ['Vadik', 'Edik', 'Arkasha', 'Vovan', 'Tolik', 'Lyokha', 'Seryoga', 'Dimon', 'Sanya', 'Maks', 'Rustam', 'Zhenyok', 'Gena', 'Stas', 'Kostyan', 'Vityok', 'Garik', 'Zhora', 'Slavik', 'Tyomych', 'Mishanya', 'Batya', 'Palych', 'Mikhalych', 'Ryzhiy', 'Lis', 'Kot', 'Shpala'];
const SUFFIX_EN = ['', '', '', '', '89', '_89', '777', '1988', '_2007', '01', '_x', ' Jr'];
const SUFFIX_RU = ['', '', '', '', '89', '_89', '777', '1988', '_2007', '_msk', '_spb', '_rayon'];

const pickFrom = <T>(rnd: () => number, a: readonly T[]): T => a[Math.floor(rnd() * a.length) % a.length]!;

/** An adjective + noun suggestion (English for everybody: aliases are written in Latin letters). */
export function randomNickname(rnd: () => number = Math.random, _lang: NickLang = 'en'): string {
  return `${pickFrom(rnd, ADJ_EN)} ${pickFrom(rnd, NOUN_EN)}`;
}

/** A name for a player added to fill a lineup: half suggestions, half the casual names people type. */
export function fillNickname(rnd: () => number, lang: NickLang): string {
  if (rnd() < 0.5) return randomNickname(rnd, lang);
  const name = lang === 'ru' ? `${pickFrom(rnd, CASUAL_RU)}${pickFrom(rnd, SUFFIX_RU)}` : `${pickFrom(rnd, CASUAL_EN)}${pickFrom(rnd, SUFFIX_EN)}`;
  return name.trim();
}
