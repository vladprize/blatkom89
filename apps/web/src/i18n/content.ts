/**
 * Localised names and descriptions of the shared game content. English comes from the shared
 * definitions (packages/shared), Russian from ru-content.ts — always read them through here.
 */
import { ACHIEVEMENTS, CHARACTERS, GADGETS, MODS, REFUSAL_TEXT, WEAPONS, getMap, isGadgetId } from '@blatkom/shared';
import type { AchievementId, ArmsId, AvatarId, BuyRefusal, CharacterId, GadgetId, MapId, ModId, WeaponId } from '@blatkom/shared';
import { getLang, t } from './index.js';
import { RU_ACHIEVEMENTS, RU_CHARACTERS, RU_GADGETS, RU_MAPS, RU_MODS, RU_REFUSALS, RU_WEAPONS } from './ru-content.js';
import type { CharacterText } from './ru-content.js';

export type { CharacterText };

const ru = () => getLang() === 'ru';

export function charText(id: CharacterId): CharacterText {
  if (ru()) return RU_CHARACTERS[id];
  const c = CHARACTERS[id];
  return { name: c.name, nickname: c.nickname, species: c.species, role: c.role, personality: c.personality, quote: c.quote, district: c.district, business: c.business, weaponsNote: c.weaponsNote, lore: c.lore, tag: c.tag };
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

/** «Rare / Epic / Legendary». */
export function rarityLabel(r: 'rare' | 'epic' | 'legendary'): string {
  return r === 'rare' ? t('Rare') : r === 'epic' ? t('Epic') : t('Legendary');
}
