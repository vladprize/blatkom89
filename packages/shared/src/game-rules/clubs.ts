/**
 * Clubs (v0.3): crews of players with a name, a short tag, a flag and an emblem. A player is in one
 * club at a time; anyone may ask to join, the club's head decides. The club's rating moves with its
 * people's results: every rating point a member wins or loses in a match is the club's too.
 *
 * Flags are drawn by the client (apps/web/src/ui/clubFlag.ts) from a pattern, three colours of the
 * palette and an emblem; the server only checks that the parts exist.
 */
import { z } from 'zod';
import type { AvatarId } from './avatars.js';
import type { CharacterId } from './characters.js';

/** The colours a flag can use: the game's own (dirty red, burgundy, tobacco, olive, industrial blue…). */
export const CLUB_PALETTE = Object.freeze([
  '#c8312a', // red
  '#6e1f22', // burgundy
  '#16120f', // black
  '#d9c39a', // tobacco
  '#5b6b3a', // olive
  '#2f5d8a', // industrial blue
  '#9a4b24', // rust
  '#e08a2e', // sodium orange
  '#efe8da', // white
  '#d8a93c', // gold
  '#2e7d4f', // green
  '#7fb2d6', // sky
] as const);
export const CLUB_COLORS = CLUB_PALETTE.length;

/** Flag patterns: one field, two or three stripes either way, a diagonal, a band, a frame, a corner, a wedge. */
export const FLAG_PATTERNS = ['solid', 'h2', 'h3', 'v2', 'v3', 'diag', 'band', 'frame', 'corner', 'wedge'] as const;
export type FlagPattern = (typeof FLAG_PATTERNS)[number];

/** Emblems drawn over the flag. Nothing political or from prison culture (no crowns, card suits, epaulettes). */
export const EMBLEM_ICONS = ['none', 'star', 'gear', 'wrench', 'cassette', 'bolt', 'rocket', 'satellite', 'anchor', 'key', 'ball', 'flame', 'paw', 'crosshair', 'tower', 'eye', 'sun'] as const;
export type EmblemIcon = (typeof EMBLEM_ICONS)[number];

const colorIndex = z.number().int().min(0).max(CLUB_COLORS - 1);

export const ClubFlagSchema = z.object({ pattern: z.enum(FLAG_PATTERNS), colors: z.tuple([colorIndex, colorIndex, colorIndex]) }).strict();
export type ClubFlag = z.infer<typeof ClubFlagSchema>;
export const ClubEmblemSchema = z.object({ icon: z.enum(EMBLEM_ICONS), color: colorIndex }).strict();
export type ClubEmblem = z.infer<typeof ClubEmblemSchema>;

export const CLUB_RULES = Object.freeze({
  nameMin: 3,
  nameMax: 24,
  tagMin: 2,
  tagMax: 4,
  mottoMax: 60,
  maxMembers: 50,
  /** Open join requests a player may have at once (to different clubs). */
  maxOutgoingRequests: 3,
  /** Requests waiting for one club's head. */
  maxIncomingRequests: 50,
  /**
   * Starting a gang (v0.2.8, the owner: «anyone can start one»): from level 1 and free. One gang per
   * player and a limit on startings per hour keep the table tidy; raise these to bring a fee back.
   */
  createLevel: 1,
  createTokens: 0,
  startRating: 1000,
});

/** A club name (v0.3: Latin letters only, like aliases): letters, digits, spaces and a little punctuation. */
export const clubNameSchema = z
  .string()
  .transform((s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(CLUB_RULES.nameMin)
      .max(CLUB_RULES.nameMax)
      .regex(/^[A-Za-z0-9 _.\-’'#!&]+$/, 'A gang name may contain Latin letters (A–Z), digits, spaces and _ . - # ! &')
      .regex(/[A-Za-z0-9]/, 'A gang name needs a letter or a digit'),
  );

/** The tag in square brackets next to the name: 2–4 Latin letters or digits, kept in capitals. */
export const clubTagSchema = z
  .string()
  .transform((s) => s.normalize('NFKC').trim().toUpperCase())
  .pipe(
    z
      .string()
      .min(CLUB_RULES.tagMin)
      .max(CLUB_RULES.tagMax)
      .regex(/^[A-Z0-9]+$/, 'A tag is 2–4 Latin letters or digits'),
  );

export const clubMottoSchema = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .max(CLUB_RULES.mottoMax)
      // v0.3: clubs are written in Latin letters (the whole motto: letters, digits, everyday punctuation)
      .regex(/^[\x20-\x7E’‘“”«»—–…]*$/, 'A motto is written in Latin letters'),
  );

export const CreateClubBody = z.object({ name: clubNameSchema, tag: clubTagSchema, motto: clubMottoSchema.optional(), flag: ClubFlagSchema, emblem: ClubEmblemSchema }).strict();
export type CreateClubBody = z.infer<typeof CreateClubBody>;
export const UpdateClubBody = z.object({ motto: clubMottoSchema.optional(), flag: ClubFlagSchema.optional(), emblem: ClubEmblemSchema.optional() }).strict();
export type UpdateClubBody = z.infer<typeof UpdateClubBody>;

/** The club rating after a member's match: the member's own rating change, never below zero. */
export function clubRatingAfter(rating: number, memberDelta: number): number {
  return Math.max(0, Math.round(rating + memberDelta));
}

export type ClubRole = 'head' | 'member';
/** The asking player's relation to a club. */
export type ClubStanding = 'head' | 'member' | 'requested' | 'none';

/** A club in the table and in lists. */
export interface ClubSummary {
  id: string;
  name: string;
  tag: string;
  flag: ClubFlag;
  emblem: ClubEmblem;
  rating: number;
  /** Place in the club table (1 = first). */
  rank: number;
  members: number;
  /** Takes join requests (a full club, or one whose head closed recruiting, doesn't). */
  recruiting: boolean;
}

export interface ClubMember {
  id: string;
  name: string;
  level: number;
  avatar: AvatarId | null;
  character: CharacterId | null;
  role: ClubRole;
}

export interface ClubRequestEntry {
  id: string;
  name: string;
  level: number;
  avatar: AvatarId | null;
  character: CharacterId | null;
  at: string;
}

export interface ClubDetails extends ClubSummary {
  motto: string;
  createdAt: string;
  memberList: ClubMember[];
  me: ClubStanding;
  /** Waiting join requests — only for the club's head. */
  requests: ClubRequestEntry[];
}

export interface ClubsResponse {
  /** The table: the first hundred clubs by rating (or the search results). */
  clubs: ClubSummary[];
  /** The asking player's club, also when it is outside the table. */
  mine: ClubSummary | null;
  /** Clubs the player has asked to join. */
  requested: string[];
  /** Join requests waiting for the player's answer (heads only). */
  incoming: number;
}

/** A player's club as other players see it: the tag next to the name. */
export interface ClubBadge {
  id: string;
  tag: string;
  name: string;
  flag: ClubFlag;
  emblem: ClubEmblem;
}
