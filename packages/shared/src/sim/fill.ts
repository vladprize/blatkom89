/**
 * Filling the lineup of an online match. When there are too few people for a good game, the server
 * adds players it runs itself (BotBrain) so a match can always start: free-for-all up to
 * FILL_RULES.ffaPlayers, team modes up to FILL_RULES.teamPlayers a side, always with even sides. Quick
 * Match rooms wait a little for people first, then the extra players arrive one by one; rooms with
 * friends fill up when the host starts. The added players carry names, levels, avatars, characters and
 * gear like everyone else's and are never labelled — the game shows them exactly like people.
 */
import { AVATAR_IDS } from '../game-rules/avatars.js';
import type { AvatarId } from '../game-rules/avatars.js';
import { CHARACTER_IDS, FREE_CHARACTERS } from '../game-rules/characters.js';
import type { CharacterId } from '../game-rules/characters.js';
import type { GadgetId } from '../game-rules/gadgets.js';
import type { Loadout } from '../game-rules/loadout.js';
import { isTeamMode } from '../game-rules/match.js';
import type { GameMode } from '../game-rules/match.js';
import type { WeaponId } from '../game-rules/weapons.js';
import type { FinishId } from '../game-rules/skins.js';
import { fillNickname } from '../game-rules/nicknames.js';
import type { NickLang } from '../game-rules/nicknames.js';
import type { BotDifficulty } from './bots.js';

export const FILL_RULES = Object.freeze({
  /** Free-for-all: at least this many players in a match. */
  ffaPlayers: 4,
  /** Team modes: at least this many players on each side (the sides are always even). */
  teamPlayers: 3,
  /** Quick Match: how long the first person waits for others before players start arriving. */
  waitMs: 5000,
  /**
   * v0.2.25 (the owner: «ожидание в лобби — не меньше 30 секунд, боты добираются равномерно и органично»):
   * a Quick Match lobby lasts this long from the first person's arrival (0: it starts as soon as the lineup is
   * there, as before); the players the room adds arrive spread over it. The server's QUICK_LOBBY_SECONDS sets it.
   */
  lobbyMs: 30000,
  /** …then one more player arrives every arriveMinMs–arriveMaxMs (lobby). */
  arriveMinMs: 700,
  arriveMaxMs: 2200,
  /** During a match an empty place is taken after joinMinMs–joinMaxMs (like someone joining in progress). */
  joinMinMs: 2500,
  joinMaxMs: 6000,
  /** A player beyond the lineup (a person took the place) leaves after leaveMinMs–leaveMaxMs. */
  leaveMinMs: 500,
  leaveMaxMs: 2000,
});

/** The timings of FILL_RULES (rooms may shorten them, e.g. in tests). */
export type FillTiming = Record<'waitMs' | 'lobbyMs' | 'arriveMinMs' | 'arriveMaxMs' | 'joinMinMs' | 'joinMaxMs' | 'leaveMinMs' | 'leaveMaxMs', number>;

/**
 * v0.2.25: when the next of `toAdd` players arrives in a Quick Match lobby that starts at `startAt` — the room
 * spread evenly over what is left of the wait (the last a few seconds before the start), each step a little
 * longer or shorter than the others (`r`: a random number 0…1).
 */
export function lobbyArrivalDelay(now: number, startAt: number, toAdd: number, t: Pick<FillTiming, 'arriveMinMs'>, r: number): number {
  const left = startAt - 2500 - now;
  if (toAdd <= 0 || left <= t.arriveMinMs) return t.arriveMinMs;
  const step = left / (toAdd + 0.35);
  return Math.round(Math.max(t.arriveMinMs, step * (0.65 + 0.7 * r)));
}

/**
 * The lineup to reach: free-for-all — the total number of players; team modes — the size of each side
 * (both sides the same). Never below the people already there, never above the room.
 */
export function fillTarget(mode: GameMode, people: { total: number; red: number; blue: number }, maxPlayers: number): { total: number } | { side: number } {
  if (isTeamMode(mode)) return { side: Math.min(Math.floor(maxPlayers / 2), Math.max(FILL_RULES.teamPlayers, people.red, people.blue)) };
  return { total: Math.min(maxPlayers, Math.max(FILL_RULES.ffaPlayers, people.total)) };
}

export interface FillPersona {
  name: string;
  character: CharacterId;
  level: number;
  avatar: AvatarId | null;
  loadout: Loadout;
  difficulty: BotDifficulty;
}

/** Gear like players carry: free and Arsenal weapons, varied equipment, no modifications. */
const PRIMARIES: WeaponId[] = ['avtomat', 'avtomat', 'obrez', 'ksyuha', 'uzi', 'ppsh', 'mp5', 's12', 'm4', 'g36', 'svd', 'tommy'];
const SIDEARMS: WeaponId[] = ['pistol', 'pistol', 'pistol', 'tt', 'p92', 'deagle'];
const MELEE: WeaponId[] = ['montirovka', 'montirovka', 'bita', 'nozh', 'topor'];
const GADGETS: GadgetId[] = ['f1', 'f1', 'f1', 'molotov', 'flash', 'smoke'];
/**
 * Finishes the filled players (and practice bots) wear, weighted by repetition. v0.2.23: wider than case
 * drops on purpose — a third common, a third rare, a fifth epic, an eighth legendary (some of them live) —
 * so a match shows what each grade does (coloured shots, glow, kill burst, the legendary card).
 */
export const FILL_FINISHES: readonly FinishId[] = Object.freeze([
  'akulka', 'akulka', 'blatkom', 'blatkom', 'haki', 'haki', 'iznos', 'berezka',
  'sport', 'devyanostye', 'cherkizon', 'afgan', 'video', 'malina', 'graffiti', 'hrom',
  'kosmos', 'hohloma', 'neon', 'zakat', 'kazino',
  'carsky', 'bratok', 'almaz',
] as FinishId[]);
/** How often a filled player's main weapon wears a skin (v0.2.23: up from 0.3). */
export const FILL_SKIN_CHANCE = 0.4;

const pick = <T>(rnd: () => number, a: readonly T[]): T => a[Math.floor(rnd() * a.length) % a.length]!;

/**
 * A player added to fill the lineup. `aroundLevel` is the people's average level: the newcomers are
 * close to it (and play a little easier against beginners, a little harder against veterans).
 */
export function fillPersona(rnd: () => number, o: { lang: NickLang; aroundLevel: number; taken: ReadonlySet<string> }): FillPersona {
  let name = fillNickname(rnd, o.lang);
  for (let i = 0; i < 30 && o.taken.has(name.toLowerCase()); i++) name = fillNickname(rnd, rnd() < 0.8 ? o.lang : o.lang === 'ru' ? 'en' : 'ru');
  const around = Math.max(1, Math.round(o.aroundLevel));
  const level = Math.max(1, Math.min(60, Math.round(around - 3 + rnd() * 9)));
  const r = rnd();
  const difficulty: BotDifficulty = around < 4 ? (r < 0.6 ? 'easy' : 'normal') : around < 15 ? (r < 0.15 ? 'easy' : r < 0.85 ? 'normal' : 'hard') : r < 0.5 ? 'normal' : 'hard';
  const persona: FillPersona = {
    name,
    character: rnd() < 0.65 ? pick(rnd, FREE_CHARACTERS) : pick(rnd, CHARACTER_IDS),
    level,
    avatar: rnd() < 0.65 ? pick(rnd, AVATAR_IDS) : null,
    loadout: { sidearm: pick(rnd, SIDEARMS), melee: pick(rnd, MELEE), primary: pick(rnd, PRIMARIES), gadget: pick(rnd, GADGETS), mods: {} },
    difficulty,
  };
  // some carry a skin on the main weapon, like people who opened a case (mostly the common finishes)
  const skins: Partial<Record<WeaponId, FinishId>> = {};
  if (persona.loadout.primary && rnd() < FILL_SKIN_CHANCE) skins[persona.loadout.primary] = pick(rnd, FILL_FINISHES);
  if (rnd() < 0.1) skins[persona.loadout.sidearm] = pick(rnd, FILL_FINISHES);
  persona.loadout.skins = skins;
  return persona;
}
