/**
 * Localised names and descriptions of the shared game content. English comes from the shared
 * definitions (packages/shared), Russian from ru-content.ts — always read them through here.
 */
import { ACHIEVEMENTS, CHARACTERS, FINISHES, GADGETS, MODS, REFUSAL_TEXT, WEAPONS, getMap, isGadgetId } from '@blatkom/shared';
import type { AchievementId, ArmsId, AvatarId, BuyRefusal, CharacterId, FinishId, GadgetId, MapId, ModId, WeaponId } from '@blatkom/shared';
import { getLang, getSwear, t } from './index.js';
import { CHAR_MARKS, CHAR_MAT_QUOTES } from './dark.js';
import { RU_ACHIEVEMENTS, RU_CHARACTERS, RU_FINISHES, RU_GADGETS, RU_MAPS, RU_MODS, RU_REFUSALS, RU_WEAPONS } from './ru-content.js';
import type { CharacterText } from './ru-content.js';

export type { CharacterText };

const ru = () => getLang() === 'ru';

/** A character's texts as the screens show them: v0.2.25 adds «Distinguishing marks» (black humour, dark.ts). */
export interface CharacterView extends CharacterText {
  marks: string;
}

/** The character's texts in the player's language — the quote with swearing unless Settings say «No swearing». */
export function charText(id: CharacterId): CharacterView {
  const i = ru() ? 1 : 0;
  const c = CHARACTERS[id];
  const base: CharacterText = ru() ? RU_CHARACTERS[id] : { name: c.name, nickname: c.nickname, species: c.species, role: c.role, personality: c.personality, quote: c.quote, district: c.district, business: c.business, weaponsNote: c.weaponsNote, lore: c.lore, tag: c.tag };
  return { ...base, quote: getSwear() ? CHAR_MAT_QUOTES[id][i] : base.quote, marks: CHAR_MARKS[id][i] };
}

export function charName(id: CharacterId): string {
  return ru() ? RU_CHARACTERS[id].name : CHARACTERS[id].name;
}

/** Profile avatars (game-rules/avatars.ts): [English, Russian] names for tooltips and screen readers. */
const AVATAR_NAMES: Record<AvatarId, readonly [string, string]> = {
  shades: ['Dark Glasses', 'Тёмные очки'],
  tracksuit: ['Tracksuit', 'Спортивка'],
  blonde: ['Blonde', 'Блондинка'],
  ushanka: ['Ushanka', 'Ушанка'],
  flatcap: ['Flat Cap', 'Кепка'],
  balaclava: ['Balaclava', 'Балаклава'],
  bob: ['Bob Cut', 'Каре'],
  resort: ['Holidaymaker', 'Курортник'],
  thinker: ['Thinker', 'Мыслитель'],
  agent: ['Agent', 'Агент'],
  smoker: ['Smoke Break', 'Перекур'],
  dog: ['Shepherd', 'Овчарка'],
  veteran: ['Old Hand', 'Бывалый'],
  hood: ['Red Hood', 'Капюшон'],
  brick: ['Brick Phone', 'Мобила'],
  tattoo: ['Ink', 'Наколки'],
  furcoat: ['Fur Coat', 'Шубка'],
  panama: ['Bucket Hat', 'Панамка'],
  militia: ['Militia', 'Милиция'],
  disco: ['Disco', 'Дискотека'],
  shotgun: ['Shotgun', 'Ружьё'],
  babushka: ['Babushka', 'Бабуля'],
  driver: ['Driver', 'Водила'],
  tram: ['Last Tram', 'Последний трамвай'],
};

export function avatarName(id: AvatarId): string {
  return AVATAR_NAMES[id][ru() ? 1 : 0];
}

export function weaponName(id: WeaponId): string {
  return ru() ? RU_WEAPONS[id].name : WEAPONS[id].name;
}

/** A weapon skin's finish («Хохлома» / «Khokhloma»). */
export function finishName(id: FinishId): string {
  return ru() ? RU_FINISHES[id] : FINISHES[id].name;
}

export function weaponBlurb(id: WeaponId): string {
  return ru() ? RU_WEAPONS[id].blurb : WEAPONS[id].blurb;
}

export function gadgetName(id: GadgetId): string {
  return ru() ? RU_GADGETS[id].name : GADGETS[id].name;
}

export function gadgetBlurb(id: GadgetId): string {
  return ru() ? RU_GADGETS[id].blurb : GADGETS[id].blurb;
}

/** Name of whatever dealt damage: a weapon, a piece of equipment or a turret. */
export function armsName(id: ArmsId): string {
  if (id === 'turret') return gadgetName('turret');
  return isGadgetId(id) ? gadgetName(id) : weaponName(id as WeaponId);
}

export function modText(id: ModId): { name: string; plus: string; minus: string } {
  if (ru()) return RU_MODS[id];
  const m = MODS[id];
  return { name: m.name, plus: m.plus, minus: m.minus };
}

export function mapName(id: MapId): string {
  return ru() ? RU_MAPS[id].name : getMap(id).name;
}

const MAP_BLURB_EN: Record<MapId, string> = {
  factory: 'The checkpoint, Workshop No. 3, the warehouse. Corridors, cover, key points.',
  garages: 'Rows of garages, narrow lanes, ambushes at close range.',
  yard: 'Panel blocks, archways and a playground. Flanks and mid-range fights.',
  stroyka: 'A half-built block under the crane: sections, the pit, stacks of bricks.',
  dk: 'The auditorium, the stage, dressing rooms, the billiard room and the foyer.',
  gastronom: 'Aisles of shelves, counters, the warehouse and the loading dock.',
  hospital: 'Wards, the operating theatre, X-ray and one long corridor.',
  cemetery: 'Gravel alleys between railed plots, a domed chapel and the crypt. Railings let bullets through, headstones don’t.',
  square: 'The fortress wall, the many-domed cathedral, the granite tribune. Lorries, carriers and barricades on the cobbles.',
  camp: 'Cabins, the dining hall, the club, a campfire ring and a lake with a jetty. Water stops you, not bullets.',
  cherkizon: 'Rows of stalls under tarps and awnings, the covered pavilion and the shawarma stand. Narrow aisles and sudden corners.',
  vorkuta: 'The mine, the House of Culture over the square, five-storey blocks in snow. Drifts for cover; heating mains stop you, not bullets.',
};

export function mapBlurb(id: MapId): string {
  return ru() ? RU_MAPS[id].blurb : MAP_BLURB_EN[id];
}

export function achievementText(id: AchievementId): { title: string; description: string } {
  if (ru()) return RU_ACHIEVEMENTS[id];
  const a = ACHIEVEMENTS[id];
  return { title: a.title, description: a.description };
}

export function refusalText(r: BuyRefusal): string {
  return ru() ? RU_REFUSALS[r] : REFUSAL_TEXT[r];
}

/** v0.2.18: «Regular / Rare / Epic / Legendary» (the grades). */
export function rarityLabel(r: 'common' | 'rare' | 'epic' | 'legendary'): string {
  return r === 'common' ? t('Regular') : r === 'rare' ? t('Rare') : r === 'epic' ? t('Epic') : t('Legendary');
}
