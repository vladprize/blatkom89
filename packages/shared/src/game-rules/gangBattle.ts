/**
 * v0.2.17 (the owner: «бои ОПГ против ОПГ»): a gang challenges another gang to a $BLAT Tournament battle.
 *
 * A battle is a private tournament room (team deathmatch, fixed sides, people only — game-rules/kon.ts) whose
 * sides are the two gangs: the challenger's people play red, the other gang's blue, nobody else comes in and
 * nobody changes sides. Every side is one gang, so both gangs' tournament ratings move with the result (the
 * tournament's gang rating, docs/KON.md §3); the players' tournament ratings move as in any tournament match.
 * No stake: a battle is for the gangs' standing. 1×1 is not a gang battle.
 */
import { z } from 'zod';
import { KON_RULES } from './kon.js';
import type { KonFormat } from './kon.js';
import type { ClubEmblem, ClubFlag } from './clubs.js';
import { MAP_IDS } from '../maps/types.js';
import type { MapId } from '../maps/types.js';
import type { GameMode } from './match.js';

/** Battle formats: two people a side or more. */
export const GANG_BATTLE_FORMATS = ['2x2', '3x3', '5x5'] as const satisfies readonly KonFormat[];
export type GangBattleFormat = (typeof GANG_BATTLE_FORMATS)[number];

export function isGangBattleFormat(v: unknown): v is GangBattleFormat {
  return typeof v === 'string' && (GANG_BATTLE_FORMATS as readonly string[]).includes(v);
}

/** A gang as a battle shows it: the tag, the name and the flag. */
export interface GangCard {
  id: string;
  name: string;
  tag: string;
  flag: ClubFlag;
  emblem: ClubEmblem;
}

/** The two sides of a battle: red — the challenger, blue — the gang that was called out. */
export interface GangBattle {
  red: GangCard;
  blue: GangCard;
}

/** POST /api/clubs/:id/battle — the gang `:id` is called out by the caller's gang. */
export const GangBattleBody = z.object({ kon: z.enum(GANG_BATTLE_FORMATS), mapId: z.enum(MAP_IDS).optional() }).strict();
export type GangBattleBody = z.infer<typeof GangBattleBody>;

export type GangBattleRefusal = 'no_gang' | 'own_gang' | 'not_found' | 'too_few';

/**
 * Who may call a gang out: the caller is in a gang, it is another gang, and both gangs have enough people
 * of their own for a side (people, not the house gangs' made-up members).
 */
export function gangBattleRefusal(o: { mine: string | null; target: string | null; targetExists: boolean; mineMembers: number; targetMembers: number; format: GangBattleFormat }): GangBattleRefusal | null {
  if (!o.mine) return 'no_gang';
  if (!o.targetExists || !o.target) return 'not_found';
  if (o.mine === o.target) return 'own_gang';
  const size = KON_RULES[o.format].size;
  if (o.mineMembers < size || o.targetMembers < size) return 'too_few';
  return null;
}

/** The answer to a battle: the room (as POST /api/rooms answers), its sides and how many were told live. */
export interface GangBattleResponse {
  roomId: string;
  inviteCode: string;
  inviteUrl: string;
  webUrl: string;
  mapId: MapId;
  mode: GameMode;
  kon: GangBattleFormat;
  stake: 0;
  battle: GangBattle;
  /** People of the two gangs (the caller aside) who got the call live. */
  told: number;
}
